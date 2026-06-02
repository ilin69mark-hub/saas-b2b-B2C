package database

import (
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"franchise-saas-backend/internal/models"
)

func SeedUsers(db *gorm.DB) error {
	users := []struct {
		Email     string
		Password  string
		Role      string
		FirstName string
		LastName  string
	}{
		{Email: "admin@mail.ru", Password: "qwerty", Role: "super_admin", FirstName: "Super", LastName: "Admin"},
		{Email: "fr@mail.ru", Password: "qwerty", Role: "franchiser", FirstName: "Franchise", LastName: "Owner"},
		{Email: "manager1@1.ru", Password: "qwerty", Role: "franchiser_manager", FirstName: "Александр", LastName: "Петров"},
		{Email: "dealer1@1.ru", Password: "qwerty", Role: "dealer", FirstName: "Иван", LastName: "Смирнов"},
		{Email: "salon1@1.ru", Password: "qwerty", Role: "salon_manager", FirstName: "Екатерина", LastName: "Сидорова"},
	}

	for _, u := range users {
		var count int64
		db.Table("users").Where("email = ?", u.Email).Count(&count)
		if count > 0 {
			log.Printf("User %s already exists, skipping", u.Email)
			continue
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}

		if u.Role == "franchiser" {
			var tenantCount int64
			db.Table("tenants").Count(&tenantCount)
			tenantUUID := "00000000-0000-0000-0000-000000000001"
			db.Exec(`INSERT INTO tenants (id, name, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING`,
				tenantUUID, u.FirstName+" "+u.LastName)
			db.Exec(`INSERT INTO users (id, email, password_hash, role, tenant_id, first_name, last_name)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
				u.Email, string(hashed), u.Role, tenantUUID, u.FirstName, u.LastName)
		} else {
			db.Exec(`INSERT INTO users (id, email, password_hash, role, tenant_id, first_name, last_name)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
				u.Email, string(hashed), u.Role, "00000000-0000-0000-0000-000000000001", u.FirstName, u.LastName)
		}

		log.Printf("User created: %s (%s)", u.Email, u.Role)
	}

	return nil
}

func SeedChecklists(db *gorm.DB) error {
	checklists := []struct {
		Title       string
		Description string
		Role        string
	}{
		{"Проверить выкладку", "Проверить соответствие планограмме", "dealer"},
		{"Оформить витрину", "Оформить новую коллекцию", "dealer"},
		{"Проверить остатки", "Сверить остатки с базой", "salon_manager"},
		{"Отчёт по продажам", "Подготовить еженедельный отчёт", "dealer"},
	}

	for _, c := range checklists {
		var userID string
		db.Table("users").Where("role = ?", c.Role).Order("created_at").Limit(1).Select("id").Scan(&userID)
		if userID == "" {
			continue
		}

		db.Exec(`INSERT INTO checklists (id, assignee_id, title, description, status, created_at, updated_at)
			VALUES (gen_random_uuid(), $1, $2, $3, 'pending', NOW(), NOW())`,
			userID, c.Title, c.Description)
		log.Printf("Checklist created: %s", c.Title)
	}

	return nil
}

func SeedAlerts(db *gorm.DB) error {
	alerts := []struct {
		Category   string
		Priority   string
		Title      string
		Description string
	}{
		{Category: "plan", Priority: "critical", Title: "План выполнен на 65%", Description: "Дилер Москва: план 15М, факт 9.7М"},
		{Category: "funnel", Priority: "warning", Title: "Падение конверсии", Description: "Конверсия ниже нормы на 15%"},
		{Category: "activity", Priority: "warning", Title: "Неактивный дилер", Description: "Не входил в систему 5 дней"},
		{Category: "stock", Priority: "critical", Title: "Дефицит товара", Description: "Кровать Прима - 0 шт."},
	}

	for _, a := range alerts {
		var userID string
		db.Table("users").Where("role = ?", "franchiser_manager").Limit(1).Select("id").Scan(&userID)
		if userID == "" {
			continue
		}

		db.Exec(`INSERT INTO alerts (id, user_id, category, priority, title, description, status, created_at)
			VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'new', NOW())`,
			userID, a.Category, a.Priority, a.Title, a.Description)
		log.Printf("Alert created: %s", a.Title)
	}

	return nil
}

func ResetAndSeedData(db *gorm.DB) error {
	log.Println("=== Reset and Seed Data ===")

	var franchiser struct{ ID string; TenantID string }
	db.Table("users").Where("role = ?", "franchiser").Limit(1).Select("id, tenant_id").Scan(&franchiser)
	if franchiser.ID == "" {
		return fmt.Errorf("no franchiser found, run SeedUsers first")
	}
	log.Printf("Franchiser: %s, tenant: %s", franchiser.ID, franchiser.TenantID)

	log.Println("Clearing old data...")
	db.Exec("SET session_replication_role = 'replica'")
	tables := []string{
		"assigned_checklists", "checklist_responses", "checklist_template_items",
		"checklist_templates", "checklists", "alerts", "notifications",
		"messages", "schedule_events", "daily_goals", "orders", "goals",
		"task_reports", "tasks", "dealer_expenses", "dealer_requests",
		"dealer_tasks", "invoices", "lead_activities", "leads",
		"marketing_budgets", "user_logs", "benchmarks",
	}
	for _, t := range tables {
		db.Exec("DELETE FROM " + t)
	}
	db.Exec("UPDATE users SET salon_id = NULL, managed_by = NULL WHERE role NOT IN ('super_admin','franchiser')")
	db.Exec("DELETE FROM users WHERE role NOT IN ('super_admin','franchiser')")
	db.Exec("DELETE FROM salons")
	db.Exec("ALTER TABLE salons ADD COLUMN IF NOT EXISTS dealer_id UUID REFERENCES users(id)")
	db.Exec("SET session_replication_role = 'origin'")
	log.Println("Old data cleared")

	hash := func(pwd string) string {
		h, _ := bcrypt.GenerateFromPassword([]byte(pwd), bcrypt.DefaultCost)
		return string(h)
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	// 3. Create 3 managers
	type mgrInfo struct {
		ID    string
		Email string
		Name  string
	}
	var managers []mgrInfo

	managerEmails := []string{"man1@mail.ru", "man2@mail.ru", "man3@mail.ru"}
	managerFirstNames := []string{"Алексей", "Дмитрий", "Сергей"}
	managerLastNames := []string{"Соколов", "Кузнецов", "Морозов"}
	managerTerritories := []string{"Москва и МО", "Санкт-Петербург и СЗФО", "Татарстан и Поволжье"}

	for i := 0; i < 3; i++ {
		var exists int64
		db.Table("users").Where("email = ?", managerEmails[i]).Count(&exists)
		if exists > 0 {
			var row struct{ ID, FirstName, LastName string }
			db.Table("users").Where("email = ?", managerEmails[i]).Select("id, first_name, last_name").Scan(&row)
			managers = append(managers, mgrInfo{ID: row.ID, Email: managerEmails[i], Name: row.FirstName + " " + row.LastName})
			db.Model(&models.User{}).Where("email = ?", managerEmails[i]).Update("territory", managerTerritories[i])
			continue
		}

		var id string
		db.Raw("SELECT gen_random_uuid()").Scan(&id)
		db.Exec(`INSERT INTO users (id, email, password_hash, role, tenant_id, managed_by, first_name, last_name, territory, created_at, updated_at)
			VALUES ($1, $2, $3, 'franchiser_manager', $4, $5, $6, $7, $8, NOW(), NOW())`,
			id, managerEmails[i], hash("qwerty"), franchiser.TenantID, franchiser.ID, managerFirstNames[i], managerLastNames[i], managerTerritories[i])
		managers = append(managers, mgrInfo{ID: id, Email: managerEmails[i], Name: managerFirstNames[i] + " " + managerLastNames[i]})
		log.Printf("Manager created: %s (%s)", managerEmails[i], managerFirstNames[i]+" "+managerLastNames[i])
	}

	// 4. Create 9 dealers (3 per manager)
	type dealerInfo struct {
		ID        string
		Email     string
		Name      string
		ManagerID string
	}
	var dealers []dealerInfo

	dealerEmails := []string{
		"dealer1@mail.ru", "dealer2@mail.ru", "dealer3@mail.ru",
		"dealer4@mail.ru", "dealer5@mail.ru", "dealer6@mail.ru",
		"dealer7@mail.ru", "dealer8@mail.ru", "dealer9@mail.ru",
	}
	dealerNames := []string{
		"ООО «Авангард»", "ИП Вектор", "ТД «Престиж»",
		"ООО «Олимп»", "ИП Горизонт", "ТД «Люкс»",
		"ООО «Спектр»", "ИП Маяк", "ТД «Атлант»",
	}

	dealerIdx := 0
	spreadDates := []string{
		"2026-01-15 10:00:00", // dealer 1 — Q1
		"2026-02-14 10:00:00", // dealer 2 — Q1
		"2026-03-15 10:00:00", // dealer 3 — Q1
		"2026-04-01 10:00:00", // dealer 4 — Q2
		"2026-04-15 10:00:00", // dealer 5 — Q2
		"2026-05-01 10:00:00", // dealer 6 — Q2
		"2026-05-15 10:00:00", // dealer 7 — Q2
		"2026-06-01 10:00:00", // dealer 8 — Q2
		"2026-06-15 10:00:00", // dealer 9 — Q2
	}

	for mi, mgr := range managers {
		for j := 0; j < 3; j++ {
			email := dealerEmails[dealerIdx]
			dName := dealerNames[dealerIdx]
			createdAt := spreadDates[dealerIdx]

			var exists int64
			db.Table("users").Where("email = ?", email).Count(&exists)
			if exists > 0 {
				var row struct{ ID, FirstName string }
				db.Table("users").Where("email = ?", email).Select("id, first_name").Scan(&row)
				dealers = append(dealers, dealerInfo{ID: row.ID, Email: email, Name: dName, ManagerID: mgr.ID})
				// Обновляем created_at у существующего
				db.Exec("UPDATE users SET created_at = $1 WHERE email = $2", createdAt, email)
				dealerIdx++
				continue
			}

			var id string
			db.Raw("SELECT gen_random_uuid()").Scan(&id)
			db.Exec(`INSERT INTO users (id, email, password_hash, role, tenant_id, managed_by, first_name, created_at, updated_at)
				VALUES ($1, $2, $3, 'dealer', $4, $5, $6, $7, $7)`,
				id, email, hash("qwerty"), franchiser.TenantID, mgr.ID, dName, createdAt)
			dealers = append(dealers, dealerInfo{ID: id, Email: email, Name: dName, ManagerID: mgr.ID})
			log.Printf("Dealer %d created: %s (%s) under manager %d", dealerIdx+1, email, dName, mi+1)
			dealerIdx++
		}
	}

	// 5. Create 9 salons (1 per dealer)
	type salonInfo struct {
		ID       string
		Name     string
		DealerID string
	}
	var salons []salonInfo

	salonNames := []string{
		"Салон «Авангард»", "Салон «Вектор»", "Салон «Престиж»",
		"Салон «Олимп»", "Салон «Горизонт»", "Салон «Люкс»",
		"Салон «Спектр»", "Салон «Маяк»", "Салон «Атлант»",
	}

	for i, d := range dealers {
		var id string
		db.Raw("SELECT gen_random_uuid()").Scan(&id)
		db.Exec(`INSERT INTO salons (id, tenant_id, name, address, dealer_id, created_at)
			VALUES ($1, $2, $3, $4, $5, NOW())`,
			id, franchiser.TenantID, salonNames[i], "г. Москва, ул. Примерная, д. "+fmt.Sprintf("%d", i+1), d.ID)
		salons = append(salons, salonInfo{ID: id, Name: salonNames[i], DealerID: d.ID})
		log.Printf("Salon created: %s for %s", salonNames[i], d.Name)

		db.Exec("UPDATE users SET salon_id = $1 WHERE id = $2", id, d.ID)
	}

	// 6. Create 18 salon managers (2 per salon)
	smFirstNames := []string{"Екатерина", "Анна", "Ольга", "Татьяна", "Наталья", "Марина",
		"Ирина", "Светлана", "Юлия", "Кристина", "Анастасия", "Елена",
		"Дарья", "Полина", "Виктория", "Ксения", "Людмила", "Галина"}
	smLastNames := []string{"Иванова", "Петрова", "Сидорова", "Смирнова", "Козлова", "Морозова",
		"Волкова", "Новикова", "Белова", "Павлова", "Фёдорова", "Алексеева",
		"Степанова", "Николаева", "Орлова", "Михайлова", "Зайцева", "Борисова"}

	smCounter := 1
	for si, s := range salons {
		for j := 0; j < 2; j++ {
			email := fmt.Sprintf("msalon%d@mail.ru", smCounter)

			var exists int64
			db.Table("users").Where("email = ?", email).Count(&exists)
			if exists > 0 {
				smCounter++
				continue
			}

			first := smFirstNames[si*2+j]
			last := smLastNames[si*2+j]

			var id string
			db.Raw("SELECT gen_random_uuid()").Scan(&id)
			db.Exec(`INSERT INTO users (id, email, password_hash, role, tenant_id, salon_id, managed_by, first_name, last_name, created_at, updated_at)
				VALUES ($1, $2, $3, 'salon_manager', $4, $5, $6, $7, $8, NOW(), NOW())`,
				id, email, hash("qwerty"), franchiser.TenantID, s.ID, s.DealerID, first, last)
			log.Printf("Salon manager created: %s (%s %s) at %s", email, first, last, s.Name)
			smCounter++
		}
	}

	// 7. Create goals for managers and dealers (Jan 2025 - May 2026)
	start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	now := time.Now()
	end := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)

	goalCount := 0
	for _, mgr := range managers {
		basePlan := 1500000.0 + rng.Float64()*1000000.0
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			plan := roundVal(basePlan * (0.8 + rng.Float64()*0.4))
			fact := roundVal(plan * (0.7 + rng.Float64()*0.4))
			dateStr := m.Format("2006-01-02")
			db.Exec(`INSERT INTO goals (id, assignee_id, role, sales_plan, sales_fact, target_date, status, period, tenant_id, assigner_id)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', 'month', $7, $8)`,
				uuid.New().String(), mgr.ID, "franchiser_manager", plan, fact, dateStr, franchiser.TenantID, franchiser.ID)
			goalCount++
		}
	}

	for _, d := range dealers {
		basePlan := 300000.0 + rng.Float64()*500000.0
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			plan := roundVal(basePlan * (0.8 + rng.Float64()*0.4))
			fact := roundVal(plan * (0.7 + rng.Float64()*0.4))
			dateStr := m.Format("2006-01-02")
			db.Exec(`INSERT INTO goals (id, assignee_id, role, sales_plan, sales_fact, target_date, status, period, tenant_id, assigner_id)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', 'month', $7, $8)`,
				uuid.New().String(), d.ID, "dealer", plan, fact, dateStr, franchiser.TenantID, d.ManagerID)
			goalCount++
		}
	}
	log.Printf("Goals created: %d", goalCount)

	// 8. Create orders for each salon (a few per month, Jan 2025 - current)
	orderCount := 0
	for _, s := range salons {
		var smIDs []string
		db.Table("users").Where("salon_id = ? AND role = 'salon_manager'", s.ID).Select("id").Scan(&smIDs)
		if len(smIDs) == 0 {
			continue
		}

		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			numOrders := 3 + rng.Intn(3)
			for o := 0; o < numOrders; o++ {
				createdBy := smIDs[rng.Intn(len(smIDs))]
				price := roundVal(5000.0 + rng.Float64()*145000.0)
				day := 1 + rng.Intn(28)
				orderTime := time.Date(m.Year(), m.Month(), day, 10+rng.Intn(12), 0, 0, 0, time.UTC)

				descriptions := []string{
					"Продажа мебели",
					"Консультация и заказ",
					"Покупка аксессуаров",
					"Оформление договора",
					"Заказ по каталогу",
				}
				desc := descriptions[rng.Intn(len(descriptions))]

				db.Exec(`INSERT INTO orders (id, salon_id, created_by, status, total_price, description, created_at, updated_at)
					VALUES ($1, $2, $3, 'paid', $4, $5, $6, $6)`,
					uuid.New().String(), s.ID, createdBy, price, desc, orderTime)
				orderCount++
			}
		}
	}
	log.Printf("Orders created: %d", orderCount)

	// 9. Create daily_goals for each dealer (aggregate monthly)
	dgCount := 0
	for _, d := range dealers {
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			monthPlan := roundVal(300000.0 + rng.Float64()*500000.0)
			db.Exec(`INSERT INTO daily_goals (id, user_id, target_date, sales_plan, created_at, updated_at)
				VALUES ($1, $2, $3, $4, NOW(), NOW())`,
				uuid.New().String(), d.ID, m.Format("2006-01-02"), monthPlan)
			dgCount++
		}
	}
	log.Printf("Daily goals created: %d", dgCount)

	// 10. Deterministic migration demo data — затираем случайные заказы для 3 дилеров
	log.Println("Adding deterministic migration demo data...")

	type migTarget struct {
		email       string
		q1Ratio     float64
		q2Ratio     float32
		description string
	}

	migrationTargets := []migTarget{
		{"dealer1@mail.ru", 0.70, 0.70, "контроль — C→C"},
		{"dealer4@mail.ru", 0.30, 1.00, "Олимп — D→A (улучшение)"},
		{"dealer7@mail.ru", 1.00, 0.30, "Спектр — A→D (ухудшение)"},
	}

	for _, mt := range migrationTargets {
		var dealerID string
		db.Table("users").Where("email = ?", mt.email).Select("id").Scan(&dealerID)
		if dealerID == "" {
			continue
		}

		var salonID string
		db.Table("salons").Where("dealer_id = ?", dealerID).Select("id").Scan(&salonID)
		if salonID == "" {
			continue
		}

		var smIDs []string
		db.Table("users").Where("salon_id = ? AND role = 'salon_manager'", salonID).Select("id").Scan(&smIDs)
		if len(smIDs) == 0 {
			continue
		}
		createdBy := smIDs[0]

		// Delete all existing orders for Q1+Q2 2026 for this salon
		db.Exec("DELETE FROM orders WHERE salon_id = $1 AND created_at >= '2026-01-01' AND created_at < '2026-07-01'", salonID)

		type quarterInfo struct {
			name  string
			start string
			end   string
			ratio float64
		}

		quarters := []quarterInfo{
			{"Q1", "2026-01-01", "2026-03-31", mt.q1Ratio},
			{"Q2", "2026-04-01", "2026-06-30", float64(mt.q2Ratio)},
		}

		for _, q := range quarters {
			var totalPlan float64
			db.Table("daily_goals").
				Where("user_id = ? AND target_date >= ? AND target_date <= ?", dealerID, q.start, q.end).
				Select("COALESCE(SUM(sales_plan), 0)").Scan(&totalPlan)

			if totalPlan == 0 {
				continue
			}

			targetFact := totalPlan * q.ratio
			numMonths := 3
			for mi := 0; mi < numMonths; mi++ {
				var monthStart time.Time
				if q.name == "Q1" {
					monthStart = time.Date(2026, time.January+time.Month(mi), 1, 0, 0, 0, 0, time.UTC)
				} else {
					monthStart = time.Date(2026, time.April+time.Month(mi), 1, 0, 0, 0, 0, time.UTC)
				}

				numOrders := 3
				for o := 0; o < numOrders; o++ {
					orderPrice := roundVal(targetFact / float64(numMonths*numOrders))
					day := 10 + o*5
					orderTime := time.Date(monthStart.Year(), monthStart.Month(), day, 12, 0, 0, 0, time.UTC)

					db.Exec(`INSERT INTO orders (id, salon_id, created_by, status, total_price, description, created_at, updated_at)
						VALUES ($1, $2, $3, 'paid', $4, $5, $6, $6)`,
						uuid.New().String(), salonID, createdBy, orderPrice, "Детерминированный заказ", orderTime)
				}
			}

			log.Printf("  %s %s: plan=%.0f fact=%.0f (ratio=%.2f)", mt.email, q.name, totalPlan, targetFact, q.ratio)
		}
	}

	log.Println("=== Reset and Seed Data complete ===")
	return nil
}

func roundVal(v float64) float64 {
	return float64(int(v*100)) / 100
}
