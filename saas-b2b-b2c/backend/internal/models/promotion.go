package models

import (
	"time"

	"github.com/google/uuid"
)

type Promotion struct {
	ID          uuid.UUID  `json:"id" gorm:"type:uuid;primaryKey;default:gen_random_uuid()"`
	TenantID    uuid.UUID  `json:"tenant_id" gorm:"type:uuid;index;not null"`
	DealerID    uuid.UUID  `json:"dealer_id" gorm:"type:uuid;index;not null"`
	Name        string     `json:"name" gorm:"not null"`
	Condition   string     `json:"condition"`
	DiscountMin int        `json:"discount_min" gorm:"default:0"`
	DiscountMax int        `json:"discount_max" gorm:"default:0"`
	StartDate   time.Time  `json:"start_date" gorm:"type:date"`
	EndDate     time.Time  `json:"end_date" gorm:"type:date"`
	IsActive    bool       `json:"is_active" gorm:"default:true"`
	CreatedAt   time.Time  `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time  `json:"updated_at" gorm:"autoUpdateTime"`
}

func (Promotion) TableName() string {
	return "promotions"
}

// ToDTO converts DB model to the frontend DTO used in ManagerTargetsResponse
func (p *Promotion) ToDTO() PromotionDTO {
	isExpiring := false
	if !p.EndDate.IsZero() && time.Until(p.EndDate).Hours() < 24*7 {
		isExpiring = true
	}
	endDateStr := ""
	if !p.EndDate.IsZero() {
		endDateStr = p.EndDate.Format("2006-01-02")
	}
	return PromotionDTO{
		ID:          p.ID.String(),
		Name:        p.Name,
		Condition:   p.Condition,
		DiscountMin: p.DiscountMin,
		DiscountMax: p.DiscountMax,
		EndDate:     endDateStr,
		IsExpiring:  isExpiring,
	}
}

// PromotionDTO — response for the frontend (matches ManagerTargetsResponse.Promotions)
type PromotionDTO struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Condition   string `json:"condition"`
	DiscountMin int    `json:"discount_min"`
	DiscountMax int    `json:"discount_max"`
	EndDate     string `json:"end_date"`
	IsExpiring  bool   `json:"is_expiring"`
}
