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

func NewChecklistHandler(db interface{}) *ChecklistHandler {
	return &ChecklistHandler{
		service: services.NewChecklistService(db),
	}
}

// GetChecklists retrieves all checklists for the authenticated user
// @Summary Get user's checklists
// @Description Get all checklists for the authenticated user
// @Tags checklists
// @Security BearerAuth
// @Produce json
// @Param page query int false "Page number" default(1)
// @Param limit query int false "Items per page" default(10)
// @Success 200 {array} models.Checklist
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists [get]
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
// @Summary Get checklist by ID
// @Description Get a specific checklist by ID
// @Tags checklists
// @Security BearerAuth
// @Produce json
// @Param id path string true "Checklist ID"
// @Success 200 {object} models.Checklist
// @Failure 401 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists/{id} [get]
func (h *ChecklistHandler) GetChecklistByID(c *gin.Context) {
	// Extract user ID from context (set by middleware)
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
// @Summary Create a new checklist
// @Description Create a new checklist for the authenticated user
// @Tags checklists
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param checklist body models.ChecklistCreateRequest true "Checklist data"
// @Success 201 {object} models.Checklist
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists [post]
func (h *ChecklistHandler) CreateChecklist(c *gin.Context) {
	// Extract user ID from context (set by middleware)
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
// @Summary Update a checklist
// @Description Update an existing checklist
// @Tags checklists
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param id path string true "Checklist ID"
// @Param checklist body models.ChecklistUpdateRequest true "Updated checklist data"
// @Success 200 {object} models.Checklist
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists/{id} [put]
func (h *ChecklistHandler) UpdateChecklist(c *gin.Context) {
	// Extract user ID from context (set by middleware)
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
// @Summary Delete a checklist
// @Description Delete a checklist by ID
// @Tags checklists
// @Security BearerAuth
// @Produce json
// @Param id path string true "Checklist ID"
// @Success 200 {object} models.SuccessResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists/{id} [delete]
func (h *ChecklistHandler) DeleteChecklist(c *gin.Context) {
	// Extract user ID from context (set by middleware)
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
// @Summary Complete a checklist
// @Description Mark a checklist as completed
// @Tags checklists
// @Security BearerAuth
// @Produce json
// @Param id path string true "Checklist ID"
// @Success 200 {object} models.Checklist
// @Failure 401 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /checklists/{id}/complete [post]
func (h *ChecklistHandler) CompleteChecklist(c *gin.Context) {
	// Extract user ID from context (set by middleware)
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