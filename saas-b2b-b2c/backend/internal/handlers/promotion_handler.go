package handlers

import (
	"net/http"

	"franchise-saas-backend/internal/services"

	"github.com/gin-gonic/gin"
)

type PromotionHandler struct {
	svc services.PromotionService
}

func NewPromotionHandler(s services.PromotionService) *PromotionHandler {
	return &PromotionHandler{svc: s}
}

// GET /dealer/promotions
func (h *PromotionHandler) List(c *gin.Context) {
	dealerID, _ := c.Get("userID")
	tenantID, _ := c.Get("tenantID")

	list, err := h.svc.GetMyPromotions(c.Request.Context(), dealerID.(string), tenantID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

// POST /dealer/promotions
func (h *PromotionHandler) Create(c *gin.Context) {
	var dto services.CreatePromotionDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dealerID, _ := c.Get("userID")
	tenantID, _ := c.Get("tenantID")

	p, err := h.svc.Create(c.Request.Context(), dto, dealerID.(string), tenantID.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, p)
}

// PUT /dealer/promotions/:id
func (h *PromotionHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var dto services.UpdatePromotionDTO
	if err := c.ShouldBindJSON(&dto); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dealerID, _ := c.Get("userID")
	tenantID, _ := c.Get("tenantID")

	p, err := h.svc.Update(c.Request.Context(), id, dto, dealerID.(string), tenantID.(string))
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, p)
}

// DELETE /dealer/promotions/:id
func (h *PromotionHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	dealerID, _ := c.Get("userID")
	tenantID, _ := c.Get("tenantID")

	if err := h.svc.Delete(c.Request.Context(), id, dealerID.(string), tenantID.(string)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
