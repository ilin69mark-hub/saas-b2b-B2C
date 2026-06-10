package repository

import (
	"context"

	"franchise-saas-backend/internal/models"

	"gorm.io/gorm"
)

type PromotionRepository interface {
	ListByTenant(ctx context.Context, tenantID string) ([]models.Promotion, error)
	ListByDealer(ctx context.Context, dealerID string) ([]models.Promotion, error)
	Create(ctx context.Context, p *models.Promotion) error
	Update(ctx context.Context, p *models.Promotion) error
	Delete(ctx context.Context, id string) error
	GetByID(ctx context.Context, id string) (*models.Promotion, error)
}

type promotionRepository struct {
	db *gorm.DB
}

func NewPromotionRepository(db *gorm.DB) PromotionRepository {
	return &promotionRepository{db: db}
}

func (r *promotionRepository) ListByTenant(ctx context.Context, tenantID string) ([]models.Promotion, error) {
	var list []models.Promotion
	err := r.db.WithContext(ctx).
		Where("tenant_id = ? AND is_active = true", tenantID).
		Order("created_at DESC").
		Find(&list).Error
	return list, err
}

func (r *promotionRepository) ListByDealer(ctx context.Context, dealerID string) ([]models.Promotion, error) {
	var list []models.Promotion
	err := r.db.WithContext(ctx).
		Where("dealer_id = ? AND is_active = true", dealerID).
		Order("created_at DESC").
		Find(&list).Error
	return list, err
}

func (r *promotionRepository) Create(ctx context.Context, p *models.Promotion) error {
	return r.db.WithContext(ctx).Create(p).Error
}

func (r *promotionRepository) Update(ctx context.Context, p *models.Promotion) error {
	return r.db.WithContext(ctx).Save(p).Error
}

func (r *promotionRepository) Delete(ctx context.Context, id string) error {
	return r.db.WithContext(ctx).Where("id = ?", id).Delete(&models.Promotion{}).Error
}

func (r *promotionRepository) GetByID(ctx context.Context, id string) (*models.Promotion, error) {
	var p models.Promotion
	err := r.db.WithContext(ctx).Where("id = ?", id).First(&p).Error
	return &p, err
}
