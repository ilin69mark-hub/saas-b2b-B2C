package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"franchise-saas-backend/internal/database"
	"franchise-saas-backend/internal/handlers"
	"franchise-saas-backend/internal/middleware"
	"franchise-saas-backend/internal/services"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func init() {
	// Set config file paths
	viper.SetConfigName("config")               // имя конфиг файла (без расширения)
	viper.SetConfigType("yaml")                 // или "json", "toml"
	viper.AddConfigPath(".")                    // ищем в текущей директории
	viper.AddConfigPath("./config")             // и в папке config
	viper.AddConfigPath("/etc/franchise-saas/") // системный путь

	// Initialize default configuration
	viper.SetDefault("port", "8080")
	viper.SetDefault("db_host", "localhost")
	viper.SetDefault("db_port", "5432")
	viper.SetDefault("db_user", "postgres")
	viper.SetDefault("db_password", "postgres")
	viper.SetDefault("db_name", "franchise_db")
	viper.SetDefault("jwt_secret", "default_secret_key_for_development_change_in_production")
	viper.SetDefault("jwt_expiration_hours", 24)
	viper.SetDefault("refresh_token_expiration_days", 7)
	viper.SetDefault("cors_allowed_origins", []string{"*"})
	viper.SetDefault("log_level", "info")

	// Load environment variables with prefix
	viper.SetEnvPrefix("FRANCHISE")
	viper.AutomaticEnv()

	// Try to read config file
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			// Config file not found; ignore error if desired
			log.Println("Config file not found, using defaults and environment variables")
		} else {
			// Config file was found but another error was produced
			log.Printf("Error reading config file: %v", err)
		}
	}
}

func main() {
	// Set Gin mode based on environment
	if viper.GetString("gin_mode") == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// Setup logger
	logFile := setupLogger()
	if logFile != nil {
		defer logFile.Close()
	}

	// Create router with middleware
	r := gin.New()

	// Add recovery middleware
	r.Use(gin.Recovery())

	// Add CORS middleware with proper configuration
	corsConfig := cors.Config{
		AllowOrigins:     viper.GetStringSlice("cors_allowed_origins"),
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "Authorization", "X-Requested-With", "X-Tenant-ID"},
		ExposeHeaders:    []string{"Content-Length", "X-Total-Count"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}

	if len(corsConfig.AllowOrigins) == 0 || corsConfig.AllowOrigins[0] == "*" {
		corsConfig.AllowAllOrigins = true
		corsConfig.AllowOrigins = nil
	}

	r.Use(cors.New(corsConfig))

	// Connect to database
	db, err := database.ConnectDB()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer func() {
		// sql.DB.Close() не возвращает ошибку
		db.Close()
		log.Println("Database connection closed")
	}()

	// Initialize services with dependencies
	authService := services.NewAuthService(db)
	userService := services.NewUserService(db)
	checklistService := services.NewChecklistService(db)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	userHandler := handlers.NewUserHandler(userService)
	checklistHandler := handlers.NewChecklistHandler(checklistService)

	// Setup routes
	setupRoutes(r, authHandler, userHandler, checklistHandler)

	// Start server
	startServer(r)
}

func setupLogger() *os.File {
	logDir := viper.GetString("log_dir")
	if logDir == "" {
		logDir = "./logs"
	}

	if err := os.MkdirAll(logDir, 0755); err != nil {
		log.Printf("Failed to create log directory: %v", err)
		return nil
	}

	logFile := fmt.Sprintf("%s/app-%s.log", logDir, time.Now().Format("2006-01-02"))
	file, err := os.OpenFile(logFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		log.Printf("Failed to open log file: %v", err)
		return nil
	}

	log.SetOutput(file)
	gin.DefaultWriter = file

	return file
}

func setupRoutes(r *gin.Engine, authHandler *handlers.AuthHandler, userHandler *handlers.UserHandler, checklistHandler *handlers.ChecklistHandler) {
	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "OK",
			"service":   "franchise-saas-backend",
			"timestamp": time.Now().Format(time.RFC3339),
			"version":   viper.GetString("version"),
		})
	})

	// API v1 routes
	api := r.Group("/api/v1")
	{
		// Public routes
		public := api.Group("/auth")
		{
			public.POST("/register", authHandler.Register)
			public.POST("/login", authHandler.Login)
			public.POST("/refresh", authHandler.RefreshToken)
		}

		// Protected routes
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware())
		{
			// Auth routes
			protected.POST("/auth/logout", authHandler.Logout)
			protected.GET("/auth/me", authHandler.GetCurrentUser) // Add this endpoint

			// User routes
			users := protected.Group("/users")
			{
				users.GET("/profile", userHandler.GetProfile)
				users.PUT("/profile", userHandler.UpdateProfile)
			}

			// Checklist routes
			checklists := protected.Group("/checklists")
			{
				checklists.GET("", checklistHandler.GetChecklists)
				checklists.GET("/:id", checklistHandler.GetChecklistByID)
				checklists.POST("", checklistHandler.CreateChecklist)
				checklists.PUT("/:id", checklistHandler.UpdateChecklist)
				checklists.DELETE("/:id", checklistHandler.DeleteChecklist)
				checklists.POST("/:id/complete", checklistHandler.CompleteChecklist)
			}

			// Dealer routes (for franchiser)
			dealers := protected.Group("/dealers")
			dealers.Use(middleware.RoleMiddleware("franchiser"))
			{
				dealers.GET("", userHandler.GetAllDealers)
				dealers.GET("/:id", userHandler.GetDealerByID)
			}
		}
	}

	// 404 handler
	r.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{
			"error":   "Not Found",
			"message": "The requested resource was not found",
		})
	})
}

func startServer(r *gin.Engine) {
	port := viper.GetString("port")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("Starting server on port %s", port)
	log.Printf("Environment: %s", viper.GetString("env"))
	log.Printf("Database host: %s", viper.GetString("db_host"))

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Failed to start server: %v", err)
	}
}
