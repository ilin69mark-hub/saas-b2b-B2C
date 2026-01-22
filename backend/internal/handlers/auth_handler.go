package handlers

import (
	"net/http"
	"time"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	service *services.AuthService
}

func NewAuthHandler(db interface{}) *AuthHandler {
	return &AuthHandler{
		service: services.NewAuthService(db),
	}
}

// Register handles user registration
// @Summary Register a new user
// @Description Register a new user account
// @Tags auth
// @Accept json
// @Produce json
// @Param user body models.UserRegisterRequest true "User registration data"
// @Success 201 {object} models.AuthResponse
// @Failure 400 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req models.UserRegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Validate password strength
	if len(req.Password) < 6 {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Password too weak",
			Message: "Password must be at least 6 characters long",
		})
		return
	}

	// Check if user already exists
	existingUser, _ := h.service.GetUserByEmail(req.Email)
	if existingUser != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "User already exists",
			Message: "A user with this email already exists",
		})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Password hashing failed",
			Message: "Internal server error",
		})
		return
	}

	// Create user
	user := &models.User{
		ID:        uuid.New().String(),
		Email:     req.Email,
		Password:  string(hashedPassword),
		Role:      req.Role,
		TenantID:  req.TenantID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	createdUser, err := h.service.CreateUser(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "User creation failed",
			Message: "Could not create user",
		})
		return
	}

	// Generate JWT tokens
	token, refreshToken, err := h.service.GenerateTokens(createdUser.ID, createdUser.Email, createdUser.Role, createdUser.TenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Token generation failed",
			Message: "Internal server error",
		})
		return
	}

	c.JSON(http.StatusCreated, models.AuthResponse{
		User:         *createdUser,
		Token:        token,
		RefreshToken: refreshToken,
	})
}

// Login handles user login
// @Summary Login user
// @Description Authenticate user and return JWT tokens
// @Tags auth
// @Accept json
// @Produce json
// @Param credentials body models.UserLoginRequest true "User credentials"
// @Success 200 {object} models.AuthResponse
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.UserLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	user, err := h.service.GetUserByEmail(req.Email)
	if err != nil || user == nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid credentials",
			Message: "Invalid email or password",
		})
		return
	}

	// Compare passwords
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid credentials",
			Message: "Invalid email or password",
		})
		return
	}

	// Generate JWT tokens
	token, refreshToken, err := h.service.GenerateTokens(user.ID, user.Email, user.Role, user.TenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Token generation failed",
			Message: "Internal server error",
		})
		return
	}

	c.JSON(http.StatusOK, models.AuthResponse{
		User:         *user,
		Token:        token,
		RefreshToken: refreshToken,
	})
}

// Logout handles user logout
// @Summary Logout user
// @Description Invalidate user session
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} models.SuccessResponse
// @Failure 401 {object} models.ErrorResponse
// @Router /auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	// In a real application, you would invalidate the refresh token here
	// For now, we just return a success message
	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Successfully logged out",
	})
}

// RefreshToken handles token refresh
// @Summary Refresh authentication token
// @Description Get a new access token using refresh token
// @Tags auth
// @Accept json
// @Produce json
// @Param refresh_request body models.RefreshTokenRequest true "Refresh token request"
// @Success 200 {object} models.TokenResponse
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req models.RefreshTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Validate refresh token (in a real app, you'd check against stored tokens)
	newToken, newRefreshToken, err := h.service.RefreshTokens(req.RefreshToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Invalid refresh token",
			Message: "The refresh token is invalid or expired",
		})
		return
	}

	c.JSON(http.StatusOK, models.TokenResponse{
		Token:        newToken,
		RefreshToken: newRefreshToken,
	})
}