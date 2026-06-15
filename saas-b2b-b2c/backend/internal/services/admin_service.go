package services

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"

	"franchise-saas-backend/internal/middleware"
	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/repository"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/spf13/viper"
	"gorm.io/gorm"
)

var (
	ErrAlreadyExists       = errors.New("tenant with this slug already exists")
	ErrNotFound           = errors.New("tenant not found")
	ErrHasActiveUsers     = errors.New("cannot delete tenant with active users")
)

type AdminService struct {
	tenantRepo repository.TenantRepositoryInterface
	db         *gorm.DB
}

func NewAdminService(db *gorm.DB) *AdminService {
	return &AdminService{
		tenantRepo: repository.NewTenantRepository(db),
		db:         db,
	}
}

func NewAdminServiceWithInterfaces(tenantRepo repository.TenantRepositoryInterface, db *gorm.DB) *AdminService {
	return &AdminService{
		tenantRepo: tenantRepo,
		db:         db,
	}
}

// GetDashboardStats - статистика
func (s *AdminService) GetDashboardStats() (map[string]interface{}, error) {
	var tenantCount int64
	var userCount int64
	var activeTenants int64
	var churnedTenants int64
	var newTenantsMonth int64
	var totalRevenue float64

	s.db.Model(&models.Tenant{}).Count(&tenantCount)
	s.db.Model(&models.User{}).Count(&userCount)

	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	s.db.Model(&models.Invoice{}).
		Where("status = ? AND paid_at >= ?", "paid", startOfMonth).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&totalRevenue)

	s.db.Model(&models.Tenant{}).Where("status = ?", "active").Count(&activeTenants)
	s.db.Model(&models.Tenant{}).Where("status = ?", "churned").Count(&churnedTenants)
	s.db.Model(&models.Tenant{}).Where("created_at >= ?", startOfMonth).Count(&newTenantsMonth)

	var arpu float64
	if activeTenants > 0 {
		arpu = totalRevenue / float64(activeTenants)
	}

	type PlanDist struct {
		Name  string
		Count int
	}
	var planDistribution []PlanDist
	s.db.Table("tenants").
		Select("plans.name as name, count(tenants.id) as count").
		Joins("left join plans on tenants.plan_id = plans.id").
		Where("tenants.status = ?", "active").
		Group("plans.name").
		Scan(&planDistribution)

	arr := totalRevenue * 12

	churnRate := 0.0
	if tenantCount > 0 {
		churnRate = float64(churnedTenants) / float64(tenantCount) * 100
	}

	var overdueCount int64
	s.db.Model(&models.Invoice{}).
		Where("status = ? OR (status = ? AND due_date < ?)", "overdue", "pending", time.Now()).
		Count(&overdueCount)

	return map[string]interface{}{
		"total_tenants":     tenantCount,
		"active_tenants":    activeTenants,
		"churned_tenants":   churnedTenants,
		"total_users":       userCount,
		"mrr":               totalRevenue,
		"arr":               arr,
		"arpu":              arpu,
		"churnRate":         math.Round(churnRate*10) / 10,
		"overduePayments":   overdueCount,
		"new_this_month":    newTenantsMonth,
		"plan_stats":        planDistribution,
	}, nil
}

// GetSystemStats - системная статистика для админа
func (s *AdminService) GetSystemStats(ctx context.Context) (map[string]interface{}, error) {
	tenants, err := s.tenantRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}

	var totalUsers int64
	if s.db != nil {
		s.db.Model(&models.User{}).Count(&totalUsers)
	}

	activeTenants := 0
	for _, t := range tenants {
		if t.Status == "active" {
			activeTenants++
		}
	}

	return map[string]interface{}{
		"total_tenants":  len(tenants),
		"active_tenants": activeTenants,
		"total_users":    totalUsers,
	}, nil
}

// GetAllTenants - список всех сетей
func (s *AdminService) GetAllTenants(ctx context.Context) ([]map[string]interface{}, error) {
	startOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)

	type TenantRow struct {
		ID          string     `json:"id"`
		Name        string     `json:"name"`
		Status      string     `json:"status"`
		PlanID      *string    `json:"plan_id"`
		PlanName    *string    `json:"plan_name"`
		LegalEntity string     `json:"legal_entity"`
		INN         string     `json:"inn"`
		MaxUsers    int        `json:"max_users"`
		PaidUntil   *time.Time `json:"paid_until"`
		UserCount   int        `json:"user_count"`
		DealerCount int        `json:"dealer_count"`
		MRR         float64    `json:"mrr"`
		CreatedAt   time.Time  `json:"created_at"`
		UpdatedAt   time.Time  `json:"updated_at"`
	}
	var rows []TenantRow
	s.db.Raw(`
		SELECT t.id, t.name, t.status, t.plan_id, p.name AS plan_name,
			t.legal_entity, t.inn, t.max_users, t.paid_until, t.created_at, t.updated_at,
			COALESCE(uc.count, 0) AS user_count,
			COALESCE(dc.count, 0) AS dealer_count,
			COALESCE(inv.total, 0) AS mrr
		FROM tenants t
		LEFT JOIN plans p ON t.plan_id = p.id
		LEFT JOIN (SELECT tenant_id, COUNT(*) AS count FROM users GROUP BY tenant_id) uc ON uc.tenant_id = t.id
		LEFT JOIN (SELECT tenant_id, COUNT(*) AS count FROM users WHERE role = 'dealer' GROUP BY tenant_id) dc ON dc.tenant_id = t.id
		LEFT JOIN (SELECT tenant_id, SUM(amount) AS total FROM invoices WHERE status = 'paid' AND paid_at >= ? GROUP BY tenant_id) inv ON inv.tenant_id = t.id
		ORDER BY t.created_at DESC
	`, startOfMonth).Scan(&rows)

	results := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		paymentStatus := "paid"
		if r.PaidUntil != nil && r.PaidUntil.Before(time.Now()) {
			paymentStatus = "overdue"
		} else if r.PaidUntil == nil {
			paymentStatus = "pending"
		}

		results = append(results, map[string]interface{}{
			"id":             r.ID,
			"name":           r.Name,
			"status":         r.Status,
			"plan_id":        r.PlanID,
			"plan_name":      r.PlanName,
			"legal_entity":   r.LegalEntity,
			"inn":            r.INN,
			"max_users":      r.MaxUsers,
			"paid_until":     r.PaidUntil,
			"user_count":     r.UserCount,
			"dealer_count":   r.DealerCount,
			"mrr":            r.MRR,
			"payment_status": paymentStatus,
			"created_at":     r.CreatedAt,
			"updated_at":     r.UpdatedAt,
		})
	}
	return results, nil
}

// GetOnboarding - новые тенанты (последние 30 дней) с прогрессом
func (s *AdminService) GetOnboarding(ctx context.Context) ([]map[string]interface{}, error) {
	thirtyDaysAgo := time.Now().AddDate(0, 0, -30)

	type OnboardingRow struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		CreatedAt time.Time `json:"created_at"`
	}
	var rows []OnboardingRow
	s.db.Table("tenants").
		Select("id, name, created_at").
		Where("created_at >= ?", thirtyDaysAgo).
		Order("created_at DESC").
		Scan(&rows)

	results := make([]map[string]interface{}, 0, len(rows))
	for _, r := range rows {
		step := "account_created"
		progress := 25

		var dealerCount int64
		s.db.Model(&models.User{}).Where("tenant_id = ? AND role = 'dealer'", r.ID).Count(&dealerCount)
		if dealerCount > 0 {
			step = "dealers_added"
			progress = 50
		}

		var saleCount int64
		s.db.Table("leads").Where("tenant_id = ? AND status = 'sale'", r.ID).Count(&saleCount)
		if saleCount > 0 {
			step = "first_sale"
			progress = 100
		}

		daysToTTV := int(time.Since(r.CreatedAt).Hours() / 24)
		if daysToTTV < 0 {
			daysToTTV = 0
		}

		results = append(results, map[string]interface{}{
			"id":        r.ID,
			"name":      r.Name,
			"createdAt": r.CreatedAt.Format("2006-01-02"),
			"step":      step,
			"progress":  progress,
			"daysToTtv": daysToTTV,
		})
	}
	return results, nil
}

// GetTenantsWithPaidUntil - для payment job
func (s *AdminService) GetTenantsWithPaidUntil(ctx context.Context) ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := s.db.Table("tenants").
		Select("id, paid_until").
		Where("paid_until IS NOT NULL").
		Find(&results).Error
	return results, err
}

// GetTenantsPaymentStatus - статус оплат сетей
func (s *AdminService) GetTenantsPaymentStatus() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := s.db.Table("tenants").
		Select("tenants.id, tenants.name, tenants.status, tenants.plan_id, tenants.paid_until, plans.name as plan_name").
		Joins("LEFT JOIN plans ON tenants.plan_id = plans.id").
		Find(&results).Error
	return results, err
}

// GetTenantByID - получить тенант по ID
func (s *AdminService) GetTenantByID(id uuid.UUID) (*models.Tenant, error) {
	var tenant models.Tenant
	err := s.db.First(&tenant, id).Error
	if err != nil {
		return nil, err
	}
	return &tenant, nil
}

// CreateTenantRequest - запрос на создание тенанта
type CreateTenantRequest struct {
	Name        string     `json:"name"`
	PlanID      *uuid.UUID `json:"plan_id"`
	Tariff      string     `json:"tariff"`
	LegalEntity string     `json:"legal_entity"`
	INN         string     `json:"inn"`
	MaxUsers    int        `json:"max_users"`
	ContactName string     `json:"contact_name"`
	ContactEmail string     `json:"contact_email"`
}

// CreateTenant - создать сеть
func (s *AdminService) CreateTenant(ctx context.Context, req *CreateTenantRequest) (*models.Tenant, error) {
	tenants, err := s.tenantRepo.FindAll(ctx)
	if err != nil {
		return nil, err
	}
	for _, t := range tenants {
		if t.Name == req.Name {
			return nil, ErrAlreadyExists
		}
	}

	planID := req.PlanID
	if planID == nil && req.Tariff != "" {
		var plan models.Plan
		if err := s.db.Where("name = ?", req.Tariff).First(&plan).Error; err == nil {
			planID = &plan.ID
		}
	}

	tenant := &models.Tenant{
		Name:        req.Name,
		PlanID:      planID,
		Status:      "active",
		LegalEntity: req.LegalEntity,
		INN:         req.INN,
		MaxUsers:    req.MaxUsers,
	}

	created, err := s.tenantRepo.CreateTenant(ctx, tenant)
	if err != nil {
		return nil, err
	}

	if req.ContactEmail != "" {
		contactUser := models.User{
			Email:     req.ContactEmail,
			FirstName: req.ContactName,
			TenantID:  &created.ID,
			Role:      models.RoleFranchisor,
			Status:    "active",
		}
		s.db.Create(&contactUser)
	}

	return created, nil
}

// UpdateTenant - обновить сеть
func (s *AdminService) UpdateTenant(id uuid.UUID, name string, planID *uuid.UUID, paidUntil *time.Time, tariff string) error {
	updates := map[string]interface{}{}
	if name != "" {
		updates["name"] = name
	}
	if tariff != "" && planID == nil {
		var plan models.Plan
		if err := s.db.Where("name = ?", tariff).First(&plan).Error; err == nil {
			planID = &plan.ID
		}
	}
	if planID != nil {
		updates["plan_id"] = planID
	}
	if paidUntil != nil {
		updates["paid_until"] = paidUntil
	}
	return s.db.Model(&models.Tenant{}).Where("id = ?", id).Updates(updates).Error
}

// BlockTenant - заблокировать
func (s *AdminService) BlockTenant(id uuid.UUID) error {
	return s.db.Model(&models.Tenant{}).Where("id = ?", id).Update("status", "blocked").Error
}

// UnblockTenant - разблокировать
func (s *AdminService) UnblockTenant(id uuid.UUID) error {
	return s.db.Model(&models.Tenant{}).Where("id = ?", id).Update("status", "active").Error
}

// SuspendTenant - приостановить тенант
func (s *AdminService) SuspendTenant(ctx context.Context, id uuid.UUID) error {
	tenant, err := s.tenantRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if tenant == nil {
		return ErrNotFound
	}

	tenant.Status = "suspended"
	return s.tenantRepo.UpdateTenant(ctx, tenant)
}

// DeleteTenant - удалить (мягкое удаление)
func (s *AdminService) DeleteTenant(ctx context.Context, id uuid.UUID) error {
	tenant, err := s.tenantRepo.FindByID(ctx, id)
	if err != nil {
		return ErrNotFound
	}
	if tenant == nil {
		return ErrNotFound
	}

	// Проверка на активных пользователей
	userCount, err := s.tenantRepo.CountUsersByTenantID(ctx, id)
	if err != nil {
		return err
	}
	if userCount > 0 {
		return ErrHasActiveUsers
	}

	tenant.Status = "churned"
	return s.tenantRepo.UpdateTenant(ctx, tenant)
}

// === PLANS ===

// === INVOICES ===

func (s *AdminService) CreateInvoice(tenantID uuid.UUID, amount float64, description string, dueDate time.Time) (*models.Invoice, error) {
	inv := models.Invoice{
		TenantID:    tenantID,
		Amount:      amount,
		Description: description,
		DueDate:     dueDate,
		Status:      "pending",
	}
	if err := s.db.Create(&inv).Error; err != nil {
		return nil, err
	}
	return &inv, nil
}

func (s *AdminService) GetAllInvoices() ([]map[string]interface{}, error) {
	var results []map[string]interface{}
	err := s.db.Table("invoices").
		Select("invoices.id, invoices.tenant_id, invoices.amount, invoices.status, invoices.due_date, invoices.paid_at, tenants.name as tenant_name").
		Joins("LEFT JOIN tenants ON invoices.tenant_id = tenants.id").
		Order("invoices.created_at DESC").
		Find(&results).Error
	return results, err
}

func (s *AdminService) MarkInvoicePaid(invoiceID uuid.UUID) error {
	now := time.Now()
	return s.db.Model(&models.Invoice{}).Where("id = ?", invoiceID).Updates(map[string]interface{}{
		"status":  "paid",
		"paid_at": now,
	}).Error
}

// === ЭТАП 2: АНАЛИТИКА ===

// AnalyticsResponse структура для фронта
type AnalyticsResponse struct {
	DAU           int64                    `json:"dau"`
	MAU           int64                    `json:"mau"`
	StickyFactor  float64                  `json:"sticky_factor"`
	Registrations []map[string]interface{} `json:"registrations"`
	Funnel        FunnelStats              `json:"funnel"`
}

type FunnelStats struct {
	TotalTenants int64   `json:"total_tenants"`
	TrialActive  int64   `json:"trial_active"`
	PaidActive   int64   `json:"paid_active"`
	Conversion   float64 `json:"conversion"`
}

// GetAnalyticsData собирает метрики активности
func (s *AdminService) GetAnalyticsData() (*AnalyticsResponse, error) {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	// 1. DAU / MAU (простые запросы к таблице user_logs)
	// Для простоты делаем прямые запросы через db, можно вынести в repo
	var dau, mau int64
	s.db.Model(&models.UserLog{}).
		Select("COUNT(DISTINCT user_id)").
		Where("created_at >= ?", startOfDay).
		Scan(&dau)

	thirtyDaysAgo := now.AddDate(0, 0, -30)
	s.db.Model(&models.UserLog{}).
		Select("COUNT(DISTINCT user_id)").
		Where("created_at >= ?", thirtyDaysAgo).
		Scan(&mau)

	sticky := 0.0
	if mau > 0 {
		sticky = float64(dau) / float64(mau) * 100
	}

	// 2. Регистрации
	var regs []map[string]interface{}
	s.db.Table("users").
		Select("DATE(created_at) as date, COUNT(*) as count").
		Where("created_at >= ?", time.Now().AddDate(0, 0, -7)).
		Group("DATE(created_at)").
		Order("date asc").
		Find(&regs)

	// 3. Воронка
	var total, trial, paid int64
	s.db.Model(&models.Tenant{}).Count(&total)
	s.db.Model(&models.Tenant{}).Where("trial_ends_at > ?", now).Count(&trial)
	s.db.Model(&models.Tenant{}).Where("status = ?", "active").Count(&paid)

	conv := 0.0
	if total > 0 {
		conv = float64(paid) / float64(total) * 100
	}

	return &AnalyticsResponse{
		DAU:           dau,
		MAU:           mau,
		StickyFactor:  sticky,
		Registrations: regs,
		Funnel: FunnelStats{
			TotalTenants: total,
			TrialActive:  trial,
			PaidActive:   paid,
			Conversion:   conv,
		},
	}, nil
}

// === ЭТАП 3: Продукт и KPI ===

// GetProductAnalytics возвращает метрики продукта
func (s *AdminService) GetProductAnalytics() (map[string]interface{}, error) {
	// 1. KPI по задачам (Checklists)
	var totalTasks, completedTasks int64
	s.db.Model(&models.Checklist{}).Count(&totalTasks)
	s.db.Model(&models.Checklist{}).Where("status = ?", "completed").Count(&completedTasks)

	kpiPercent := 0.0
	if totalTasks > 0 {
		kpiPercent = float64(completedTasks) / float64(totalTasks) * 100
	}

	// 2. Trial Воронка (Используем поля из миграции этапа 2)
	var activeTrials int64
	now := time.Now()
	s.db.Model(&models.Tenant{}).Where("trial_ends_at > ? AND status = ?", now, "active").Count(&activeTrials)

	// 3. Retention (Простая метрика: % активных от общего числа созданных)
	var totalTenants, activeTenants int64
	s.db.Model(&models.Tenant{}).Count(&totalTenants)
	s.db.Model(&models.Tenant{}).Where("status = ?", "active").Count(&activeTenants)

	retention := 0.0
	if totalTenants > 0 {
		retention = float64(activeTenants) / float64(totalTenants) * 100
	}

	return map[string]interface{}{
		"kpi": map[string]interface{}{
			"total_tasks":     totalTasks,
			"completed_tasks": completedTasks,
			"completion_rate": kpiPercent,
		},
		"trials": map[string]interface{}{
			"active_count": activeTrials,
		},
		"product": map[string]interface{}{
			"retention_rate": retention,
		},
	}, nil
}

// === ЭТАП 4: Риски и Health Score ===

type RiskTenant struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Status       string    `json:"status"`
	HealthScore  int       `json:"health_score"`
	RiskReason   string    `json:"risk_reason"`
	LastActivity string    `json:"last_activity"`
}

// GetRisksAnalytics возвращает список сетей в зоне риска
func (s *AdminService) GetRisksAnalytics() ([]RiskTenant, error) {
	var tenants []models.Tenant
	// Берем все сети, включая неактивные (soft deleted не берем)
	if err := s.db.Where("status != ?", "churned").Find(&tenants).Error; err != nil {
		return nil, err
	}

	var risks []RiskTenant
	now := time.Now()
	thirtyDaysAgo := now.AddDate(0, 0, -30)

	for _, t := range tenants {
		score := 100
		reasons := []string{}

		// 1. Проверка Финансов (40% веса)
		if t.PaidUntil == nil || t.PaidUntil.Before(now) {
			score -= 40
			reasons = append(reasons, "Просрочена оплата")
		}

		// 2. Проверка Активности (40% веса)
		// Смотрим, были ли логи от юзеров этой сети за последние 30 дней
		var lastLog models.UserLog
		s.db.Where("tenant_id = ?", t.ID).Order("created_at desc").First(&lastLog)

		lastActStr := "Никогда"
		if lastLog.ID != uuid.Nil {
			lastActStr = lastLog.CreatedAt.Format("2006-01-02")
			if lastLog.CreatedAt.Before(thirtyDaysAgo) {
				score -= 40
				reasons = append(reasons, "Нет активности 30 дней")
			}
		} else {
			score -= 40
			reasons = append(reasons, "Нет логов активности")
		}

		// 3. Проверка KPI (20% веса)
		// Если есть задачи, но % выполнения низкий
		var total, completed int64
		s.db.Model(&models.Checklist{}).Where("tenant_id = ?", t.ID).Count(&total)
		if total > 0 {
			s.db.Model(&models.Checklist{}).Where("tenant_id = ? AND status = ?", t.ID, "completed").Count(&completed)
			rate := float64(completed) / float64(total)
			if rate < 0.5 { // Меньше 50% выполнения
				score -= 20
				reasons = append(reasons, "Низкое выполнение KPI")
			}
		}

		// Если есть проблемы, добавляем в список
		if len(reasons) > 0 || t.Status == "blocked" {
			risks = append(risks, RiskTenant{
				ID:           t.ID,
				Name:         t.Name,
				Status:       t.Status,
				HealthScore:  score,
				RiskReason:   strings.Join(reasons, "; "),
				LastActivity: lastActStr,
			})
		}
	}

	// Сортируем: самые "больные" впереди
	// (Простая сортировка пузырьком для малого кол-ва сетей)
	for i := 0; i < len(risks); i++ {
		for j := i + 1; j < len(risks); j++ {
			if risks[i].HealthScore > risks[j].HealthScore {
				risks[i], risks[j] = risks[j], risks[i]
			}
		}
	}

	return risks, nil
}

// === ЭТАП 5: LTV, CAC и Unit Economics ===

// GetUnitEconomics - расчет LTV, CAC и Ratio
func (s *AdminService) GetUnitEconomics() (map[string]interface{}, error) {
	// 1. LTV (Lifetime Value)
	// Считаем средний доход с одной сети за всё время
	// LTV = Общая выручка / Кол-во сетей (когда-либо созданных)
	var totalRevenue float64
	var totalTenantsEver int64

	s.db.Model(&models.Invoice{}).Where("status = ?", "paid").Select("COALESCE(SUM(amount), 0)").Scan(&totalRevenue)
	s.db.Model(&models.Tenant{}).Unscoped().Count(&totalTenantsEver) // Unscoped чтобы считать и удаленных

	ltv := 0.0
	if totalTenantsEver > 0 {
		ltv = totalRevenue / float64(totalTenantsEver)
	}

	// 2. CAC (Customer Acquisition Cost)
	// Расходы на маркетинг / Кол-во НОВЫХ сетей за этот месяц
	// Получаем расходы из system_settings
	var marketingSpendStr string
	s.db.Table("system_settings").Where("key = ?", "marketing_spend_current_month").Select("value").Scan(&marketingSpendStr)

	marketingSpend := 0.0
	if marketingSpendStr != "" {
		fmt.Sscanf(marketingSpendStr, "%f", &marketingSpend)
	}

	var newTenantsThisMonth int64
	startOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC)
	s.db.Model(&models.Tenant{}).Where("created_at >= ?", startOfMonth).Count(&newTenantsThisMonth)

	cac := 0.0
	if newTenantsThisMonth > 0 {
		cac = marketingSpend / float64(newTenantsThisMonth)
	}

	// 3. LTV/CAC Ratio (Здоровье бизнеса)
	// > 3 - отлично, < 1 - плохо
	ratio := 0.0
	if cac > 0 {
		ratio = ltv / cac
	}

	return map[string]interface{}{
		"ltv":               ltv,
		"cac":               cac,
		"ltv_cac_ratio":     ratio,
		"marketing_spend":   marketingSpend,
		"new_tenants_month": newTenantsThisMonth,
	}, nil
}

// UpdateMarketingSpend - обновить расходы на маркетинг
func (s *AdminService) UpdateMarketingSpend(amount float64) error {
	amountStr := fmt.Sprintf("%.2f", amount)
	return s.db.Exec(`
        INSERT INTO system_settings (key, value, updated_at) 
        VALUES ('marketing_spend_current_month', ?, NOW()) 
        ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = NOW()
    `, amountStr, amountStr).Error
}

// === ACTIVITY ===

func (s *AdminService) GetActivityOverview(days int, tenantID string) (map[string]interface{}, error) {
	now := time.Now()
	weekAgo := now.AddDate(0, 0, -7)
	monthAgo := now.AddDate(0, 0, -30)

	q := s.db.Model(&models.UserLog{})
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}

	var dau, wau, mau int64
	q.Where("created_at >= ?", now.AddDate(0, 0, -1)).Select("COUNT(DISTINCT user_id)").Scan(&dau)
	q.Where("created_at >= ?", weekAgo).Select("COUNT(DISTINCT user_id)").Scan(&wau)
	q.Where("created_at >= ?", monthAgo).Select("COUNT(DISTINCT user_id)").Scan(&mau)

	var prevMau int64
	startPrev := monthAgo.AddDate(0, 0, -30)
	q.Where("created_at >= ? AND created_at < ?", startPrev, monthAgo).Select("COUNT(DISTINCT user_id)").Scan(&prevMau)

	dauChange := 0.0
	wauChange := 0.0
	mauChange := 0.0
	if prevMau > 0 {
		mauChange = (float64(mau) - float64(prevMau)) / float64(prevMau) * 100
	}

	stickiness := 0.0
	if mau > 0 {
		stickiness = float64(dau) / float64(mau) * 100
	}

	// Считаем количество сессий за сегодня
	var sessions int64
	s.db.Model(&models.UserLog{}).Where("created_at >= ?", now.AddDate(0, 0, -1)).Select("COUNT(DISTINCT user_id)").Scan(&sessions)

	return map[string]interface{}{
		"dau":             dau,
		"dauChange":       math.Round(dauChange*10) / 10,
		"wau":             wau,
		"wauChange":       math.Round(wauChange*10) / 10,
		"mau":             mau,
		"mauChange":       math.Round(mauChange*10) / 10,
		"stickiness":      math.Round(stickiness*10) / 10,
		"avgSessionTime":  25,
		"activeSessions":  sessions,
	}, nil
}

func (s *AdminService) GetActivityDynamics(days int, tenantID string) ([]map[string]interface{}, error) {
	q := s.db.Table("user_logs").
		Select("DATE(created_at) as date, COUNT(DISTINCT user_id) as dau")
	if tenantID != "" {
		q = q.Where("tenant_id = ?", tenantID)
	}
	q = q.Where("created_at >= ?", time.Now().AddDate(0, 0, -days)).
		Group("DATE(created_at)").Order("date ASC")

	results := make([]map[string]interface{}, 0)
	if err := q.Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}

func (s *AdminService) GetActivityByTenant(days int) ([]map[string]interface{}, error) {
	since := time.Now().AddDate(0, 0, -days)

	type TenantStats struct {
		TenantID   string
		TenantName string
		DAU        int64
		WAU        int64
		MAU        int64
	}
	var stats []TenantStats
	s.db.Table("user_logs").
		Select("tenants.id as tenant_id, tenants.name as tenant_name, COUNT(DISTINCT user_logs.user_id) as mau").
		Joins("LEFT JOIN tenants ON user_logs.tenant_id = tenants.id").
		Where("user_logs.created_at >= ?", time.Now().AddDate(0, 0, -30)).
		Group("tenants.id, tenants.name").
		Find(&stats)

	result := make([]map[string]interface{}, 0)
	for _, st := range stats {
		var dau int64
		s.db.Model(&models.UserLog{}).Where("tenant_id = ? AND created_at >= ?", st.TenantID, time.Now().AddDate(0, 0, -1)).
			Select("COUNT(DISTINCT user_id)").Scan(&dau)
		var wau int64
		s.db.Model(&models.UserLog{}).Where("tenant_id = ? AND created_at >= ?", st.TenantID, time.Now().AddDate(0, 0, -7)).
			Select("COUNT(DISTINCT user_id)").Scan(&wau)

		stickiness := 0.0
		if st.MAU > 0 {
			stickiness = float64(dau) / float64(st.MAU) * 100
		}

		var totalUsers, activeUsers int64
		s.db.Model(&models.User{}).Where("tenant_id = ?", st.TenantID).Count(&totalUsers)
		s.db.Model(&models.UserLog{}).Where("tenant_id = ? AND created_at >= ?", st.TenantID, since).
			Select("COUNT(DISTINCT user_id)").Scan(&activeUsers)
		licensePct := 0.0
		if totalUsers > 0 {
			licensePct = float64(activeUsers) / float64(totalUsers) * 100
		}

		result = append(result, map[string]interface{}{
			"id":                   st.TenantID,
			"name":                 st.TenantName,
			"dau":                  dau,
			"wau":                  wau,
			"mau":                  st.MAU,
			"stickiness":           math.Round(stickiness*10) / 10,
			"activeLicensePercent": math.Round(licensePct*10) / 10,
		})
	}
	return result, nil
}

func (s *AdminService) GetFeatureAdoption(days int) ([]map[string]interface{}, error) {
	var totalTenants int64
	s.db.Model(&models.Tenant{}).Count(&totalTenants)
	if totalTenants == 0 {
		totalTenants = 1
	}

	var totalUsers int64
	s.db.Model(&models.User{}).Count(&totalUsers)
	if totalUsers == 0 {
		totalUsers = 1
	}

	since := time.Now().AddDate(0, 0, -days)
	prevSince := time.Now().AddDate(0, 0, -2*days)

	type FeatureDef struct {
		Name      string
		Table     string
		TenantCol string
		UserCol   string
		DateCol   string
		Where     string
	}

	features := []FeatureDef{
		{"Управление дилерами", "users", "tenant_id", "id", "created_at", "role = 'dealer'"},
		{"Чек-листы", "checklists", "tenant_id", "user_id", "created_at", ""},
		{"Коммуникации", "territory_interactions", "tenant_id", "created_by", "date", ""},
		{"Цели и планы", "goals", "tenant_id", "assignee_id", "created_at", ""},
		{"Задачи", "tasks", "tenant_id", "created_by", "created_at", ""},
	}

	var result []map[string]interface{}
	for _, f := range features {
		var currTenantCount int64
		q := s.db.Table(f.Table).
			Select("COUNT(DISTINCT " + f.TenantCol + ")").
			Where(f.TenantCol + " IS NOT NULL").
			Where(f.DateCol + " >= ?", since)
		if f.Where != "" {
			q = q.Where(f.Where)
		}
		q.Scan(&currTenantCount)

		var currUserCount int64
		uq := s.db.Table(f.Table).
			Select("COUNT(DISTINCT " + f.UserCol + ")").
			Where(f.UserCol + " IS NOT NULL").
			Where(f.DateCol + " >= ?", since)
		if f.Where != "" {
			uq = uq.Where(f.Where)
		}
		uq.Scan(&currUserCount)

		var prevUserCount int64
		pq := s.db.Table(f.Table).
			Select("COUNT(DISTINCT " + f.UserCol + ")").
			Where(f.UserCol + " IS NOT NULL").
			Where(f.DateCol+" >= ? AND "+f.DateCol+" < ?", prevSince, since)
		if f.Where != "" {
			pq = pq.Where(f.Where)
		}
		pq.Scan(&prevUserCount)

		var activeDays int64
		dq := s.db.Table(f.Table).
			Select("COUNT(DISTINCT DATE(" + f.DateCol + "))").
			Where(f.UserCol + " IS NOT NULL").
			Where(f.DateCol + " >= ?", since)
		if f.Where != "" {
			dq = dq.Where(f.Where)
		}
		dq.Scan(&activeDays)

		freq := "monthly"
		if activeDays >= int64(float64(days)*0.4) {
			freq = "daily"
		} else if activeDays >= 3 {
			freq = "weekly"
		}

		trend := "stable"
		if prevUserCount > 0 {
			ratio := float64(currUserCount) / float64(prevUserCount)
			if ratio > 1.1 {
				trend = "up"
			} else if ratio < 0.9 {
				trend = "down"
			}
		} else if currUserCount > 0 {
			trend = "up"
		}

		result = append(result, map[string]interface{}{
			"id":            fmt.Sprintf("%d", len(result)+1),
			"name":          f.Name,
			"tenantPercent": math.Round(float64(currTenantCount)/float64(totalTenants)*1000) / 10,
			"userPercent":   math.Round(float64(currUserCount)/float64(totalUsers)*1000) / 10,
			"frequency":     freq,
			"trend":         trend,
		})
	}
	return result, nil
}

func (s *AdminService) GetTimeToValue(days int) ([]map[string]interface{}, error) {
	type TenantInfo struct {
		ID        uuid.UUID
		Name      string
		CreatedAt time.Time
	}
	var tenants []TenantInfo
	s.db.Model(&models.Tenant{}).
		Select("id, name, created_at").
		Order("created_at DESC").
		Limit(20).
		Find(&tenants)

	var result []map[string]interface{}
	for _, t := range tenants {
		var firstInvoice struct {
			CreatedAt time.Time
		}
		err := s.db.Model(&models.Invoice{}).Where("tenant_id = ? AND status = ?", t.ID, "paid").
			Select("created_at").Order("created_at ASC").First(&firstInvoice).Error

		ttvDays := -1
		firstSaleAt := ""
		if err == nil {
			firstSaleAt = firstInvoice.CreatedAt.Format("2006-01-02")
			d1 := time.Date(t.CreatedAt.Year(), t.CreatedAt.Month(), t.CreatedAt.Day(), 0, 0, 0, 0, time.UTC)
			d2 := time.Date(firstInvoice.CreatedAt.Year(), firstInvoice.CreatedAt.Month(), firstInvoice.CreatedAt.Day(), 0, 0, 0, 0, time.UTC)
			ttvDays = int(d2.Sub(d1).Hours() / 24)
			if ttvDays < 0 {
				ttvDays = 0
			}
		}

		result = append(result, map[string]interface{}{
			"id":          t.ID.String(),
			"name":        t.Name,
			"createdAt":   t.CreatedAt.Format("2006-01-02"),
			"firstSaleAt": firstSaleAt,
			"ttvDays":     ttvDays,
		})
	}
	return result, nil
}

// === TECH HEALTH ===

func (s *AdminService) GetHealthStatus() (map[string]interface{}, error) {
	var totalRequests, errorCount int64
	s.db.Model(&models.UserLog{}).Count(&totalRequests)
	s.db.Model(&models.UserLog{}).Where("action = ?", "error").Count(&errorCount)

	errorRate := 0.0
	if totalRequests > 0 {
		errorRate = float64(errorCount) / float64(totalRequests) * 100
	}

	stats := middleware.GetHealthStats()

	return map[string]interface{}{
		"uptime":            stats.Uptime,
		"avgResponseTime":  stats.AvgResponseTime,
		"p95ResponseTime":  stats.P95ResponseTime,
		"p99ResponseTime":  stats.P99ResponseTime,
		"errorRate":        math.Round(errorRate*100) / 100,
		"activeWebsockets": stats.ActiveWebsockets,
	}, nil
}

func (s *AdminService) GetHealthPerformance(period, startDate, endDate string) ([]map[string]interface{}, error) {
	var startTime, endTime time.Time
	endTime = time.Now()

	if startDate != "" && endDate != "" {
		var err error
		startTime, err = time.Parse(time.RFC3339, startDate)
		if err != nil {
			startTime, err = time.Parse("2006-01-02", startDate)
			if err != nil {
				return nil, fmt.Errorf("invalid start_date: %w", err)
			}
		}
		endTime, err = time.Parse(time.RFC3339, endDate)
		if err != nil {
			endTime, err = time.Parse("2006-01-02", endDate)
			if err != nil {
				return nil, fmt.Errorf("invalid end_date: %w", err)
			}
		}
	} else {
		hours := 24
		if period == "7d" {
			hours = 168
		} else if period == "30d" {
			hours = 720
		}
		startTime = endTime.Add(-time.Duration(hours) * time.Hour)
	}

	stats := middleware.GetHealthStats()

	var result []map[string]interface{}
	current := startTime.Truncate(2 * time.Hour)
	for current.Before(endTime) {
		bucketEnd := current.Add(2 * time.Hour)

		var totalCount, errorCount int64
		s.db.Model(&models.UserLog{}).
			Where("created_at >= ? AND created_at < ?", current, bucketEnd).
			Count(&totalCount)
		s.db.Model(&models.UserLog{}).
			Where("created_at >= ? AND created_at < ? AND action = ?", current, bucketEnd, "error").
			Count(&errorCount)

		rps := float64(0)
		if totalCount > 0 {
			rps = float64(totalCount) / 7200
		}
		errRate5xx := float64(0)
		if totalCount > 0 {
			errRate5xx = float64(errorCount) / float64(totalCount) * 100
		}

		result = append(result, map[string]interface{}{
			"timestamp":          current.Format(time.RFC3339),
			"avgResponseTime":   stats.AvgResponseTime,
			"p95ResponseTime":   stats.P95ResponseTime,
			"p99ResponseTime":   stats.P99ResponseTime,
			"requestsPerSecond": math.Round(rps*100) / 100,
			"errorRate4xx":      float64(0),
			"errorRate5xx":      math.Round(errRate5xx*100) / 100,
		})

		current = bucketEnd
	}

	return result, nil
}

func (s *AdminService) GetHealthErrors(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 50
	}
	var logs []models.UserLog
	s.db.Where("action = ?", "error").Order("created_at DESC").Limit(limit).Find(&logs)

	result := make([]map[string]interface{}, 0)
	for _, l := range logs {
		tenantName := ""
		if l.TenantID != nil {
			var t models.Tenant
			s.db.First(&t, "id = ?", l.TenantID)
			tenantName = t.Name
		}

		code := 500
		endpoint := l.Action
		message := l.UserAgent
		// UserAgent format: "404 | GET /api/leads"
		parts := strings.SplitN(l.UserAgent, " | ", 2)
		if len(parts) == 2 {
			fmt.Sscanf(parts[0], "%d", &code)
			endpoint = parts[1]
			message = parts[1]
		}

		result = append(result, map[string]interface{}{
			"id":        l.ID.String(),
			"timestamp": l.CreatedAt.Format(time.RFC3339),
			"code":      code,
			"endpoint":  endpoint,
			"tenant":    tenantName,
			"message":   message,
		})
	}
	return result, nil
}

func (s *AdminService) GetHealthServices() ([]map[string]interface{}, error) {
	// 1. API Gateway — реальные метрики Go runtime
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	heapInUseMB := float64(m.HeapInuse) / 1024 / 1024
	sysMB := float64(m.Sys) / 1024 / 1024
	numGoroutines := runtime.NumGoroutine()

	// CPU proxy: goroutines → % (0-20 = idle, 20-50 = norm, 50+ = high)
	cpuGateway := float64(numGoroutines)
	if cpuGateway > 100 {
		cpuGateway = 100
	}

	memGateway := 0.0
	if sysMB > 0 {
		memGateway = heapInUseMB / sysMB * 100
	}
	if memGateway > 100 {
		memGateway = 100
	}

	// Версия Go
	goVersion := runtime.Version()[2:] // "go1.22.0" → "1.22.0"

	// Дата деплоя = время модификации бинарника
	binaryModTime := "-"
	if exe, err := os.Executable(); err == nil {
		if fi, err := os.Stat(exe); err == nil {
			binaryModTime = fi.ModTime().Format("2006-01-02")
		}
	}

	// 2. Database — реальные метрики Postgres
	var activeConns int64
	s.db.Raw("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'").Scan(&activeConns)

	var maxConnsStr string
	s.db.Raw("SHOW max_connections").Scan(&maxConnsStr)
	maxConns, _ := strconv.Atoi(maxConnsStr)

	dbCPU := 0.0
	if maxConns > 0 {
		dbCPU = float64(activeConns) / float64(maxConns) * 100
	}

	var cacheHit float64
	s.db.Raw(`
		SELECT COALESCE(
			round(blks_hit::numeric / NULLIF(blks_hit + blks_read, 0) * 100, 1),
			0
		) FROM pg_stat_database WHERE datname = current_database()
	`).Scan(&cacheHit)

	dbStatus := "healthy"
	if dbCPU > 90 {
		dbStatus = "degraded"
	}

	dbVersion := s.getDBVersion()

	return []map[string]interface{}{
		{
			"id": "1", "name": "API Gateway", "status": "healthy",
			"cpu": math.Round(cpuGateway), "memory": math.Round(memGateway),
			"instances": 1, "lastDeploy": binaryModTime, "version": goVersion,
		},
		{
			"id": "2", "name": "Database", "status": dbStatus,
			"cpu": math.Round(dbCPU), "memory": math.Round(cacheHit),
			"instances": 1, "lastDeploy": "-", "version": dbVersion,
		},
		{
			"id": "3", "name": "Auth Service (демо)", "status": "healthy",
			"cpu": 0, "memory": 0,
			"instances": 1, "lastDeploy": "-", "version": "1.0.0",
		},
		{
			"id": "4", "name": "File Storage (демо)", "status": "degraded",
			"cpu": 0, "memory": 0,
			"instances": 1, "lastDeploy": "-", "version": "0.0.1",
		},
	}, nil
}

func (s *AdminService) getDBVersion() string {
	var version string
	s.db.Raw("SHOW server_version").Scan(&version)
	return version
}

func (s *AdminService) GetHealthSecurityEvents(hours int) ([]map[string]interface{}, error) {
	since := time.Now().Add(-time.Duration(hours) * time.Hour)

	type eventAgg struct {
		Action    string
		IPAddress string
		TenantID  string
		Count     int64
		LastTS    time.Time
		Details   string
		EntityID  string
	}
	var agg []eventAgg
	s.db.Table("audit_logs").
		Where("created_at >= ?", since).
		Select("action, ip_address, COALESCE(tenant_id::text, '') as tenant_id, count(*) as count, max(created_at) as last_ts, max(details) as details, max(entity_id) as entity_id").
		Group("action, ip_address, tenant_id").
		Order("last_ts DESC").
		Limit(20).
		Scan(&agg)

	result := make([]map[string]interface{}, 0, len(agg))
	for _, e := range agg {
		tenantName := ""
		if e.TenantID != "" {
			var t models.Tenant
			if err := s.db.First(&t, "id = ?", e.TenantID).Error; err == nil {
				tenantName = t.Name
			}
		}
		result = append(result, map[string]interface{}{
			"id":        fmt.Sprintf("%s|%s|%s", e.Action, e.IPAddress, e.TenantID),
			"timestamp": e.LastTS.Format(time.RFC3339),
			"type":      e.Action,
			"tenant":    tenantName,
			"ip":        e.IPAddress,
			"details":   e.Details,
			"count":     e.Count,
		})
	}
	return result, nil
}

// === BILLING ===

func (s *AdminService) GetBillingSettings() (map[string]interface{}, error) {
	settings := map[string]interface{}{
		"notifyAfterDays":         3,
		"secondNotifyAfterDays":   7,
		"suspendAfterDays":        14,
		"autoInvoiceDays":         3,
	}

	var rows []struct {
		Key   string
		Value string
	}
	s.db.Table("system_settings").Where("key LIKE 'billing_%'").Find(&rows)
	for _, r := range rows {
		var val int
		fmt.Sscanf(r.Value, "%d", &val)
		switch r.Key {
		case "billing_notify_after":
			settings["notifyAfterDays"] = val
		case "billing_second_notify":
			settings["secondNotifyAfterDays"] = val
		case "billing_suspend_after":
			settings["suspendAfterDays"] = val
		case "billing_auto_invoice":
			settings["autoInvoiceDays"] = val
		}
	}
	return settings, nil
}

func (s *AdminService) UpdateBillingSettings(settings map[string]interface{}) error {
	mapping := map[string]string{
		"notifyAfterDays":       "billing_notify_after",
		"secondNotifyAfterDays": "billing_second_notify",
		"suspendAfterDays":      "billing_suspend_after",
		"autoInvoiceDays":       "billing_auto_invoice",
	}
	for key, val := range settings {
		dbKey, ok := mapping[key]
		if !ok {
			continue
		}
		valStr := fmt.Sprintf("%v", val)
		s.db.Exec(`INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, NOW())
			ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = NOW()`, dbKey, valStr, valStr)
	}
	return nil
}

type tenantDueForInvoice struct {
	ID        uuid.UUID
	PaidUntil time.Time
	Price     float64
	PlanName  string
}

func (s *AdminService) GetTenantsDueForInvoice(ctx context.Context, daysBeforeDue int) ([]tenantDueForInvoice, error) {
	var results []tenantDueForInvoice
	err := s.db.Table("tenants t").
		Select("t.id, t.paid_until, p.price, p.name as plan_name").
		Joins("JOIN plans p ON t.plan_id = p.id").
		Where("t.status = ? AND t.plan_id IS NOT NULL", "active").
		Where("t.paid_until BETWEEN NOW() AND NOW() + INTERVAL '1 day' * ?", daysBeforeDue).
		Where("NOT EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = t.id AND i.status = 'pending' AND i.due_date = t.paid_until)").
		Find(&results).Error
	return results, err
}

func (s *AdminService) AutoCreateInvoice(ctx context.Context, tenantID uuid.UUID, amount float64, dueDate time.Time) error {
	inv := models.Invoice{
		TenantID:    tenantID,
		Amount:      amount,
		Description: "Автоматический счёт за подписку",
		Status:      "pending",
		DueDate:     dueDate,
	}
	return s.db.Create(&inv).Error
}

type tenantOverdue struct {
	ID              uuid.UUID
	Name            string
	PaidUntil       *time.Time
	TrialEndsAt     *time.Time
	GracePeriodDays int
}

func (s *AdminService) GetTenantsOverdue(ctx context.Context) ([]tenantOverdue, error) {
	var results []tenantOverdue
	err := s.db.Table("tenants").
		Select("id, name, paid_until, trial_ends_at, grace_period_days").
		Where("status = ?", "active").
		Where(`(
			(paid_until IS NOT NULL AND paid_until + (grace_period_days || ' days')::INTERVAL < NOW())
			OR
			(trial_ends_at IS NOT NULL AND trial_ends_at < NOW() AND paid_until IS NULL)
		)`).
		Find(&results).Error
	return results, err
}

func (s *AdminService) AutoSuspendTenant(ctx context.Context, tenantID uuid.UUID) error {
	if err := s.db.Model(&models.Tenant{}).Where("id = ?", tenantID).Update("status", "suspended").Error; err != nil {
		return err
	}
	// Create suspension notification
	n := models.Notification{
		TenantID:  tenantID,
		Type:      models.NotificationTypePayment,
		Title:     "Подписка приостановлена",
		Message:   "Доступ к системе приостановлен из-за просрочки оплаты. Для возобновления доступа свяжитесь с поддержкой.",
	}
	return s.db.Create(&n).Error
}

func (s *AdminService) GetBillingHistory(months int) ([]map[string]interface{}, error) {
	since := time.Now().AddDate(0, -months, 0)
	var invoices []models.Invoice
	s.db.Preload("Tenant").Where("created_at >= ?", since).Order("created_at DESC").Find(&invoices)

	var result []map[string]interface{}
	for _, inv := range invoices {
		rType := "income"
		result = append(result, map[string]interface{}{
			"id":     inv.ID.String(),
			"date":   inv.CreatedAt.Format("2006-01-02"),
			"tenant": inv.Tenant.Name,
			"amount": inv.Amount,
			"type":   rType,
		})
	}
	return result, nil
}

func (s *AdminService) CreatePayment(tenantID uuid.UUID, invoiceID uuid.UUID, amount float64) error {
	now := time.Now()
	tx := s.db.Begin()

	if invoiceID != uuid.Nil {
		if err := tx.Model(&models.Invoice{}).Where("id = ?", invoiceID).Updates(map[string]interface{}{
			"status": "paid", "paid_at": now,
		}).Error; err != nil {
			tx.Rollback()
			return err
		}
	} else if tenantID != uuid.Nil {
		inv := models.Invoice{
			TenantID: tenantID,
			Amount:   amount,
			Status:   "paid",
			DueDate:  now,
			PaidAt:   &now,
		}
		if err := tx.Create(&inv).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit().Error
}

// === AUDIT ===

func (s *AdminService) GetAdminActions(filters map[string]string) ([]map[string]interface{}, error) {
	type row struct {
		models.AuditLog
		UserName  string
		UserEmail string
		TenantName string
	}
	q := s.db.Table("audit_logs").
		Select(`audit_logs.*,
			COALESCE(CONCAT(users.first_name, ' ', users.last_name), '') as user_name,
			COALESCE(users.email, '') as user_email,
			COALESCE(tenants.name, '') as tenant_name`).
		Joins("LEFT JOIN users ON users.id = audit_logs.user_id").
		Joins("LEFT JOIN tenants ON tenants.id = audit_logs.tenant_id").
		Order("audit_logs.created_at DESC").
		Limit(100)
	if v, ok := filters["admin"]; ok && v != "" {
		q = q.Where("audit_logs.user_id = ?", v)
	}
	if v, ok := filters["action"]; ok && v != "" {
		q = q.Where("audit_logs.action ILIKE ?", "%"+v+"%")
	}
	if v, ok := filters["tenant"]; ok && v != "" {
		q = q.Where("audit_logs.tenant_id = ?", v)
	}
	var rows []row
	q.Scan(&rows)

	result := make([]map[string]interface{}, len(rows))
	for i, r := range rows {
		result[i] = map[string]interface{}{
			"id":         r.ID.String(),
			"timestamp":  r.CreatedAt.Format(time.RFC3339),
			"adminName":  r.UserName,
			"adminEmail": r.UserEmail,
			"action":     r.Action,
			"object":     r.TenantName,
			"details":    r.Details,
			"ip":         r.IPAddress,
		}
	}
	return result, nil
}

func (s *AdminService) GetImpersonations(filters map[string]string) ([]map[string]interface{}, error) {
	type row struct {
		models.AuditLog
		UserName   string
		TenantName string
	}
	q := s.db.Table("audit_logs").
		Select(`audit_logs.*,
			COALESCE(CONCAT(users.first_name, ' ', users.last_name), '') as user_name,
			COALESCE(tenants.name, '') as tenant_name`).
		Joins("LEFT JOIN users ON users.id = audit_logs.user_id").
		Joins("LEFT JOIN tenants ON tenants.id = audit_logs.tenant_id").
		Where("audit_logs.action = ?", "impersonate").
		Order("audit_logs.created_at DESC").
		Limit(50)
	var rows []row
	q.Scan(&rows)

	result := make([]map[string]interface{}, len(rows))
	for i, r := range rows {
		impersonatedUser := r.Details
		duration := 15
		actionsSummary := 3
		if r.Details != "" {
			fmt.Sscanf(r.Details, "%d|%d", &duration, &actionsSummary)
		}
		result[i] = map[string]interface{}{
			"id":             r.ID.String(),
			"timestamp":      r.CreatedAt.Format(time.RFC3339),
			"adminName":      r.UserName,
			"tenant":         r.TenantName,
			"role":           r.EntityType,
			"userName":       impersonatedUser,
			"duration":       duration,
			"actionsSummary": fmt.Sprintf("%d действий", actionsSummary),
			"ip":             r.IPAddress,
		}
	}
	return result, nil
}

func (s *AdminService) GetActiveSessions() ([]map[string]interface{}, error) {
	return []map[string]interface{}{
		{"message": "Сессии не отслеживаются. Требуется Redis для управления сессиями."},
	}, nil
}

func (s *AdminService) GetUserLogins(filters map[string]string) ([]map[string]interface{}, error) {
	type row struct {
		models.UserLog
		UserName   string
		UserEmail  string
		Role       string
		TenantName string
	}
	q := s.db.Table("user_logs").
		Select(`user_logs.*,
			COALESCE(CONCAT(users.first_name, ' ', users.last_name), '') as user_name,
			COALESCE(users.email, '') as user_email,
			COALESCE(users.role::text, '') as role,
			COALESCE(tenants.name, '') as tenant_name`).
		Joins("LEFT JOIN users ON users.id = user_logs.user_id").
		Joins("LEFT JOIN tenants ON tenants.id = user_logs.tenant_id").
		Order("user_logs.created_at DESC").
		Limit(100)
	if v, ok := filters["tenant"]; ok && v != "" {
		q = q.Where("user_logs.tenant_id = ?", v)
	}
	if v, ok := filters["user"]; ok && v != "" {
		q = q.Where("user_logs.user_id = ?", v)
	}
	if v, ok := filters["role"]; ok && v != "" {
		q = q.Where("users.role = ?", v)
	}
	if v, ok := filters["date_from"]; ok && v != "" {
		q = q.Where("user_logs.created_at >= ?", v)
	}
	if v, ok := filters["date_to"]; ok && v != "" {
		q = q.Where("user_logs.created_at <= ?", v)
	}
	var rows []row
	q.Scan(&rows)

	result := make([]map[string]interface{}, len(rows))
	for i, r := range rows {
		result[i] = map[string]interface{}{
			"id":        r.ID.String(),
			"timestamp": r.CreatedAt.Format(time.RFC3339),
			"tenant":    r.TenantName,
			"userName":  r.UserName,
			"userEmail": r.UserEmail,
			"role":      r.Role,
			"action":    r.Action,
			"ip":        r.IPAddress,
			"userAgent": r.UserAgent,
			"geo":       "",
		}
	}
	return result, nil
}

func (s *AdminService) TerminateSession(sessionID string) error {
	log.Printf("Session termination requested for %s — not implemented (requires Redis)", sessionID)
	return nil
}

// ImpersonateTenant - сгенерировать токен для входа от имени указанного тенанта
func (s *AdminService) ImpersonateTenant(tenantID uuid.UUID, role string) (string, error) {
	var user models.User
	query := s.db.Where("tenant_id = ?", tenantID)
	if role != "" {
		query = query.Where("role = ?", role)
	}
	if err := query.First(&user).Error; err != nil {
		// Если пользователь не найден с указанной ролью, берём любого
		if err := s.db.Where("tenant_id = ?", tenantID).First(&user).Error; err != nil {
			return "", errors.New("no user found in this tenant")
		}
	}

	secret := viper.GetString("jwt_secret")
	if secret == "" {
		secret = "default_secret_key_for_development_change_in_production"
	}

	tidStr := ""
	if user.TenantID != nil {
		tidStr = user.TenantID.String()
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id":   user.ID.String(),
		"email":     user.Email,
		"role":      user.Role,
		"tenant_id": tidStr,
		"exp":       time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenStr, err := accessToken.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}
	return tokenStr, nil
}
