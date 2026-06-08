package models

import (
	"time"

	"github.com/google/uuid"
)

type TerritoryInteraction struct {
	ID          uuid.UUID `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	DealerID    uuid.UUID `json:"dealer_id" gorm:"type:uuid;not null"`
	Type        string    `json:"type" gorm:"type:varchar(50);not null"`
	Description string    `json:"description" gorm:"type:text"`
	Result      string    `json:"result" gorm:"type:text"`
	CreatedBy   uuid.UUID `json:"created_by" gorm:"type:uuid"`
	CreatedAt   time.Time `json:"created_at" gorm:"autoCreateTime"`
	Date        time.Time `json:"date" gorm:"type:timestamp"`
}

func (TerritoryInteraction) TableName() string {
	return "territory_interactions"
}
