package handlers

import (
	"net/http"
	"strconv"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ChecklistHandler struct {
	service *services.ChecklistService
}

func NewChecklistHandler(service *services.ChecklistService) *ChecklistHandler {
	return &ChecklistHandler{
		service: service,
	}
}

// GetChecklists retrieves all checklists for the authenticated user
func (h *ChecklistHandler) GetChecklists(c *gin.Context) {
	// Extract user ID from context (set by middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	pageStr := c.DefaultQuery("page", "1")
	limitStr := c.DefaultQuery("limit", "10")

	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit < 1 || limit > 100 {
		limit = 10
	}

	offset := (page - 1) * limit

	checklists, err := h.service.GetChecklistsByUserID(userID.(string), limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve checklists",
			Message: "Could not fetch checklist data",
		})
		return
	}

	c.JSON(http.StatusOK, checklists)
}

// GetChecklistByID retrieves a specific checklist by ID
func (h *ChecklistHandler) GetChecklistByID(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	checklistID := c.Param("id")

	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid checklist ID",
			Message: "The provided checklist ID is not valid",
		})
		return
	}

	checklist, err := h.service.GetChecklistByID(checklistID, userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve checklist",
			Message: "Could not fetch checklist data",
		})
		return
	}

	if checklist == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Checklist not found",
			Message: "The requested checklist does not exist",
		})
		return
	}

	c.JSON(http.StatusOK, checklist)
}

// CreateChecklist creates a new checklist
func (h *ChecklistHandler) CreateChecklist(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	var req models.ChecklistCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Create checklist
	checklist := &models.Checklist{
		ID:          uuid.New().String(),
		Title:       req.Title,
		Description: req.Description,
		UserID:      userID.(string),
		Status:      "pending",
		CreatedAt:   req.CreatedAt,
		UpdatedAt:   req.CreatedAt,
		Tasks:       req.Tasks,
	}

	createdChecklist, err := h.service.CreateChecklist(checklist)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to create checklist",
			Message: "Could not create checklist",
		})
		return
	}

	c.JSON(http.StatusCreated, createdChecklist)
}

// UpdateChecklist updates an existing checklist
func (h *ChecklistHandler) UpdateChecklist(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	checklistID := c.Param("id")

	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid checklist ID",
			Message: "The provided checklist ID is not valid",
		})
		return
	}

	var req models.ChecklistUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Update checklist
	updatedChecklist, err := h.service.UpdateChecklist(checklistID, userID.(string), req)
	if err != nil {
		if err.Error() == "checklist not found" {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "Checklist not found",
				Message: "The requested checklist does not exist",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update checklist",
			Message: "Could not update checklist",
		})
		return
	}

	c.JSON(http.StatusOK, updatedChecklist)
}

// DeleteChecklist deletes a checklist
func (h *ChecklistHandler) DeleteChecklist(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	checklistID := c.Param("id")

	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid checklist ID",
			Message: "The provided checklist ID is not valid",
		})
		return
	}

	err := h.service.DeleteChecklist(checklistID, userID.(string))
	if err != nil {
		if err.Error() == "checklist not found" {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "Checklist not found",
				Message: "The requested checklist does not exist",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to delete checklist",
			Message: "Could not delete checklist",
		})
		return
	}

	c.JSON(http.StatusOK, models.SuccessResponse{
		Message: "Checklist deleted successfully",
	})
}

// CompleteChecklist marks a checklist as completed
func (h *ChecklistHandler) CompleteChecklist(c *gin.Context) {
	// Extract user ID from context
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	checklistID := c.Param("id")

	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid checklist ID",
			Message: "The provided checklist ID is not valid",
		})
		return
	}

	updatedChecklist, err := h.service.CompleteChecklist(checklistID, userID.(string))
	if err != nil {
		if err.Error() == "checklist not found" {
			c.JSON(http.StatusNotFound, models.ErrorResponse{
				Error:   "Checklist not found",
				Message: "The requested checklist does not exist",
			})
			return
		}

		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to complete checklist",
			Message: "Could not mark checklist as completed",
		})
		return
	}

	c.JSON(http.StatusOK, updatedChecklist)
}
