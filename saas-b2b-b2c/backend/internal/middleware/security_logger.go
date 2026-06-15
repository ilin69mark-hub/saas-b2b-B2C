package middleware

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"franchise-saas-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ipTracker struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var (
	securityTracker = &ipTracker{hits: make(map[string][]time.Time)}
	securityOnce    sync.Once
)

func (t *ipTracker) Check(ip string, window time.Duration, threshold int) bool {
	t.mu.Lock()
	defer t.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-window)

	var recent []time.Time
	for _, ts := range t.hits[ip] {
		if ts.After(cutoff) {
			recent = append(recent, ts)
		}
	}

	recent = append(recent, now)
	t.hits[ip] = recent

	return len(recent) >= threshold
}

func (t *ipTracker) Cleanup(interval time.Duration) {
	for {
		time.Sleep(interval)
		t.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for ip, times := range t.hits {
			var recent []time.Time
			for _, ts := range times {
				if ts.After(cutoff) {
					recent = append(recent, ts)
				}
			}
			if len(recent) == 0 {
				delete(t.hits, ip)
			} else {
				t.hits[ip] = recent
			}
		}
		t.mu.Unlock()
	}
}

func SecurityLogger(db *gorm.DB) gin.HandlerFunc {
	securityOnce.Do(func() {
		go securityTracker.Cleanup(5 * time.Minute)
	})

	return func(c *gin.Context) {
		c.Next()

		status := c.Writer.Status()
		if status < 400 {
			return
		}

		path := c.Request.URL.Path
		ip := c.ClientIP()
		method := c.Request.Method
		userAgent := c.Request.UserAgent()

		if strings.Contains(path, "/health") || strings.Contains(path, "/static") {
			return
		}

		var action, entityType, details string
		tenantID := uuid.Nil

		if tid, exists := c.Get("tenantId"); exists {
			switch v := tid.(type) {
			case string:
				if parsed, err := uuid.Parse(v); err == nil {
					tenantID = parsed
				}
			case uuid.UUID:
				tenantID = v
			}
		}
		if tenantID == uuid.Nil {
			if tid, exists := c.Get("tenant_id"); exists {
				switch v := tid.(type) {
				case string:
					if parsed, err := uuid.Parse(v); err == nil {
						tenantID = parsed
					}
				case uuid.UUID:
					tenantID = v
				}
			}
		}

		switch {
		case status == 401 && strings.Contains(path, "/auth/login"):
			action = "failed_login"
			entityType = "auth"
			details = fmt.Sprintf("401 | %s %s | %s", method, path, userAgent)
		case status == 403:
			action = "unauthorized_access"
			entityType = "api"
			details = fmt.Sprintf("403 | %s %s | %s", method, path, userAgent)
		case status == 429:
			action = "mass_requests"
			entityType = "api"
			details = fmt.Sprintf("429 | %s %s | %s", method, path, userAgent)
		default:
			if status >= 400 && securityTracker.Check(ip, 5*time.Minute, 5) {
				action = "unusual_ip"
				entityType = "api"
				details = fmt.Sprintf("%d | %s %s | %s", status, method, path, userAgent)
			}
		}

		if action == "" {
			return
		}

		logEntry := models.AuditLog{
			ID: uuid.New(),
			TenantID: tenantID,
			Action: action,
			EntityType: entityType,
			EntityID: path,
			Details: details,
			IPAddress: ip,
			CreatedAt: time.Now(),
		}

		if err := db.Create(&logEntry).Error; err != nil {
			log.Printf("SecurityLogger error: %v", err)
		}
	}
}
