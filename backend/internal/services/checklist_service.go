package services

import (
	"errors"
	"fmt"
	"math/rand"
	"time"

	"franchise-saas-backend/internal/models"

	"github.com/google/uuid"
)

type ChecklistService struct {
	db interface{}
}

func NewChecklistService(db interface{}) *ChecklistService {
	return &ChecklistService{db: db}
}

// GetChecklistsByUserID retrieves all checklists for a specific user
func (s *ChecklistService) GetChecklistsByUserID(userID string, limit, offset int) ([]models.Checklist, error) {
	// In a real implementation, you would query the database
	// For now, we'll simulate the retrieval
	
	// Validate UUID format
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Simulate fetching from database
	// Generate sample checklists
	checklists := []models.Checklist{}
	
	// Create sample checklists
	for i := 0; i < 5; i++ {
		id := uuid.New().String()
		date := time.Now().AddDate(0, 0, -i) // Different dates
		
		// Calculate random KPI score
		kpiScore := float64(rand.Intn(100))
		
		// Create sample tasks
		tasks := []models.Task{
			{
				ID:          uuid.New().String(),
				Title:       "Позвонить клиенту",
				Description: "Сделать звонок потенциальному клиенту",
				Status:      getRandomStatus(),
				Order:       1,
				CreatedAt:   date,
				UpdatedAt:   date,
			},
			{
				ID:          uuid.New().String(),
				Title:       "Опубликовать пост",
				Description: "Опубликовать рекламный пост в соцсетях",
				Status:      getRandomStatus(),
				Order:       2,
				CreatedAt:   date,
				UpdatedAt:   date,
			},
			{
				ID:          uuid.New().String(),
				Title:       "Провести встречу",
				Description: "Провести встречу с потенциальным партнёром",
				Status:      getRandomStatus(),
				Order:       3,
				CreatedAt:   date,
				UpdatedAt:   date,
			},
		}
		
		checklist := models.Checklist{
			ID:          id,
			Title:       fmt.Sprintf("Ежедневный чек-лист %s", date.Format("02.01.2006")),
			Description: fmt.Sprintf("Чек-лист задач на %s", date.Format("02.01.2006")),
			UserID:      userID,
			TenantID:    "tenant-1",
			Status:      calculateStatusFromTasks(tasks),
			CreatedAt:   date,
			UpdatedAt:   date,
			Tasks:       tasks,
			KPIScore:    kpiScore,
		}
		
		checklists = append(checklists, checklist)
	}
	
	return checklists, nil
}

// GetChecklistByID retrieves a specific checklist by its ID
func (s *ChecklistService) GetChecklistByID(checklistID, userID string) (*models.Checklist, error) {
	// In a real implementation, you would query the database
	// For now, we'll simulate the retrieval
	
	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		return nil, errors.New("invalid checklist ID format")
	}
	
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Simulate fetching from database
	// For demo purposes, we'll create a checklist if it doesn't exist
	date := time.Now()
	
	tasks := []models.Task{
		{
			ID:          uuid.New().String(),
			Title:       "Позвонить клиенту",
			Description: "Сделать звонок потенциальному клиенту",
			Status:      "pending",
			Order:       1,
			CreatedAt:   date,
			UpdatedAt:   date,
		},
		{
			ID:          uuid.New().String(),
			Title:       "Опубликовать пост",
			Description: "Опубликовать рекламный пост в соцсетях",
			Status:      "in_progress",
			Order:       2,
			CreatedAt:   date,
			UpdatedAt:   date,
		},
		{
			ID:          uuid.New().String(),
			Title:       "Провести встречу",
			Description: "Провести встречу с потенциальным партнёром",
			Status:      "completed",
			Order:       3,
			CreatedAt:   date,
			UpdatedAt:   date,
		},
	}
	
	checklist := &models.Checklist{
		ID:          checklistID,
		Title:       "Ежедневный чек-лист",
		Description: "Чек-лист задач на сегодня",
		UserID:      userID,
		TenantID:    "tenant-1",
		Status:      calculateStatusFromTasks(tasks),
		CreatedAt:   date,
		UpdatedAt:   date,
		Tasks:       tasks,
		KPIScore:    85.0,
	}
	
	return checklist, nil
}

// CreateChecklist creates a new checklist
func (s *ChecklistService) CreateChecklist(checklist *models.Checklist) (*models.Checklist, error) {
	// In a real implementation, you would insert into the database
	// For now, we'll simulate the creation
	
	// Validate UUID format
	if _, err := uuid.Parse(checklist.UserID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Set status based on tasks if not set
	if checklist.Status == "" {
		checklist.Status = calculateStatusFromTasks(checklist.Tasks)
	}
	
	// Calculate KPI score based on task completion
	checklist.KPIScore = calculateKPIScore(checklist.Tasks)
	
	// Update timestamps
	now := time.Now()
	checklist.CreatedAt = now
	checklist.UpdatedAt = now
	
	// In a real implementation, you would save to the database here
	
	return checklist, nil
}

// UpdateChecklist updates an existing checklist
func (s *ChecklistService) UpdateChecklist(checklistID, userID string, req models.ChecklistUpdateRequest) (*models.Checklist, error) {
	// In a real implementation, you would update the database
	// For now, we'll simulate the update
	
	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		return nil, errors.New("invalid checklist ID format")
	}
	
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Fetch existing checklist
	existingChecklist, err := s.GetChecklistByID(checklistID, userID)
	if err != nil || existingChecklist == nil {
		return nil, errors.New("checklist not found")
	}
	
	// Update fields if provided in request
	if req.Title != "" {
		existingChecklist.Title = req.Title
	}
	if req.Description != "" {
		existingChecklist.Description = req.Description
	}
	if req.Status != "" {
		existingChecklist.Status = req.Status
	}
	if req.Tasks != nil {
		existingChecklist.Tasks = req.Tasks
		existingChecklist.Status = calculateStatusFromTasks(req.Tasks)
		existingChecklist.KPIScore = calculateKPIScore(req.Tasks)
	}
	
	// Update timestamp
	existingChecklist.UpdatedAt = time.Now()
	
	// In a real implementation, you would save to the database here
	
	return existingChecklist, nil
}

// DeleteChecklist deletes a checklist by ID
func (s *ChecklistService) DeleteChecklist(checklistID, userID string) error {
	// In a real implementation, you would delete from the database
	// For now, we'll simulate the deletion
	
	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		return errors.New("invalid checklist ID format")
	}
	
	if _, err := uuid.Parse(userID); err != nil {
		return errors.New("invalid user ID format")
	}
	
	// Check if checklist exists (by trying to fetch it)
	_, err := s.GetChecklistByID(checklistID, userID)
	if err != nil {
		return errors.New("checklist not found")
	}
	
	// In a real implementation, you would delete from the database here
	
	return nil
}

// CompleteChecklist marks a checklist as completed
func (s *ChecklistService) CompleteChecklist(checklistID, userID string) (*models.Checklist, error) {
	// In a real implementation, you would update the database
	// For now, we'll simulate the completion
	
	// Validate UUID format
	if _, err := uuid.Parse(checklistID); err != nil {
		return nil, errors.New("invalid checklist ID format")
	}
	
	if _, err := uuid.Parse(userID); err != nil {
		return nil, errors.New("invalid user ID format")
	}
	
	// Fetch existing checklist
	existingChecklist, err := s.GetChecklistByID(checklistID, userID)
	if err != nil || existingChecklist == nil {
		return nil, errors.New("checklist not found")
	}
	
	// Mark all tasks as completed if not already
	for i := range existingChecklist.Tasks {
		if existingChecklist.Tasks[i].Status != "completed" {
			existingChecklist.Tasks[i].Status = "completed"
			existingChecklist.Tasks[i].UpdatedAt = time.Now()
		}
	}
	
	// Update checklist status to completed
	existingChecklist.Status = "completed"
	existingChecklist.KPIScore = 100.0 // Perfect score when completed
	existingChecklist.UpdatedAt = time.Now()
	
	// In a real implementation, you would save to the database here
	
	return existingChecklist, nil
}

// Helper function to randomly assign task statuses (for demo purposes)
func getRandomStatus() string {
	statuses := []string{"pending", "in_progress", "completed"}
	return statuses[rand.Intn(len(statuses))]
}

// Helper function to calculate checklist status based on task statuses
func calculateStatusFromTasks(tasks []models.Task) string {
	if len(tasks) == 0 {
		return "pending"
	}
	
	completedCount := 0
	inProgressCount := 0
	
	for _, task := range tasks {
		if task.Status == "completed" {
			completedCount++
		} else if task.Status == "in_progress" {
			inProgressCount++
		}
	}
	
	if completedCount == len(tasks) {
		return "completed"
	} else if inProgressCount > 0 || completedCount > 0 {
		return "in_progress"
	} else {
		return "pending"
	}
}

// Helper function to calculate KPI score based on task completion
func calculateKPIScore(tasks []models.Task) float64 {
	if len(tasks) == 0 {
		return 0.0
	}
	
	completedCount := 0
	for _, task := range tasks {
		if task.Status == "completed" {
			completedCount++
		}
	}
	
	return float64(completedCount) / float64(len(tasks)) * 100.0
}