package models

import (
	"time"

	"github.com/google/uuid"
)

type ManagerPlan struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	ManagerID       uuid.UUID  `gorm:"type:uuid;not null;index:idx_manager_plan"`
	Month           time.Time  `gorm:"type:date;not null;index:idx_manager_plan"`
	SalesPlan       float64    `gorm:"default:0"`
	TargetDealers   int        `gorm:"default:0"`
	TargetRedDealers int       `gorm:"default:0"`
	TargetSla       int        `gorm:"default:0"`
	CreatedAt       time.Time  `gorm:"autoCreateTime"`
	UpdatedAt       time.Time  `gorm:"autoUpdateTime"`
}

func (ManagerPlan) TableName() string {
	return "manager_plans"
}
