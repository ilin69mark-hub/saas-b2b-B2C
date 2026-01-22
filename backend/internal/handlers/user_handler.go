package handlers

import (
	"net/http"
	"strings"

	"franchise-saas-backend/internal/models"
	"franchise-saas-backend/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type UserHandler struct {
	service *services.UserService
}

func NewUserHandler(db interface{}) *UserHandler {
	return &UserHandler{
		service: services.NewUserService(db),
	}
}

// GetProfile retrieves the authenticated user's profile
// @Summary Get user profile
// @Description Get the profile of the authenticated user
// @Tags users
// @Security BearerAuth
// @Produce json
// @Success 200 {object} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /users/profile [get]
func (h *UserHandler) GetProfile(c *gin.Context) {
	// Extract user ID from context (set by middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	user, err := h.service.GetUserByID(userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve user",
			Message: "Could not fetch user profile",
		})
		return
	}

	if user == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "User not found",
			Message: "The requested user does not exist",
		})
		return
	}

	// Don't return the password hash
	user.Password = ""
	c.JSON(http.StatusOK, user)
}

// UpdateProfile updates the authenticated user's profile
// @Summary Update user profile
// @Description Update the profile of the authenticated user
// @Tags users
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param user body models.UserUpdateRequest true "User update data"
// @Success 200 {object} models.User
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /users/profile [put]
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	// Extract user ID from context (set by middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Authentication required",
			Message: "User not authenticated",
		})
		return
	}

	var req models.UserUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid request data",
			Message: err.Error(),
		})
		return
	}

	// Update user
	updatedUser, err := h.service.UpdateUser(userID.(string), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to update user",
			Message: "Could not update user profile",
		})
		return
	}

	// Don't return the password hash
	updatedUser.Password = ""
	c.JSON(http.StatusOK, updatedUser)
}

// GetAllDealers retrieves all dealers for franchiser
// @Summary Get all dealers
// @Description Get all dealers in the franchise network (accessible by franchiser only)
// @Tags dealers
// @Security BearerAuth
// @Produce json
// @Success 200 {array} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /dealers [get]
func (h *UserHandler) GetAllDealers(c *gin.Context) {
	// Extract user role from context (set by middleware)
	userRole, exists := c.Get("role")
	if !exists || userRole != "franchiser" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "Access denied",
			Message: "Only franchisers can access this resource",
		})
		return
	}

	// Extract tenant ID from context
	tenantID, exists := c.Get("tenantID")
	if !exists {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Server error",
			Message: "Missing tenant information",
		})
		return
	}

	dealerType := c.Query("type")
	if dealerType == "" {
		dealerType = "dealer" // default
	}

	dealers, err := h.service.GetDealersByTenant(tenantID.(string), dealerType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve dealers",
			Message: "Could not fetch dealer list",
		})
		return
	}

	// Don't return password hashes
	for i := range dealers {
		dealers[i].Password = ""
	}

	c.JSON(http.StatusOK, dealers)
}

// GetDealerByID retrieves a specific dealer by ID
// @Summary Get dealer by ID
// @Description Get a specific dealer by ID (accessible by franchiser only)
// @Tags dealers
// @Security BearerAuth
// @Produce json
// @Param id path string true "Dealer ID"
// @Success 200 {object} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /dealers/{id} [get]
func (h *UserHandler) GetDealerByID(c *gin.Context) {
	// Extract user role from context (set by middleware)
	userRole, exists := c.Get("role")
	if !exists || userRole != "franchiser" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "Access denied",
			Message: "Only franchisers can access this resource",
		})
		return
	}

	dealerID := c.Param("id")
	
	// Validate UUID format
	if _, err := uuid.Parse(dealerID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Invalid dealer ID",
			Message: "The provided dealer ID is not valid",
		})
		return
	}

	dealer, err := h.service.GetUserByID(dealerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Failed to retrieve dealer",
			Message: "Could not fetch dealer information",
		})
		return
	}

	if dealer == nil || !strings.EqualFold(dealer.Role, "dealer") {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Dealer not found",
			Message: "The requested dealer does not exist",
		})
		return
	}

	// Don't return password hash
	dealer.Password = ""
	c.JSON(http.StatusOK, dealer)
}