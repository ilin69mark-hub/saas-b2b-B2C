package main

import (
	"fmt"
	"log"
	"net/http"

	"franchise-saas-backend/internal/database"
	"franchise-saas-backend/internal/handlers"
	"franchise-saas-backend/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
)

func init() {
	// Initialize configuration
	viper.SetDefault("port", "8080")
	viper.SetDefault("db_host", "localhost")
	viper.SetDefault("db_port", "5432")
	viper.SetDefault("db_user", "postgres")
	viper.SetDefault("db_password", "password")
	viper.SetDefault("db_name", "franchise_db")
	viper.SetDefault("jwt_secret", "default_secret_key_for_development")

	// Load environment variables
	viper.AutomaticEnv()
}

func main() {
	// Set up Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	// Add CORS middleware
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowCredentials = true
	config.AllowHeaders = []string{"*"}
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	r.Use(cors.New(config))

	// Connect to database
	db, err := database.ConnectDB()
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Initialize handlers with database connection
	authHandler := handlers.NewAuthHandler(db)
	userHandler := handlers.NewUserHandler(db)
	checklistHandler := handlers.NewChecklistHandler(db)

	// Public routes
	public := r.Group("/api/v1")
	{
		public.POST("/auth/register", authHandler.Register)
		public.POST("/auth/login", authHandler.Login)
		public.POST("/auth/logout", middleware.AuthMiddleware(), authHandler.Logout)
		public.POST("/auth/refresh", authHandler.RefreshToken)
	}

	// Protected routes
	protected := r.Group("/api/v1")
	protected.Use(middleware.AuthMiddleware())
	{
		// User routes
		protected.GET("/users/profile", userHandler.GetProfile)
		protected.PUT("/users/profile", userHandler.UpdateProfile)

		// Checklist routes
		protected.GET("/checklists", checklistHandler.GetChecklists)
		protected.GET("/checklists/:id", checklistHandler.GetChecklistByID)
		protected.POST("/checklists", checklistHandler.CreateChecklist)
		protected.PUT("/checklists/:id", checklistHandler.UpdateChecklist)
		protected.DELETE("/checklists/:id", checklistHandler.DeleteChecklist)
		protected.POST("/checklists/:id/complete", checklistHandler.CompleteChecklist)

		// Dealer routes (for franchiser)
		protected.GET("/dealers", middleware.RoleMiddleware("franchiser"), userHandler.GetAllDealers)
		protected.GET("/dealers/:id", middleware.RoleMiddleware("franchiser"), userHandler.GetDealerByID)
	}

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status": "OK",
			"service": "franchise-saas-backend",
		})
	})

	port := viper.GetString("port")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("Server is running on port %s\n", port)
	log.Fatal(r.Run(":" + port))
}