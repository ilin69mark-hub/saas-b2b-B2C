package models

import (
	"time"

	"github.com/google/uuid"
)

type Report struct {
	ID        uuid.UUID `json:"id" gorm:"type:uuid;primary_key;default:gen_random_uuid()"`
	UserID    uuid.UUID `json:"user_id" gorm:"type:uuid;not null"`
	Period    string    `json:"period"`
	Date      string    `json:"date"`
	StartDate string    `json:"start_date"`
	EndDate   string    `json:"end_date"`
	FilePath  string    `json:"file_path"`
	Status    string    `json:"status" gorm:"default:'draft'"`
	Blocks    string    `json:"blocks"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}
