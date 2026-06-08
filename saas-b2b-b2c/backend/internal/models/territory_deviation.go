package models

import (
	"time"

	"github.com/google/uuid"
)

type TerritoryDeviation struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	DealerID  uuid.UUID `json:"dealer_id" gorm:"type:uuid;not null"`
	Period    string    `json:"period" gorm:"not null"`
	Reason    string    `json:"reason"`
	Actions   string    `json:"actions"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}

func (TerritoryDeviation) TableName() string {
	return "territory_deviations"
}
