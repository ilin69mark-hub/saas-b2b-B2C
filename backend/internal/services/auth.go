package services

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"github.com/google/uuid"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/database"
)

// AuthService предоставляет методы для аутентификации пользователей
type AuthService struct {
	db        *database.DB
	jwtSecret string
}

// Claims определяет структуру для JWT claims
type Claims struct {
	UserID   string `json:"user_id"`
	UserRole string `json:"user_role"`
	TenantID string `json:"tenant_id"`
	jwt.RegisteredClaims
}

// NewAuthService создает новый экземпляр AuthService
func NewAuthService(db *database.DB, jwtSecret string) *AuthService {
	return &AuthService{
		db:        db,
		jwtSecret: jwtSecret,
	}
}

// Register регистрирует нового пользователя
func (s *AuthService) Register(ctx context.Context, req *models.UserRegisterRequest) (*models.AuthResponse, error) {
	// Проверяем, существует ли уже пользователь с таким email
	existingUser, err := s.db.GetUserByEmail(ctx, req.Email)
	if err == nil && existingUser != nil {
		return nil, errors.New("user with this email already exists")
	}

	// Хешируем пароль
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("failed to hash password")
	}

	// Создаем нового пользователя
	user := &models.User{
		ID:        uuid.New().String(),
		Email:     req.Email,
		Password:  string(hashedPassword),
		Role:      req.Role,
		TenantID:  req.TenantID,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		Phone:     req.Phone,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	err = s.db.CreateUser(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Генерируем токены
	token, refreshToken, err := s.generateTokens(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	return &models.AuthResponse{
		User:         *user,
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// Login выполняет аутентификацию пользователя
func (s *AuthService) Login(ctx context.Context, req *models.UserLoginRequest) (*models.AuthResponse, error) {
	// Получаем пользователя по email
	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil || user == nil {
		return nil, errors.New("invalid email or password")
	}

	// Сравниваем пароли
	err = bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password))
	if err != nil {
		return nil, errors.New("invalid email or password")
	}

	// Генерируем токены
	token, refreshToken, err := s.generateTokens(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate tokens: %w", err)
	}

	return &models.AuthResponse{
		User:         *user,
		Token:        token,
		RefreshToken: refreshToken,
	}, nil
}

// RefreshToken обновляет токены
func (s *AuthService) RefreshToken(ctx context.Context, refreshToken string) (*models.TokenResponse, error) {
	// Здесь должна быть реализация проверки refresh токена
	// и генерации новых токенов
	
	// Для простоты пока возвращаем ошибку
	return nil, errors.New("refresh token implementation not completed yet")
}

// ValidateToken проверяет валидность JWT токена
func (s *AuthService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// generateTokens генерирует JWT токены для пользователя
func (s *AuthService) generateTokens(user *models.User) (string, string, error) {
	// Генерируем access token
	accessTokenExpire := time.Now().Add(time.Hour * 24) // 24 часа
	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID:   user.ID,
		UserRole: user.Role,
		TenantID: user.TenantID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(accessTokenExpire),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	signedAccessToken, err := accessToken.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", "", err
	}

	// Генерируем refresh token
	refreshTokenExpire := time.Now().Add(time.Hour * 24 * 7) // 7 дней
	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID:   user.ID,
		UserRole: user.Role,
		TenantID: user.TenantID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(refreshTokenExpire),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	signedRefreshToken, err := refreshToken.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", "", err
	}

	return signedAccessToken, signedRefreshToken, nil
}