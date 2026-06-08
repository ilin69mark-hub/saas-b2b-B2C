// Package validation содержит кастомные валидаторы для go-playground/validator.
package validation

import (
	"regexp"
	"sync"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// phoneRURegex — канонический формат российского номера для API: +7XXXXXXXXXX.
var phoneRURegex = regexp.MustCompile(`^\+7\d{10}$`)

// registerOnce гарантирует идемпотентную регистрацию.
var registerOnce sync.Once

// init автоматически регистрирует валидатор при первом импорте пакета.
// Это нужно, чтобы кастомные теги работали и в тестах, которые
// создают собственный gin-движок без вызова main().
func init() {
	RegisterValidators()
}

// ValidateRuPhone — функция-валидатор для тега `phone_ru`.
// Принимает пустую строку (omitempty работает на уровне тега), иначе
// требует строго +7 и 10 цифр.
func ValidateRuPhone(fl validator.FieldLevel) bool {
	value := fl.Field().String()
	if value == "" {
		return true
	}
	return phoneRURegex.MatchString(value)
}

// RegisterValidators регистрирует все кастомные валидаторы в gin-движке.
// Идемпотентно: повторные вызовы безопасны.
func RegisterValidators() error {
	var regErr error
	registerOnce.Do(func() {
		v, ok := binding.Validator.Engine().(*validator.Validate)
		if !ok {
			return
		}
		regErr = v.RegisterValidation("phone_ru", ValidateRuPhone)
	})
	return regErr
}
