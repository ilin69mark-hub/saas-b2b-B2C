package services

import (
	"context"
	"errors"
	"time"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/repository"

	"github.com/google/uuid"
)

type PromotionService interface {
	GetMyPromotions(ctx context.Context, dealerID, tenantID string) ([]models.PromotionDTO, error)
	Create(ctx context.Context, dto CreatePromotionDTO, dealerID, tenantID string) (*models.PromotionDTO, error)
	Update(ctx context.Context, id string, dto UpdatePromotionDTO, dealerID, tenantID string) (*models.PromotionDTO, error)
	Delete(ctx context.Context, id, dealerID, tenantID string) error
}

type CreatePromotionDTO struct {
	Name        string `json:"name"`
	Condition   string `json:"condition"`
	DiscountMin int    `json:"discount_min"`
	DiscountMax int    `json:"discount_max"`
	StartDate   string `json:"start_date"`
	EndDate     string `json:"end_date"`
}

type UpdatePromotionDTO struct {
	Name        *string `json:"name"`
	Condition   *string `json:"condition"`
	DiscountMin *int    `json:"discount_min"`
	DiscountMax *int    `json:"discount_max"`
	StartDate   *string `json:"start_date"`
	EndDate     *string `json:"end_date"`
	IsActive    *bool   `json:"is_active"`
}

type promotionService struct {
	repo repository.PromotionRepository
}

func NewPromotionService(r repository.PromotionRepository) PromotionService {
	return &promotionService{repo: r}
}

func parseDate(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func (s *promotionService) GetMyPromotions(ctx context.Context, dealerID, tenantID string) ([]models.PromotionDTO, error) {
	list, err := s.repo.ListByTenant(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	dtos := make([]models.PromotionDTO, len(list))
	for i, p := range list {
		dtos[i] = p.ToDTO()
	}
	return dtos, nil
}

func (s *promotionService) Create(ctx context.Context, dto CreatePromotionDTO, dealerID, tenantID string) (*models.PromotionDTO, error) {
	if dto.Name == "" {
		return nil, errors.New("name is required")
	}

	tid, err := uuid.Parse(tenantID)
	if err != nil {
		return nil, errors.New("invalid tenant")
	}
	did, err := uuid.Parse(dealerID)
	if err != nil {
		return nil, errors.New("invalid dealer")
	}

	p := &models.Promotion{
		TenantID:    tid,
		DealerID:    did,
		Name:        dto.Name,
		Condition:   dto.Condition,
		DiscountMin: dto.DiscountMin,
		DiscountMax: dto.DiscountMax,
		IsActive:    true,
	}
	if dto.StartDate != "" {
		p.StartDate = parseDate(dto.StartDate)
	}
	if dto.EndDate != "" {
		p.EndDate = parseDate(dto.EndDate)
	}

	if err := s.repo.Create(ctx, p); err != nil {
		return nil, err
	}
	dtoResp := p.ToDTO()
	return &dtoResp, nil
}

func (s *promotionService) Update(ctx context.Context, id string, dto UpdatePromotionDTO, dealerID, tenantID string) (*models.PromotionDTO, error) {
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, errors.New("promotion not found")
	}

	if p.TenantID.String() != tenantID {
		return nil, errors.New("access denied")
	}

	if dto.Name != nil {
		p.Name = *dto.Name
	}
	if dto.Condition != nil {
		p.Condition = *dto.Condition
	}
	if dto.DiscountMin != nil {
		p.DiscountMin = *dto.DiscountMin
	}
	if dto.DiscountMax != nil {
		p.DiscountMax = *dto.DiscountMax
	}
	if dto.StartDate != nil {
		p.StartDate = parseDate(*dto.StartDate)
	}
	if dto.EndDate != nil {
		p.EndDate = parseDate(*dto.EndDate)
	}
	if dto.IsActive != nil {
		p.IsActive = *dto.IsActive
	}

	if err := s.repo.Update(ctx, p); err != nil {
		return nil, err
	}
	dtoResp := p.ToDTO()
	return &dtoResp, nil
}

func (s *promotionService) Delete(ctx context.Context, id, dealerID, tenantID string) error {
	p, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return errors.New("promotion not found")
	}
	if p.TenantID.String() != tenantID {
		return errors.New("access denied")
	}
	return s.repo.Delete(ctx, id)
}
