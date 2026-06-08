package handlers

import (
	"os"
	"testing"

	"franchise-saas-backend/internal/validation"
)

// TestMain обеспечивает регистрацию кастомных валидаторов (phone_ru)
// до запуска любых тестов в пакете, чтобы теги binding работали
// и в unit/integration тестах, не только в main().
func TestMain(m *testing.M) {
	if err := validation.RegisterValidators(); err != nil {
		panic("failed to register validators: " + err.Error())
	}
	os.Exit(m.Run())
}
