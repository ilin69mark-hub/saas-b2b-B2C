package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"embed"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/repository"

	"github.com/google/uuid"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

//go:embed fonts/*.ttf
var reportFonts embed.FS

type KPIService struct {
	DB       *gorm.DB // Публичное поле для доступа из хендлеров
	kpiRepo  repository.KPIRepositoryInterface
	schedRep repository.ScheduleRepositoryInterface
	analyticsRepo repository.AnalyticsRepositoryInterface
}

func NewKPIService(db *gorm.DB, kpiRepo repository.KPIRepositoryInterface, schedRep repository.ScheduleRepositoryInterface) *KPIService {
	return &KPIService{DB: db, kpiRepo: kpiRepo, schedRep: schedRep}
}

func NewKPIServiceWithAnalytics(db *gorm.DB, kpiRepo repository.KPIRepositoryInterface, schedRep repository.ScheduleRepositoryInterface, analyticsRepo repository.AnalyticsRepositoryInterface) *KPIService {
	return &KPIService{DB: db, kpiRepo: kpiRepo, schedRep: schedRep, analyticsRepo: analyticsRepo}
}

// SetGoal - обертка для репозитория
func (s *KPIService) SetGoal(ctx context.Context, goal *models.DailyGoal) error {
	return s.kpiRepo.UpsertGoal(ctx, goal)
}

func (s *KPIService) GetDashboardStats(ctx context.Context, userID uuid.UUID, salonID uuid.UUID, isManager bool) (*models.DashboardStatsResponse, error) {
	if s.analyticsRepo != nil {
		return s.analyticsRepo.CalculateDashboardStats(ctx, &userID, &salonID, isManager)
	}

	today := time.Now()
	todayStr := today.Format("2006-01-02")

	resp := &models.DashboardStatsResponse{Date: todayStr}

	// 1. Получаем план
	var goal *models.DailyGoal
	var err error

	if isManager {
		goal, err = s.kpiRepo.GetGoal(ctx, &userID, nil, today)
	} else {
		goal, err = s.kpiRepo.GetGoal(ctx, nil, &salonID, today)
	}

	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}
	if goal == nil {
		goal = &models.DailyGoal{}
	}

	// 2. Считаем ФАКТ Продаж
	var salesFact float64
	qSales := s.DB.Model(&models.Lead{}).Where("status = ?", "sale")
	if isManager {
		qSales = qSales.Where("manager_id = ?", userID)
	} else {
		qSales = qSales.Where("salon_id = ?", salonID)
	}
	qSales.Where("DATE(created_at) = ?", todayStr).Select("COALESCE(SUM(budget), 0)").Scan(&salesFact)

	// 3. ФАКТ Лидов
	var leadsFact int64
	qLeads := s.DB.Model(&models.Lead{})
	if isManager {
		qLeads = qLeads.Where("manager_id = ?", userID)
	} else {
		qLeads = qLeads.Where("salon_id = ?", salonID)
	}
	qLeads.Where("DATE(created_at) = ?", todayStr).Count(&leadsFact)

	// 4. Звонки и Встречи
	var callsFact, meetingsFact int64
	actQuery := s.DB.Model(&models.LeadActivity{}).Where("DATE(created_at) = ?", todayStr)
	if isManager {
		actQuery = actQuery.Where("user_id = ?", userID)
	} else {
		actQuery = actQuery.Where("salon_id = ?", salonID)
	}

	actQuery.Where("type = ?", "call").Count(&callsFact)
	actQuery.Where("type = ?", "meeting").Count(&meetingsFact)

	// Формируем проценты
	resp.Sales = calcPercent(goal.SalesPlan, salesFact)
	resp.Leads = calcPercentInt(goal.LeadsPlan, leadsFact)
	resp.Calls = calcPercentInt(goal.CallsPlan, callsFact)
	resp.Meetings = calcPercentInt(goal.MeetingsPlan, meetingsFact)

	return resp, nil
}

// GetTeamAnalytics - аналитика для дилера
func (s *KPIService) GetTeamAnalytics(ctx context.Context, dealerID uuid.UUID, period string) ([]map[string]interface{}, error) {
	now := time.Now()
	var start, end time.Time

	switch period {
	case "week":
		start = now.AddDate(0, 0, -int(now.Weekday())+1).Truncate(24 * time.Hour) // Пн
		end = now
	case "month":
		start = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		end = now
	default: // day
		start = now.Truncate(24 * time.Hour)
		end = now
	}

	var managers []models.User
	if err := s.DB.Where("managed_by = ?", dealerID).Find(&managers).Error; err != nil {
		return nil, err
	}

	var results []map[string]interface{}

	for _, mgr := range managers {
		if mgr.SalonID == nil {
			continue
		}

		// --- KPI ---
		var totalSalesPlan float64
		var totalLeadsPlan, totalCallsPlan, totalMeetingsPlan int

		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", mgr.ID, start, end).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalSalesPlan)
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", mgr.ID, start, end).
			Select("COALESCE(SUM(leads_plan), 0)").Scan(&totalLeadsPlan)
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", mgr.ID, start, end).
			Select("COALESCE(SUM(calls_plan), 0)").Scan(&totalCallsPlan)
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", mgr.ID, start, end).
			Select("COALESCE(SUM(meetings_plan), 0)").Scan(&totalMeetingsPlan)

		// Факты
		var salesFact float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status = ? AND created_at BETWEEN ? AND ?", mgr.ID, "sale", start, end).
			Select("COALESCE(SUM(budget), 0)").Scan(&salesFact)

		var leadsFact int64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND created_at BETWEEN ? AND ?", mgr.ID, start, end).
			Count(&leadsFact)

		var callsFact, meetingsFact int64
		s.DB.Model(&models.LeadActivity{}).
			Where("user_id = ? AND created_at BETWEEN ? AND ?", mgr.ID, start, end).
			Where("type = ?", "call").Count(&callsFact)
		s.DB.Model(&models.LeadActivity{}).
			Where("user_id = ? AND created_at BETWEEN ? AND ?", mgr.ID, start, end).
			Where("type = ?", "meeting").Count(&meetingsFact)

		// --- Воронка ---
		var lNew, lWork, lWait, lSale int64
		s.DB.Model(&models.Lead{}).Where("manager_id = ? AND status = ?", mgr.ID, "new").Count(&lNew)
		s.DB.Model(&models.Lead{}).Where("manager_id = ? AND status IN ?", mgr.ID, []string{"contact", "meeting"}).Count(&lWork)
		s.DB.Model(&models.Lead{}).Where("manager_id = ? AND status = ?", mgr.ID, "wait").Count(&lWait)
		s.DB.Model(&models.Lead{}).Where("manager_id = ? AND status = ?", mgr.ID, "sale").Count(&lSale)

		results = append(results, map[string]interface{}{
			"id":   mgr.ID,
			"name": mgr.FirstName + " " + mgr.LastName,
			"kpi": map[string]interface{}{
				"sales":    map[string]interface{}{"plan": totalSalesPlan, "fact": salesFact, "percent": calcPercentVal(totalSalesPlan, salesFact)},
				"leads":    map[string]interface{}{"plan": totalLeadsPlan, "fact": leadsFact, "percent": calcPercentVal(float64(totalLeadsPlan), float64(leadsFact))},
				"calls":    map[string]interface{}{"plan": totalCallsPlan, "fact": callsFact, "percent": calcPercentVal(float64(totalCallsPlan), float64(callsFact))},
				"meetings": map[string]interface{}{"plan": totalMeetingsPlan, "fact": meetingsFact, "percent": calcPercentVal(float64(totalMeetingsPlan), float64(meetingsFact))},
			},
			"funnel": map[string]interface{}{
				"entered": leadsFact,
				"in_work": lWork,
				"waiting": lWait,
				"sale":    lSale,
			},
		})
	}

	return results, nil
}

func calcPercent(plan float64, fact float64) models.KPIItem {
	p := 0
	if plan > 0 {
		p = int((fact / plan) * 100)
		if p > 100 {
			p = 100
		}
	}
	return models.KPIItem{Plan: plan, Fact: fact, Percent: p}
}

func calcPercentInt(plan int, fact int64) models.KPIItem {
	return calcPercent(float64(plan), float64(fact))
}

func calcPercentVal(plan, fact float64) int {
	if plan == 0 {
		return 0
	}
	p := int((fact / plan) * 100)
	if p > 100 {
		return 100
	}
	return p
}

// GetDashboardMain - получение данных для главной вкладки дашборда менеджера салона
func (s *KPIService) GetDashboardMain(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DashboardMainResponse, error) {
	// Парсим дату или берем текущую
	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	resp := &models.DashboardMainResponse{}

	// Получаем салон пользователя
	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.SalonID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	salonID := *user.SalonID

	// ====================
	// 1. ПЛАН И ФАКТ НА МЕСЯЦ
	// ====================
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
	lastOfMonth := firstOfMonth.AddDate(0, 1, -1)

	// План на месяц (сумма goals по пользователю)
	// Используем assignee_id для поиска плана, так как в goals нет salon_id
	var monthPlan float64
	s.DB.Model(&models.Goal{}).
		Where("assignee_id = ? AND target_date BETWEEN ? AND ?", userID, firstOfMonth, lastOfMonth).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&monthPlan)
	// Также учитываем периоды month/week/year
	if monthPlan == 0 {
		s.DB.Model(&models.Goal{}).
			Where("assignee_id = ? AND period IN ('month', 'year') AND target_date >= ?", userID, firstOfMonth).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&monthPlan)
	}

	// Факт на текущий момент (сумма продаж из leads со статусом sale)
	var monthFact, orderFact float64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND created_at BETWEEN ? AND ?", salonID, "sale", firstOfMonth, targetDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&monthFact)

	// Также добавляем факт из заказов (более точные данные)
	s.DB.Model(&models.Order{}).
		Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salonID, []string{"paid", "contract"}, firstOfMonth, targetDate).
		Select("COALESCE(SUM(total_price), 0)").Scan(&orderFact)
	
	// СУММИРУЕМ оба источника для более точного подсчёта
	monthFact = monthFact + orderFact

	resp.Plan = monthPlan
	resp.Fact = monthFact

	// Calculate percent - ensure it's always set when we have data
	if monthPlan > 0 {
		percent := (monthFact / monthPlan) * 100
		resp.PlanPercent = int(percent)
		if resp.PlanPercent > 100 {
			resp.PlanPercent = 100
		}
	} else {
		// If there's fact but no plan, show 100% or use default
		if monthFact > 0 {
			resp.PlanPercent = 100
		}
	}

	// ====================
	// 2. ДИНАМИКА (сравнение с прошлым днем и неделей)
	// ====================
	// Вчера
	yesterday := targetDate.AddDate(0, 0, -1)
	var yesterdaySales float64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND DATE(created_at) = ?", salonID, "sale", yesterday.Format("2006-01-02")).
		Select("COALESCE(SUM(budget), 0)").Scan(&yesterdaySales)

	// Прошлая неделя (7 дней назад)
	weekAgo := targetDate.AddDate(0, 0, -7)
	var weekAgoSales float64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND DATE(created_at) = ?", salonID, "sale", weekAgo.Format("2006-01-02")).
		Select("COALESCE(SUM(budget), 0)").Scan(&weekAgoSales)

	if yesterdaySales > 0 {
		resp.DynamicDay = ((monthFact - yesterdaySales) / yesterdaySales) * 100
	}
	if weekAgoSales > 0 {
		resp.DynamicWeek = ((monthFact - weekAgoSales) / weekAgoSales) * 100
	}

	// ====================
	// 3. ПРОГНОЗ
	// ====================
	// Среднедневные продажи
	daysInMonth := targetDate.Day()
	avgDaily := monthFact / float64(daysInMonth)
	daysLeft := lastOfMonth.Day() - targetDate.Day() + 1
	forecast := monthFact + (avgDaily * float64(daysLeft))
	if monthPlan > 0 {
		resp.Forecast = int((forecast / monthPlan) * 100)
		if resp.Forecast > 100 {
			resp.Forecast = 100
		}
	}

	// ====================
	// 4. СРЕДНИЙ ЧЕК
	// ====================
	var dealsCount int64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND created_at BETWEEN ? AND ?", salonID, "sale", firstOfMonth, targetDate).
		Count(&dealsCount)
	if dealsCount > 0 {
		resp.AvgCheck = monthFact / float64(dealsCount)
	}

	// ====================
	// 5. МАРЖИНАЛЬНОСТЬ
	// ====================
	var totalMargin float64
	s.DB.Model(&models.Contract{}).
		Where("salon_id = ? AND created_at BETWEEN ? AND ?", salonID, firstOfMonth, targetDate).
		Select("COALESCE(AVG(margin_percent), 0)").Scan(&totalMargin)
	resp.MarginPercent = totalMargin

	// ====================
	// 6. СУММА ПРЕДОПЛАТ
	// ====================
	var prepaymentsSum float64
	s.DB.Model(&models.Contract{}).
		Where("salon_id = ? AND created_at BETWEEN ? AND ?", salonID, firstOfMonth, targetDate).
		Select("COALESCE(SUM(prepaid_amount), 0)").Scan(&prepaymentsSum)
	resp.PrepaymentsSum = prepaymentsSum

	// ====================
	// 7. СВЕТОФОР
	// ====================
	// Трафик (количество лидов за сегодня vs норма)
	today := targetDate.Format("2006-01-02")
	var todayLeads int64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND DATE(created_at) = ?", salonID, today).
		Count(&todayLeads)

	// Норма - 10 лидов в день (можно сделать настраиваемой)
	normTraffic := 10
	if todayLeads >= int64(normTraffic) {
		resp.TrafficStatus = "green"
	} else if todayLeads >= int64(normTraffic/2) {
		resp.TrafficStatus = "yellow"
	} else {
		resp.TrafficStatus = "red"
	}

	// Конверсия в замеры (лиды со статусом meeting / все лиды)
	var totalLeads, meetingLeads int64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND created_at BETWEEN ? AND ?", salonID, firstOfMonth, targetDate).
		Count(&totalLeads)
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND created_at BETWEEN ? AND ?", salonID, "meeting", firstOfMonth, targetDate).
		Count(&meetingLeads)

	if totalLeads > 0 {
		convMeasure := int((meetingLeads * 100) / totalLeads)
		if convMeasure >= 30 {
			resp.ConversionMeasureStatus = "green"
		} else if convMeasure >= 15 {
			resp.ConversionMeasureStatus = "yellow"
		} else {
			resp.ConversionMeasureStatus = "red"
		}
	} else {
		resp.ConversionMeasureStatus = "red"
	}

	// Конверсия в договоры (продажи / лиды)
	var saleLeads int64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status = ? AND created_at BETWEEN ? AND ?", salonID, "sale", firstOfMonth, targetDate).
		Count(&saleLeads)

	if totalLeads > 0 {
		convContract := int((saleLeads * 100) / totalLeads)
		if convContract >= 20 {
			resp.ConversionContractStatus = "green"
		} else if convContract >= 10 {
			resp.ConversionContractStatus = "yellow"
		} else {
			resp.ConversionContractStatus = "red"
		}
	} else {
		resp.ConversionContractStatus = "red"
	}

	// ====================
	// 8. ОЖИДАЕМЫЕ ОПЛАТЫ НА СЕГОДНЯ
	// ====================
	var contracts []models.Contract
	s.DB.Where("salon_id = ? AND payment_status IN ? AND DATE(payment_date) = ?", salonID, []string{"awaiting_payment", "payment_due"}, today).
		Find(&contracts)

	for _, c := range contracts {
		resp.PendingPayments = append(resp.PendingPayments, models.PendingPayment{
			ContractID:  c.ID,
			ClientName:  c.ClientName,
			Amount:      c.RemainAmount,
			Status:      c.PaymentStatus,
			PaymentDate: today,
		})
	}

	return resp, nil
}

// GetDashboardFunnel - получение данных для воронки продаж
func (s *KPIService) GetDashboardFunnel(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DashboardFunnelResponse, error) {
	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	resp := &models.DashboardFunnelResponse{
		Stages:     []models.FunnelStage{},
		HotDeals:   []models.HotDeal{},
		FreshLeads: []models.FreshLead{},
	}

	// Получаем салон пользователя
	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.SalonID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	salonID := *user.SalonID

	// Этапы воронки: Трафик → Консультация → Замер → КП → Договор → Оплата
	// Маппим статусы лидов на этапы воронки
	statusCounts := make(map[string]int64)
	statusSums := make(map[string]float64)

	rows, err := s.DB.Model(&models.Lead{}).
		Where("salon_id = ?", salonID).
		Select("status, COUNT(*), COALESCE(SUM(budget), 0)").
		Group("status").
		Rows()
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var status string
			var count int64
			var sum float64
			rows.Scan(&status, &count, &sum)
			statusCounts[status] = count
			statusSums[status] = sum
		}
	}

	// Трафик = все лиды
	trafficCount := int64(0)
	for _, c := range statusCounts {
		trafficCount += c
	}

	// Конверсия = (следующий этап / предыдущий) * 100
	var prevCount int64 = trafficCount
	addStage := func(stage, label string, count int64, sum float64) {
		conv := 0
		if prevCount > 0 {
			conv = int((count * 100) / prevCount)
		}
		resp.Stages = append(resp.Stages, models.FunnelStage{
			Stage:      stage,
			Label:      label,
			Count:      int(count),
			Conversion: conv,
			Sum:        sum,
		})
		prevCount = count
	}

	// Трафик → Консультация → Замер → КП → Договор → Оплата
	addStage("traffic", "Трафик", trafficCount, statusSums["new"])
	addStage("consultation", "Консультация", statusCounts["contact"], statusSums["contact"])
	addStage("measurement", "Замер", statusCounts["meeting"], statusSums["meeting"])
	addStage("kp", "КП", statusCounts["wait"], statusSums["wait"])
	addStage("contract", "Договор", statusCounts["sale"], statusSums["sale"])
	addStage("payment", "Оплата", statusCounts["paid"], statusSums["paid"])

	// ===== ГОРЯЧИЕ СДЕЛКИ (КП > N дней) =====
	hotDays := 5
	hotDaysThreshold := targetDate.AddDate(0, 0, -hotDays)

	var hotLeads []models.Lead
	s.DB.Where("salon_id = ? AND status = ? AND updated_at < ?", salonID, "wait", hotDaysThreshold).
		Find(&hotLeads)

	for _, lead := range hotLeads {
		daysStalled := int(time.Since(lead.UpdatedAt).Hours() / 24)
		resp.HotDeals = append(resp.HotDeals, models.HotDeal{
			ID:          lead.ID,
			ClientName:  lead.FullName,
			Phone:       lead.Phone,
			Amount:      lead.Budget,
			CreatedAt:   lead.UpdatedAt.Format("2006-01-02"),
			DaysStalled: daysStalled,
			ManagerID:   lead.ManagerID,
			ManagerName: "",
		})
	}

	// ===== СВЕЖИЕ ЛИДЫ (за сегодня) =====
	today := targetDate.Format("2006-01-02")
	var todayLeads []models.Lead
	s.DB.Where("salon_id = ? AND DATE(created_at) = ?", salonID, today).
		Order("created_at DESC").
		Find(&todayLeads)

	for _, lead := range todayLeads {
		status := "unassigned"
		if lead.ManagerID != uuid.Nil {
			status = "in_progress"
		}
		resp.FreshLeads = append(resp.FreshLeads, models.FreshLead{
			ID:          lead.ID,
			Source:      "Сайт",
			ClientName:  lead.FullName,
			Phone:       lead.Phone,
			CreatedAt:   lead.CreatedAt.Format("2006-01-02 15:04"),
			Status:      status,
			AssignedTo:  &lead.ManagerID,
			ManagerName: "",
		})
	}

	return resp, nil
}

// GetDashboardTeam - получение данных команды (рейтинг продавцов)
func (s *KPIService) GetDashboardTeam(ctx context.Context, userID uuid.UUID, period, dateStr string) (*models.DashboardTeamResponse, error) {
	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	var startDate, endDate time.Time
	switch period {
	case "week":
		startDate = targetDate.AddDate(0, 0, -7)
		endDate = targetDate
	case "month":
		startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = targetDate
	case "quarter":
		quarter := (int(targetDate.Month()) - 1) / 3
		startDate = time.Date(targetDate.Year(), time.Month(quarter*3+1), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = targetDate
	default:
		startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = targetDate
	}

	resp := &models.DashboardTeamResponse{
		Period:         period,
		TotalRevenue:   0,
		AvgRevenue:     0,
		AvgConversion:  0,
		AvgCheck:       0,
		SalesReps:      []models.SalesRepMetrics{},
	}

	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.SalonID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	salonID := *user.SalonID

	var managers []models.User
	// Ищем продавцов (sales_rep) которые управляются текущим пользователем или в том же салоне
	s.DB.Where("managed_by = ? OR (salon_id = ? AND role = 'sales_rep')", userID, salonID).Find(&managers)

	var totalRevenue, totalDeals, totalConversion, totalAvgCheck float64
	var dealsCount, conversionCount int

	for _, mgr := range managers {
		var revenue float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", mgr.ID, []string{"sale", "paid"}, startDate, endDate).
			Select("COALESCE(SUM(budget), 0)").Scan(&revenue)

		var deals int64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", mgr.ID, []string{"sale", "paid"}, startDate, endDate).
			Count(&deals)

		var leadsCount int64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND created_at BETWEEN ? AND ?", mgr.ID, startDate, endDate).
			Count(&leadsCount)

		conversion := 0.0
		if leadsCount > 0 {
			conversion = (float64(deals) / float64(leadsCount)) * 100
		}

		avgCheck := 0.0
		if deals > 0 {
			avgCheck = revenue / float64(deals)
		}

		extrasSum := revenue * 0.1
		discountPercent := 5.0

		totalRevenue += revenue
		totalDeals += float64(deals)
		if conversion > 0 {
			totalConversion += conversion
			conversionCount++
		}
		if avgCheck > 0 {
			totalAvgCheck += avgCheck
			dealsCount++
		}

		resp.SalesReps = append(resp.SalesReps, models.SalesRepMetrics{
			UserID:           mgr.ID,
			FirstName:        mgr.FirstName,
			LastName:         mgr.LastName,
			Role:             string(mgr.Role),
			Revenue:          revenue,
			DealsCount:       int(deals),
			Conversion:       conversion,
			AvgCheck:         avgCheck,
			DiscountPercent:  discountPercent,
			ExtrasSum:        extrasSum,
			RevenueDeviation: 0,
			DealsDeviation:   0,
			ConversionDeviation: 0,
			AvgCheckDeviation: 0,
		})
	}

	if len(managers) > 0 {
		resp.TotalRevenue = totalRevenue
		resp.AvgRevenue = totalRevenue / float64(len(managers))
		if conversionCount > 0 {
			resp.AvgConversion = totalConversion / float64(conversionCount)
		}
		if dealsCount > 0 {
			resp.AvgCheck = totalAvgCheck / float64(dealsCount)
		}
	}

	for i := range resp.SalesReps {
		if resp.AvgRevenue > 0 {
			resp.SalesReps[i].RevenueDeviation = ((resp.SalesReps[i].Revenue - resp.AvgRevenue) / resp.AvgRevenue) * 100
		}
		avgDeals := totalDeals / float64(len(managers))
		if avgDeals > 0 {
			resp.SalesReps[i].DealsDeviation = ((float64(resp.SalesReps[i].DealsCount) - avgDeals) / avgDeals) * 100
		}
		if resp.AvgConversion > 0 {
			resp.SalesReps[i].ConversionDeviation = ((resp.SalesReps[i].Conversion - resp.AvgConversion) / resp.AvgConversion) * 100
		}
		if resp.AvgCheck > 0 {
			resp.SalesReps[i].AvgCheckDeviation = ((resp.SalesReps[i].AvgCheck - resp.AvgCheck) / resp.AvgCheck) * 100
		}
	}

	for i := 0; i < len(resp.SalesReps)-1; i++ {
		for j := i + 1; j < len(resp.SalesReps); j++ {
			if resp.SalesReps[i].Revenue < resp.SalesReps[j].Revenue {
				resp.SalesReps[i], resp.SalesReps[j] = resp.SalesReps[j], resp.SalesReps[i]
			}
		}
	}

	return resp, nil
}

// GetSalesRepHistory - история продавца за N месяцев
func (s *KPIService) GetSalesRepHistory(ctx context.Context, managerID uuid.UUID, months int) ([]models.SalesRepHistory, error) {
	resp := []models.SalesRepHistory{}

	now := time.Now()
	for i := months - 1; i >= 0; i-- {
		monthStart := time.Date(now.Year(), now.Month()-time.Month(i), 1, 0, 0, 0, 0, now.Location())
		monthEnd := monthStart.AddDate(0, 1, 0)

		var revenue float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", managerID, []string{"sale", "paid"}, monthStart, monthEnd).
			Select("COALESCE(SUM(budget), 0)").Scan(&revenue)

		var deals int64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", managerID, []string{"sale", "paid"}, monthStart, monthEnd).
			Count(&deals)

		avgCheck := 0.0
		if deals > 0 {
			avgCheck = revenue / float64(deals)
		}

		resp = append(resp, models.SalesRepHistory{
			Month:    monthStart.Format("2006-01"),
			Revenue:  revenue,
			Deals:    int(deals),
			AvgCheck: avgCheck,
		})
	}

	return resp, nil
}

// GetDashboardProducts - получение данных о товарах
func (s *KPIService) GetDashboardProducts(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DashboardProductsResponse, error) {
	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	resp := &models.DashboardProductsResponse{
		TopProducts:      []models.TopProduct{},
		StockItems:       []models.StockItem{},
		LostSales:        []models.LostSale{},
		CategoryTurnover: []models.CategoryTurnover{},
		TotalRevenue:     0,
	}

	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.SalonID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	salonID := *user.SalonID

	// Период - текущий месяц
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
	endOfMonth := targetDate

	// Общая выручка салона
	var totalRevenue float64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salonID, []string{"sale", "paid"}, firstOfMonth, endOfMonth).
		Select("COALESCE(SUM(budget), 0)").Scan(&totalRevenue)
	resp.TotalRevenue = totalRevenue

	// === ТОП-10 ТОВАРОВ (по interest_product) ===
	// Группируем по interest_product (названию товара)
	type productStats struct {
		Name     string
		Revenue  float64
		Quantity int
	}

	var productStatsList []productStats
	rows, err := s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salonID, []string{"sale", "paid"}, firstOfMonth, endOfMonth).
		Select("interest_product, COALESCE(SUM(budget), 0) as revenue, COUNT(*) as quantity").
		Group("interest_product").
		Order("revenue DESC").
		Limit(10).
		Rows()
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ps productStats
			rows.Scan(&ps.Name, &ps.Revenue, &ps.Quantity)
			if ps.Name != "" {
				productStatsList = append(productStatsList, ps)
			}
		}
	}

	for _, ps := range productStatsList {
		share := 0.0
		if totalRevenue > 0 {
			share = (ps.Revenue / totalRevenue) * 100
		}
		resp.TopProducts = append(resp.TopProducts, models.TopProduct{
			ID:           ps.Name,
			Name:         ps.Name,
			Collection:   "Основная",
			Category:     "Мебель",
			Revenue:      ps.Revenue,
			Quantity:     ps.Quantity,
			SharePercent: share,
			Margin:       25.0, // Заглушка
		})
	}

	// === ОСТАТКИ (заглушка - нужна таблица products/stock) ===
	// Симулируем остатки для демонстрации
	sampleProducts := []string{"Диван", "Кресло", "Кровать", "Шкаф", "Стол"}
	for i, name := range sampleProducts {
		showroom := 1 + i
		warehouse := 5 + i*2
		cost := float64((showroom + warehouse) * 50000)
		turnover := 30 + i*10
		if turnover > 90 {
			turnover = 120 // Неликвид
		}
		resp.StockItems = append(resp.StockItems, models.StockItem{
			ID:           name,
			Name:         name,
			Category:     "Мебель",
			ShowroomQty:  showroom,
			WarehouseQty: warehouse,
			TotalCost:    cost,
			TurnoverDays: turnover,
		})
	}

	// === УПУЩЕННЫЕ ПРОДАЖИ ===
	lostReasons := map[string]float64{
		"Нет в наличии":           150000,
		"Долгий срок производства": 80000,
		"Не устроила цена":        200000,
		"Не подошёл дизайн":       120000,
	}
	for reason, revenue := range lostReasons {
		count := int(revenue / 50000) // Примерное количество
		resp.LostSales = append(resp.LostSales, models.LostSale{
			Reason:        reason,
			RequestsCount: count,
			LostRevenue:   revenue,
		})
	}

	// === ОБОРАЧИВАЕМОСТЬ ПО КАТЕГОРИЯМ ===
	categories := []string{"Диваны", "Кресла", "Кровати", "Шкафы", "Столы"}
	for _, cat := range categories {
		days := 30 + (len(cat) * 5) // Заглушка
		slowMoving := days > 90
		resp.CategoryTurnover = append(resp.CategoryTurnover, models.CategoryTurnover{
			Category:    cat,
			AvgDays:     days,
			IsSlowMoving: slowMoving,
		})
	}

	return resp, nil
}

// GetManagerTargets - получить директивы от дилера
func (s *KPIService) GetManagerTargets(ctx context.Context, userID uuid.UUID, dateStr string) (*models.ManagerTargetsResponse, error) {
	resp := &models.ManagerTargetsResponse{
		HasTargets:          false,
		TargetConversion:     0,
		CurrentConversion:    0,
		TargetExtrasPercent:  0,
		CurrentExtrasPercent: 0,
		Promotions:          []models.Promotion{},
		BonusForecast:        0,
		MaxBonus:             0,
		WarningLevel:         "none",
	}

	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}
	if user.SalonID == nil {
		return nil, gorm.ErrRecordNotFound
	}
	salonID := *user.SalonID

	// === План продаж ===
	firstOfMonth := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Now().Location())

	// План на месяц - ищем по assignee_id в таблице goals
	var planAmount float64
	s.DB.Model(&models.Goal{}).
		Where("assignee_id = ? AND target_date BETWEEN ? AND ?", userID, firstOfMonth, time.Now()).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&planAmount)
	// Также учитываем периоды month/week/year
	if planAmount == 0 {
		s.DB.Model(&models.Goal{}).
			Where("assignee_id = ? AND period IN ('month', 'year')", userID).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&planAmount)
	}

	// Если план не утверждён (не задан)
	if planAmount == 0 {
		resp.HasTargets = false
		resp.Plan = nil
		return resp, nil
	}

	resp.HasTargets = true

	// Текущее выполнение - используем salonID из user
	var currentAmount float64
	var currentUser models.User
	if err := s.DB.First(&currentUser, userID).Error; err == nil && currentUser.SalonID != nil {
		s.DB.Model(&models.Lead{}).
			Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", currentUser.SalonID, []string{"sale", "paid"}, firstOfMonth, time.Now()).
			Select("COALESCE(SUM(budget), 0)").Scan(&currentAmount)
	}

	percent := 0
	if planAmount > 0 {
		percent = int((currentAmount / planAmount) * 100)
		if percent > 100 {
			percent = 100
		}
	}

	byCategory := map[string]float64{
		"Мебель": currentAmount * 0.7,
		"Допы":   currentAmount * 0.2,
		"Услуги": currentAmount * 0.1,
	}

	resp.Plan = &models.TargetPlan{
		TotalAmount:    planAmount,
		ByCategory:    byCategory,
		CurrentAmount:  currentAmount,
		Percent:        percent,
	}

	// === Бенчмарки ===
	resp.TargetConversion = 30.0 // 30% - цель
	resp.TargetExtrasPercent = 15.0 // 15% - цель

	// Текущая конверсия
	var totalLeads, saleLeads int64
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND created_at BETWEEN ? AND ?", salonID, firstOfMonth, time.Now()).
		Count(&totalLeads)
	s.DB.Model(&models.Lead{}).
		Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salonID, []string{"sale", "paid"}, firstOfMonth, time.Now()).
		Count(&saleLeads)

	if totalLeads > 0 {
		resp.CurrentConversion = (float64(saleLeads) / float64(totalLeads)) * 100
	}
	resp.CurrentExtrasPercent = 12.0 // Заглушка

	// === Акции ===
	now := time.Now()
	promotions := []models.Promotion{
		{
			ID:            "1",
			Name:          "Летняя распродажа",
			Condition:     "При покупке дивана - кресло в подарок",
			DiscountMin:   10,
			DiscountMax:   25,
			EndDate:       now.AddDate(0, 0, 5).Format("2006-01-02"),
			IsExpiring:    true,
		},
		{
			ID:            "2",
			Name:          "Комплект со скидкой",
			Condition:     "Мебель + услуги дизайнера",
			DiscountMin:   15,
			DiscountMax:   30,
			EndDate:       now.AddDate(0, 0, 14).Format("2006-01-02"),
			IsExpiring:    false,
		},
		{
			ID:            "3",
			Name:          "Акция выходного дня",
			Condition:     "Скидка 20% в субботу и воскресенье",
			DiscountMin:   20,
			DiscountMax:   20,
			EndDate:       now.AddDate(0, 0, 3).Format("2006-01-02"),
			IsExpiring:    true,
		},
	}
	resp.Promotions = promotions

	// === Прогноз премии ===
	maxBonus := 50000.0 // Максимальная премия
	if percent >= 100 {
		resp.BonusForecast = maxBonus
	} else if percent >= 80 {
		resp.BonusForecast = maxBonus * 0.8
	} else if percent >= 50 {
		resp.BonusForecast = maxBonus * 0.5
	} else {
		resp.BonusForecast = maxBonus * 0.2
	}
	resp.MaxBonus = maxBonus

	// Уровень предупреждения
	bonusPercent := (resp.BonusForecast / maxBonus) * 100
	if bonusPercent < 50 {
		resp.WarningLevel = "yellow"
	} else if bonusPercent < 30 {
		resp.WarningLevel = "red"
	} else {
		resp.WarningLevel = "none"
	}

	return resp, nil
}

// GetDealerSummary - сводка для дилера (все салоны)
func (s *KPIService) GetDealerSummary(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DealerSummaryResponse, error) {
	resp := &models.DealerSummaryResponse{}

	// Сначала находим пользователя дилера
	var user models.User
	if err := s.DB.First(&user, userID).Error; err != nil {
		return nil, err
	}

	// Находим все салоны дилера через tenant_id (dealer_id в таблице salons = user.tenant_id)
	var dealerTenantID *uuid.UUID
	if user.TenantID != nil {
		dealerTenantID = user.TenantID
	}

	var salons []models.Salon
	if dealerTenantID != nil {
		if err := s.DB.Where("dealer_id = ?", *dealerTenantID).Find(&salons).Error; err != nil {
			return nil, err
		}
	}

	// Собираем все salonID
	var salonIDs []uuid.UUID
	for _, salon := range salons {
		salonIDs = append(salonIDs, salon.ID)
	}

	if len(salonIDs) == 0 {
		return resp, nil
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())

	// Выручка из заказов (orders)
	var orderRevenue float64
	s.DB.Model(&models.Order{}).
		Where("salon_id IN ? AND status = ? AND created_at BETWEEN ? AND ?", salonIDs, "paid", firstOfMonth, targetDate).
		Select("COALESCE(SUM(total_price), 0)").Scan(&orderRevenue)

	// Выручка из лидов - учитываем ВСЕ закрытые статусы (paid, contract)
	var leadRevenue float64
	s.DB.Model(&models.Lead{}).
		Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, firstOfMonth, targetDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&leadRevenue)

	// Общая выручка = заказы + лиды (или максимум из них)
	totalRevenue := orderRevenue
	if leadRevenue > totalRevenue {
		totalRevenue = leadRevenue
	}

	// Общий план через goals (для дилеров - ищем по assignee_id = userID)
	var totalPlan float64
	s.DB.Model(&models.Goal{}).
		Where("assignee_id = ? AND period = 'monthly'", userID).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)

	// Процент выполнения
	planPercent := 0
	if totalPlan > 0 {
		planPercent = int((totalRevenue / totalPlan) * 100)
		if planPercent > 100 {
			planPercent = 100
		}
	}

	// Чистая прибыль (20% от выручки - упрощенно)
	netProfit := totalRevenue * 0.2
	marginProfit := totalRevenue * 0.35

	// Алёрты - считаем через notifications для дилера
	var alertsCount int64
	s.DB.Model(&models.Notification{}).
		Where("user_id = ? AND is_read = ?", userID, false).
		Count(&alertsCount)

	resp.NetProfit = netProfit
	resp.GrossRevenue = totalRevenue
	resp.PlanCompletionPercent = planPercent
	resp.MarginProfit = marginProfit
	resp.ActiveAlerts = int(alertsCount)

	return resp, nil
}

// GetDealerFinance - финансы для дилера
func (s *KPIService) GetDealerFinance(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DealerFinanceResponse, error) {
	resp := &models.DealerFinanceResponse{}

	// Находим все салоны дилера через таблицу salons по dealer_id
	var salons []models.Salon
	if err := s.DB.Where("dealer_id = ?", userID).Find(&salons).Error; err != nil {
		return nil, err
	}

	var salonIDs []uuid.UUID
	for _, salon := range salons {
		salonIDs = append(salonIDs, salon.ID)
	}

	if len(salonIDs) == 0 {
		return resp, nil
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())

	// Выручка
	s.DB.Model(&models.Lead{}).
		Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"sale", "paid"}, firstOfMonth, targetDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&resp.Revenue)

	// COGS (себестоимость - 65% от выручки)
	resp.COGS = resp.Revenue * 0.65

	// Расходы из таблицы dealer_expenses
	type Expense struct {
		Category string
		Amount  float64
	}
	
	var expenses []Expense
	// Читаем расходы из БД - используем raw SQL для безопасности
	rows, err := s.DB.Raw(`
		SELECT category, SUM(amount) as amount 
		FROM dealer_expenses 
		WHERE dealer_id = ? AND period = '2026-04'
		GROUP BY category
	`, userID).Rows()
	
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var exp Expense
			rows.Scan(&exp.Category, &exp.Amount)
			expenses = append(expenses, exp)
		}
		// Маппинг расходов по категориям
		expenseMap := make(map[string]float64)
		for _, e := range expenses {
			expenseMap[e.Category] = e.Amount
		}
		
		resp.Rent = expenseMap["rent"]
		resp.Utilities = expenseMap["utilities"]
		resp.Payroll = expenseMap["payroll"]
		resp.Taxes = expenseMap["taxes"]
		resp.Logistics = expenseMap["logistics"]
		resp.Marketing = expenseMap["marketing"]
		resp.Defects = expenseMap["defects"]
		resp.OtherExpenses = expenseMap["other"]
} else {
		// Fallback если таблица пустая
		resp.Rent = 430000
	}
	
	// Fallback только если все нули (данных нет в таблице)
	if resp.Rent == 0 && resp.Utilities == 0 && resp.Payroll == 0 {
		resp.Rent = 430000
		resp.Utilities = 45000
		resp.Payroll = 650000
		resp.Taxes = 180000
		resp.Logistics = 95000
		resp.Marketing = 60000
		resp.Defects = 35000
		resp.OtherExpenses = 0
		resp.Bonus = 0
	}

	// Чистая прибыль
	resp.NetProfit = resp.Revenue - resp.COGS - resp.Rent - resp.Utilities - resp.Payroll - resp.Taxes - resp.Logistics - resp.Marketing - resp.Defects - resp.OtherExpenses - resp.Bonus

	// Прогноз
	daysInMonth := targetDate.Day()
	daysLeft := 30 - daysInMonth + 1
	dailyAvg := resp.NetProfit / float64(daysInMonth)
	resp.NetProfitForecast = resp.NetProfit + (dailyAvg * float64(daysLeft))

	// Прошлый месяц (заглушка - 80% от текущего)
	resp.PrevMonthNetProfit = resp.NetProfit * 0.8

	// Заполняем expense_breakdown
	expenseItems := []struct {
		Category string
		Amount   float64
	}{
		{"rent", resp.Rent},
		{"utilities", resp.Utilities},
		{"payroll", resp.Payroll},
		{"taxes", resp.Taxes},
		{"logistics", resp.Logistics},
		{"marketing", resp.Marketing},
		{"defects", resp.Defects},
		{"other", resp.OtherExpenses},
	}
	
	for _, item := range expenseItems {
		percent := 0.0
		if resp.Revenue > 0 {
			percent = (item.Amount / resp.Revenue) * 100
		}
		resp.ExpenseBreakdown = append(resp.ExpenseBreakdown, models.ExpenseBreakdown{
			Category:         item.Category,
			Amount:          item.Amount,
			PercentOfRevenue: percent,
			PrevMonthAmount: item.Amount * 0.9, // Assume 10% less in prev month
		})
	}

	return resp, nil
}

// GetDealerFunnel - воронка для дилера
func (s *KPIService) GetDealerFunnel(ctx context.Context, userID uuid.UUID, period, dateStr string) (*models.DealerFunnelResponse, error) {
	resp := &models.DealerFunnelResponse{}

	// Находим все салоны дилера через таблицу salons по dealer_id
	var salons []models.Salon
	if err := s.DB.Where("dealer_id = ?", userID).Find(&salons).Error; err != nil {
		return nil, err
	}

	var salonIDs []uuid.UUID
	for _, salon := range salons {
		salonIDs = append(salonIDs, salon.ID)
	}

	if len(salonIDs) == 0 {
		return resp, nil
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	var startDate, endDate time.Time
	quarterStart := func(t time.Time) time.Time {
		m := int(t.Month())
		quarterMonth := time.Month(((m - 1) / 3) * 3 + 1)
		return time.Date(t.Year(), quarterMonth, 1, 0, 0, 0, 0, t.Location())
	}

	switch period {
	case "week":
		startDate = targetDate.AddDate(0, 0, -7)
		endDate = targetDate
	case "quarter":
		startDate = quarterStart(targetDate)
		endDate = targetDate
	case "year":
		startDate = time.Date(targetDate.Year(), 1, 1, 0, 0, 0, 0, targetDate.Location())
		endDate = targetDate
	default: // month
		startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = targetDate
	}

	// Воронка по стадиям
	var newLeads, contactLeads, meetingLeads, waitLeads, saleLeads int64
	s.DB.Model(&models.Lead{}).Where("salon_id IN ? AND created_at BETWEEN ? AND ?", salonIDs, startDate, endDate).Count(&newLeads)
	s.DB.Model(&models.Lead{}).Where("salon_id IN ? AND status = ? AND created_at BETWEEN ? AND ?", salonIDs, "contact", startDate, endDate).Count(&contactLeads)
	s.DB.Model(&models.Lead{}).Where("salon_id IN ? AND status = ? AND created_at BETWEEN ? AND ?", salonIDs, "meeting", startDate, endDate).Count(&meetingLeads)
	s.DB.Model(&models.Lead{}).Where("salon_id IN ? AND status = ? AND created_at BETWEEN ? AND ?", salonIDs, "wait", startDate, endDate).Count(&waitLeads)
	s.DB.Model(&models.Lead{}).Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"sale", "paid"}, startDate, endDate).Count(&saleLeads)

	resp.Stages = []models.FunnelStage{
		{Stage: "traffic", Label: "Трафик", Count: int(newLeads + contactLeads), Conversion: 100},
		{Stage: "consultation", Label: "Консультация", Count: int(contactLeads), Conversion: 0},
		{Stage: "measurement", Label: "Замер", Count: int(meetingLeads), Conversion: 0},
		{Stage: "kp", Label: "КП", Count: int(waitLeads), Conversion: 0},
		{Stage: "contract", Label: "Договор", Count: int(saleLeads), Conversion: 0},
		{Stage: "payment", Label: "Оплата", Count: 0, Conversion: 0},
	}

	// План по салонам - используем уже полученные salons
	for _, salon := range salons {
		var plan, fact float64
		// План ищем через goals - ищем по назначенным менеджерам салонов или по салонам
		// Сначала пробуем найти менеджеров этого салона
		var managerIDs []uuid.UUID
		s.DB.Model(&models.User{}).
			Where("salon_id = ?", salon.ID).
			Pluck("id", &managerIDs)
		
		if len(managerIDs) > 0 {
			// План по менеджерам салона
			s.DB.Model(&models.Goal{}).
				Where("assignee_id IN ? AND target_date BETWEEN ? AND ?", managerIDs, startDate, endDate).
				Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		}
		
		// Если план не найден, пробуем через dealer_id
		if plan == 0 {
			s.DB.Model(&models.Goal{}).
				Where("dealer_id = ? AND target_date BETWEEN ? AND ?", userID, startDate, endDate).
				Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		}
		
		// Факт - продажи этого салона
		s.DB.Model(&models.Lead{}).
			Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salon.ID, []string{"sale", "paid"}, startDate, endDate).
			Select("COALESCE(SUM(budget), 0)").Scan(&fact)

		percent := 0
		if plan > 0 {
			percent = int((fact / plan) * 100)
		}

		forecast := "red"
		if percent >= 100 {
			forecast = "green"
		} else if percent >= 70 {
			forecast = "yellow"
		}

		resp.SalonPlanData = append(resp.SalonPlanData, models.SalonPlanData{
			ID:        salon.ID,
			Name:      salon.Name,
			Plan:      plan,
			Fact:      fact,
			Percent:   percent,
			Forecast:  forecast,
			ManagersCount: 1, // Each salon has at least one manager
			AvgCheck:       0,
		})
	}

	return resp, nil
}

// GetDealerProducts - товары для дилера
func (s *KPIService) GetDealerProducts(ctx context.Context, userID uuid.UUID, dateStr string) (*models.DealerProductsResponse, error) {
	resp := &models.DealerProductsResponse{}

	var managers []models.User
	if err := s.DB.Where("managed_by = ?", userID).Find(&managers).Error; err != nil {
		return nil, err
	}

	var salonIDs []uuid.UUID
	for _, mgr := range managers {
		if mgr.SalonID != nil {
			salonIDs = append(salonIDs, *mgr.SalonID)
		}
	}

	if len(salonIDs) == 0 {
		return resp, nil
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())

	// Общая выручка
	s.DB.Model(&models.Lead{}).
		Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"sale", "paid"}, firstOfMonth, targetDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&resp.TotalRevenue)

	// Топ товары
	type productStats struct {
		Name     string
		Revenue  float64
		Quantity int
	}

	var products []productStats
	rows, err := s.DB.Model(&models.Lead{}).
		Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"sale", "paid"}, firstOfMonth, targetDate).
		Select("interest_product, COALESCE(SUM(budget), 0) as revenue, COUNT(*) as quantity").
		Group("interest_product").
		Order("revenue DESC").
		Limit(10).
		Rows()
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var ps productStats
			rows.Scan(&ps.Name, &ps.Revenue, &ps.Quantity)
			if ps.Name != "" {
				products = append(products, ps)
			}
		}
	}

	for _, ps := range products {
		share := 0.0
		if resp.TotalRevenue > 0 {
			share = (ps.Revenue / resp.TotalRevenue) * 100
		}
		resp.TopProducts = append(resp.TopProducts, models.DealerTopProduct{
			ID:           ps.Name,
			Name:         ps.Name,
			Revenue:      ps.Revenue,
			Quantity:     ps.Quantity,
			SharePercent: share,
		})
	}

	// Остатки (заглушки)
	stockItems := []string{"Диван", "Кресло", "Кровать", "Шкаф", "Стол"}
	for _, name := range stockItems {
		resp.Inventory = append(resp.Inventory, models.DealerInventoryItem{
			ID:              name,
			Collection:     "Основная",
			StockWarehouse: 10,
			OnDisplay:     5,
			SoldPeriod:    3,
			TurnoverDays:  45,
		})
	}

	return resp, nil
}

// GetFranchiserSummary - сводка для франчайзера
func (s *KPIService) GetFranchiserSummary(ctx context.Context, userID uuid.UUID, dateStr string) (*models.FranchiserSummaryResponse, error) {
	resp := &models.FranchiserSummaryResponse{}

	// All managers under this franchiser
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, userID).Find(&managers).Error; err != nil {
		return nil, err
	}
	if len(managers) == 0 {
		return resp, nil
	}

	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
	endOfMonth := time.Date(targetDate.Year(), targetDate.Month()+1, 0, 23, 59, 59, 0, targetDate.Location())

	// Dealers under those managers
	var dealerIDs []uuid.UUID
	s.DB.Model(&models.User{}).Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Pluck("id", &dealerIDs)
	resp.ActiveDealers = len(dealerIDs)

	if len(dealerIDs) == 0 {
		return resp, nil
	}

	// Total plan from daily_goals
	var totalPlan float64
	s.DB.Model(&models.DailyGoal{}).
		Where("user_id IN ? AND target_date BETWEEN ? AND ?", dealerIDs, firstOfMonth, endOfMonth).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)

	// Salons belonging to these dealers (dealer_id = user.ID, NOT user.TenantID)
	var salonIDs []uuid.UUID
	s.DB.Model(&models.Salon{}).Where("dealer_id IN ?", dealerIDs).Pluck("id", &salonIDs)

	// Fact from orders
	var totalFact float64
	if len(salonIDs) > 0 {
		s.DB.Model(&models.Order{}).
			Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, firstOfMonth, endOfMonth).
			Select("COALESCE(SUM(total_price), 0)").Scan(&totalFact)
	}

	planPercent := 0
	if totalPlan > 0 {
		planPercent = int((totalFact / totalPlan) * 100)
	}

	forecastPercent := 0
	if totalPlan > 0 {
		forecastPercent = int((totalFact / totalPlan) * 100)
	}

	var totalLeads, totalSales int64
	if len(salonIDs) > 0 {
		s.DB.Model(&models.Lead{}).
			Where("salon_id IN ? AND created_at BETWEEN ? AND ?", salonIDs, firstOfMonth, targetDate).Count(&totalLeads)
		s.DB.Model(&models.Lead{}).
			Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, firstOfMonth, targetDate).Count(&totalSales)
	}
	avgConversion := 0.0
	if totalLeads > 0 {
		avgConversion = (float64(totalSales) / float64(totalLeads)) * 100
	}

	resp.PlanPercent = planPercent
	resp.ForecastPercent = forecastPercent
	resp.ActiveDealers = len(dealerIDs)
	resp.AvgConversion = avgConversion
	resp.AvgMargin = 32.0

	return resp, nil
}

// GetFranchiserNetwork - данные сети
func (s *KPIService) GetFranchiserNetwork(ctx context.Context, userID uuid.UUID, period, dateStr, startDateStr, endDateStr string) (*models.FranchiserNetworkResponse, error) {
	resp := &models.FranchiserNetworkResponse{}

	// Шаг 1: Найти всех менеджеров под этим франчайзером
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, userID).Find(&managers).Error; err != nil {
		return nil, err
	}

	if len(managers) == 0 {
		return resp, nil
	}

	// Шаг 2: Найти всех дилеров под этими менеджерами
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
		return nil, err
	}

	if len(dealers) == 0 {
		return resp, nil
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	startDate, endDate := parsePeriodStartEnd(period, dateStr, startDateStr, endDateStr)

	// По каждому дилеру
	for _, dealer := range dealers {
		var plan, leadFactVal, orderFactVal float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", dealer.ID, []string{"sale", "paid"}, startDate, endDate).
			Select("COALESCE(SUM(budget), 0)").Scan(&leadFactVal)

		// Fact from orders via dealer's salons
		var dSalonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &dSalonIDs)
		if len(dSalonIDs) > 0 {
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dSalonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&orderFactVal)
		}

		fact := orderFactVal
		if leadFactVal > orderFactVal {
			fact = leadFactVal
		}

		percent := 0
		if plan > 0 {
			percent = int((fact / plan) * 100)
		}

		// SALON count
		var salonsCount int64
		s.DB.Model(&models.Salon{}).Where("tenant_id = ?", dealer.TenantID).Count(&salonsCount)

		forecast := "red"
		if percent >= 80 {
			forecast = "green"
		} else if percent >= 50 {
			forecast = "yellow"
		}

		resp.NetworkData = append(resp.NetworkData, models.FranchiserDealerData{
			ID:              dealer.ID,
			Name:            dealer.FirstName + " " + dealer.LastName,
			SalonCount:      int(salonsCount),
			Plan:            plan,
			Fact:            fact,
			PlanPercent:     percent,
			Forecast:        forecast,
		})
	}

	// Общие метрики
	var totalPlan, leadFact, orderFact, totalFact float64
	s.DB.Model(&models.DailyGoal{}).
		Where("user_id IN ? AND target_date BETWEEN ? AND ?", dealerIDs, startDate, endDate).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)
	
	// Факт из лидов (статус sale или paid)
	s.DB.Model(&models.Lead{}).
		Where("manager_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerIDs, []string{"sale", "paid"}, startDate, endDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&leadFact)
	
	// Получаем фактические продажи из заказов (ORDERS)
	// Сначала найдём салоны, принадлежащие этим дилерам (dealer_id = user.ID)
	var salonIDs []uuid.UUID
	for _, dealer := range dealers {
		var salons []models.Salon
		s.DB.Where("dealer_id = ?", dealer.ID).Find(&salons)
		for _, salon := range salons {
			salonIDs = append(salonIDs, salon.ID)
		}
	}
	
	if len(salonIDs) > 0 {
		s.DB.Model(&models.Order{}).
			Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
			Select("COALESCE(SUM(total_price), 0)").Scan(&orderFact)
	}
	
	// Используем максимальное значение из обоих источников
	if orderFact > leadFact {
		totalFact = orderFact
	} else {
		totalFact = leadFact
	}

	// Рассчитать процент плана
	planPercent := 0.0
	if totalPlan > 0 {
		planPercent = (totalFact / totalPlan) * 100
	}

	// Прогноз на квартал (простая экстраполяция)
	forecastAmount := totalFact
	forecastPercent := planPercent

	// Красная зона: дилеры с < 50% плана
	redZoneCount := 0
	for _, dealer := range dealers {
		// Находим салоны этого дилера
		var dealerSalonIDs []uuid.UUID
		var salons []models.Salon
		s.DB.Where("dealer_id = ?", dealer.ID).Find(&salons)
		for _, salon := range salons {
			dealerSalonIDs = append(dealerSalonIDs, salon.ID)
		}
		
		var plan float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		
		if plan > 0 && len(dealerSalonIDs) > 0 {
			var fact float64
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerSalonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
			if int((fact/plan)*100) < 50 {
				redZoneCount++
			}
		}
	}

	// Средняя конверсия (упрощённо)
	avgConversion := 50.0
	if len(dealers) == 0 {
		avgConversion = 0
	}

	resp.Overview = models.FranchiserOverview{
		PlanAmount:       totalPlan,
		PlanPercent:     int(planPercent),
		ForecastAmount:  forecastAmount,
		ForecastPercent: int(forecastPercent),
		ActiveDealers:  len(dealers),
		AvgConversion:  avgConversion,
		AvgMargin:      32,
		RedZoneDealers:  redZoneCount,
	}

	return resp, nil
}

// GetFranchiserHealth - здоровье сети
func (s *KPIService) GetFranchiserHealth(ctx context.Context, userID uuid.UUID) (*models.FranchiserHealthResponse, error) {
	resp := &models.FranchiserHealthResponse{}

	// Используем правильную иерархию: franchiser → managers → dealers
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, userID).Find(&managers).Error; err != nil {
		return nil, err
	}

	if len(managers) == 0 {
		return resp, nil
	}

	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
		return nil, err
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	if len(dealerIDs) == 0 {
		return resp, nil
	}

	// SLA (все лиды обработаны за 24ч)
	var totalLeads, processedLeads int64
	s.DB.Model(&models.Lead{}).Where("manager_id IN ?", dealerIDs).Count(&totalLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND updated_at > ?", dealerIDs, time.Now().Add(-24*time.Hour)).Count(&processedLeads)

	if totalLeads > 0 {
		resp.SLA = float64(processedLeads) / float64(totalLeads) * 100
	} else {
		resp.SLA = 100
	}

	// Красные дилеры (выполнение < 50%)
	for _, dealer := range dealers {
		var fact float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ?", dealer.ID, []string{"sale", "paid"}).
			Select("COALESCE(SUM(budget), 0)").Scan(&fact)

		if fact == 0 {
			resp.RedDealers = append(resp.RedDealers, models.FranchiserDealerHealth{
				DealerID:   dealer.ID,
				DealerName: dealer.FirstName + " " + dealer.LastName,
				Issue:     "Нет продаж",
				Severity:   "critical",
			})
		}
	}

	// Общие показатели
	resp.TotalDealers = len(dealers)
	resp.ActiveDealers = len(dealers)
	resp.TotalSalons = 0 // Запросить через Salon model

	return resp, nil
}

// GetFranchiserTeam - команда франчайзера
func (s *KPIService) GetFranchiserTeam(ctx context.Context, userID uuid.UUID, period, dateStr, startDateStr, endDateStr string) (*models.FranchiserTeamResponse, error) {
	resp := &models.FranchiserTeamResponse{}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, userID).Find(&managers).Error; err != nil {
		return nil, err
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	var startDate, endDate time.Time
	switch period {
	case "quarter":
		q := ((int(targetDate.Month()) - 1) / 3) * 3
		startDate = time.Date(targetDate.Year(), time.Month(q+1), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = time.Date(targetDate.Year(), time.Month(q+4), 0, 23, 59, 59, 0, targetDate.Location())
	case "year":
		startDate = time.Date(targetDate.Year(), 1, 1, 0, 0, 0, 0, targetDate.Location())
		endDate = time.Date(targetDate.Year(), 12, 31, 23, 59, 59, 0, targetDate.Location())
	case "custom":
		if sd, err := time.Parse("2006-01-02", startDateStr); err == nil {
			startDate = sd
		} else {
			startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
		}
		if ed, err := time.Parse("2006-01-02", endDateStr); err == nil {
			endDate = ed
		} else {
			endDate = time.Now()
		}
	default: // month
		startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())
		endDate = time.Date(targetDate.Year(), targetDate.Month()+1, 0, 23, 59, 59, 0, targetDate.Location())
	}

	for _, mgr := range managers {
		var dealersCount int64
		s.DB.Model(&models.User{}).Where("role = ? AND managed_by = ?", models.RoleDealer, mgr.ID).Count(&dealersCount)

		// Manager's own plan completion — sum over period
		type planFact struct {
			Plan float64
			Fact float64
		}
		var mgrPF planFact
		s.DB.Model(&models.Goal{}).
			Where("assignee_id = ? AND target_date >= ? AND target_date <= ?", mgr.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan),0) as plan, COALESCE(SUM(sales_fact),0) as fact").
			Scan(&mgrPF)

		planPercent := 0
		if mgrPF.Plan > 0 {
			pct := (mgrPF.Fact / mgrPF.Plan) * 100
			if pct > 100 {
				pct = 100
			}
			planPercent = int(pct)
		}

		// Dealers and their goals
		var dealers []models.User
		s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, mgr.ID).Find(&dealers)

		redCount := 0
		slaOKCount := 0
		zeroFactCount := 0
		for _, d := range dealers {
			var dPF planFact
			s.DB.Model(&models.Goal{}).
				Where("assignee_id = ? AND target_date >= ? AND target_date <= ?", d.ID, startDate, endDate).
				Select("COALESCE(SUM(sales_plan),0) as plan, COALESCE(SUM(sales_fact),0) as fact").
				Scan(&dPF)
			if dPF.Plan > 0 {
				pct := (dPF.Fact / dPF.Plan) * 100
				if pct < 50 {
					redCount++
				}
				if pct >= 80 {
					slaOKCount++
				}
			}
			if dPF.Fact == 0 {
				zeroFactCount++
			}
		}

		redPct := 0
		if len(dealers) > 0 {
			redPct = (redCount * 100) / len(dealers)
		}

		// SLA: % of dealers with plan >= 80%
		sla := 0
		if len(dealers) > 0 {
			sla = (slaOKCount * 100) / len(dealers)
		}

		// Dealer growth: new dealers created in period
		var newDealers int64
		s.DB.Model(&models.User{}).
			Where("role = ? AND managed_by = ? AND created_at >= ? AND created_at <= ?", models.RoleDealer, mgr.ID, startDate, endDate).
			Count(&newDealers)
		dealerGrowth := 0
		if dealersCount > 0 {
			dealerGrowth = int((newDealers * 100) / dealersCount)
		}

		// Churn rate: % of dealers with fact = 0
		churnRate := 0
		if len(dealers) > 0 {
			churnRate = (zeroFactCount * 100) / len(dealers)
		}

		// Forecast: plan% / days-progress
		forecastPct := planPercent
		totalDays := endDate.Sub(startDate).Hours() / 24
		if totalDays > 0 {
			now := time.Now()
			if now.After(endDate) {
				now = endDate
			}
			daysPassed := now.Sub(startDate).Hours() / 24
			if daysPassed < 1 {
				daysPassed = 1
			}
			progress := daysPassed / totalDays
			if progress > 0 {
				f := float64(planPercent) / progress
				if f > 100 {
					f = 100
				}
				forecastPct = int(f)
			}
		}

		// integral KPI = plan*0.40 + (100-redPct)*0.25 + sla*0.20 + min((growth/2)*10,10) + 5
		kpiPlan := float64(planPercent) * 0.40
		kpiRed := float64(100-redPct) * 0.25
		kpiSla := float64(sla) * 0.20
		kpiGrowth := float64(dealerGrowth) / 2 * 10
		if kpiGrowth > 10 {
			kpiGrowth = 10
		}
		kpiReports := 5.0
		integralKpi := int(kpiPlan + kpiRed + kpiSla + kpiGrowth + kpiReports)
		if integralKpi > 100 {
			integralKpi = 100
		}

		// Bonus
		bonus := 0.0
		if integralKpi >= 90 {
			bonus = 75000
		} else if integralKpi >= 75 {
			bonus = 50000
		} else if integralKpi >= 50 {
			bonus = 25000
		}

		resp.TeamMembers = append(resp.TeamMembers, models.FranchiserTeamMember{
			ID:              mgr.ID,
			Name:            mgr.FirstName + " " + mgr.LastName,
			Territory:       mgr.Territory,
			DealersCount:    int(dealersCount),
			Role:            "Менеджер сети",
			PlanPercent:     planPercent,
			RedDealersPct:   redPct,
			SLA:             sla,
			DealerGrowth:    dealerGrowth,
			ChurnRate:       churnRate,
			ForecastPercent: forecastPct,
			IntegralKPI:     integralKpi,
			BonusForecast:   bonus,
		})
	}

	return resp, nil
}

// GetTerritorySummary - сводка для территориального менеджера
func (s *KPIService) GetTerritorySummary(ctx context.Context, userID uuid.UUID, dateStr string) (*models.TerritorySummaryResponse, error) {
	resp := &models.TerritorySummaryResponse{}

	// Находим всех дилеров, которыми управляет территориальный менеджер
	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, userID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	if len(dealers) == 0 {
		return resp, nil
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}
	firstOfMonth := time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, targetDate.Location())

	// План и факт
	var totalPlan, totalFact float64
	s.DB.Model(&models.DailyGoal{}).
		Where("user_id IN ? AND target_date BETWEEN ? AND ?", dealerIDs, firstOfMonth, targetDate).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)
	s.DB.Model(&models.Lead{}).
		Where("manager_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerIDs, []string{"sale", "paid"}, firstOfMonth, targetDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&totalFact)

	resp.PlanCompletionPercent = 0
	if totalPlan > 0 {
		resp.PlanCompletionPercent = int((totalFact / totalPlan) * 100)
	}

	// Прогноз
	daysInMonth := targetDate.Day()
	dailyAvg := totalFact / float64(daysInMonth)
	forecastAmount := dailyAvg * 30
	resp.QuarterForecastPercent = 0
	if totalPlan > 0 {
		resp.QuarterForecastPercent = int((forecastAmount / totalPlan) * 100)
	}

	// Красные дилеры
	redZoneDealersCount := 0
	for _, dealer := range dealers {
		var fact float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ?", dealer.ID, []string{"sale", "paid"}).
			Select("COALESCE(SUM(budget), 0)").Scan(&fact)
		if totalPlan > 0 && (fact/totalPlan)*100 < 50 {
			redZoneDealersCount++
		}
	}
	resp.RedZoneDealersCount = redZoneDealersCount

	// Конверсия
	var totalLeads, totalSales int64
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND created_at BETWEEN ? AND ?", dealerIDs, firstOfMonth, targetDate).Count(&totalLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerIDs, []string{"sale", "paid"}, firstOfMonth, targetDate).Count(&totalSales)

	resp.AvgConversion = 0
	if totalLeads > 0 {
		resp.AvgConversion = (float64(totalSales) / float64(totalLeads)) * 100
	}

	resp.ActiveAlerts = redZoneDealersCount

	return resp, nil
}

// GetTerritoryFunnel - воронка для территориального менеджера
func (s *KPIService) GetTerritoryFunnel(ctx context.Context, userID uuid.UUID, period, dateStr string) (*models.TerritoryFunnelResponse, error) {
	resp := &models.TerritoryFunnelResponse{}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, userID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	if len(dealerIDs) == 0 {
		return resp, nil
	}

	targetDate := time.Now()
	if dateStr != "" {
		if parsed, err := time.Parse("2006-01-02", dateStr); err == nil {
			targetDate = parsed
		}
	}

	// Воронка по этапам
	var newLeads, contactLeads, meetingLeads, saleLeads int64
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND created_at >= ?", dealerIDs, targetDate.AddDate(0, 0, -30)).Count(&newLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND status = ? AND created_at >= ?", dealerIDs, "contact", targetDate.AddDate(0, 0, -30)).Count(&contactLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND status = ? AND created_at >= ?", dealerIDs, "meeting", targetDate.AddDate(0, 0, -30)).Count(&meetingLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND status IN ? AND created_at >= ?", dealerIDs, []string{"sale", "paid"}, targetDate.AddDate(0, 0, -30)).Count(&saleLeads)

	resp.Stages = []models.FunnelStage{
		{Stage: "leads", Label: "Лиды", Count: int(newLeads), Conversion: 100},
		{Stage: "contact", Label: "Контакт", Count: int(contactLeads), Conversion: 0},
		{Stage: "meeting", Label: "Встреча", Count: int(meetingLeads), Conversion: 0},
		{Stage: "sale", Label: "Продажа", Count: int(saleLeads), Conversion: 0},
	}

	return resp, nil
}

// GetTerritoryPlanFact - план-факт
func (s *KPIService) GetTerritoryPlanFact(ctx context.Context, userID uuid.UUID, period string) (*models.TerritoryPlanFactResponse, error) {
	resp := &models.TerritoryPlanFactResponse{}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, userID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	if len(dealerIDs) == 0 {
		return resp, nil
	}

	now := time.Now()
	var startDate, endDate time.Time
	switch period {
	case "week":
		startDate = now.AddDate(0, 0, -7)
		endDate = now
	case "quarter":
		m := int(now.Month())
		quarterStart := time.Month(((m - 1) / 3) * 3 + 1)
		startDate = time.Date(now.Year(), quarterStart, 1, 0, 0, 0, 0, now.Location())
		endDate = now
	default: // month
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = now
	}

	// По каждому дилеру
	for _, dealer := range dealers {
		var plan, fact float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", dealer.ID, []string{"sale", "paid"}, startDate, endDate).
			Select("COALESCE(SUM(budget), 0)").Scan(&fact)

		percent := 0
		if plan > 0 {
			percent = int((fact / plan) * 100)
		}

		resp.Dealers = append(resp.Dealers, models.TerritoryDealerPlanFact{
			ID:            dealer.ID,
			DealerName:    dealer.FirstName + " " + dealer.LastName,
			Plan:          plan,
			Fact:          fact,
			PlanPercent:   percent,
		})
	}

	// Итого
	var totalPlan, totalFact float64
	s.DB.Model(&models.DailyGoal{}).
		Where("user_id IN ? AND target_date BETWEEN ? AND ?", dealerIDs, startDate, endDate).
		Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)
	s.DB.Model(&models.Lead{}).
		Where("manager_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerIDs, []string{"sale", "paid"}, startDate, endDate).
		Select("COALESCE(SUM(budget), 0)").Scan(&totalFact)

	resp.TotalPlan = totalPlan
	resp.TotalFact = totalFact

	return resp, nil
}

// GetTerritoryCommunications - коммуникации
func (s *KPIService) GetTerritoryCommunications(ctx context.Context, userID uuid.UUID) (*models.TerritoryCommunicationsResponse, error) {
	resp := &models.TerritoryCommunicationsResponse{}

	// Задачи (от franchiser_manager к дилерам)
	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, userID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	// Недавние задачи
	var tasks []models.Task
	if len(dealerIDs) > 0 {
		s.DB.Where("assigned_to IN ? AND created_at > ?", dealerIDs, time.Now().AddDate(0, 0, -7)).Find(&tasks)
	}

	for _, task := range tasks {
		resp.Tasks = append(resp.Tasks, models.TerritoryTask{
			ID:          task.ID,
			Title:       task.Title,
			Status:      task.Status,
			AssignedTo: task.AssignedTo,
			DueDate:     task.DueDate.Format("2006-01-02"),
		})
	}

	// Непрочитанные сообщения
	var messagesCount int64
	s.DB.Model(&models.Notification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&messagesCount)
	resp.UnreadMessages = int(messagesCount)

	return resp, nil
}

// GetTerritoryBenchmarks - бенчмарки
func (s *KPIService) GetTerritoryBenchmarks(ctx context.Context, userID uuid.UUID) (*models.TerritoryBenchmarksResponse, error) {
	resp := &models.TerritoryBenchmarksResponse{}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, userID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	var dealerIDs []uuid.UUID
	for _, d := range dealers {
		dealerIDs = append(dealerIDs, d.ID)
	}

	if len(dealerIDs) == 0 {
		return resp, nil
	}

	// Средняя конверсия территории
	var totalLeads, totalSales int64
	s.DB.Model(&models.Lead{}).Where("manager_id IN ?", dealerIDs).Count(&totalLeads)
	s.DB.Model(&models.Lead{}).Where("manager_id IN ? AND status IN ?", dealerIDs, []string{"sale", "paid"}).Count(&totalSales)

	resp.TerritoryConversion = 0
	if totalLeads > 0 {
		resp.TerritoryConversion = (float64(totalSales) / float64(totalLeads)) * 100
	}

	// Средний чек
	var avgCheck float64
	s.DB.Model(&models.Lead{}).
		Where("manager_id IN ? AND status IN ?", dealerIDs, []string{"sale", "paid"}).
		Select("COALESCE(AVG(budget), 0)").Scan(&avgCheck)
	resp.TerritoryAvgCheck = avgCheck

	// Эталон (сеть)
	resp.NetworkAvgConversion = 15.0 // 15% - эталон
	resp.NetworkAvgCheck = 80000   // 80k - эталон

	return resp, nil
}

// === Dealer Tasks Service ===

func (s *KPIService) GetDealerTasks(ctx context.Context, userID uuid.UUID) (*models.DealerTasksResponse, error) {
	resp := &models.DealerTasksResponse{}
	
	// Проверяем наличие таблицы
	var count int64
	s.DB.Raw("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'dealer_tasks'").Scan(&count)
	if count == 0 {
		return resp, nil // таблицы нет - возвращаем пустой ответ
	}
	
	// Читаем задачи из таблицы dealer_tasks
	type DealerTask struct {
		ID          uuid.UUID  `json:"id"`
		Title       string    `json:"title"`
		Description string    `json:"description"`
		Status      string    `json:"status"`
		Priority   string    `json:"priority"`
		DueDate     *time.Time `json:"due_date"`
		CreatedAt   time.Time `json:"created_at"`
	}
	rows, err := s.DB.Raw(`
		SELECT id, title, description, status, priority, due_date, created_at 
		FROM dealer_tasks 
		WHERE dealer_id = ?
		ORDER BY due_date ASC, created_at DESC
	`, userID).Rows()
	
	if err != nil {
		return resp, nil
	}
	defer rows.Close()
	
	now := time.Now()
	for rows.Next() {
		var t DealerTask
		rows.Scan(&t.ID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.CreatedAt)
		
		// Определяем статус просрочки
		isOverdue := t.DueDate != nil && t.DueDate.Before(now) && t.Status != "done"
		
		resp.Tasks = append(resp.Tasks, models.DealerTaskItem{
			ID:          t.ID,
			Title:       t.Title,
			Description: t.Description,
			Status:      t.Status,
			Priority:   t.Priority,
			DueDate:     t.DueDate.Format("2006-01-02"),
			IsOverdue:  isOverdue,
		})
	}
	
	resp.Total = len(resp.Tasks)
	resp.Overdue = 0
	for _, t := range resp.Tasks {
		if t.IsOverdue {
			resp.Overdue++
		}
	}
	
	return resp, nil
}

func (s *KPIService) UpdateDealerTask(ctx context.Context, userID, taskID, status string) error {
	return s.DB.Exec(`
		UPDATE dealer_tasks 
		SET status = ?, updated_at = NOW() 
		WHERE id = ? AND dealer_id = ?
	`, status, taskID, userID).Error
}

// === Dealer Requests Service ===

func (s *KPIService) GetDealerRequests(ctx context.Context, userID uuid.UUID, statusFilter string) (*models.DealerRequestsResponse, error) {
	resp := &models.DealerRequestsResponse{}
	
	type DealerRequest struct {
		ID          uuid.UUID  `json:"id"`
		Type        string    `json:"type"`
		Description string    `json:"description"`
		Amount     float64   `json:"amount"`
		Status      string    `json:"status"`
		CreatedAt   time.Time `json:"created_at"`
	}
	
	query := "SELECT id, type, description, amount, status, created_at FROM dealer_requests WHERE dealer_id = ?"
	args := []interface{}{userID.String()}
	
	if statusFilter != "" {
		query += " AND status = ?"
		args = append(args, statusFilter)
	}
	query += " ORDER BY created_at DESC"
	
	rows, err := s.DB.Raw(query, args...).Rows()
	if err != nil {
		return resp, nil
	}
	defer rows.Close()
	
	for rows.Next() {
		var r models.DealerRequest
		rows.Scan(&r.ID, &r.DealerID, &r.Type, &r.Description, &r.Amount, &r.Status, &r.CreatedAt)
		resp.Requests = append(resp.Requests, models.DealerRequestItem{
			ID:          r.ID,
			DealerID:    r.DealerID,
			Type:        r.Type,
			Description: r.Description,
			Amount:      r.Amount,
			Status:      r.Status,
			CreatedAt:   r.CreatedAt,
		})
	}
	
	resp.Total = len(resp.Requests)
	resp.Pending = 0
	for _, r := range resp.Requests {
		if r.Status == "pending" {
			resp.Pending++
		}
	}
	
	return resp, nil
}

func (s *KPIService) CreateDealerRequest(ctx context.Context, userID uuid.UUID, reqType, description string, amount float64) error {
	return s.DB.Exec(`
		INSERT INTO dealer_requests (id, dealer_id, type, description, amount, status, created_at, updated_at)
		VALUES (gen_random_uuid(), ?, ?, ?, ?, 'pending', NOW(), NOW())
	`, userID.String(), reqType, description, amount).Error
}

// === Dealer Marketing Budget Service ===

func (s *KPIService) GetDealerMarketingBudget(ctx context.Context, userID uuid.UUID, quarter string) (*models.DealerMarketingBudgetResponse, error) {
	resp := &models.DealerMarketingBudgetResponse{
		Quarter: quarter,
	}
	
	type MarketingBudget struct {
		TotalAmount  float64 `json:"total_amount"`
		UsedAmount   float64 `json:"used_amount"`
	}
	
	var mb MarketingBudget
	err := s.DB.Raw(`
		SELECT total_amount, used_amount 
		FROM marketing_budgets 
		WHERE dealer_id = ? AND quarter = ?
	`, userID, quarter).Scan(&mb)
	
	if err != nil {
		// Дефолтные значения если бюджет не задан
		resp.TotalAmount = 200000
		resp.UsedAmount = 60000
	} else {
		resp.TotalAmount = mb.TotalAmount
		resp.UsedAmount = mb.UsedAmount
	}
	
	resp.Remaining = resp.TotalAmount - resp.UsedAmount
	if resp.TotalAmount > 0 {
		resp.UsagePercent = int((resp.UsedAmount / resp.TotalAmount) * 100)
	}
	
	return resp, nil
}

// === Dealer Alerts Service ===

func (s *KPIService) GetDealerAlerts(ctx context.Context, userID uuid.UUID) (*models.DealerAlertsResponse, error) {
	resp := &models.DealerAlertsResponse{}
	
	// Читаем из notifications
	type Alert struct {
		ID        uuid.UUID `json:"id"`
		Type     string   `json:"type"`
		Title    string   `json:"title"`
		Message  string   `json:"message"`
		IsRead   bool     `json:"is_read"`
		Priority string  `json:"priority"`
	}
	
	rows, err := s.DB.Raw(`
		SELECT id, type, title, message, is_read
		FROM notifications 
		WHERE user_id = ?
		ORDER BY created_at DESC
	`, userID).Rows()
	
	if err != nil {
		return resp, nil
	}
	defer rows.Close()
	
	for rows.Next() {
		var a Alert
		rows.Scan(&a.ID, &a.Type, &a.Title, &a.Message, &a.IsRead)
		
		priority := "info"
		if a.Type == "conversion_drop" || a.Type == "task_overdue" {
			priority = "critical"
		} else if a.Type == "payroll_exceeded" {
			priority = "warning"
		}
		
		if !a.IsRead {
			resp.Alerts = append(resp.Alerts, models.DealerAlertItem{
				ID:       a.ID,
				Type:     a.Type,
				Title:    a.Title,
				Message:  a.Message,
				Priority: priority,
			})
		}
	}
	
	resp.UnreadCount = len(resp.Alerts)
	return resp, nil
}

func (s *KPIService) MarkDealerAlertRead(ctx context.Context, userID, alertID uuid.UUID) error {
	return s.DB.Exec(`
		UPDATE notifications 
		SET is_read = true 
		WHERE id = ? AND user_id = ?
	`, alertID, userID).Error
}

func (s *KPIService) MarkAllDealerAlertsRead(ctx context.Context, userID uuid.UUID) error {
	return s.DB.Exec(`
		UPDATE notifications 
		SET is_read = true 
		WHERE user_id = ?
	`, userID).Error
}

// GetFranchiserDealers - получить список дилеров
func (s *KPIService) GetFranchiserDealers(ctx context.Context, userID uuid.UUID, filter string) (*models.FranchiserDealersResponse, error) {
	resp := &models.FranchiserDealersResponse{
		Dealers: []models.FranchiserDealerItem{},
	}

	var currentUser models.User
	if err := s.DB.First(&currentUser, "id = ?", userID).Error; err != nil {
		return nil, err
	}

	query := s.DB.Where("role = ? AND tenant_id = ?", models.RoleDealer, currentUser.TenantID)
	if filter == "problem" {
		query = query.Where("status = ?", "inactive")
	}

	var dealers []models.User
	if err := query.Find(&dealers).Error; err != nil {
		return nil, err
	}

	// Preload managers for name lookup
	type mgrInfo struct {
		ID         string
		FirstName  string
		LastName   string
	}
	var managers []mgrInfo
	s.DB.Table("users").Select("id, first_name, last_name").
		Where("tenant_id = ? AND role = ?", currentUser.TenantID, models.RoleFranchisorManager).Scan(&managers)
	managerMap := map[string]string{}
	for _, m := range managers {
		managerMap[m.ID] = m.FirstName + " " + m.LastName
	}

	for _, dealer := range dealers {
		var totalSales float64
		s.DB.Model(&models.Order{}).
			Joins("JOIN salons ON salons.id = orders.salon_id").
			Where("salons.dealer_id = ? AND orders.status = ?", dealer.ID, "paid").
			Select("COALESCE(SUM(total_price), 0)").Scan(&totalSales)

		var plan float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ?", dealer.ID).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)

		percent := 0
		if plan > 0 {
			percent = int((totalSales / plan) * 100)
		}

		status := "green"
		if percent < 50 {
			status = "red"
		} else if percent < 80 {
			status = "yellow"
		}

		managerName := ""
		if dealer.ManagedBy != nil {
			managerName = managerMap[dealer.ManagedBy.String()]
		}

		resp.Dealers = append(resp.Dealers, models.FranchiserDealerItem{
			ID:           dealer.ID,
			Name:         dealer.FirstName + " " + dealer.LastName,
			Email:        dealer.Email,
			Plan:         plan,
			Fact:         totalSales,
			PlanPercent:  percent,
			Status:       status,
			ManagerName:  managerName,
			ManagerID:    dealer.ManagedBy,
		})
	}

	resp.Total = len(resp.Dealers)
	return resp, nil
}

// GetFranchiserRequests - получить запросы от дилеров
func (s *KPIService) GetFranchiserRequests(ctx context.Context, userID uuid.UUID, filter string) (*models.FranchiserRequestsResponse, error) {
	resp := &models.FranchiserRequestsResponse{
		Requests: []models.FranchiserRequestItem{},
	}

	query := s.DB.Where("status = ?", "pending")
	if filter != "all" && filter != "" {
		query = query.Where("type = ?", filter)
	}

	var requests []models.DealerRequest
	if err := query.Order("created_at DESC").Find(&requests).Error; err != nil {
		return nil, err
	}

	for _, req := range requests {
		var dealerName string
		s.DB.Model(&models.User{}).Where("id = ?", req.DealerID).Select("first_name").Scan(&dealerName)

		resp.Requests = append(resp.Requests, models.FranchiserRequestItem{
			ID:          req.ID,
			DealerID:     req.DealerID,
			DealerName:   dealerName,
			Type:        req.Type,
			Description: req.Description,
			Amount:      req.Amount,
			Status:      req.Status,
			CreatedAt:    req.CreatedAt,
		})
	}

	resp.Total = len(resp.Requests)
	resp.Pending = len(resp.Requests)
	return resp, nil
}

// GetTerritoriesHeatmap - тепловая карта территорий
func (s *KPIService) GetTerritoriesHeatmap(ctx context.Context, userID string, period string) (map[string]interface{}, error) {
	resp := map[string]interface{}{"territories": []map[string]interface{}{}}
	
	userUUID, _ := uuid.Parse(userID)
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, userUUID).Find(&managers).Error; err != nil {
		return nil, err
	}
	
	var territories []map[string]interface{}
	for _, m := range managers {
		var managerIDs []uuid.UUID
		managerIDs = append(managerIDs, m.ID)
		
		var dealers []models.User
		s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers)
		
		var dealerIDs []uuid.UUID
		for _, d := range dealers {
			dealerIDs = append(dealerIDs, d.ID)
		}
		
		var plan float64
		if len(dealerIDs) > 0 {
			s.DB.Model(&models.DailyGoal{}).Where("user_id IN ?", dealerIDs).Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		}
		
		territories = append(territories, map[string]interface{}{
			"manager_id": m.ID,
			"name":       m.FirstName + " " + m.LastName,
			"dealers":   len(dealers),
			"plan":      plan,
			"status":    "green",
		})
	}
	resp["territories"] = territories
	return resp, nil
}

// GetManagerDynamics - динамика менеджера
func (s *KPIService) GetManagerDynamics(ctx context.Context, userID, managerID, months string) (map[string]interface{}, error) {
	resp := map[string]interface{}{"kpi": []map[string]interface{}{}}

	mgrUUID, err := uuid.Parse(managerID)
	if err != nil {
		return resp, nil
	}

	m, _ := strconv.Atoi(months)
	if m < 1 || m > 12 {
		m = 6
	}

	cutoff := time.Now().AddDate(0, -m, 0)
	var goals []models.Goal
	s.DB.Where("assignee_id = ? AND target_date >= ? AND target_date <= ?", mgrUUID, cutoff.Format("2006-01-02"), time.Now().Format("2006-01-02")).
		Order("target_date ASC").Find(&goals)

	goalMap := map[string]models.Goal{}
	for _, g := range goals {
		goalMap[g.TargetDate.Format("2006-01")] = g
	}

	for i := m - 1; i >= 0; i-- {
		date := time.Now().AddDate(0, -i, 0)
		monthKey := date.Format("2006-01")
		monthLabel := date.Format("2006-01")
		kpiVal := 75
		if g, ok := goalMap[monthKey]; ok && g.SalesPlan > 0 {
			pct := (g.SalesFact / g.SalesPlan) * 100
			if pct > 100 {
				pct = 100
			}
			kpiVal = int(pct)
		}
		item := map[string]interface{}{
			"month": monthLabel,
			"kpi":   kpiVal,
		}
		if g, ok := goalMap[monthKey]; ok {
			item["plan"] = g.SalesPlan
			item["fact"] = g.SalesFact
		}
		resp["kpi"] = append(resp["kpi"].([]map[string]interface{}), item)
	}
	return resp, nil
}

// GetManagerDealers - дилеры менеджера
func (s *KPIService) GetManagerDealers(ctx context.Context, userID, managerID string) (map[string]interface{}, error) {
	resp := map[string]interface{}{"dealers": []map[string]interface{}{}}

	mgrUUID, err := uuid.Parse(managerID)
	if err != nil {
		return resp, nil
	}

	var dealers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, mgrUUID).Find(&dealers).Error; err != nil {
		return nil, err
	}

	thisMonth := time.Now().Format("2006-01-02")

	for _, d := range dealers {
		var goal models.Goal
		s.DB.Where("assignee_id = ? AND target_date = ?", d.ID, thisMonth).Order("created_at DESC").First(&goal)

		plan := 4000000.0
		percent := 50
		if goal.SalesPlan > 0 {
			plan = goal.SalesPlan
			pct := (goal.SalesFact / goal.SalesPlan) * 100
			if pct > 100 {
				pct = 100
			}
			percent = int(pct)
		}

		status := "yellow"
		if percent >= 80 {
			status = "green"
		} else if percent < 50 {
			status = "red"
		}

		resp["dealers"] = append(resp["dealers"].([]map[string]interface{}), map[string]interface{}{
			"id":       d.ID,
			"name":     d.FirstName + " " + d.LastName,
			"plan":     int(plan),
			"percent":  percent,
			"status":   status,
		})
	}
	return resp, nil
}

// SetManagerPlans - установить планы менеджеров на месяц
func (s *KPIService) SetManagerPlans(ctx context.Context, userID string, monthStr string, plans []struct {
	ManagerID        string  `json:"manager_id"`
	PlanAmount       float64 `json:"plan_amount"`
	TargetDealers    int     `json:"target_dealers"`
	TargetRedDealers int     `json:"target_red_dealers"`
	TargetSla        int     `json:"target_sla"`
}) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", err)
	}

	monthDate, err := time.Parse("2006-01", monthStr)
	if err != nil {
		return fmt.Errorf("invalid month format (expected YYYY-MM): %w", err)
	}

	// Find franchiser to get tenant_id
	var franchiser models.User
	if err := s.DB.First(&franchiser, "id = ?", uid).Error; err != nil {
		return fmt.Errorf("franchiser not found: %w", err)
	}

	for _, p := range plans {
		managerUID, err := uuid.Parse(p.ManagerID)
		if err != nil {
			continue
		}

		// Upsert into manager_plans
		s.DB.Exec(`
			INSERT INTO manager_plans (manager_id, month, sales_plan, target_dealers, target_red_dealers, target_sla)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (manager_id, month)
			DO UPDATE SET sales_plan = $3, target_dealers = $4, target_red_dealers = $5, target_sla = $6, updated_at = NOW()
		`, managerUID, monthDate, p.PlanAmount, p.TargetDealers, p.TargetRedDealers, p.TargetSla)

		// Also sync into goals table so existing KPI queries can see the plan
		var exists int64
		s.DB.Model(&models.Goal{}).Where("assignee_id = ? AND target_date = ? AND period = 'month'", managerUID, monthDate).Count(&exists)
		if exists > 0 {
			s.DB.Model(&models.Goal{}).Where("assignee_id = ? AND target_date = ? AND period = 'month'", managerUID, monthDate).Update("sales_plan", p.PlanAmount)
		} else {
			s.DB.Create(&models.Goal{
				AssigneeID:  managerUID,
				AssignerID:  uid,
				Role:        string(models.RoleFranchisorManager),
				SalesPlan:   p.PlanAmount,
				Period:      models.PeriodMonth,
				TargetDate:  monthDate,
				TenantID:    franchiser.TenantID,
			})
		}
	}
	return nil
}

// GetManagerPlans - получить планы менеджеров на месяц
func (s *KPIService) GetManagerPlans(ctx context.Context, userID string, monthStr string) ([]map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	monthDate, err := time.Parse("2006-01", monthStr)
	if err != nil {
		return nil, fmt.Errorf("invalid month format (expected YYYY-MM): %w", err)
	}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}

	var result []map[string]interface{}
	for _, mgr := range managers {
		var plan models.ManagerPlan
		err := s.DB.Where("manager_id = ? AND month = ?", mgr.ID, monthDate).First(&plan).Error
		if err != nil {
			// No plan saved yet — return defaults
			result = append(result, map[string]interface{}{
				"manager_id":         mgr.ID.String(),
				"manager_name":       mgr.FirstName + " " + mgr.LastName,
				"sales_plan":         0,
				"target_dealers":     0,
				"target_red_dealers": 0,
				"target_sla":         0,
			})
		} else {
			result = append(result, map[string]interface{}{
				"manager_id":         mgr.ID.String(),
				"manager_name":       mgr.FirstName + " " + mgr.LastName,
				"sales_plan":         plan.SalesPlan,
				"target_dealers":     plan.TargetDealers,
				"target_red_dealers": plan.TargetRedDealers,
				"target_sla":         plan.TargetSla,
			})
		}
	}

	return result, nil
}

func parsePeriodStartEnd(period string, dateStr string, startDateStr string, endDateStr string) (startDate, endDate time.Time) {
	loc := time.UTC

	if startDateStr != "" && endDateStr != "" {
		startDate, _ = time.ParseInLocation("2006-01-02", startDateStr, loc)
		endDate, _ = time.ParseInLocation("2006-01-02", endDateStr, loc)
		endDate = endDate.Add(24*time.Hour - time.Nanosecond)
		return
	}

	now := time.Now()
	targetDate := now
	if dateStr != "" {
		switch period {
		case "month":
			t, err := time.Parse("2006-01", dateStr)
			if err == nil {
				targetDate = t
			}
		case "quarter":
			var year, q int
			if n, _ := fmt.Sscanf(dateStr, "%d-Q%d", &year, &q); n == 2 {
				targetDate = time.Date(year, time.Month((q-1)*3+1), 1, 0, 0, 0, 0, loc)
			}
		case "year":
			t, err := time.Parse("2006", dateStr)
			if err == nil {
				targetDate = t
			}
		}
	}

	switch period {
	case "month":
		startDate = time.Date(targetDate.Year(), targetDate.Month(), 1, 0, 0, 0, 0, loc)
		endDate = time.Date(targetDate.Year(), targetDate.Month()+1, 0, 23, 59, 59, 0, loc)
	case "quarter":
		m := int(targetDate.Month())
		qs := time.Month(((m - 1) / 3) * 3 + 1)
		startDate = time.Date(targetDate.Year(), qs, 1, 0, 0, 0, 0, loc)
		endDate = time.Date(targetDate.Year(), qs+3, 0, 23, 59, 59, 0, loc)
	default:
		startDate = time.Date(targetDate.Year(), 1, 1, 0, 0, 0, 0, loc)
		endDate = time.Date(targetDate.Year(), 12, 31, 23, 59, 59, 0, loc)
	}
	return
}

func parsePeriodWithPrev(period string, dateStr string, startDateStr string, endDateStr string) (curStart, curEnd, prevStart, prevEnd time.Time) {
	curStart, curEnd = parsePeriodStartEnd(period, dateStr, startDateStr, endDateStr)

	loc := time.UTC

	if startDateStr != "" && endDateStr != "" {
		dur := curEnd.Sub(curStart)
		prevStart = curStart.Add(-dur - 24*time.Hour)
		prevEnd = curStart.Add(-time.Nanosecond)
		return
	}

	targetDate := time.Now()
	if dateStr != "" {
		switch period {
		case "month":
			t, err := time.Parse("2006-01", dateStr)
			if err == nil {
				targetDate = t
			}
		case "quarter":
			var year, q int
			if n, _ := fmt.Sscanf(dateStr, "%d-Q%d", &year, &q); n == 2 {
				targetDate = time.Date(year, time.Month((q-1)*3+1), 1, 0, 0, 0, 0, loc)
			}
		case "year":
			t, err := time.Parse("2006", dateStr)
			if err == nil {
				targetDate = t
			}
		}
	}

	switch period {
	case "month":
		prevStart = time.Date(targetDate.Year(), targetDate.Month()-1, 1, 0, 0, 0, 0, loc)
		prevEnd = time.Date(targetDate.Year(), targetDate.Month(), 0, 23, 59, 59, 0, loc)
	case "quarter":
		m := int(targetDate.Month())
		qs := time.Month(((m - 1) / 3) * 3 + 1)
		prevStart = time.Date(targetDate.Year(), qs-3, 1, 0, 0, 0, 0, loc)
		prevEnd = time.Date(targetDate.Year(), qs, 0, 23, 59, 59, 0, loc)
	default:
		prevStart = time.Date(targetDate.Year()-1, 1, 1, 0, 0, 0, 0, loc)
		prevEnd = time.Date(targetDate.Year()-1, 12, 31, 23, 59, 59, 0, loc)
	}
	return
}

// GetDealersHealth - сегментация дилеров
func (s *KPIService) GetDealersHealth(ctx context.Context, userID string, period string, dateStr string, startDateStr string, endDateStr string) (map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Найти менеджеров → дилеров
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	if len(dealers) == 0 {
		return map[string]interface{}{
			"segments": map[string]interface{}{
				"a": []map[string]interface{}{},
				"b": []map[string]interface{}{},
				"c": []map[string]interface{}{},
				"d": []map[string]interface{}{},
			},
			"metrics": map[string]interface{}{},
		}, nil
	}

	startDate, endDate := parsePeriodStartEnd(period, dateStr, startDateStr, endDateStr)

	type dealerInfo struct {
		id          uuid.UUID
		name        string
		plan        float64
		fact        float64
		percent     int
		status      string
		managerName string
	}

	var dealerInfos []dealerInfo
	totalFact := 0.0

	for _, dealer := range dealers {
		info := dealerInfo{
			id:   dealer.ID,
			name: dealer.FirstName + " " + dealer.LastName,
		}

		// План
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&info.plan)

		// Факт из orders через салоны
		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&info.fact)
		}

		// Lead fact
		var leadFact float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", dealer.ID, []string{"sale", "paid"}, startDate, endDate).
			Select("COALESCE(SUM(budget), 0)").Scan(&leadFact)
		if leadFact > info.fact {
			info.fact = leadFact
		}

		if info.plan > 0 {
			info.percent = int((info.fact / info.plan) * 100)
		}

		switch {
		case info.percent >= 95:
			info.status = "green"
		case info.percent >= 85:
			info.status = "yellow"
		case info.percent >= 50:
			info.status = "orange"
		default:
			info.status = "red"
		}

		// Имя менеджера
		for _, m := range managers {
			if m.ID == *dealer.ManagedBy {
				info.managerName = m.FirstName + " " + m.LastName
				break
			}
		}

		dealerInfos = append(dealerInfos, info)
		totalFact += info.fact
	}

	// Группировка по сегментам
	segments := map[string][]map[string]interface{}{
		"a": {},
		"b": {},
		"c": {},
		"d": {},
	}

	segmentFacts := map[string]float64{"a": 0, "b": 0, "c": 0, "d": 0}
	segmentCounts := map[string]int{"a": 0, "b": 0, "c": 0, "d": 0}

	for _, d := range dealerInfos {
		var seg string
		switch {
		case d.percent >= 95:
			seg = "a"
		case d.percent >= 85:
			seg = "b"
		case d.percent >= 50:
			seg = "c"
		default:
			seg = "d"
		}

		segments[seg] = append(segments[seg], map[string]interface{}{
			"id":           d.id.String(),
			"name":         d.name,
			"plan":         d.plan,
			"fact":         d.fact,
			"plan_percent": d.percent,
			"status":       d.status,
			"manager_name": d.managerName,
		})
		segmentFacts[seg] += d.fact
		segmentCounts[seg]++
	}

	totalDealers := len(dealerInfos)
	activeDealers := 0
	for _, d := range dealerInfos {
		if d.percent >= 50 {
			activeDealers++
		}
	}

	// Доля выручки по сегментам
	segmentRevenue := map[string]float64{}
	for seg, fact := range segmentFacts {
		share := 0.0
		if totalFact > 0 {
			share = (fact / totalFact) * 100
		}
		segmentRevenue[seg] = share
	}

	// Средний процент плана
	avgPercent := 0
	if totalDealers > 0 {
		sumPercent := 0
		for _, d := range dealerInfos {
			sumPercent += d.percent
		}
		avgPercent = sumPercent / totalDealers
	}

	return map[string]interface{}{
		"segments": map[string]interface{}{
			"a": segments["a"],
			"b": segments["b"],
			"c": segments["c"],
			"d": segments["d"],
		},
		"metrics": map[string]interface{}{
			"total_dealers":       totalDealers,
			"active_dealers":      activeDealers,
			"avg_plan_percent":    avgPercent,
			"segment_counts": map[string]int{
				"a": segmentCounts["a"],
				"b": segmentCounts["b"],
				"c": segmentCounts["c"],
				"d": segmentCounts["d"],
			},
			"segment_revenue_share": segmentRevenue,
		},
	}, nil
}

// GetDealersMigration - миграция дилеров
func (s *KPIService) GetDealersMigration(ctx context.Context, userID string, period string, dateStr string, startDateStr string, endDateStr string) (map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	// Найти менеджеров → дилеров
	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	if len(dealers) == 0 {
		return map[string]interface{}{"migrations": []map[string]interface{}{}}, nil
	}

	curStart, curEnd, prevStart, prevEnd := parsePeriodWithPrev(period, dateStr, startDateStr, endDateStr)

	getSegment := func(dealerID uuid.UUID, start, end time.Time) string {
		var plan, fact float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealerID, start, end).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealerID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, start, end).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
		}
		var leadFact float64
		s.DB.Model(&models.Lead{}).
			Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", dealerID, []string{"sale", "paid"}, start, end).
			Select("COALESCE(SUM(budget), 0)").Scan(&leadFact)
		if leadFact > fact {
			fact = leadFact
		}
		pct := 0
		if plan > 0 {
			pct = int((fact / plan) * 100)
		}
		switch {
		case pct >= 95:
			return "A"
		case pct >= 85:
			return "B"
		case pct >= 50:
			return "C"
		default:
			return "D"
		}
	}

	var migrations []map[string]interface{}
	for _, dealer := range dealers {
		curSeg := getSegment(dealer.ID, curStart, curEnd)
		prevSeg := getSegment(dealer.ID, prevStart, prevEnd)
		if curSeg != prevSeg {
			migrations = append(migrations, map[string]interface{}{
				"dealer_id":    dealer.ID.String(),
				"dealer_name":  dealer.FirstName + " " + dealer.LastName,
				"from_segment": prevSeg,
				"to_segment":   curSeg,
			})
		}
	}

	return map[string]interface{}{"migrations": migrations}, nil
}

// GetSystemIssues - системные проблемы
func (s *KPIService) GetSystemIssues(ctx context.Context, userID string, status string) ([]map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	now := time.Now()
	startDate := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	endDate := time.Date(now.Year(), now.Month()+1, 0, 23, 59, 59, 0, now.Location())

	var issues []map[string]interface{}
	for _, dealer := range dealers {
		var plan, fact float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
		}

		pct := 0
		if plan > 0 {
			pct = int((fact / plan) * 100)
		}

		// Фильтр по статусу
		if status != "" && status == "resolved" && pct >= 50 {
			continue
		}
		if status != "" && status == "open" && pct >= 50 {
			continue
		}

		if pct < 50 {
			issues = append(issues, map[string]interface{}{
				"id":                dealer.ID.String(),
				"title":             "Низкое выполнение плана",
				"description":       fmt.Sprintf("Дилер %s выполнил план на %d%%", dealer.FirstName+" "+dealer.LastName, pct),
				"status":            "open",
				"severity":          "critical",
				"dealer_id":         dealer.ID.String(),
				"dealer_name":       dealer.FirstName + " " + dealer.LastName,
				"affected_dealers":  1,
				"lost_revenue":      plan - fact,
				"created_at":        now.Format(time.RFC3339),
			})
		}
	}

	return issues, nil
}

// GetDealersGeography - география дилеров
func (s *KPIService) GetDealersGeography(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	now := time.Now()
	startDate := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
	endDate := time.Date(now.Year(), 12, 31, 23, 59, 59, 0, now.Location())

	type regionInfo struct {
		city         string
		dealerIDs    map[string]bool
		salonCount   int
		totalRevenue float64
	}

	regions := map[string]*regionInfo{}

	// Собираем салоны по дилерам
	for _, dealer := range dealers {
		var salons []models.Salon
		s.DB.Where("dealer_id = ?", dealer.ID).Find(&salons)
		for _, salon := range salons {
			city := salon.Address
			if city == "" {
				city = "Не указан"
			}
			if _, ok := regions[city]; !ok {
				regions[city] = &regionInfo{
					city:       city,
					dealerIDs:  map[string]bool{},
					salonCount: 0,
				}
			}
			regions[city].dealerIDs[dealer.ID.String()] = true
			regions[city].salonCount++

			var rev float64
			s.DB.Model(&models.Order{}).
				Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", salon.ID, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&rev)
			regions[city].totalRevenue += rev
		}
	}

	var result []map[string]interface{}
	for _, r := range regions {
		result = append(result, map[string]interface{}{
			"city":          r.city,
			"dealers_count": len(r.dealerIDs),
			"salons_count":  r.salonCount,
			"total_revenue": r.totalRevenue,
		})
	}

	return result, nil
}

// GetMarketingROI - ROI маркетинга
func (s *KPIService) GetMarketingROI(ctx context.Context, userID string, period string, dateStr string, startDateStr string, endDateStr string) (map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	startDate, endDate := parsePeriodStartEnd(period, dateStr, startDateStr, endDateStr)

	// Считаем среднюю выручку на дилера как метрику эффективности
	// В реальном сценарии здесь были бы данные о маркетинговых бюджетах
	var totalFact float64
	dealerCount := len(dealers)
	for _, dealer := range dealers {
		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			var fact float64
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
			totalFact += fact
		}
	}

	avgRevenue := 0.0
	if dealerCount > 0 {
		avgRevenue = totalFact / float64(dealerCount)
	}

	// ROI: условно считаем как отношение выручки к "расходам" (30% от выручки как маркетинговый бюджет)
	marketingBudget := totalFact * 0.3
	roi := 0.0
	if marketingBudget > 0 {
		roi = (totalFact - marketingBudget) / marketingBudget
	}

	return map[string]interface{}{
		"roi":               roi,
		"marketing_spent":   marketingBudget,
		"revenue_attributed": totalFact,
		"period":            period,
		"avg_dealer_revenue": avgRevenue,
	}, nil
}

// GetAlertSettings - настройки алертов
func (s *KPIService) GetAlertSettings(ctx context.Context, userID string) (map[string]interface{}, error) {
	return map[string]interface{}{
		"thresholds": map[string]interface{}{
			"network_forecast_critical": 90,
			"churn_rate_critical":      5,
			"manager_kpi_critical":     70,
		},
		"channels": []string{"in_app", "email"},
	}, nil
}

// UpdateAlertSettings - обновить настройки алертов
func (s *KPIService) UpdateAlertSettings(ctx context.Context, userID string, settings map[string]interface{}) error {
	return nil
}

// GetReportData - данные для отчёта
func (s *KPIService) GetReportData(ctx context.Context, userID string, period, date string, startDateStr, endDateStr string) (map[string]interface{}, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %w", err)
	}

	var managers []models.User
	if err := s.DB.Where("role = ? AND managed_by = ?", models.RoleFranchisorManager, uid).Find(&managers).Error; err != nil {
		return nil, err
	}
	var managerIDs []uuid.UUID
	for _, m := range managers {
		managerIDs = append(managerIDs, m.ID)
	}
	var dealers []models.User
	if len(managerIDs) > 0 {
		if err := s.DB.Where("role = ? AND managed_by IN ?", models.RoleDealer, managerIDs).Find(&dealers).Error; err != nil {
			return nil, err
		}
	}

	now := time.Now()
	var startDate, endDate time.Time
	year := now.Year()

	// Парсим period и date
	switch period {
	case "month":
		startDate = time.Date(year, now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = time.Date(year, now.Month()+1, 0, 23, 59, 59, 0, now.Location())
		if len(date) >= 7 {
			if t, err := time.Parse("2006-01", date[:7]); err == nil {
				startDate = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, now.Location())
				endDate = time.Date(t.Year(), t.Month()+1, 0, 23, 59, 59, 0, now.Location())
			}
		}
	case "year":
		parsedYear := year
		if len(date) >= 4 {
			if y, err := strconv.Atoi(date[:4]); err == nil {
				parsedYear = y
			}
		}
		startDate = time.Date(parsedYear, 1, 1, 0, 0, 0, 0, now.Location())
		endDate = time.Date(parsedYear, 12, 31, 23, 59, 59, 0, now.Location())
	case "custom":
		if startDateStr != "" && endDateStr != "" {
			if sd, err := time.Parse("2006-01-02", startDateStr); err == nil {
				startDate = sd
			}
			if ed, err := time.Parse("2006-01-02", endDateStr); err == nil {
				endDate = ed
			}
		}
	default: // quarter
		if len(date) >= 7 {
			q := date[len(date)-2:]
			qNum := 1
			fmt.Sscanf(q, "Q%d", &qNum)
			fmt.Sscanf(date, "%d", &year)
			qStart := time.Month((qNum-1)*3 + 1)
			startDate = time.Date(year, qStart, 1, 0, 0, 0, 0, now.Location())
			endDate = time.Date(year, qStart+3, 0, 23, 59, 59, 0, now.Location())
		} else {
			m := int(now.Month())
			qs := time.Month(((m-1)/3)*3 + 1)
			startDate = time.Date(year, qs, 1, 0, 0, 0, 0, now.Location())
			endDate = time.Date(year, qs+3, 0, 23, 59, 59, 0, now.Location())
		}
	}

	// Executive summary
	var totalPlan, totalFact float64
	for _, dealer := range dealers {
		var plan float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		totalPlan += plan

		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			var fact float64
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
			totalFact += fact
		}
	}

	forecastPercent := 0.0
	if totalPlan > 0 {
		forecastPercent = (totalFact / totalPlan) * 100
	}

	trend := "stable"
	if forecastPercent >= 95 {
		trend = "up"
	} else if forecastPercent < 80 {
		trend = "down"
	}

	executiveSummary := map[string]interface{}{
		"plan_amount":      totalPlan,
		"fact_amount":      totalFact,
		"forecast_amount":  totalFact,
		"forecast_percent": int(forecastPercent),
		"conclusion":       fmt.Sprintf("Выполнение плана: %d%%. Всего дилеров: %d.", int(forecastPercent), len(dealers)),
		"trend":            trend,
	}

	// Plan-fact dynamics (last 6 months)
	type monthData struct {
		month string
		plan  float64
		fact  float64
	}
	var dynamics []monthData
	for i := 5; i >= 0; i-- {
		mStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -i, 0)
		mEnd := time.Date(mStart.Year(), mStart.Month()+1, 0, 23, 59, 59, 0, mStart.Location())
		monthLabel := mStart.Format("2006-01")

		var mPlan, mFact float64
		for _, dealer := range dealers {
			var plan float64
			s.DB.Model(&models.DailyGoal{}).
				Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, mStart, mEnd).
				Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
			mPlan += plan

			var sIDs []uuid.UUID
			s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &sIDs)
			if len(sIDs) > 0 {
				var fact float64
				s.DB.Model(&models.Order{}).
					Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", sIDs, []string{"paid", "contract"}, mStart, mEnd).
					Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
				mFact += fact
			}
		}
		dynamics = append(dynamics, monthData{month: monthLabel, plan: mPlan, fact: mFact})
	}

	var dynamicsResult []map[string]interface{}
	for _, d := range dynamics {
		dynamicsResult = append(dynamicsResult, map[string]interface{}{
			"month": d.month,
			"plan":  d.plan,
			"fact":  d.fact,
		})
	}

	// Territory rating (per manager)
	var territoryRating []map[string]interface{}
	for _, m := range managers {
		var mDealers []models.User
		s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, m.ID).Find(&mDealers)

		var mPlan, mFact float64
		dealerCount := len(mDealers)
		for _, d := range mDealers {
			var plan float64
			s.DB.Model(&models.DailyGoal{}).
				Where("user_id = ? AND target_date BETWEEN ? AND ?", d.ID, startDate, endDate).
				Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
			mPlan += plan
			var sIDs []uuid.UUID
			s.DB.Model(&models.Salon{}).Where("dealer_id = ?", d.ID).Pluck("id", &sIDs)
			if len(sIDs) > 0 {
				var fact float64
				s.DB.Model(&models.Order{}).
					Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", sIDs, []string{"paid", "contract"}, startDate, endDate).
					Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
				mFact += fact
			}
		}

		pct := 0
		if mPlan > 0 {
			pct = int((mFact / mPlan) * 100)
		}
		forecast := pct

		// Growth: compare with previous period
		var prevCount int64
		s.DB.Model(&models.User{}).Where("role = ? AND managed_by = ? AND created_at < ?", models.RoleDealer, m.ID, startDate).Count(&prevCount)
		growth := dealerCount - int(prevCount)

		territoryRating = append(territoryRating, map[string]interface{}{
			"manager":       m.FirstName + " " + m.LastName,
			"plan_percent":  pct,
			"dealers_count": dealerCount,
			"growth":        growth,
			"forecast":      forecast,
		})
	}

	// Network growth
	prevPeriodStart := startDate.AddDate(0, 0, 0)
	switch period {
	case "month":
		prevPeriodStart = startDate.AddDate(0, -1, 0)
	case "quarter":
		prevPeriodStart = startDate.AddDate(0, -3, 0)
	default:
		prevPeriodStart = startDate.AddDate(-1, 0, 0)
	}
	var dealersBefore int64
	s.DB.Model(&models.User{}).Where("role = ? AND managed_by IN ? AND created_at < ?", models.RoleDealer, managerIDs, startDate).Count(&dealersBefore)
	var dealersAfter int64
	s.DB.Model(&models.User{}).Where("role = ? AND managed_by IN ? AND created_at <= ?", models.RoleDealer, managerIDs, endDate).Count(&dealersAfter)

	newDealers := int(dealersAfter - dealersBefore)
	churnedDealers := 0
	if newDealers < 0 {
		churnedDealers = -newDealers
		newDealers = 0
	}

	avgRevenue := 0.0
	if len(dealers) > 0 {
		avgRevenue = totalFact / float64(len(dealers))
	}

	prevTotalFact := 0.0
	for _, dealer := range dealers {
		var sIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &sIDs)
		if len(sIDs) > 0 {
			var fact float64
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", sIDs, []string{"paid", "contract"}, prevPeriodStart, startDate.Add(-time.Nanosecond)).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
			prevTotalFact += fact
		}
	}

	revDynamics := 0.0
	if prevTotalFact > 0 {
		revDynamics = ((totalFact - prevTotalFact) / prevTotalFact) * 100
	}

	networkGrowth := map[string]interface{}{
		"dealers_start":        int(dealersBefore),
		"dealers_end":          int(dealersAfter),
		"new_dealers":          newDealers,
		"churned_dealers":      churnedDealers,
		"avg_revenue_per_dealer": avgRevenue,
		"revenue_dynamics":     int(revDynamics),
	}

	// Sales structure — нет категорий товаров, группируем по салонам/дилерам
	salesStructure := []map[string]interface{}{
		{"category": "Заказы (paid)", "share": 100, "dynamics": 0},
	}

	// Risks — проблемные дилеры
	var risks []map[string]interface{}
	for _, dealer := range dealers {
		var plan, fact float64
		s.DB.Model(&models.DailyGoal{}).
			Where("user_id = ? AND target_date BETWEEN ? AND ?", dealer.ID, startDate, endDate).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&plan)
		var salonIDs []uuid.UUID
		s.DB.Model(&models.Salon{}).Where("dealer_id = ?", dealer.ID).Pluck("id", &salonIDs)
		if len(salonIDs) > 0 {
			s.DB.Model(&models.Order{}).
				Where("salon_id IN ? AND status IN ? AND created_at BETWEEN ? AND ?", salonIDs, []string{"paid", "contract"}, startDate, endDate).
				Select("COALESCE(SUM(total_price), 0)").Scan(&fact)
		}
		pct := 0
		if plan > 0 {
			pct = int((fact / plan) * 100)
		}
		if pct < 50 && pct > 0 {
			risks = append(risks, map[string]interface{}{
				"issue":            fmt.Sprintf("Низкое выполнение плана: %s (%d%%)", dealer.FirstName+" "+dealer.LastName, pct),
				"affected_dealers": 1,
				"impact":           plan - fact,
			})
		}
	}

	return map[string]interface{}{
		"executive_summary":  executiveSummary,
		"plan_fact_dynamics": dynamicsResult,
		"network_growth":     networkGrowth,
		"sales_structure":    salesStructure,
		"territory_rating":   territoryRating,
		"risks":              risks,
	}, nil
}

// GenerateManagerPDF - сгенерировать PDF отчёт по менеджеру
func (s *KPIService) GenerateManagerPDF(ctx context.Context, userID string, managerID string) ([]byte, error) {
	mgrUUID, err := uuid.Parse(managerID)
	if err != nil {
		return nil, err
	}

	var manager models.User
	if err := s.DB.First(&manager, "id = ?", mgrUUID).Error; err != nil {
		return nil, err
	}

	var dealersCount int64
	s.DB.Model(&models.User{}).Where("role = ? AND managed_by = ?", models.RoleDealer, mgrUUID).Count(&dealersCount)

	var dealers []models.User
	s.DB.Where("role = ? AND managed_by = ?", models.RoleDealer, mgrUUID).Find(&dealers)

	cutoff := time.Now().AddDate(0, -6, 0)
	var goals []models.Goal
	s.DB.Where("assignee_id = ? AND target_date >= ? AND target_date <= ?", mgrUUID, cutoff.Format("2006-01-02"), time.Now().Format("2006-01-02")).
		Order("target_date ASC").Find(&goals)

	// dealer goals for current month
	thisMonth := time.Now().Format("2006-01-02")
	type DealerGoal struct {
		AssigneeID string
		SalesPlan  float64
		SalesFact  float64
	}
	var dealerGoals []DealerGoal
	s.DB.Table("goals").Select("assignee_id, sales_plan, sales_fact").
		Where("assignee_id IN (SELECT id FROM users WHERE managed_by = ?) AND target_date = ? AND role = 'dealer'", mgrUUID, thisMonth).
		Scan(&dealerGoals)
	dealerGoalMap := map[string]DealerGoal{}
	for _, dg := range dealerGoals {
		dealerGoalMap[dg.AssigneeID] = dg
	}

	// colours
	blueR, blueG, blueB := 26, 54, 93
	greenR, greenG, greenB := 82, 196, 26
	yellowR, yellowG, yellowB := 250, 173, 20
	redR, redG, redB := 255, 77, 79
	grayR, grayG, grayB := 245, 245, 245
	whiteR, whiteG, whiteB := 255, 255, 255

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 20)
	pdf.AliasNbPages("{nb}")
	pdf.AddPage()

	// register UTF-8 fonts
	for _, f := range []struct{ family, style, file string }{
		{"DejaVu", "", "fonts/DejaVuSans.ttf"},
		{"DejaVu", "B", "fonts/DejaVuSans-Bold.ttf"},
		{"DejaVu", "I", "fonts/DejaVuSans-Oblique.ttf"},
		{"DejaVu", "BI", "fonts/DejaVuSans-BoldOblique.ttf"},
	} {
		data, rErr := reportFonts.ReadFile(f.file)
		if rErr != nil {
			return nil, fmt.Errorf("read font %s: %w", f.file, rErr)
		}
		pdf.AddUTF8FontFromBytes(f.family, f.style, data)
	}

	// colours for kpi status
	kpiColor := func(pct float64) (int, int, int) {
		if pct >= 80 {
			return greenR, greenG, greenB
		} else if pct >= 50 {
			return yellowR, yellowG, yellowB
		}
		return redR, redG, redB
	}

	// number format with spaces
	nf := func(v float64) string {
		s := fmt.Sprintf("%.0f", v)
		out := ""
		for i, c := range s {
			if i > 0 && (len(s)-i)%3 == 0 {
				out += " "
			}
			out += string(c)
		}
		return out
	}

	// === HEADER BAR ===
	pdf.SetFillColor(blueR, blueG, blueB)
	pdf.Rect(0, 0, 210, 32, "F")
	pdf.SetTextColor(whiteR, whiteG, whiteB)
	pdf.SetFont("DejaVu", "B", 18)
	pdf.SetXY(20, 8)
	pdf.Cell(0, 12, "Отчёт по менеджеру")
	pdf.SetFont("DejaVu", "", 8)
	pdf.SetXY(150, 11)
	pdf.Cell(50, 8, "Сгенерировано: "+time.Now().Format("02.01.2006 15:04"))
	pdf.SetTextColor(0, 0, 0)

	// === MANAGER INFO ===
	yInfo := 44.0
	pdf.SetFont("DejaVu", "B", 14)
	pdf.SetXY(20, yInfo)
	pdf.Cell(0, 8, manager.FirstName+" "+manager.LastName)
	yInfo += 12
	pdf.SetFont("DejaVu", "", 10)
	pdf.SetTextColor(80, 80, 80)
	pdf.SetXY(20, yInfo)
	phone := manager.Phone
	if phone == "" {
		phone = "—"
	}
	pdf.Cell(80, 6, "Email: "+manager.Email)
	pdf.Cell(0, 6, "Телефон: "+phone)
	yInfo += 12
	pdf.SetXY(20, yInfo)
	periodStr := fmt.Sprintf("Дилеров: %d", dealersCount)
	if len(goals) > 0 {
		periodStr += fmt.Sprintf("  |  Период: %s — %s",
			goals[0].TargetDate.Format("Jan 2006"), goals[len(goals)-1].TargetDate.Format("Jan 2006"))
	} else {
		periodStr += "  |  Нет данных за 6 месяцев"
	}
	pdf.Cell(0, 6, periodStr)

	// separator line
	yInfo += 10
	pdf.SetDrawColor(200, 200, 200)
	pdf.Line(20, yInfo, 190, yInfo)
	pdf.SetTextColor(0, 0, 0)

	// === KPI CARDS ===
	yCards := yInfo + 8
	cardW := 37.0
	cardH := 24.0
	gap := 6.0
	startX := 20.0

	avgPct := 0.0
	if len(goals) > 0 {
		totalPct := 0.0
		for _, g := range goals {
			if g.SalesPlan > 0 {
				totalPct += (g.SalesFact / g.SalesPlan) * 100
			}
		}
		avgPct = totalPct / float64(len(goals))
	}

	currentPct := 0.0
	if len(goals) > 0 {
		last := goals[len(goals)-1]
		if last.SalesPlan > 0 {
			currentPct = (last.SalesFact / last.SalesPlan) * 100
		}
	}

	cards := []struct {
		title string
		value string
		pct   float64
	}{
		{"KPI (средний)", fmt.Sprintf("%.0f%%", avgPct), avgPct},
		{"Текущий месяц", fmt.Sprintf("%.0f%%", currentPct), currentPct},
		{"Дилеры", strconv.FormatInt(dealersCount, 10), 100},
		{"Всего дилеров", strconv.FormatInt(dealersCount, 10), 100},
	}

	for i, c := range cards {
		x := startX + float64(i)*(cardW+gap)
		r, g, b := kpiColor(c.pct)
		// card fill
		pdf.SetFillColor(whiteR, whiteG, whiteB)
		pdf.SetDrawColor(r, g, b)
		pdf.Rect(x, yCards, cardW, cardH, "D")
		// top accent line
		pdf.SetFillColor(r, g, b)
		pdf.Rect(x, yCards, cardW, 3, "F")
		// title
		pdf.SetFont("DejaVu", "", 8)
		pdf.SetTextColor(120, 120, 120)
		pdf.SetXY(x+2, yCards+5)
		pdf.Cell(cardW-4, 5, c.title)
		// value
		pdf.SetFont("DejaVu", "B", 16)
		pdf.SetTextColor(r, g, b)
		pdf.SetXY(x+2, yCards+12)
		pdf.Cell(cardW-4, 10, c.value)
	}
	pdf.SetTextColor(0, 0, 0)

	// === DYNAMICS TABLE ===
	yTable := yCards + cardH + 12
	pdf.SetFont("DejaVu", "B", 12)
	pdf.SetXY(20, yTable)
	pdf.SetTextColor(blueR, blueG, blueB)
	pdf.Cell(0, 8, "Динамика KPI (6 месяцев)")
	pdf.SetTextColor(0, 0, 0)
	yTable += 12

	colW := []float64{28, 42, 42, 34, 24}
	headers := []string{"Месяц", "План, ₽", "Факт, ₽", "Выполнение", "KPI"}
	pdf.SetFont("DejaVu", "B", 8)
	pdf.SetFillColor(blueR, blueG, blueB)
	pdf.SetTextColor(whiteR, whiteG, whiteB)
	x0 := 20.0
	for i, h := range headers {
		pdf.SetXY(x0, yTable)
		pdf.CellFormat(colW[i], 7, h, "1", 0, "C", true, 0, "")
		x0 += colW[i]
	}
	pdf.Ln(-1)
	yTable += 7

	pdf.SetFont("DejaVu", "", 8)
	for idx, g := range goals {
		pct := 0.0
		if g.SalesPlan > 0 {
			pct = (g.SalesFact / g.SalesPlan) * 100
		}
		pR, pG, pB := kpiColor(pct)

		if idx%2 == 0 {
			pdf.SetFillColor(grayR, grayG, grayB)
		} else {
			pdf.SetFillColor(whiteR, whiteG, whiteB)
		}

		x0 = 20.0
		pdf.SetTextColor(0, 0, 0)
		pdf.SetXY(x0, yTable)
		pdf.CellFormat(colW[0], 6, g.TargetDate.Format("01.2006"), "1", 0, "C", true, 0, "")
		x0 += colW[0]

		pdf.SetXY(x0, yTable)
		pdf.CellFormat(colW[1], 6, nf(g.SalesPlan), "1", 0, "R", true, 0, "")
		x0 += colW[1]

		pdf.SetXY(x0, yTable)
		pdf.CellFormat(colW[2], 6, nf(g.SalesFact), "1", 0, "R", true, 0, "")
		x0 += colW[2]

		pctStr := fmt.Sprintf("%.0f%%", pct)
		pdf.SetXY(x0, yTable)
		pdf.SetTextColor(pR, pG, pB)
		pdf.CellFormat(colW[3], 6, pctStr, "1", 0, "C", true, 0, "")
		x0 += colW[3]

		pdf.SetTextColor(pR, pG, pB)
		pdf.SetXY(x0, yTable)
		pdf.CellFormat(colW[4], 6, pctStr, "1", 0, "C", true, 0, "")
		x0 += colW[4]
		yTable += 6
	}
	pdf.SetTextColor(0, 0, 0)

	// === DEALERS TABLE ===
	yTable += 8
	pdf.SetFont("DejaVu", "B", 12)
	pdf.SetXY(20, yTable)
	pdf.SetTextColor(blueR, blueG, blueB)
	pdf.Cell(0, 8, fmt.Sprintf("Дилеры менеджера (%d)", dealersCount))
	pdf.SetTextColor(0, 0, 0)
	yTable += 12

	dColW := []float64{70, 50, 30, 30}
	dHeaders := []string{"Дилер", "План, ₽", "Выполнение", "Статус"}
	pdf.SetFont("DejaVu", "B", 8)
	pdf.SetFillColor(blueR, blueG, blueB)
	pdf.SetTextColor(whiteR, whiteG, whiteB)
	x0 = 20.0
	for i, h := range dHeaders {
		pdf.SetXY(x0, yTable)
		pdf.CellFormat(dColW[i], 7, h, "1", 0, "C", true, 0, "")
		x0 += dColW[i]
	}
	yTable += 7

	if len(dealers) == 0 {
		pdf.SetFont("DejaVu", "I", 9)
		pdf.SetTextColor(150, 150, 150)
		pdf.SetXY(20, yTable)
		pdf.Cell(0, 7, "Нет дилеров")
		yTable += 9
	} else {
		pdf.SetFont("DejaVu", "", 8)
		for idx, d := range dealers {
			if idx%2 == 0 {
				pdf.SetFillColor(grayR, grayG, grayB)
			} else {
				pdf.SetFillColor(whiteR, whiteG, whiteB)
			}

			name := d.FirstName + " " + d.LastName
			dg, hasGoal := dealerGoalMap[d.ID.String()]
			pct := 0.0
			if hasGoal && dg.SalesPlan > 0 {
				pct = (dg.SalesFact / dg.SalesPlan) * 100
			}
			dStatus := "yellow"
			if pct >= 80 {
				dStatus = "green"
			} else if pct < 50 {
				dStatus = "red"
			}

			planStr := "—"
			if hasGoal {
				planStr = nf(dg.SalesPlan)
			}
			pctStr := "—"
			if hasGoal {
				pctStr = fmt.Sprintf("%.0f%%", pct)
			}

			statusLabels := map[string]string{
				"green":  "Хорошо",
				"yellow": "Средне",
				"red":    "Плохо",
			}
			statusColors := map[string][3]int{
				"green":  {greenR, greenG, greenB},
				"yellow": {yellowR, yellowG, yellowB},
				"red":    {redR, redG, redB},
			}

			x0 = 20.0
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x0, yTable)
			pdf.CellFormat(dColW[0], 6, name, "1", 0, "", true, 0, "")
			x0 += dColW[0]

			pdf.SetXY(x0, yTable)
			pdf.CellFormat(dColW[1], 6, planStr, "1", 0, "R", true, 0, "")
			x0 += dColW[1]

			pdf.SetXY(x0, yTable)
			sc := statusColors[dStatus]
			pdf.SetTextColor(sc[0], sc[1], sc[2])
			pdf.CellFormat(dColW[2], 6, pctStr, "1", 0, "C", true, 0, "")
			x0 += dColW[2]

			pdf.SetXY(x0, yTable)
			pdf.SetTextColor(sc[0], sc[1], sc[2])
			pdf.CellFormat(dColW[3], 6, statusLabels[dStatus], "1", 0, "C", true, 0, "")
			x0 += dColW[3]

			yTable += 6
		}
	}
	pdf.SetTextColor(0, 0, 0)

	// === FOOTER ===
	pdf.SetY(-20)
	pdf.SetDrawColor(200, 200, 200)
	pdf.Line(20, pdf.GetY(), 190, pdf.GetY())
	pdf.SetY(-15)
	pdf.SetFont("DejaVu", "", 8)
	pdf.SetTextColor(150, 150, 150)
	pdf.CellFormat(0, 5, "Сгенерировано: "+time.Now().Format("02.01.2006 15:04"), "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 5, fmt.Sprintf("Стр. %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// GeneratePDF - сгенерировать PDF отчёта для B2B
func (s *KPIService) GeneratePDF(ctx context.Context, userID string, period, date string, blocks []string, comment string, startDateStr, endDateStr string) ([]byte, error) {
	reportData, err := s.GetReportData(ctx, userID, period, date, startDateStr, endDateStr)
	if err != nil {
		return nil, err
	}

	es, _ := reportData["executive_summary"].(map[string]interface{})
	ng, _ := reportData["network_growth"].(map[string]interface{})
	tr, _ := reportData["territory_rating"].([]map[string]interface{})
	risks, _ := reportData["risks"].([]map[string]interface{})
	dynamics, _ := reportData["plan_fact_dynamics"].([]map[string]interface{})

	planAmt := getFloat(es, "plan_amount")
	factAmt := getFloat(es, "fact_amount")
	forcastPct := getInt(es, "forecast_percent")
	trend, _ := es["trend"].(string)
	conclusion, _ := es["conclusion"].(string)

	dealersStart := getInt(ng, "dealers_start")
	dealersEnd := getInt(ng, "dealers_end")
	newDealers := getInt(ng, "new_dealers")
	churned := getInt(ng, "churned_dealers")
	avgRev := getFloat(ng, "avg_revenue_per_dealer")
	revDyn := getInt(ng, "revenue_dynamics")

	blueR, blueG, blueB := 26, 54, 93
	greenR, greenG, greenB := 82, 196, 26
	yellowR, yellowG, yellowB := 250, 173, 20
	redR, redG, redB := 255, 77, 79
	grayR, grayG, grayB := 245, 245, 245
	whiteR, whiteG, whiteB := 255, 255, 255

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetAutoPageBreak(true, 20)
	pdf.AliasNbPages("{nb}")
	pdf.AddPage()

	for _, f := range []struct{ family, style, file string }{
		{"DejaVu", "", "fonts/DejaVuSans.ttf"},
		{"DejaVu", "B", "fonts/DejaVuSans-Bold.ttf"},
		{"DejaVu", "I", "fonts/DejaVuSans-Oblique.ttf"},
		{"DejaVu", "BI", "fonts/DejaVuSans-BoldOblique.ttf"},
	} {
		data, rErr := reportFonts.ReadFile(f.file)
		if rErr != nil {
			return nil, fmt.Errorf("read font %s: %w", f.file, rErr)
		}
		pdf.AddUTF8FontFromBytes(f.family, f.style, data)
	}

	kpiColor := func(pct float64) (int, int, int) {
		if pct >= 80 {
			return greenR, greenG, greenB
		} else if pct >= 50 {
			return yellowR, yellowG, yellowB
		}
		return redR, redG, redB
	}

	nf := func(v float64) string {
		s := fmt.Sprintf("%.0f", v)
		out := ""
		for i, c := range s {
			if i > 0 && (len(s)-i)%3 == 0 {
				out += " "
			}
			out += string(c)
		}
		return out
	}

	// === HEADER BAR ===
	pdf.SetFillColor(blueR, blueG, blueB)
	pdf.Rect(0, 0, 210, 32, "F")
	pdf.SetTextColor(whiteR, whiteG, whiteB)
	pdf.SetFont("DejaVu", "B", 18)
	pdf.SetXY(20, 8)
	pdf.Cell(0, 12, "Отчёт для B2B")
	pdf.SetFont("DejaVu", "", 8)
	pdf.SetXY(150, 11)
	pdf.Cell(50, 8, fmt.Sprintf("Период: %s", date))
	pdf.SetTextColor(0, 0, 0)

	// === Executive Summary ===
	y := 44.0
	pdf.SetFont("DejaVu", "B", 14)
	pdf.SetXY(20, y)
	pdf.SetTextColor(blueR, blueG, blueB)
	pdf.Cell(0, 8, "Ключевые показатели")
	pdf.SetTextColor(0, 0, 0)
	y += 12

	cardW := 42.0
	cardH := 24.0
	gap := 6.0

	cards := []struct {
		title string
		value string
		pct   float64
	}{
		{"План", nf(planAmt) + " ₽", 100},
		{"Факт", nf(factAmt) + " ₽", 100},
		{"Прогноз", fmt.Sprintf("%d%%", forcastPct), float64(forcastPct)},
		{"Тренд", trend, float64(forcastPct)},
	}

	for i, c := range cards {
		x := 20.0 + float64(i)*(cardW+gap)
		r, g, b := kpiColor(c.pct)
		pdf.SetFillColor(whiteR, whiteG, whiteB)
		pdf.SetDrawColor(r, g, b)
		pdf.Rect(x, y, cardW, cardH, "D")
		pdf.SetFillColor(r, g, b)
		pdf.Rect(x, y, cardW, 3, "F")
		pdf.SetFont("DejaVu", "", 8)
		pdf.SetTextColor(120, 120, 120)
		pdf.SetXY(x+2, y+5)
		pdf.Cell(cardW-4, 5, c.title)
		pdf.SetFont("DejaVu", "B", 12)
		pdf.SetTextColor(r, g, b)
		pdf.SetXY(x+2, y+12)
		pdf.Cell(cardW-4, 10, c.value)
	}
	pdf.SetTextColor(0, 0, 0)
	y = y + cardH + 4

	pdf.SetFont("DejaVu", "", 10)
	pdf.SetXY(20, y)
	pdf.MultiCell(170, 6, conclusion, "", "L", false)
	y = pdf.GetY() + 4

	// === Network Growth ===
	if contains(blocks, "growth") {
		pdf.SetDrawColor(200, 200, 200)
		pdf.Line(20, y, 190, y)
		y += 6
		pdf.SetFont("DejaVu", "B", 14)
		pdf.SetXY(20, y)
		pdf.SetTextColor(blueR, blueG, blueB)
		pdf.Cell(0, 8, "Анализ роста сети")
		pdf.SetTextColor(0, 0, 0)
		y += 12

		growCards := []struct {
			title string
			value string
		}{
			{"Дилеров на начало", fmt.Sprintf("%d", dealersStart)},
			{"Новых", fmt.Sprintf("%d", newDealers)},
			{"Выбыло", fmt.Sprintf("%d", churned)},
			{"Дилеров на конец", fmt.Sprintf("%d", dealersEnd)},
			{"Средняя выручка", nf(avgRev) + " ₽"},
			{"Динамика выручки", fmt.Sprintf("%+d%%", revDyn)},
		}

		gCardW := 28.0
		for i, gc := range growCards {
			x := 20.0 + float64(i)*(gCardW+2)
			pdf.SetFont("DejaVu", "", 7)
			pdf.SetTextColor(120, 120, 120)
			pdf.SetXY(x, y)
			pdf.Cell(gCardW, 5, gc.title)
			pdf.SetFont("DejaVu", "B", 10)
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x, y+5)
			pdf.Cell(gCardW, 7, gc.value)
		}
		y += 18
	}

	// === Territory Rating ===
	if contains(blocks, "territories") && len(tr) > 0 {
		pdf.SetDrawColor(200, 200, 200)
		pdf.Line(20, y, 190, y)
		y += 6
		pdf.SetFont("DejaVu", "B", 14)
		pdf.SetXY(20, y)
		pdf.SetTextColor(blueR, blueG, blueB)
		pdf.Cell(0, 8, "Рейтинг территорий")
		pdf.SetTextColor(0, 0, 0)
		y += 12

		tColW := []float64{50, 30, 25, 25, 40}
		tHeaders := []string{"Менеджер", "% плана", "Дилеры", "Прирост", "Прогноз"}
		pdf.SetFont("DejaVu", "B", 8)
		pdf.SetFillColor(blueR, blueG, blueB)
		pdf.SetTextColor(whiteR, whiteG, whiteB)
		x0 := 20.0
		for i, h := range tHeaders {
			pdf.SetXY(x0, y)
			pdf.CellFormat(tColW[i], 7, h, "1", 0, "C", true, 0, "")
			x0 += tColW[i]
		}
		y = pdf.GetY() + 7

		pdf.SetFont("DejaVu", "", 8)
		for idx, t := range tr {
			if idx%2 == 0 {
				pdf.SetFillColor(grayR, grayG, grayB)
			} else {
				pdf.SetFillColor(whiteR, whiteG, whiteB)
			}
			mgr, _ := t["manager"].(string)
			pct := getInt(t, "plan_percent")
			dc := getInt(t, "dealers_count")
			gr := getInt(t, "growth")
			fc := getInt(t, "forecast")

			r, g, b := kpiColor(float64(pct))
			x0 = 20.0
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x0, y)
			pdf.CellFormat(tColW[0], 6, mgr, "1", 0, "L", true, 0, "")
			x0 += tColW[0]
			pdf.SetTextColor(r, g, b)
			pdf.SetXY(x0, y)
			pdf.CellFormat(tColW[1], 6, fmt.Sprintf("%d%%", pct), "1", 0, "C", true, 0, "")
			x0 += tColW[1]
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x0, y)
			pdf.CellFormat(tColW[2], 6, fmt.Sprintf("%d", dc), "1", 0, "C", true, 0, "")
			x0 += tColW[2]
			pdf.SetXY(x0, y)
			pdf.CellFormat(tColW[3], 6, fmt.Sprintf("%+d", gr), "1", 0, "C", true, 0, "")
			x0 += tColW[3]
			pdf.SetXY(x0, y)
			pdf.SetTextColor(r, g, b)
			pdf.CellFormat(tColW[4], 6, fmt.Sprintf("%d%%", fc), "1", 0, "C", true, 0, "")
			y = pdf.GetY() + 6
		}
		pdf.SetTextColor(0, 0, 0)
		y = pdf.GetY() + 2
	}

	// === Risks ===
	if contains(blocks, "risks") && len(risks) > 0 {
		pdf.SetDrawColor(200, 200, 200)
		pdf.Line(20, y, 190, y)
		y += 6
		pdf.SetFont("DejaVu", "B", 14)
		pdf.SetXY(20, y)
		pdf.SetTextColor(blueR, blueG, blueB)
		pdf.Cell(0, 8, "Ключевые риски")
		pdf.SetTextColor(0, 0, 0)
		y += 12

		rColW := []float64{100, 30, 40}
		rHeaders := []string{"Проблема", "Дилера", "Влияние, ₽"}
		pdf.SetFont("DejaVu", "B", 8)
		pdf.SetFillColor(blueR, blueG, blueB)
		pdf.SetTextColor(whiteR, whiteG, whiteB)
		x0 := 20.0
		for i, h := range rHeaders {
			pdf.SetXY(x0, y)
			pdf.CellFormat(rColW[i], 7, h, "1", 0, "C", true, 0, "")
			x0 += rColW[i]
		}
		y = pdf.GetY() + 7

		pdf.SetFont("DejaVu", "", 8)
		for idx, r := range risks {
			if idx%2 == 0 {
				pdf.SetFillColor(grayR, grayG, grayB)
			} else {
				pdf.SetFillColor(whiteR, whiteG, whiteB)
			}
			issue, _ := r["issue"].(string)
			ad := getInt(r, "affected_dealers")
			imp := getFloat(r, "impact")

			x0 = 20.0
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x0, y)
			pdf.CellFormat(rColW[0], 6, issue, "1", 0, "L", true, 0, "")
			x0 += rColW[0]
			pdf.SetTextColor(redR, redG, redB)
			pdf.SetXY(x0, y)
			pdf.CellFormat(rColW[1], 6, fmt.Sprintf("%d", ad), "1", 0, "C", true, 0, "")
			x0 += rColW[1]
			pdf.SetXY(x0, y)
			pdf.CellFormat(rColW[2], 6, nf(imp), "1", 0, "R", true, 0, "")
			y = pdf.GetY() + 6
		}
		pdf.SetTextColor(0, 0, 0)
		y = pdf.GetY() + 2
	}

	// === Plan-Fact Dynamics ===
	if contains(blocks, "planFact") && len(dynamics) > 0 {
		pdf.SetDrawColor(200, 200, 200)
		pdf.Line(20, y, 190, y)
		y += 6
		pdf.SetFont("DejaVu", "B", 14)
		pdf.SetXY(20, y)
		pdf.SetTextColor(blueR, blueG, blueB)
		pdf.Cell(0, 8, "Динамика План-Факт")
		pdf.SetTextColor(0, 0, 0)
		y += 12

		dColW := []float64{30, 50, 50, 40}
		dHeaders := []string{"Месяц", "План, ₽", "Факт, ₽", "Выполнение"}
		pdf.SetFont("DejaVu", "B", 8)
		pdf.SetFillColor(blueR, blueG, blueB)
		pdf.SetTextColor(whiteR, whiteG, whiteB)
		x0 := 20.0
		for i, h := range dHeaders {
			pdf.SetXY(x0, y)
			pdf.CellFormat(dColW[i], 7, h, "1", 0, "C", true, 0, "")
			x0 += dColW[i]
		}
		y = pdf.GetY() + 7

		pdf.SetFont("DejaVu", "", 8)
		for idx, d := range dynamics {
			if idx%2 == 0 {
				pdf.SetFillColor(grayR, grayG, grayB)
			} else {
				pdf.SetFillColor(whiteR, whiteG, whiteB)
			}
			month, _ := d["month"].(string)
			plan := getFloat(d, "plan")
			fact := getFloat(d, "fact")
			pct := 0.0
			if plan > 0 {
				pct = (fact / plan) * 100
			}
			r, g, b := kpiColor(pct)

			x0 = 20.0
			pdf.SetTextColor(0, 0, 0)
			pdf.SetXY(x0, y)
			pdf.CellFormat(dColW[0], 6, month, "1", 0, "C", true, 0, "")
			x0 += dColW[0]
			pdf.SetXY(x0, y)
			pdf.CellFormat(dColW[1], 6, nf(plan), "1", 0, "R", true, 0, "")
			x0 += dColW[1]
			pdf.SetXY(x0, y)
			pdf.CellFormat(dColW[2], 6, nf(fact), "1", 0, "R", true, 0, "")
			x0 += dColW[2]
			pdf.SetTextColor(r, g, b)
			pdf.SetXY(x0, y)
			pdf.CellFormat(dColW[3], 6, fmt.Sprintf("%.0f%%", pct), "1", 0, "C", true, 0, "")
			y = pdf.GetY() + 6
		}
		pdf.SetTextColor(0, 0, 0)
		y = pdf.GetY() + 2
	}

	// === Proposals ===
	if contains(blocks, "proposals") && comment != "" {
		pdf.SetDrawColor(200, 200, 200)
		pdf.Line(20, y, 190, y)
		y += 6
		pdf.SetFont("DejaVu", "B", 14)
		pdf.SetXY(20, y)
		pdf.SetTextColor(blueR, blueG, blueB)
		pdf.Cell(0, 8, "Предложения")
		pdf.SetTextColor(0, 0, 0)
		y += 12
		pdf.SetFont("DejaVu", "", 10)
		pdf.SetXY(20, y)
		pdf.MultiCell(170, 6, comment, "", "L", false)
	}

	// === FOOTER ===
	pdf.SetY(-20)
	pdf.SetDrawColor(200, 200, 200)
	pdf.Line(20, pdf.GetY(), 190, pdf.GetY())
	pdf.SetY(-15)
	pdf.SetFont("DejaVu", "", 8)
	pdf.SetTextColor(150, 150, 150)
	pdf.CellFormat(0, 5, "Сгенерировано: "+time.Now().Format("02.01.2006 15:04"), "", 0, "L", false, 0, "")
	pdf.CellFormat(0, 5, fmt.Sprintf("Стр. %d/{nb}", pdf.PageNo()), "", 0, "R", false, 0, "")
	pdf.SetTextColor(0, 0, 0)

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// helpers for map access
func getFloat(m map[string]interface{}, key string) float64 {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case float64:
			return val
		case int:
			return float64(val)
		}
	}
	return 0
}

func getInt(m map[string]interface{}, key string) int {
	if v, ok := m[key]; ok {
		switch val := v.(type) {
		case int:
			return val
		case float64:
			return int(val)
		}
	}
	return 0
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// SaveReportPdf - сгенерировать, сохранить PDF и вернуть report_id
func (s *KPIService) SaveReportPdf(ctx context.Context, userID string, period, date, startDateStr, endDateStr string, blocks []string, comment string) (string, error) {
	pdfData, err := s.GeneratePDF(ctx, userID, period, date, blocks, comment, startDateStr, endDateStr)
	if err != nil {
		return "", err
	}

	dir := "reports"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	uid := uuid.New().String()
	filename := fmt.Sprintf("%s.pdf", uid)
	filePath := filepath.Join(dir, filename)

	if err := os.WriteFile(filePath, pdfData, 0644); err != nil {
		return "", err
	}

	parsedUserID, _ := uuid.Parse(userID)
	report := models.Report{
		ID:        uuid.MustParse(uid),
		UserID:    parsedUserID,
		Period:    period,
		Date:      date,
		StartDate: startDateStr,
		EndDate:   endDateStr,
		FilePath:  filePath,
		Status:    "draft",
		Blocks:    strings.Join(blocks, ","),
		Comment:   comment,
	}

	if err := s.DB.Create(&report).Error; err != nil {
		return "", err
	}

	return uid, nil
}

// SendReport - отправить отчёт на email через SMTP
func (s *KPIService) SendReport(ctx context.Context, userID string, reportID string, recipients []string) error {
	var report models.Report
	if err := s.DB.Where("id = ? AND user_id = ?", reportID, userID).First(&report).Error; err != nil {
		return fmt.Errorf("report not found: %w", err)
	}

	pdfData, err := os.ReadFile(report.FilePath)
	if err != nil {
		return fmt.Errorf("failed to read PDF: %w", err)
	}

	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASSWORD")
	fromAddr := os.Getenv("SMTP_FROM")

	if smtpHost == "" || smtpPort == "" {
		return fmt.Errorf("SMTP not configured")
	}
	if fromAddr == "" {
		fromAddr = smtpUser
	}

	subject := fmt.Sprintf("Отчёт для B2B (%s %s)", report.Period, report.Date)
	body := "Здравствуйте!\n\nВо вложении отчёт для B2B.\n\nС уважением,\nКоманда"

	encoded := base64.StdEncoding.EncodeToString(pdfData)

	var msg bytes.Buffer
	boundary := "boundary123"

	msg.WriteString(fmt.Sprintf("From: %s\r\n", fromAddr))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", strings.Join(recipients, ", ")))
	msg.WriteString(fmt.Sprintf("Subject: =?UTF-8?B?%s?=\r\n", base64.StdEncoding.EncodeToString([]byte(subject))))
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n", boundary))
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(body)
	msg.WriteString("\r\n")
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: application/pdf\r\n")
	msg.WriteString("Content-Transfer-Encoding: base64\r\n")
	msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n", report.FilePath))
	msg.WriteString("\r\n")

	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		msg.WriteString(encoded[i:end] + "\r\n")
	}
	msg.WriteString(fmt.Sprintf("\r\n--%s--\r\n", boundary))

	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)

	addr := smtpHost + ":" + smtpPort
	tlsConfig := &tls.Config{ServerName: smtpHost}

	var conn net.Conn
	tlsConn, tlsErr := tls.Dial("tcp", addr, tlsConfig)
	if tlsErr == nil {
		conn = tlsConn
	} else {
		var dialErr error
		conn, dialErr = net.Dial("tcp", addr)
		if dialErr != nil {
			return fmt.Errorf("SMTP connection failed: %w", dialErr)
		}
	}

	client, err := smtp.NewClient(conn, smtpHost)
	if err != nil {
		conn.Close()
		return fmt.Errorf("SMTP client failed: %w", err)
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth failed: %w", err)
	}
	if err = client.Mail(fromAddr); err != nil {
		return fmt.Errorf("SMTP mail from failed: %w", err)
	}
	for _, r := range recipients {
		if err = client.Rcpt(r); err != nil {
			return fmt.Errorf("SMTP rcpt failed for %s: %w", r, err)
		}
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP data failed: %w", err)
	}
	if _, err = w.Write(msg.Bytes()); err != nil {
		return fmt.Errorf("SMTP write failed: %w", err)
	}
	w.Close()

	s.DB.Model(&report).Update("status", "sent")
	return nil
}

// GetReportHistory - история отчётов
func (s *KPIService) GetReportHistory(ctx context.Context, userID string) ([]map[string]interface{}, error) {
	var reports []models.Report
	if err := s.DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&reports).Error; err != nil {
		return nil, err
	}

	var result []map[string]interface{}
	for _, r := range reports {
		dateLabel := r.Date
		if r.Period == "custom" {
			dateLabel = fmt.Sprintf("%s — %s", r.StartDate, r.EndDate)
		}
		result = append(result, map[string]interface{}{
			"id":         r.ID.String(),
			"period":     dateLabel,
			"status":     r.Status,
			"created_at": r.CreatedAt.Format("2006-01-02 15:04"),
		})
	}
	return result, nil
}

// SaveDraft - сохранить черновик
func (s *KPIService) SaveDraft(ctx context.Context, userID string, draft map[string]interface{}) error {
	return nil
}

// GetDraft - получить черновик
func (s *KPIService) GetDraft(ctx context.Context, userID string) (map[string]interface{}, error) {
	return map[string]interface{}{}, nil
}
