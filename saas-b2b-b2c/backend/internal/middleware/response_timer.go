package middleware

import (
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

var (
	mu             sync.RWMutex
	responseTimes  []float64
	totalRequests  int64
	successReqs    int64
	maxBuffer      = 1000
	serverStartAt  = time.Now()
)

func ResponseTimer() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		duration := time.Since(start).Seconds() * 1000

		mu.Lock()
		totalRequests++
		if c.Writer.Status() < 500 {
			successReqs++
		}
		responseTimes = append(responseTimes, duration)
		if len(responseTimes) > maxBuffer {
			responseTimes = responseTimes[len(responseTimes)-maxBuffer:]
		}
		mu.Unlock()
	}
}

type HealthStats struct {
	AvgResponseTime float64
	P95ResponseTime float64
	P99ResponseTime float64
	Uptime          float64
	ActiveWebsockets int64
}

func GetHealthStats() HealthStats {
	mu.RLock()
	defer mu.RUnlock()

	n := len(responseTimes)
	if n == 0 {
		return HealthStats{
			AvgResponseTime:  0,
			P95ResponseTime:  0,
			P99ResponseTime:  0,
			Uptime:           100,
			ActiveWebsockets: 0,
		}
	}

	sorted := make([]float64, n)
	copy(sorted, responseTimes)
	sort.Float64s(sorted)

	var sum float64
	for _, v := range sorted {
		sum += v
	}
	avg := sum / float64(n)

	idx95 := int(float64(n) * 0.95)
	if idx95 >= n {
		idx95 = n - 1
	}
	idx99 := int(float64(n) * 0.99)
	if idx99 >= n {
		idx99 = n - 1
	}

	uptime := 100.0
	if totalRequests > 0 {
		uptime = float64(successReqs) / float64(totalRequests) * 100
	}

	return HealthStats{
		AvgResponseTime:  mathRound(avg, 1),
		P95ResponseTime:  mathRound(sorted[idx95], 1),
		P99ResponseTime:  mathRound(sorted[idx99], 1),
		Uptime:           mathRound(uptime, 2),
		ActiveWebsockets: 0,
	}
}

func mathRound(val float64, decimals int) float64 {
	pow := 1.0
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	return float64(int(val*pow+0.5)) / pow
}
