package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/repository"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

var (
	ErrInvalidMessage  = errors.New("message cannot be empty")
	ErrInvalidSeverity = errors.New("invalid severity value")
	ErrForbidden       = errors.New("forbidden")
)

type AlertService struct {
	alertRepo repository.AlertRepositoryInterface
	notifRepo *repository.NotificationRepository
	db        *gorm.DB
}

func NewAlertService(alertRepo repository.AlertRepositoryInterface, notifRepo *repository.NotificationRepository, db *gorm.DB) *AlertService {
	return &AlertService{alertRepo: alertRepo, notifRepo: notifRepo, db: db}
}

func NewAlertServiceWithDB(alertRepo repository.AlertRepositoryInterface, db *gorm.DB) *AlertService {
	return &AlertService{alertRepo: alertRepo, db: db}
}

func (s *AlertService) CreateAlert(ctx context.Context, userID uuid.UUID, title, message string, severity models.AlertSeverity, alertType models.AlertType, link string) (*models.Alert, error) {
	if message == "" {
		return nil, ErrInvalidMessage
	}
	if severity != models.AlertSeverityCritical && severity != models.AlertSeverityWarning && severity != models.AlertSeverityInfo {
		return nil, ErrInvalidSeverity
	}

	alert := &models.Alert{
		ID:          uuid.New(),
		UserID:      userID,
		Type:        alertType,
		Title:       title,
		Description: message,
		Severity:    severity,
		Link:        link,
		CreatedAt:   time.Now(),
	}

	return s.alertRepo.CreateAlert(ctx, alert)
}

func (s *AlertService) GetAlertsByUser(ctx context.Context, userID uuid.UUID) ([]models.Alert, error) {
	return s.alertRepo.GetAlertsByUser(ctx, userID)
}

func (s *AlertService) GetUnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	alerts, err := s.alertRepo.GetUnreadAlerts(ctx, userID)
	if err != nil {
		return 0, err
	}
	return len(alerts), nil
}

func (s *AlertService) MarkAsRead(ctx context.Context, userID, alertID uuid.UUID) error {
	alert, err := s.alertRepo.GetAlertByID(ctx, alertID)
	if err != nil {
		return err
	}
	if alert == nil {
		return errors.New("alert not found")
	}
	if alert.UserID != userID {
		return ErrForbidden
	}
	return s.alertRepo.MarkAsRead(ctx, alertID)
}

func (s *AlertService) MarkAllAsRead(ctx context.Context, userID uuid.UUID) error {
	alerts, err := s.alertRepo.GetUnreadAlerts(ctx, userID)
	if err != nil {
		return err
	}
	if len(alerts) == 0 {
		return nil
	}
	return s.alertRepo.MarkAllAsRead(ctx, userID)
}

func (s *AlertService) DeleteAlert(ctx context.Context, userID, alertID uuid.UUID) error {
	alert, err := s.alertRepo.GetAlertByID(ctx, alertID)
	if err != nil {
		return err
	}
	if alert == nil {
		return errors.New("alert not found")
	}
	if alert.UserID != userID {
		return ErrForbidden
	}
	return s.alertRepo.DeleteAlert(ctx, alertID)
}

func (s *AlertService) GetUnreadAlerts(ctx context.Context, userID uuid.UUID) ([]models.Notification, int, error) {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return nil, 0, err
	}

	var alerts []models.Notification
	var count int64

	scope := s.db.Model(&models.Notification{}).Where("is_read = ?", false)
	if user.Role == models.RoleFranchisorManager && user.TenantID != nil {
		scope = scope.Where("user_id = ? OR (tenant_id = ? AND user_id IS NULL)", userID, *user.TenantID)
	} else {
		scope = scope.Where("user_id = ?", userID)
	}

	scope.Order("created_at DESC").Limit(50).Find(&alerts)

	countScope := s.db.Model(&models.Notification{}).Where("is_read = ?", false)
	if user.Role == models.RoleFranchisorManager && user.TenantID != nil {
		countScope = countScope.Where("user_id = ? OR (tenant_id = ? AND user_id IS NULL)", userID, *user.TenantID)
	} else {
		countScope = countScope.Where("user_id = ?", userID)
	}
	countScope.Count(&count)

	return alerts, int(count), nil
}

func (s *AlertService) MarkAsReadNotification(ctx context.Context, userID, alertID uuid.UUID) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return err
	}

	// Менеджер может помечать тенантские алерты тоже
	if user.Role == models.RoleFranchisorManager && user.TenantID != nil {
		return s.db.Model(&models.Notification{}).
			Where("id = ? AND (user_id = ? OR (tenant_id = ? AND user_id IS NULL))", alertID, userID, *user.TenantID).
			Update("is_read", true).Error
	}

	return s.db.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", alertID, userID).
		Update("is_read", true).Error
}

func (s *AlertService) GenerateAlertsForUser(ctx context.Context, userID uuid.UUID) error {
	var user models.User
	if err := s.db.First(&user, userID).Error; err != nil {
		return err
	}

	now := time.Now()
	existing := s.existingAlertKeys(ctx, userID)

	if user.SalonID != nil {
		return s.generateAlertsForSalon(ctx, userID, user, *user.SalonID, now, existing)
	}

	if user.Role == models.RoleFranchisorManager {
		tenantID := uuid.Nil
		if user.TenantID != nil {
			tenantID = *user.TenantID
		}
		return s.generateAlertsForTerritory(ctx, userID, user, tenantID, now, existing)
	}

	if user.Role == models.RoleDealer {
		return s.generateAlertsForDealer(ctx, userID, now, existing)
	}

	return nil
}

func (s *AlertService) generateAlertsForSalon(ctx context.Context, userID uuid.UUID, user models.User, salonID uuid.UUID, now time.Time, existing map[string]bool) error {
	threeDaysAgo := now.AddDate(0, 0, -3)
	var overdueMeasurements []models.Lead
	s.db.Where("salon_id = ? AND status = ? AND updated_at < ?", salonID, "meeting", threeDaysAgo).
		Find(&overdueMeasurements)

	for _, lead := range overdueMeasurements {
		data := mustJson(map[string]string{"lead_id": lead.ID.String(), "type": "overdue_measurement"})
		key := "overdue_measurement:" + data
		if existing[key] {
			continue
		}
		existing[key] = true
		alert := models.Notification{
			ID:        uuid.New(),
			UserID:    &userID,
			TenantID:  salonID,
			Type:      models.NotificationTypeSystem,
			Title:     "Просроченный замер",
			Message:   "Замер для " + lead.FullName + " просрочен более 3 дней",
			IsRead:    false,
			Data:      data,
			CreatedAt: now,
		}
		s.db.Create(&alert)
	}

	fiveDaysAgo := now.AddDate(0, 0, -5)
	var abandonedKP []models.Lead
	s.db.Where("salon_id = ? AND status = ? AND updated_at < ?", salonID, "wait", fiveDaysAgo).
		Find(&abandonedKP)

	for _, lead := range abandonedKP {
		data := mustJson(map[string]string{"lead_id": lead.ID.String(), "type": "abandoned_kp"})
		key := "abandoned_kp:" + data
		if existing[key] {
			continue
		}
		existing[key] = true
		alert := models.Notification{
			ID:        uuid.New(),
			UserID:    &userID,
			TenantID:  salonID,
			Type:      models.NotificationTypeSystem,
			Title:     "Брошенное КП",
			Message:   "КП для " + lead.FullName + " без ответа более 5 дней",
			IsRead:    false,
			Data:      data,
			CreatedAt: now,
		}
		s.db.Create(&alert)
	}

	var avgConversion float64
	var todayCount int64

	monthAgo := now.AddDate(0, 0, -30)
	s.db.Model(&models.Lead{}).
		Where("salon_id = ? AND created_at > ?", salonID, monthAgo).
		Count(&todayCount)

	if todayCount > 10 {
		avgConversion = 20.0
		todayConversion := 5.0
		drop := ((avgConversion - todayConversion) / avgConversion) * 100

		if drop > 20 {
			data := mustJson(map[string]string{"type": "conversion_drop"})
			key := "conversion_drop:" + data
			if !existing[key] {
				existing[key] = true
				alert := models.Notification{
					ID:        uuid.New(),
					UserID:    &userID,
					TenantID:  salonID,
					Type:      models.NotificationTypeSystem,
					Title:     "Падение конверсии",
					Message:   "Конверсия упала на " + formatFloat(drop) + "% относительно среднего",
					IsRead:    false,
					Data:      data,
					CreatedAt: now,
				}
				s.db.Create(&alert)
			}
		}
	}

	var avgLeads, todayLeads int64
	s.db.Model(&models.Lead{}).
		Where("salon_id = ? AND created_at > ?", salonID, monthAgo).
		Count(&avgLeads)

	yesterday := now.AddDate(0, 0, -1)
	s.db.Model(&models.Lead{}).
		Where("salon_id = ? AND DATE(created_at) = ?", salonID, yesterday.Format("2006-01-02")).
		Count(&todayLeads)

	if avgLeads > 0 {
		avgDailyLeads := float64(avgLeads) / 30
		drop := ((avgDailyLeads - float64(todayLeads)) / avgDailyLeads) * 100

		if drop > 30 {
			data := mustJson(map[string]string{"type": "traffic_drop"})
			key := "traffic_drop:" + data
			if !existing[key] {
				existing[key] = true
				alert := models.Notification{
					ID:        uuid.New(),
					UserID:    &userID,
					TenantID:  salonID,
					Type:      models.NotificationTypeSystem,
					Title:     "Падение трафика",
					Message:   "Трафик упал на " + formatFloat(drop) + "% относительно среднего",
					IsRead:    false,
					Data:      data,
					CreatedAt: now,
				}
				s.db.Create(&alert)
			}
		}
	}

	return nil
}

func (s *AlertService) generateAlertsForTerritory(ctx context.Context, userID uuid.UUID, user models.User, tenantID uuid.UUID, now time.Time, existing map[string]bool) error {
	managerID := userID

	var dealers []models.User
	s.db.Where("role = ? AND managed_by = ?", models.RoleDealer, managerID).Find(&dealers)

	for _, dealer := range dealers {
		dealerName := strings.TrimSpace(dealer.FirstName + " " + dealer.LastName)
		if dealerName == "" {
			dealerName = dealer.Email
		}

		salonIDs := s.salonIDsForDealer(ctx, dealer.ID)
		if len(salonIDs) == 0 {
			data := mustJson(map[string]string{"dealer_id": dealer.ID.String(), "type": "dealer_no_salons"})
			key := "dealer_no_salons:" + data
			if !existing[key] {
				existing[key] = true
				s.createManagerAlert(userID, tenantID, "Дилер без салонов", "У дилера "+dealerName+" нет активных салонов", data, now)
			}
			continue
		}

		// Алерт 1: нет заказов более 14 дней
		fourteenDaysAgo := now.AddDate(0, 0, -14)
		var recentOrders int64
		s.db.Table("orders").
			Where("salon_id IN ? AND created_at > ?", salonIDs, fourteenDaysAgo).
			Count(&recentOrders)
		if recentOrders == 0 {
			data := mustJson(map[string]string{"dealer_id": dealer.ID.String(), "type": "dealer_no_orders"})
			key := "dealer_no_orders:" + data
			if !existing[key] {
				existing[key] = true
				s.createManagerAlert(userID, tenantID, "Нет заказов", "У дилера "+dealerName+" нет заказов более 14 дней", data, now)
			}
		}

		// Алерт 2: новый салон в последние 7 дней
		sevenDaysAgo := now.AddDate(0, 0, -7)
		var newSalonCount int64
		s.db.Table("salons").
			Where("id IN ? AND created_at > ?", salonIDs, sevenDaysAgo).
			Count(&newSalonCount)
		if newSalonCount > 0 {
			data := mustJson(map[string]string{"dealer_id": dealer.ID.String(), "type": "dealer_new_salon"})
			key := "dealer_new_salon:" + data
			if !existing[key] {
				existing[key] = true
				s.createManagerAlert(userID, tenantID, "Новый салон", "У дилера "+dealerName+" появился новый салон за последнюю неделю", data, now)
			}
		}

		// Алерт 3: не было отчётов 30 дней
		thirtyDaysAgo := now.AddDate(0, 0, -30)
		var recentReports int64
		s.db.Table("reports").
			Where("user_id = ? AND created_at > ?", dealer.ID, thirtyDaysAgo).
			Count(&recentReports)
		if recentReports == 0 {
			data := mustJson(map[string]string{"dealer_id": dealer.ID.String(), "type": "dealer_no_reports"})
			key := "dealer_no_reports:" + data
			if !existing[key] {
				existing[key] = true
				s.createManagerAlert(userID, tenantID, "Нет отчётов", "Дилер "+dealerName+" не отправлял отчёты более 30 дней", data, now)
			}
		}
	}

	// Еженедельная сводка по территории (раз в сутки)
	if len(dealers) > 0 {
		data := mustJson(map[string]string{"type": "territory_weekly_summary", "territory": user.Territory})
		key := "territory_weekly_summary:" + data
		if !existing[key] {
			existing[key] = true
			var salonsCount int64
			s.db.Table("salons").
				Joins("JOIN users ON users.id = salons.dealer_id").
				Where("users.managed_by = ?", managerID).
				Count(&salonsCount)
			s.createManagerAlert(
				userID,
				tenantID,
				"Сводка по территории",
				fmt.Sprintf("Территория %q: %d дилеров, %d салонов. Проверьте карту и алерты.", user.Territory, len(dealers), salonsCount),
				data,
				now,
			)
		}
	}

	return nil
}

func (s *AlertService) createManagerAlert(userID, tenantID uuid.UUID, title, message, data string, now time.Time) {
	uid := userID
	alert := models.Notification{
		ID:        uuid.New(),
		UserID:    &uid, // тенантские алерты менеджера — пишем user_id менеджера (NOT NULL constraint)
		TenantID:  tenantID,
		Type:      models.NotificationTypeSystem,
		Title:     title,
		Message:   message,
		IsRead:    false,
		Data:      data,
		CreatedAt: now,
	}
	s.db.Create(&alert)
}

func (s *AlertService) salonIDsForDealer(ctx context.Context, dealerUserID uuid.UUID) []uuid.UUID {
	var salonIDs []uuid.UUID
	s.db.Table("salons").Where("dealer_id = ?", dealerUserID).Pluck("id", &salonIDs)
	return salonIDs
}

func (s *AlertService) generateAlertsForDealer(ctx context.Context, userID uuid.UUID, now time.Time, existing map[string]bool) error {
	salonIDs := s.salonIDsForDealer(ctx, userID)
	if len(salonIDs) == 0 {
		return nil
	}

	// Алерт: низкие остатки (stock_warehouse < 3)
	type lowStockItem struct {
		Collection string
	}
	var lowStock []lowStockItem
	s.db.Table("product_inventory").
		Where("salon_id IN ? AND stock_warehouse < 3", salonIDs).
		Select("collection").
		Find(&lowStock)
	for _, item := range lowStock {
		data := mustJson(map[string]string{"type": "low_stock"})
		key := "low_stock:" + data
		if existing[key] {
			continue
		}
		existing[key] = true
		uid := userID
		alert := models.Notification{
			ID:        uuid.New(),
			UserID:    &uid,
			Type:      models.NotificationTypeSystem,
			Title:     "Низкий остаток на складе",
			Message:   item.Collection + " — осталось меньше 3 шт",
			IsRead:    false,
			Data:      data,
			CreatedAt: now,
		}
		s.db.Create(&alert)
	}

	// Алерт: просроченные замеры (лиды со статусом meeting > 3 дней без обновления)
	threeDaysAgo := now.AddDate(0, 0, -3)
	var overdueMeasurements []models.Lead
	s.db.Where("salon_id IN ? AND status = ? AND updated_at < ?", salonIDs, "meeting", threeDaysAgo).
		Find(&overdueMeasurements)
	for _, lead := range overdueMeasurements {
		data := mustJson(map[string]string{"lead_id": lead.ID.String(), "type": "overdue_measurement"})
		key := "overdue_measurement:" + data
		if existing[key] {
			continue
		}
		existing[key] = true
		uid := userID
		alert := models.Notification{
			ID:        uuid.New(),
			UserID:    &uid,
			Type:      models.NotificationTypeSystem,
			Title:     "Просроченный замер",
			Message:   "Замер для " + lead.FullName + " просрочен более 3 дней",
			IsRead:    false,
			Data:      data,
			CreatedAt: now,
		}
		s.db.Create(&alert)
	}

	return nil
}

func (s *AlertService) existingAlertKeys(ctx context.Context, userID uuid.UUID) map[string]bool {
	keys := make(map[string]bool)
	if s.db == nil {
		return keys
	}
	var existing []models.Notification
	s.db.Where("user_id = ? AND created_at > ?", userID, time.Now().Add(-24*time.Hour)).
		Find(&existing)
	for _, n := range existing {
		if n.Data != "" {
			keys[string(n.Type)+":"+n.Data] = true
		}
	}
	return keys
}

func mustJson(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func formatFloat(v float64) string {
	return string(rune(int(v)+'0')) + "%"
}