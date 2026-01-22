package models

import "time"

// Task represents a single task within a checklist
type Task struct {
	ID          string    `json:"id" db:"id"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description,omitempty" db:"description"`
	Status      string    `json:"status" db:"status"` // pending, in_progress, completed
	Order       int       `json:"order" db:"order"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// Checklist represents a checklist with multiple tasks
type Checklist struct {
	ID          string    `json:"id" db:"id"`
	Title       string    `json:"title" db:"title"`
	Description string    `json:"description,omitempty" db:"description"`
	UserID      string    `json:"user_id" db:"user_id"`
	TenantID    string    `json:"tenant_id" db:"tenant_id"`
	Status      string    `json:"status" db:"status"` // pending, in_progress, completed
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
	Tasks       []Task    `json:"tasks" db:"tasks"`
	KPIScore    float64   `json:"kpi_score" db:"kpi_score"`
}

// ChecklistCreateRequest represents the data needed to create a checklist
type ChecklistCreateRequest struct {
	Title       string `json:"title" validate:"required"`
	Description string `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	Tasks       []Task `json:"tasks"`
}

// ChecklistUpdateRequest represents the data needed to update a checklist
type ChecklistUpdateRequest struct {
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
	Status      string `json:"status,omitempty" validate:"omitempty,oneof=pending in_progress completed"`
	Tasks       []Task `json:"tasks,omitempty"`
}

// ChecklistFilter represents the filter options for retrieving checklists
type ChecklistFilter struct {
	UserID   string
	TenantID string
	Status   string
	DateFrom time.Time
	DateTo   time.Time
	Page     int
	Limit    int
}