package services

import (
	"errors"
	"time"

	"franchise-saas-backend/internal/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type UserService struct {
	db interface{}
}

func NewUserService(db interface{}) *UserService {
	return &UserService{db: db}
}

// GetUserByID retrieves a user by their ID
func (s *UserService) GetUserByID(userID string) (*models.User, error) {
	// In a real implementation, you would query the database
	// For now, we'll simulate a lookup
	
	// Validate UUID format
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Simulate fetching from database
	// In a real implementation, you would query the database here
	return &models.User{
		ID:        userID,
		Email:     "user@example.com",
		Password:  "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjdQcVrRzwwIWKXNw2vE.9YJdLQj3u", // bcrypt hash
		Role:      "dealer",
		TenantID:  "tenant-1",
		FirstName: "John",
		LastName:  "Doe",
		Phone:     "+7 (999) 123-45-67",
		CreatedAt: time.Now().Add(-24 * time.Hour), // Created yesterday
		UpdatedAt: time.Now(),
	}, nil
}

// UpdateUser updates a user's profile
func (s *UserService) UpdateUser(userID string, req models.UserUpdateRequest) (*models.User, error) {
	// In a real implementation, you would update the database
	// For now, we'll simulate the update
	
	// Validate UUID format
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Fetch existing user
	existingUser, err := s.GetUserByID(userID)
	if err != nil || existingUser == nil {
		return nil, errors.New("user not found")
	}
	
	// Update fields if provided in request
	if req.FirstName != "" {
		existingUser.FirstName = req.FirstName
	}
	if req.LastName != "" {
		existingUser.LastName = req.LastName
	}
	if req.Phone != "" {
		existingUser.Phone = req.Phone
	}
	if req.Avatar != "" {
		existingUser.Avatar = req.Avatar
	}
	
	// Update timestamp
	existingUser.UpdatedAt = time.Now()
	
	// In a real implementation, you would save to the database here
	
	return existingUser, nil
}

// GetDealersByTenant retrieves all dealers for a specific tenant
func (s *UserService) GetDealersByTenant(tenantID, role string) ([]models.User, error) {
	// In a real implementation, you would query the database
	// For now, we'll simulate the retrieval
	
	// Validate UUID format
	if _, err := uuid.Parse(tenantID); err != nil {
		return nil, errors.New("invalid tenant ID format")
	}
	
	// Simulate fetching dealers from database
	dealers := []models.User{
		{
			ID:        uuid.New().String(),
			Email:     "dealer1@example.com",
			Password:  "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjdQcVrRzwwIWKXNw2vE.9YJdLQj3u", // bcrypt hash
			Role:      "dealer",
			TenantID:  tenantID,
			FirstName: "Alice",
			LastName:  "Johnson",
			Phone:     "+7 (999) 111-11-11",
			CreatedAt: time.Now().Add(-7 * 24 * time.Hour), // Created a week ago
			UpdatedAt: time.Now(),
		},
		{
			ID:        uuid.New().String(),
			Email:     "dealer2@example.com",
			Password:  "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjdQcVrRzwwIWKXNw2vE.9YJdLQj3u", // bcrypt hash
			Role:      "dealer",
			TenantID:  tenantID,
			FirstName: "Bob",
			LastName:  "Smith",
			Phone:     "+7 (999) 222-22-22",
			CreatedAt: time.Now().Add(-5 * 24 * time.Hour), // Created 5 days ago
			UpdatedAt: time.Now(),
		},
		{
			ID:        uuid.New().String(),
			Email:     "dealer3@example.com",
			Password:  "$2a$10$N9qo8uLOickgx2ZMRZoMye.IjdQcVrRzwwIWKXNw2vE.9YJdLQj3u", // bcrypt hash
			Role:      "dealer",
			TenantID:  tenantID,
			FirstName: "Carol",
			LastName:  "Williams",
			Phone:     "+7 (999) 333-33-33",
			CreatedAt: time.Now().Add(-3 * 24 * time.Hour), // Created 3 days ago
			UpdatedAt: time.Now(),
		},
	}
	
	return dealers, nil
}

// ChangeUserPassword changes a user's password
func (s *UserService) ChangeUserPassword(userID, oldPassword, newPassword string) error {
	// In a real implementation, you would verify the old password and update the new one
	// For now, we'll just validate the new password
	
	// Validate new password strength
	if len(newPassword) < 6 {
		return errors.New("password must be at least 6 characters long")
	}
	
	// Hash the new password
	_, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("failed to hash new password")
	}
	
	// In a real implementation, you would update the password in the database
	// along with updating the updated_at timestamp
	
	return nil
}