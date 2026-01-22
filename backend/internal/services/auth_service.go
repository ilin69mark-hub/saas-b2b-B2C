package services

import (
	"errors"
	"fmt"
	"time"

	"franchise-saas-backend/internal/models"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/spf13/viper"
)

type AuthService struct {
	db interface{}
}

func NewAuthService(db interface{}) *AuthService {
	return &AuthService{db: db}
}

// CreateUser creates a new user in the database
func (s *AuthService) CreateUser(user *models.User) (*models.User, error) {
	// In a real implementation, you would interact with the database here
	// For now, we'll simulate the operation
	
	// Simulate saving to database
	simulatedUser := *user
	simulatedUser.CreatedAt = time.Now()
	simulatedUser.UpdatedAt = time.Now()
	
	return &simulatedUser, nil
}

// GetUserByEmail retrieves a user by their email address
func (s *AuthService) GetUserByEmail(email string) (*models.User, error) {
	// In a real implementation, you would query the database
	// For now, we'll simulate a lookup
	
	// Simulate checking if user exists
	if email == "existing@example.com" {
		return &models.User{
			ID:        uuid.New().String(),
			Email:     email,
			Password:  "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjdQcVrRzwwIWKXNw2vE.9YJdLQj3u", // bcrypt hash for "password123"
			Role:      "dealer",
			TenantID:  "tenant-1",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}, nil
	}
	
	return nil, nil
}

// GenerateTokens creates JWT tokens for a user
func (s *AuthService) GenerateTokens(userID, email, role, tenantID string) (string, string, error) {
	// Create access token
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  userID,
		"email":    email,
		"role":     role,
		"tenant_id": tenantID,
		"exp":      time.Now().Add(time.Hour * 24).Unix(), // 24 hours
		"iat":      time.Now().Unix(),
	})

	// Create refresh token
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":  userID,
		"email":    email,
		"role":     role,
		"tenant_id": tenantID,
		"exp":      time.Now().Add(time.Hour * 24 * 30).Unix(), // 30 days
		"iat":      time.Now().Unix(),
	})

	// Sign tokens with secret
	accessSecret := viper.GetString("jwt_secret")
	if accessSecret == "" {
		accessSecret = "default_secret_key_for_development"
	}

	accessTokenString, err := accessToken.SignedString([]byte(accessSecret))
	if err != nil {
		return "", "", fmt.Errorf("failed to sign access token: %w", err)
	}

	refreshTokenString, err := refreshToken.SignedString([]byte(accessSecret))
	if err != nil {
		return "", "", fmt.Errorf("failed to sign refresh token: %w", err)
	}

	return accessTokenString, refreshTokenString, nil
}

// RefreshTokens validates the refresh token and generates new tokens
func (s *AuthService) RefreshTokens(refreshToken string) (string, string, error) {
	// Parse and validate the refresh token
	token, err := jwt.Parse(refreshToken, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}

		// Return the secret key
		secret := viper.GetString("jwt_secret")
		if secret == "" {
			secret = "default_secret_key_for_development"
		}
		return []byte(secret), nil
	})

	if err != nil {
		return "", "", fmt.Errorf("invalid refresh token: %w", err)
	}

	// Extract claims if token is valid
	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		// Extract user information from claims
		userID, ok := claims["user_id"].(string)
		if !ok {
			return "", "", errors.New("invalid token claims: user_id")
		}

		email, ok := claims["email"].(string)
		if !ok {
			return "", "", errors.New("invalid token claims: email")
		}

		role, ok := claims["role"].(string)
		if !ok {
			return "", "", errors.New("invalid token claims: role")
		}

		tenantID, ok := claims["tenant_id"].(string)
		if !ok {
			return "", "", errors.New("invalid token claims: tenant_id")
		}

		// Generate new tokens
		return s.GenerateTokens(userID, email, role, tenantID)
	}

	return "", "", errors.New("invalid refresh token")
}