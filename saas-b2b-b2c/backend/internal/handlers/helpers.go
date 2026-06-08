package handlers

import (
    "errors"

    "franchise-saas-backend/internal/models"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "gorm.io/gorm"
)

var ErrUserNotFound = errors.New("user not found")
var ErrInvalidSession = errors.New("invalid session")
var ErrAccessDenied = errors.New("access denied")

var allowedTerritoryPeriods = map[string]bool{
    "week": true, "month": true, "quarter": true, "year": true, "custom": true,
}

// requireTerritoryManagerRole проверяет, что пользователь имеет доступ к территории
func requireTerritoryManagerRole(user *models.User) error {
    if user.Role != models.RoleFranchisorManager && user.Role != models.RoleSuperAdmin && user.Role != models.RoleFranchisor {
        return ErrAccessDenied
    }
    return nil
}

// validatePeriod проверяет допустимые значения period
func validatePeriod(period string) bool {
    return allowedTerritoryPeriods[period]
}

// getCurrentUser - загружает пользователя из БД по ID из токена
func getCurrentUser(c *gin.Context) (*models.User, error) {
    userIDStr, exists := c.Get("userID")
    if !exists {
        return nil, ErrInvalidSession
    }

    uid, err := uuid.Parse(userIDStr.(string))
    if err != nil {
        return nil, err
    }

    dbVal, exists := c.Get("db")
    if !exists {
        return nil, errors.New("db not found in context")
    }

    db, ok := dbVal.(*gorm.DB)
    if !ok {
        return nil, errors.New("invalid db type")
    }

    var user models.User
    if err := db.First(&user, "id = ?", uid).Error; err != nil {
        if err == gorm.ErrRecordNotFound {
            return nil, ErrUserNotFound
        }
        return nil, err
    }

    return &user, nil
}
