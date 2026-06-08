package validation

import (
	"testing"

	"github.com/go-playground/validator/v10"
)

type phoneTestStruct struct {
	Phone string `validate:"omitempty,phone_ru"`
}

func runPhoneValidation(t *testing.T, value string) bool {
	t.Helper()
	s := phoneTestStruct{Phone: value}
	v := validator.New()
	if err := v.RegisterValidation("phone_ru", ValidateRuPhone); err != nil {
		t.Fatalf("failed to register validator: %v", err)
	}
	return v.Struct(s) == nil
}

func TestValidateRuPhone_Valid(t *testing.T) {
	cases := []string{
		"+79991234567",
		"+70000000000",
		"+71234567890",
	}
	for _, c := range cases {
		if !runPhoneValidation(t, c) {
			t.Errorf("expected valid: %q", c)
		}
	}
}

func TestValidateRuPhone_Empty(t *testing.T) {
	if !runPhoneValidation(t, "") {
		t.Error("expected empty string to be valid (omitempty)")
	}
}

func TestValidateRuPhone_Invalid(t *testing.T) {
	cases := []string{
		"+7999123456",         // 9 digits
		"+799912345678",       // 11 digits
		"89991234567",         // no +7
		"+7",                  // no digits
		"+7abc",               // letters
		"+7 999 123 45 67",    // spaces
		"+7(999)-123-45-67",   // display format
		"+89991234567",        // wrong country code
		"7+9991234567",        // malformed
	}
	for _, c := range cases {
		if runPhoneValidation(t, c) {
			t.Errorf("expected invalid: %q", c)
		}
	}
}
