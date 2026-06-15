package handlers

import (
	"fmt"
	"franchise-saas-backend/internal/services"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AdminHandler struct {
	service *services.AdminService
}

func NewAdminHandler(service *services.AdminService) *AdminHandler {
	return &AdminHandler{service: service}
}

// GetDashboardStats - статистика
func (h *AdminHandler) GetDashboardStats(c *gin.Context) {
	stats, err := h.service.GetDashboardStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// GetAllTenants - список сетей
func (h *AdminHandler) GetAllTenants(c *gin.Context) {
	tenants, err := h.service.GetAllTenants(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tenants)
}

// GetTenantsPaymentStatus - статус оплат
func (h *AdminHandler) GetTenantsPaymentStatus(c *gin.Context) {
	data, err := h.service.GetTenantsPaymentStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// GetOnboarding - новые тенанты с прогрессом
func (h *AdminHandler) GetOnboarding(c *gin.Context) {
	tenants, err := h.service.GetOnboarding(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tenants)
}

// GetTenantByID - получить тенант по ID
func (h *AdminHandler) GetTenantByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant ID"})
		return
	}
	tenant, err := h.service.GetTenantByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tenant not found"})
		return
	}
	c.JSON(http.StatusOK, tenant)
}

// CreateTenant - создать сеть
func (h *AdminHandler) CreateTenant(c *gin.Context) {
	var req services.CreateTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	tenant, err := h.service.CreateTenant(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tenant)
}

// UpdateTenant - обновить сеть
func (h *AdminHandler) UpdateTenant(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := uuid.Parse(idStr)

	var req struct {
		Name      string     `json:"name"`
		PlanID    *uuid.UUID `json:"plan_id"`
		Tariff    string     `json:"tariff"`
		PaidUntil *time.Time `json:"paid_until"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.UpdateTenant(id, req.Name, req.PlanID, req.PaidUntil, req.Tariff); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Updated"})
}

// BlockTenant - заблокировать
func (h *AdminHandler) BlockTenant(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := uuid.Parse(idStr)
	if err := h.service.BlockTenant(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Blocked"})
}

// UnblockTenant - разблокировать
func (h *AdminHandler) UnblockTenant(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := uuid.Parse(idStr)
	if err := h.service.UnblockTenant(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Unblocked"})
}

// DeleteTenant - удалить
func (h *AdminHandler) DeleteTenant(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := uuid.Parse(idStr)
	if err := h.service.DeleteTenant(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Deleted"})
}

// === PLANS ===

// === INVOICES ===

// CreateInvoice - создать счет
func (h *AdminHandler) CreateInvoice(c *gin.Context) {
	var req struct {
		TenantID    uuid.UUID `json:"tenant_id" binding:"required"`
		Amount      float64   `json:"amount" binding:"required"`
		Description string    `json:"description"`
		DueDate     time.Time `json:"due_date"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	inv, err := h.service.CreateInvoice(req.TenantID, req.Amount, req.Description, req.DueDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, inv)
}

// GetAllInvoices - получить все счета
func (h *AdminHandler) GetAllInvoices(c *gin.Context) {
	invoices, err := h.service.GetAllInvoices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, invoices)
}

// PayInvoice - оплатить счет
func (h *AdminHandler) PayInvoice(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := uuid.Parse(idStr)

	if err := h.service.MarkInvoicePaid(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Invoice paid successfully"})
}

// === ЭТАП 2: АНАЛИТИКА ===

// GetAnalytics возвращает DAU/MAU и Воронку
func (h *AdminHandler) GetAnalytics(c *gin.Context) {
	data, err := h.service.GetAnalyticsData()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// === ЭТАП 3: Продукт и KPI ===

// GetProductAnalytics - возвращает KPI и продуктовые метрики
func (h *AdminHandler) GetProductAnalytics(c *gin.Context) {
	data, err := h.service.GetProductAnalytics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// === ЭТАП 4: Риски и Health Score ===

// GetRisks - список сетей в зоне риска
func (h *AdminHandler) GetRisks(c *gin.Context) {
	risks, err := h.service.GetRisksAnalytics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, risks)
}

// === ЭТАП 5: Unit Economics ===

// GetUnitEconomics - LTV, CAC, Ratio
func (h *AdminHandler) GetUnitEconomics(c *gin.Context) {
	data, err := h.service.GetUnitEconomics()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// UpdateMarketingSpend - ввод расходов на рекламу
func (h *AdminHandler) UpdateMarketingSpend(c *gin.Context) {
	var req struct {
		Amount float64 `json:"amount" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.service.UpdateMarketingSpend(req.Amount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Marketing spend updated"})
}

// === ACTIVITY ===

func (h *AdminHandler) GetActivityOverview(c *gin.Context) {
	days := 30
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	tenant := c.Query("tenant")
	data, err := h.service.GetActivityOverview(days, tenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetActivityDynamics(c *gin.Context) {
	days := 90
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	tenant := c.Query("tenant")
	data, err := h.service.GetActivityDynamics(days, tenant)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetActivityByTenant(c *gin.Context) {
	days := 30
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	data, err := h.service.GetActivityByTenant(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetFeatureAdoption(c *gin.Context) {
	days := 30
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	data, err := h.service.GetFeatureAdoption(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetTimeToValue(c *gin.Context) {
	days := 90
	if d := c.Query("days"); d != "" {
		fmt.Sscanf(d, "%d", &days)
	}
	data, err := h.service.GetTimeToValue(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// === TECH HEALTH ===

func (h *AdminHandler) GetHealthStatus(c *gin.Context) {
	data, err := h.service.GetHealthStatus()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetHealthPerformance(c *gin.Context) {
	period := c.DefaultQuery("period", "24h")
	startDate := c.Query("start_date")
	endDate := c.Query("end_date")
	data, err := h.service.GetHealthPerformance(period, startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetHealthErrors(c *gin.Context) {
	limit := 50
	if l := c.Query("limit"); l != "" {
		fmt.Sscanf(l, "%d", &limit)
	}
	data, err := h.service.GetHealthErrors(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetHealthServices(c *gin.Context) {
	data, err := h.service.GetHealthServices()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetHealthSecurityEvents(c *gin.Context) {
	hours := 24
	if hh := c.Query("hours"); hh != "" {
		fmt.Sscanf(hh, "%d", &hours)
	}
	data, err := h.service.GetHealthSecurityEvents(hours)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

// === BILLING ===

func (h *AdminHandler) GetBillingSettings(c *gin.Context) {
	data, err := h.service.GetBillingSettings()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) UpdateBillingSettings(c *gin.Context) {
	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.service.UpdateBillingSettings(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Settings updated"})
}

func (h *AdminHandler) GetBillingHistory(c *gin.Context) {
	months := 12
	if m := c.Query("months"); m != "" {
		fmt.Sscanf(m, "%d", &months)
	}
	data, err := h.service.GetBillingHistory(months)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) CreatePayment(c *gin.Context) {
	var req struct {
		TenantID  string  `json:"tenant_id"`
		InvoiceID string  `json:"invoice_id"`
		Amount    float64 `json:"amount"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	tenantID, _ := uuid.Parse(req.TenantID)
	invoiceID, _ := uuid.Parse(req.InvoiceID)

	if err := h.service.CreatePayment(tenantID, invoiceID, req.Amount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Payment created"})
}

// === AUDIT ===

func (h *AdminHandler) GetAdminActions(c *gin.Context) {
	filters := map[string]string{}
	if v := c.Query("admin"); v != "" {
		filters["admin"] = v
	}
	if v := c.Query("action"); v != "" {
		filters["action"] = v
	}
	if v := c.Query("tenant"); v != "" {
		filters["tenant"] = v
	}
	data, err := h.service.GetAdminActions(filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetImpersonations(c *gin.Context) {
	filters := map[string]string{}
	if v := c.Query("admin"); v != "" {
		filters["admin"] = v
	}
	data, err := h.service.GetImpersonations(filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetActiveSessions(c *gin.Context) {
	data, err := h.service.GetActiveSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) GetUserLogins(c *gin.Context) {
	filters := map[string]string{}
	if v := c.Query("tenant"); v != "" {
		filters["tenant"] = v
	}
	if v := c.Query("user"); v != "" {
		filters["user"] = v
	}
	if v := c.Query("role"); v != "" {
		filters["role"] = v
	}
	if v := c.Query("date_from"); v != "" {
		filters["date_from"] = v
	}
	if v := c.Query("date_to"); v != "" {
		filters["date_to"] = v
	}
	data, err := h.service.GetUserLogins(filters)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, data)
}

func (h *AdminHandler) TerminateSession(c *gin.Context) {
	sessionID := c.Param("id")
	if err := h.service.TerminateSession(sessionID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Session terminated"})
}

func (h *AdminHandler) ImpersonateTenant(c *gin.Context) {
	idStr := c.Param("id")
	tenantID, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tenant ID"})
		return
	}
	var req struct {
		Role string `json:"role"`
	}
	c.ShouldBindJSON(&req)

	token, err := h.service.ImpersonateTenant(tenantID, req.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token})
}
