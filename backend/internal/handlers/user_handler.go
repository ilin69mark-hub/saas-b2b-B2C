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

func NewUserHandler(service *services.UserService) *UserHandler {
	return &UserHandler{
		service: service,
	}
}

// GetProfile получает профиль аутентифицированного пользователя
// @Summary Получение профиля пользователя
// @Description Получение профиля текущего аутентифицированного пользователя
// @Tags users
// @Security BearerAuth
// @Produce json
// @Success 200 {object} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /users/profile [get]
func (h *UserHandler) GetProfile(c *gin.Context) {
	// Извлечение ID пользователя из контекста (устанавливается middleware)
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Требуется аутентификация",
			Message: "Пользователь не аутентифицирован",
		})
		return
	}

	user, err := h.service.GetUserByID(userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Не удалось получить данные пользователя",
			Message: "Не удалось загрузить профиль пользователя",
		})
		return
	}

	if user == nil {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Пользователь не найден",
			Message: "Запрашиваемый пользователь не существует",
		})
		return
	}

	// Не возвращаем хеш пароля
	user.Password = ""
	c.JSON(http.StatusOK, user)
}

// UpdateProfile обновляет профиль аутентифицированного пользователя
// @Summary Обновление профиля пользователя
// @Description Обновление профиля текущего аутентифицированного пользователя
// @Tags users
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param user body models.UserUpdateRequest true "Данные для обновления"
// @Success 200 {object} models.User
// @Failure 400 {object} models.ErrorResponse
// @Failure 401 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /users/profile [put]
func (h *UserHandler) UpdateProfile(c *gin.Context) {
	// Извлечение ID пользователя из контекста
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, models.ErrorResponse{
			Error:   "Требуется аутентификация",
			Message: "Пользователь не аутентифицирован",
		})
		return
	}

	var req models.UserUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Неверные данные запроса",
			Message: err.Error(),
		})
		return
	}

	// Обновление данных пользователя
	updatedUser, err := h.service.UpdateUser(userID.(string), req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Не удалось обновить пользователя",
			Message: "Не удалось обновить профиль пользователя",
		})
		return
	}

	// Не возвращаем хеш пароля
	updatedUser.Password = ""
	c.JSON(http.StatusOK, updatedUser)
}

// GetAllDealers получает всех дилеров для франчайзера
// @Summary Получение всех дилеров
// @Description Получение всех дилеров франчайзинговой сети (доступно только франчайзеру)
// @Tags dealers
// @Security BearerAuth
// @Produce json
// @Success 200 {array} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /dealers [get]
func (h *UserHandler) GetAllDealers(c *gin.Context) {
	// Извлечение роли пользователя из контекста
	userRole, exists := c.Get("role")
	if !exists || userRole != "franchiser" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "Доступ запрещён",
			Message: "Только франчайзеры могут получить доступ к этому ресурсу",
		})
		return
	}

	// Извлечение ID тенанта из контекста
	tenantID, exists := c.Get("tenantID")
	if !exists {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Ошибка сервера",
			Message: "Отсутствует информация о тенанте",
		})
		return
	}

	dealerType := c.Query("type")
	if dealerType == "" {
		dealerType = "dealer" // по умолчанию
	}

	dealers, err := h.service.GetDealersByTenant(tenantID.(string), dealerType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Не удалось получить дилеров",
			Message: "Не удалось загрузить список дилеров",
		})
		return
	}

	// Не возвращаем хеши паролей
	for i := range dealers {
		dealers[i].Password = ""
	}

	c.JSON(http.StatusOK, dealers)
}

// GetDealerByID получает конкретного дилера по ID
// @Summary Получение дилера по ID
// @Description Получение конкретного дилера по ID (доступно только франчайзеру)
// @Tags dealers
// @Security BearerAuth
// @Produce json
// @Param id path string true "ID дилера"
// @Success 200 {object} models.User
// @Failure 401 {object} models.ErrorResponse
// @Failure 403 {object} models.ErrorResponse
// @Failure 404 {object} models.ErrorResponse
// @Failure 500 {object} models.ErrorResponse
// @Router /dealers/{id} [get]
func (h *UserHandler) GetDealerByID(c *gin.Context) {
	// Извлечение роли пользователя из контекста
	userRole, exists := c.Get("role")
	if !exists || userRole != "franchiser" {
		c.JSON(http.StatusForbidden, models.ErrorResponse{
			Error:   "Доступ запрещён",
			Message: "Только франчайзеры могут получить доступ к этому ресурсу",
		})
		return
	}

	dealerID := c.Param("id")

	// Валидация формата UUID
	if _, err := uuid.Parse(dealerID); err != nil {
		c.JSON(http.StatusBadRequest, models.ErrorResponse{
			Error:   "Неверный ID дилера",
			Message: "Предоставленный ID дилера некорректен",
		})
		return
	}

	dealer, err := h.service.GetUserByID(dealerID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.ErrorResponse{
			Error:   "Не удалось получить дилера",
			Message: "Не удалось загрузить информацию о дилере",
		})
		return
	}

	if dealer == nil || !strings.EqualFold(dealer.Role, "dealer") {
		c.JSON(http.StatusNotFound, models.ErrorResponse{
			Error:   "Дилер не найден",
			Message: "Запрашиваемый дилер не существует",
		})
		return
	}

	// Не возвращаем хеш пароля
	dealer.Password = ""
	c.JSON(http.StatusOK, dealer)
}