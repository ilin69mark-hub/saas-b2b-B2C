package middleware

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/spf13/viper"
)

// AuthMiddleware validates the JWT token in the Authorization header
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Authorization header required",
				"message": "Authorization header is missing",
			})
			c.Abort()
			return
		}

		// Extract token from header (format: "Bearer <token>")
		tokenString := ""
		if len(authHeader) >= 7 && strings.ToUpper(authHeader[0:6]) == "BEARER" {
			tokenString = authHeader[7:]
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Invalid authorization header format",
				"message": "Authorization header must be in the format 'Bearer <token>'",
			})
			c.Abort()
			return
		}

		// Parse and validate the token
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate signing method
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}

			// Return the secret key
			return []byte(viper.GetString("jwt_secret")), nil
		})

		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Invalid token",
				"message": "The provided token is invalid or expired",
			})
			c.Abort()
			return
		}

		// Extract claims if token is valid
		if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
			// Extract user information from claims
			userID, ok := claims["user_id"].(string)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error":   "Invalid token claims",
					"message": "Token does not contain valid user ID",
				})
				c.Abort()
				return
			}

			userEmail, ok := claims["email"].(string)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error":   "Invalid token claims",
					"message": "Token does not contain valid email",
				})
				c.Abort()
				return
			}

			userRole, ok := claims["role"].(string)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error":   "Invalid token claims",
					"message": "Token does not contain valid role",
				})
				c.Abort()
				return
			}

			tenantID, ok := claims["tenant_id"].(string)
			if !ok {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error":   "Invalid token claims",
					"message": "Token does not contain valid tenant ID",
				})
				c.Abort()
				return
			}

			// Set user info in context for use by handlers
			c.Set("userID", userID)
			c.Set("email", userEmail)
			c.Set("role", userRole)
			c.Set("tenantID", tenantID)
		} else {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Invalid token",
				"message": "The provided token could not be validated",
			})
			c.Abort()
			return
		}

		// Continue to the next handler
		c.Next()
	}
}

// RoleMiddleware checks if the user has the required role
func RoleMiddleware(requiredRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// First, ensure the user is authenticated
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Authentication required",
				"message": "User not authenticated",
			})
			c.Abort()
			return
		}

		// Check if the user has the required role
		if role.(string) != requiredRole {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "Insufficient permissions",
				"message": "User does not have the required role: " + requiredRole,
			})
			c.Abort()
			return
		}

		// Continue to the next handler
		c.Next()
	}
}

// TenantMiddleware ensures the user belongs to the correct tenant
func TenantMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Extract tenant ID from context (set by AuthMiddleware)
		tenantID, exists := c.Get("tenantID")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Tenant information missing",
				"message": "User does not belong to any tenant",
			})
			c.Abort()
			return
		}

		// You can add additional tenant validation logic here if needed
		// For example, checking if the tenant is active, etc.

		// Set tenant ID in context for use by handlers
		c.Set("tenantID", tenantID)

		// Continue to the next handler
		c.Next()
	}
}

// PermissionMiddleware checks if the user has the required permission
func PermissionMiddleware(permission string) gin.HandlerFunc {
	// This is a simplified version - in a real application you might want to
	// implement a more sophisticated permission system
	return func(c *gin.Context) {
		// Extract user role from context
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":   "Authentication required",
				"message": "User not authenticated",
			})
			c.Abort()
			return
		}

		// Simple role-based permissions mapping
		allowedRoles := getRolesForPermission(permission)
		currentRole := role.(string)

		isAllowed := false
		for _, allowedRole := range allowedRoles {
			if currentRole == allowedRole {
				isAllowed = true
				break
			}
		}

		if !isAllowed {
			c.JSON(http.StatusForbidden, gin.H{
				"error":   "Insufficient permissions",
				"message": "User does not have permission: " + permission,
			})
			c.Abort()
			return
		}

		// Continue to the next handler
		c.Next()
	}
}

// Helper function to define role-permission mapping
func getRolesForPermission(permission string) []string {
	switch permission {
	case "manage_checklists":
		return []string{"franchiser", "manager", "dealer"}
	case "view_all_dealers":
		return []string{"franchiser"}
	case "manage_tenant":
		return []string{"franchiser"}
	default:
		return []string{} // No roles have this permission by default
	}
}
