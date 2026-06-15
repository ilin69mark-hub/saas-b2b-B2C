package models

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"
)

type Tenant struct {
    ID     uuid.UUID  `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
    Name   string    `json:"name" gorm:"not null"`
    PlanID *uuid.UUID `json:"plan_id" gorm:"type:uuid"`
    Status string    `json:"status" gorm:"default:'active'"`
    
    // Реквизиты
    LegalEntity string `json:"legal_entity"`
    INN         string `json:"inn"`
    
    // Лимиты
    MaxUsers int `json:"max_users" gorm:"default:10"`
    
	// Биллинг
	PaidUntil       *time.Time `json:"paid_until"`
	TrialEndsAt     *time.Time `json:"trial_ends_at"`
	GracePeriodDays int        `json:"grace_period_days" gorm:"default:7"`

    // Директивы (бенчмарки дилера)
    TargetConversion     float64 `json:"target_conversion" gorm:"default:30"`
    TargetExtrasPercent  float64 `json:"target_extras_percent" gorm:"default:15"`
    MaxBonus             float64 `json:"max_bonus" gorm:"default:50000"`

    // Нормы для светофора
    DailyLeadsNorm int `json:"daily_leads_norm" gorm:"default:10"`

    // Soft Delete (для аналитики Churn)
    DeletedAt gorm.DeletedAt `json:"deleted_at" gorm:"index"`

    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

func (Tenant) TableName() string {
    return "tenants"
}
