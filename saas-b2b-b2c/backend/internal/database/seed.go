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
		"marketing_budgets", "user_logs", "benchmarks", "unit_templates",
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

	// 4b. Create promotions for each dealer
	log.Println("Creating promotions...")
	type promoDef struct {
		Name      string
		Condition string
		Min       int
		Max       int
		OffsetMonthsStart int  // months to add to now for start_date
		OffsetMonthsEnd   int  // months to add to now for end_date
		IsActive          bool
	}
	promoTemplates := []promoDef{
		// 3 active
		{"Летняя распродажа",       "При покупке дивана — кресло в подарок",        10, 25, -1, 1, true},
		{"Комплект со скидкой",     "Мебель + услуги дизайнера",                    15, 30, -2, 2, true},
		{"Акция выходного дня",     "Скидка 20% в субботу и воскресенье",           20, 20, -1, 1, true},
		// 2 upcoming (start in ~2 weeks)
		{"Сезонное предложение",    "Кухни со скидкой до 35%",                      20, 35, 0, 3, true},
		{"Новоселье",               "Скидка 10% при заказе от 200 000 ₽",           10, 15, 0, 3, true},
		// 2 past
		{"Счастливый час",          "Скидка 15% с 10 до 12 часов",                  15, 15, -4, -1, false},
		{"Счастливые часы",         "Скидка 20% на мягкую мебель",                  20, 25, -3, -1, false},
	}
	promoCount := 0
	now := time.Now()
	for _, d := range dealers {
		for _, t := range promoTemplates {
			startDate := time.Date(now.Year(), now.Month()+time.Month(t.OffsetMonthsStart), 1, 0, 0, 0, 0, now.Location())
			// upcoming: start in 2 weeks from now
			if t.OffsetMonthsStart == 0 {
				startDate = now.AddDate(0, 0, 14)
			}
			endDate := startDate.AddDate(0, t.OffsetMonthsEnd-t.OffsetMonthsStart, 0)
			db.Exec(`INSERT INTO promotions (id, tenant_id, dealer_id, name, condition, discount_min, discount_max, start_date, end_date, is_active)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				franchiser.TenantID, d.ID, t.Name, t.Condition, t.Min, t.Max, startDate, endDate, t.IsActive)
			promoCount++
		}
	}
	log.Printf("Promotions created: %d", promoCount)

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
	end := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)

	goalCount := 0
	for _, mgr := range managers {
		basePlan := 1500000.0 + rng.Float64()*1000000.0
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			plan := roundVal(basePlan * (0.8 + rng.Float64()*0.4))
			fact := roundVal(plan * (0.7 + rng.Float64()*0.4))
			dateStr := m.Format("2006-01-02")
			db.Exec(`INSERT INTO goals (id, assignee_id, role, sales_plan, sales_fact, target_date, status, period, tenant_id, assigner_id, target_conversion, target_extras_percent, max_bonus)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', 'month', $7, $8, 30, 15, 50000)`,
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
			db.Exec(`INSERT INTO goals (id, assignee_id, role, sales_plan, sales_fact, target_date, status, period, tenant_id, assigner_id, target_conversion, target_extras_percent, max_bonus)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', 'month', $7, $8, 30, 15, 50000)`,
				uuid.New().String(), d.ID, "dealer", plan, fact, dateStr, franchiser.TenantID, d.ManagerID)
			goalCount++
		}
	}
	// Goals for salon managers (from DB)
	var smUsers []struct {
		ID       string
		Email    string
	}
	db.Table("users").Where("role = 'salon_manager'").Select("id, email").Scan(&smUsers)
	for _, sm := range smUsers {
		basePlan := 500000.0 + rng.Float64()*300000.0
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			plan := roundVal(basePlan * (0.8 + rng.Float64()*0.4))
			fact := roundVal(plan * (0.7 + rng.Float64()*0.4))
			dateStr := m.Format("2006-01-02")
			db.Exec(`INSERT INTO goals (id, assignee_id, role, sales_plan, sales_fact, target_date, status, period, tenant_id, assigner_id, target_conversion, target_extras_percent, max_bonus)
				VALUES ($1, $2, $3, $4, $5, $6, 'active', 'month', $7, $8, 30, 15, 50000)`,
				uuid.New().String(), sm.ID, "salon_manager", plan, fact, dateStr, franchiser.TenantID, franchiser.ID)
			goalCount++
		}
	}
	log.Printf("Goals created: %d", goalCount)

	// 8. Create orders for each salon (Jan 2025 - current)
	orderProducts := []struct {
		collection string
		category   string
	}{
		{"Кухня «Модерн»", "Кухни"},
		{"Кухня «Классика»", "Кухни"},
		{"Кухня «Лофт»", "Кухни"},
		{"Диван «Комфорт»", "Мягкая"},
		{"Диван «Престиж»", "Мягкая"},
		{"Кресло «Эко»", "Мягкая"},
		{"Шкаф «Гармония»", "Корпусная"},
		{"Стенка «Практик»", "Корпусная"},
		{"Стол «Стиль»", "Корпусная"},
		{"Матрас «Ортопед»", "Матрасы"},
		{"Матрас «Релакс»", "Матрасы"},
		{"Матрас «Дуо»", "Матрасы"},
	}

	extraServices := []struct {
		collection string
		category   string
	}{
		{"Дизайн-проект", "Услуги"},
		{"Доставка и сборка", "Услуги"},
		{"Гардеробная система", "Допы"},
		{"Освещение для кухни", "Допы"},
		{"Фартук из скинали", "Допы"},
	}

	orderCount := 0
	for _, s := range salons {
		var smIDs []string
		db.Table("users").Where("salon_id = ? AND role = 'salon_manager'", s.ID).Select("id").Scan(&smIDs)
		if len(smIDs) == 0 {
			continue
		}

		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			numOrders := 8 + rng.Intn(5)
			for o := 0; o < numOrders; o++ {
				createdBy := smIDs[rng.Intn(len(smIDs))]
				price := roundVal(15000.0 + rng.Float64()*135000.0)
				day := 1 + rng.Intn(28)
				orderTime := time.Date(m.Year(), m.Month(), day, 10+rng.Intn(12), 0, 0, 0, time.UTC)

				isExtra := rng.Float32() < 0.15
				var prod struct{ collection, category string }
				if isExtra {
					prod = extraServices[rng.Intn(len(extraServices))]
					price = roundVal(3000.0 + rng.Float64()*27000.0)
				} else {
					prod = orderProducts[rng.Intn(len(orderProducts))]
				}

				db.Exec(`INSERT INTO orders (id, salon_id, created_by, status, total_price, description, is_extra, created_at, updated_at)
					VALUES ($1, $2, $3, 'paid', $4, $5, $6, $7, $7)`,
					uuid.New().String(), s.ID, createdBy, price, prod.collection, isExtra, orderTime)
				orderCount++
			}
		}
	}
	log.Printf("Orders created: %d", orderCount)

	// 8b. Create contracts for each salon (derived from sale-leads for prepayments/margin)
	log.Println("Seeding contracts...")
	contractCount := 0
	for _, s := range salons {
		var mgrIDs []string
		db.Table("users").Where("salon_id = ? AND role = 'salon_manager'", s.ID).Select("id").Scan(&mgrIDs)
		if len(mgrIDs) == 0 {
			continue
		}

		// Create 2-4 contracts per month per salon
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			numContracts := 2 + rng.Intn(3)
			for c := 0; c < numContracts; c++ {
				managerID := mgrIDs[rng.Intn(len(mgrIDs))]
				day := 1 + rng.Intn(28)
				contractTime := time.Date(m.Year(), m.Month(), day, 10+rng.Intn(12), 0, 0, 0, time.UTC)

				totalAmount := roundVal(50000.0 + rng.Float64()*200000.0)
				prepaidPercent := 20 + rng.Intn(60)
				prepaidAmount := roundVal(totalAmount * float64(prepaidPercent) / 100.0)
				margin := 20.0 + rng.Float64()*15.0
				remain := totalAmount - prepaidAmount

				paymentDate := contractTime.AddDate(0, 0, 14+rng.Intn(30))
				status := "paid"
				paymentStatus := "paid"
				if rng.Float32() < 0.3 {
					status = "pending"
					paymentStatus = "awaiting_payment"
				}

				db.Exec(`INSERT INTO contracts
					(id, salon_id, manager_id, client_name, client_phone,
					 total_amount, prepaid_amount, paid_amount, remain_amount, margin_percent,
					 status, payment_status, payment_date, products, created_at, updated_at)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)`,
					uuid.New().String(), s.ID, managerID,
					fmt.Sprintf("Клиент %s #%d", s.Name, c+1), "+7 (999) "+fmt.Sprintf("%03d-%02d-%02d", rng.Intn(999), rng.Intn(99), rng.Intn(99)),
					totalAmount, prepaidAmount, prepaidAmount, remain, margin,
					status, paymentStatus, paymentDate, "Мебель", contractTime)
				contractCount++
			}
		}
	}
	log.Printf("Contracts created: %d", contractCount)

	// 9. Create daily_goals for each dealer (daily granularity)
	dgCount := 0
	// Удаляем старые помесячные планы, чтобы не было дублей
	for _, d := range dealers {
		db.Exec(`DELETE FROM daily_goals WHERE user_id = $1`, d.ID)
	}
	for _, d := range dealers {
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			monthPlan := roundVal(300000.0 + rng.Float64()*500000.0)
			daysInMonth := time.Date(m.Year(), m.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
			workingDays := 0
			for day := 1; day <= daysInMonth; day++ {
				dow := time.Date(m.Year(), m.Month(), day, 0, 0, 0, 0, time.UTC).Weekday()
				if dow != time.Sunday && dow != time.Saturday {
					workingDays++
				}
			}
			if workingDays == 0 {
				workingDays = 22
			}
			dailyPlan := monthPlan / float64(workingDays)
			for day := 1; day <= daysInMonth; day++ {
				dow := time.Date(m.Year(), m.Month(), day, 0, 0, 0, 0, time.UTC).Weekday()
				if dow == time.Sunday || dow == time.Saturday {
					continue
				}
				variance := 0.7 + rng.Float64()*0.6
				dayPlan := roundVal(dailyPlan * variance)
				targetDate := time.Date(m.Year(), m.Month(), day, 0, 0, 0, 0, time.UTC)
				db.Exec(`INSERT INTO daily_goals (id, user_id, target_date, sales_plan, created_at, updated_at)
					VALUES ($1, $2, $3, $4, NOW(), NOW())`,
					uuid.New().String(), d.ID, targetDate, dayPlan)
				dgCount++
			}
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
					prod := orderProducts[(mi+o)%len(orderProducts)]

					db.Exec(`INSERT INTO orders (id, salon_id, created_by, status, total_price, description, created_at, updated_at)
						VALUES ($1, $2, $3, 'paid', $4, $5, $6, $6)`,
						uuid.New().String(), salonID, createdBy, orderPrice, prod.collection, orderTime)
				}
			}

			log.Printf("  %s %s: plan=%.0f fact=%.0f (ratio=%.2f)", mt.email, q.name, totalPlan, targetFact, q.ratio)
		}
	}

	// 11. Create leads for ALL months (Jan 2025 – current) for territory planfact / sales history
	log.Println("Creating leads for all months...")
	leadCount := 0
	currentMonthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	// Собираем менеджеров салонов, чтобы привязывать лиды к ним, а не к дилеру
	salonMgrIDs := make(map[string][]string)
	for _, s := range salons {
		var ids []string
		db.Table("users").Where("salon_id = ? AND role = 'salon_manager'", s.ID).Select("id").Scan(&ids)
		if len(ids) > 0 {
			salonMgrIDs[s.ID] = ids
		}
	}
	pickMgr := func(salonID, fallback string) string {
		ids := salonMgrIDs[salonID]
		if len(ids) == 0 {
			return fallback
		}
		return ids[rng.Intn(len(ids))]
	}

	for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
		monthStart := time.Date(m.Year(), m.Month(), 1, 0, 0, 0, 0, time.UTC)
		monthEnd := time.Date(m.Year(), m.Month()+1, 0, 23, 59, 59, 0, time.UTC)
		isCurrentMonth := monthStart.Equal(currentMonthStart)

		for _, s := range salons {
			// Sale-leads из заказов этого месяца
			var orders []struct {
				TotalPrice float64
				CreatedAt  time.Time
			}
			db.Table("orders").
				Where("salon_id = ? AND status = 'paid' AND created_at BETWEEN ? AND ?", s.ID, monthStart, monthEnd).
				Select("total_price, created_at").
				Scan(&orders)

		for i, o := range orders {
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'sale', $5, $5)`,
					s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Клиент %s #%d", s.Name, i+1), o.TotalPrice, o.CreatedAt, randomPhone(rng))
				leadCount++
			}

			// Для каждого месяца добавляем new-лиды, open-лиды и wait-лиды (для реалистичной конверсии)
			// Для текущего месяца — побольше, для прошлых — по 1-2
			var newLeadCount, openLeadCount, waitLeadCount int
			if isCurrentMonth {
				newLeadCount = 2 + rng.Intn(2)
				openLeadCount = 1 + rng.Intn(3)
				if now.Day() > 6 {
					waitLeadCount = 1 + rng.Intn(2)
				}
			} else {
				newLeadCount = rng.Intn(2)
				openLeadCount = rng.Intn(2)
				waitLeadCount = rng.Intn(2)
			}

			for i := 0; i < newLeadCount; i++ {
				day := 1 + rng.Intn(28)
				if isCurrentMonth && now.Day() > 1 {
					day = 1 + rng.Intn(now.Day())
				}
				createdAt := time.Date(m.Year(), m.Month(), day, 10, 0, 0, 0, time.UTC)
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'new', $5, $5)`,
					s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Новый лид %s", s.Name),
					roundVal(30000+rng.Float64()*70000), createdAt, randomPhone(rng))
				leadCount++
			}

			for i := 0; i < openLeadCount; i++ {
				status := "contact"
				if rng.Float32() < 0.5 {
					status = "meeting"
				}
				day := 1 + rng.Intn(28)
				if isCurrentMonth && now.Day() > 1 {
					day = 1 + rng.Intn(now.Day())
				}
				createdAt := time.Date(m.Year(), m.Month(), day, 11, 0, 0, 0, time.UTC)
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $7, $4, $5, $6, $6)`,
					s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Открытый лид %s", s.Name),
					roundVal(50000+rng.Float64()*100000), status, createdAt, randomPhone(rng))
				leadCount++
			}

			for i := 0; i < waitLeadCount; i++ {
				day := 1 + rng.Intn(28)
				if isCurrentMonth {
					day = 1 + rng.Intn(now.Day()-6)
				}
				createdAt := time.Date(m.Year(), m.Month(), day, 15, 0, 0, 0, time.UTC)
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'wait', $5, $5)`,
					s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Клиент %s (КП ожидание)", s.Name),
					roundVal(70000+rng.Float64()*200000), createdAt, randomPhone(rng))
				leadCount++
			}
		}
	}

	// Добавляем лиды за последние 7 дней, чтобы "Неделя" отличалась от "Месяц"
	oneWeekAgo := now.AddDate(0, 0, -7)
	for _, s := range salons {
		var weekLeadCount int64
		db.Table("leads").
			Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", s.ID, []string{"sale", "paid"}, oneWeekAgo, now).
			Count(&weekLeadCount)
		if weekLeadCount < 2 {
			needed := 2 - weekLeadCount
			for i := int64(0); i < needed; i++ {
				dayOffset := rng.Intn(7)
				createdAt := now.AddDate(0, 0, -dayOffset)
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'sale', $5, $5)`,
					s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Клиент %s (нед.)", s.Name),
					roundVal(50000+rng.Float64()*150000), createdAt, randomPhone(rng))
				leadCount++
			}
		}
	}

	// Гарантируем каждому салону sale-лиды на сегодня, вчера и 7 дней назад
	// для корректной работы виджета "Динамика" на дашборде
	for _, s := range salons {
		for _, d := range []struct {
			label string
			t     time.Time
		}{
			{"сегодня", now},
			{"вчера", now.AddDate(0, 0, -1)},
			{"7 дней назад", now.AddDate(0, 0, -7)},
		} {
			var count int64
			db.Table("leads").
				Where("salon_id = ? AND status = 'sale' AND DATE(created_at) = DATE(?)", s.ID, d.t).
				Count(&count)
			if count == 0 {
				db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
					VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'sale', $5, $5)`,
					s.ID, pickMgr(s.ID, s.DealerID),
					fmt.Sprintf("Клиент %s (%s)", s.Name, d.label),
					roundVal(50000+rng.Float64()*150000), d.t, randomPhone(rng))
				leadCount++
			}
		}
	}

	// Гарантируем каждому салону хотя бы 1 sale-лид в окне [currentMonthStart, now],
	// чтобы у всех дилеров был fact > 0 даже в начале месяца
	for _, s := range salons {
		var count int64
		db.Table("leads").
			Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", s.ID, []string{"sale", "paid"}, currentMonthStart, now).
			Count(&count)
		if count == 0 {
			db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $5, $4, 'sale', NOW(), NOW())`,
				s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Клиент %s", s.Name),
				roundVal(50000+rng.Float64()*100000), randomPhone(rng))
			leadCount++
		}
	}

	// Гарантируем каждому салону хотя бы 1 open-лид (contact/meeting) для debt
	for _, s := range salons {
		var count int64
		db.Table("leads").
			Where("salon_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", s.ID, []string{"contact", "meeting"}, currentMonthStart, now).
			Count(&count)
		if count == 0 {
			status := "contact"
			if rng.Float32() < 0.5 {
				status = "meeting"
			}
			db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, $5, NOW(), NOW())`,
				s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Открытый лид %s", s.Name),
				roundVal(50000+rng.Float64()*100000), status, randomPhone(rng))
			leadCount++
		}
	}

	// Гарантируем каждому салону хотя бы 1 wait-лид (КП без ответа >5 дней) для горячих сделок
	for _, s := range salons {
		var count int64
		db.Table("leads").
			Where("salon_id = ? AND status = ? AND updated_at < ?", s.ID, "wait", now.AddDate(0, 0, -5)).
			Count(&count)
		if count == 0 {
			createdAt := now.AddDate(0, 0, -8)
			db.Exec(`INSERT INTO leads (id, salon_id, manager_id, full_name, phone, budget, status, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $6, $4, 'wait', $5, $5)`,
				s.ID, pickMgr(s.ID, s.DealerID), fmt.Sprintf("Клиент %s (КП ожидание)", s.Name),
				roundVal(50000+rng.Float64()*200000), createdAt, randomPhone(rng))
			leadCount++
		}
	}

	log.Printf("Leads created: %d", leadCount)

	// Распределяем причины потери по зависшим лидам (>60 дней)
	db.Exec(`
		UPDATE leads SET
			interest_product = CASE ((EXTRACT(EPOCH FROM created_at)::int) % 12)
				WHEN 0 THEN 'Кухня «Классика»'
				WHEN 1 THEN 'Диван «Престиж»'
				WHEN 2 THEN 'Матрас «Ортопед»'
				WHEN 3 THEN 'Кухня «Лофт»'
				WHEN 4 THEN 'Шкаф «Гармония»'
				WHEN 5 THEN 'Стол «Стиль»'
				WHEN 6 THEN 'Диван «Комфорт»'
				WHEN 7 THEN 'Матрас «Дуо»'
				WHEN 8 THEN 'Кухня «Модерн»'
				WHEN 9 THEN 'Кресло «Эко»'
				WHEN 10 THEN 'Стенка «Практик»'
				WHEN 11 THEN 'Матрас «Релакс»'
			END,
			disqualify_reason = CASE
				WHEN RANDOM() < 0.30 THEN 'Нет в наличии'
				WHEN RANDOM() < 0.55 THEN 'Не устроила цена'
				WHEN RANDOM() < 0.75 THEN 'Долгий срок производства'
				WHEN RANDOM() < 0.90 THEN 'Не подошёл дизайн'
				ELSE 'Другое'
			END
		WHERE status NOT IN ('sale', 'paid')
			AND created_at < NOW() - INTERVAL '60 days'
			AND (disqualify_reason IS NULL OR disqualify_reason = '')
			AND (interest_product IS NULL OR interest_product = '')
	`)
	var lostUpdated int64
	db.Table("leads").Where("disqualify_reason IS NOT NULL AND disqualify_reason != ''").Count(&lostUpdated)
	log.Printf("Lost sales reasons assigned: %d", lostUpdated)

	// Заполняем interest_product для всех лидов (включая sale/paid) для Топ-10 товаров
	db.Exec(`
		UPDATE leads SET
			interest_product = CASE ((EXTRACT(EPOCH FROM created_at)::int) % 12)
				WHEN 0 THEN 'Кухня «Классика»'
				WHEN 1 THEN 'Диван «Престиж»'
				WHEN 2 THEN 'Матрас «Ортопед»'
				WHEN 3 THEN 'Кухня «Лофт»'
				WHEN 4 THEN 'Шкаф «Гармония»'
				WHEN 5 THEN 'Стол «Стиль»'
				WHEN 6 THEN 'Диван «Комфорт»'
				WHEN 7 THEN 'Матрас «Дуо»'
				WHEN 8 THEN 'Кухня «Модерн»'
				WHEN 9 THEN 'Кресло «Эко»'
				WHEN 10 THEN 'Стенка «Практик»'
				WHEN 11 THEN 'Матрас «Релакс»'
			END
		WHERE interest_product IS NULL OR interest_product = ''
	`)
	var interestUpdated int64
	db.Table("leads").Where("interest_product IS NOT NULL AND interest_product != ''").Count(&interestUpdated)
	log.Printf("Interest products assigned: %d", interestUpdated)

	// Создаём возвраты для каждого дилера (по 10 шт)
	log.Println("Creating dealer return requests...")
	db.Exec(`
		WITH numbered AS (
			SELECT u.id AS dealer_id, g AS idx,
				ROW_NUMBER() OVER (ORDER BY u.id, g) - 1 AS rn
			FROM users u
			CROSS JOIN generate_series(1, 10) g
			WHERE u.role = 'dealer'
				AND NOT EXISTS (SELECT 1 FROM dealer_requests dr WHERE dr.dealer_id = u.id AND dr.type = 'return' LIMIT 1)
		)
		INSERT INTO dealer_requests (id, dealer_id, type, description, amount, status, reason, created_at, updated_at)
		SELECT
			gen_random_uuid(),
			n.dealer_id,
			'return',
			(ARRAY['Кухня «Классика»','Диван «Престиж»','Матрас «Ортопед»','Кухня «Лофт»','Шкаф «Гармония»','Стол «Стиль»','Диван «Комфорт»','Матрас «Дуо»','Кухня «Модерн»','Кресло «Эко»','Стенка «Практик»','Матрас «Релакс»'])[1 + (n.rn % 12)],
			(RANDOM() * 150000 + 30000)::numeric(15,2),
			(ARRAY['approved','approved','approved','approved','pending','pending','pending','rejected','rejected'])[1 + (RANDOM() * 8)::int],
			CASE
				WHEN RANDOM() < 0.30 THEN 'Брак производства'
				WHEN RANDOM() < 0.55 THEN 'Повреждение при доставке'
				WHEN RANDOM() < 0.75 THEN 'Несоответствие заказу'
				WHEN RANDOM() < 0.90 THEN 'Гарантийный случай'
				ELSE 'Другое'
			END,
			NOW() - (RANDOM() * INTERVAL '180 days'),
			NOW() - (RANDOM() * INTERVAL '180 days')
		FROM numbered n
	`)
	var returnCount int64
	db.Table("dealer_requests").Where("type = 'return'").Count(&returnCount)
	log.Printf("Dealer return requests created: %d", returnCount)

	// 12. Create dealer_expenses for all months (Jan 2025 – current) for each dealer
	log.Println("Creating dealer expenses for all months...")
	expenseCount := 0
	expenseCategories := []string{"rent", "utilities", "payroll", "taxes", "logistics", "marketing", "defects", "other", "bonus"}

	type expenseRange struct {
		min float64
		max float64
	}
	expenseRanges := map[string]expenseRange{
		"rent":       {40000, 180000},
		"utilities":  {5000, 25000},
		"payroll":    {60000, 250000},
		"taxes":      {15000, 60000},
		"logistics":  {10000, 35000},
		"marketing":  {5000, 60000},
		"defects":    {0, 15000},
		"other":      {0, 20000},
		"bonus":      {0, 40000},
	}

	for _, d := range dealers {
		for m := start; m.Before(end); m = m.AddDate(0, 1, 0) {
			period := m.Format("2006-01")
			for _, cat := range expenseCategories {
				r := expenseRanges[cat]
				amount := roundVal(r.min + rng.Float64()*(r.max-r.min))
				if amount == 0 {
					continue
				}
			expenseDesc := cat
			if cat == "marketing" {
				expenseDescs := []string{
					"Реклама в соцсетях",
					"Печатные материалы",
					"Продвижение на сайте",
					"Сувенирная продукция",
					"Участие в выставке",
				}
				expenseDesc = expenseDescs[rng.Intn(len(expenseDescs))]
			}
			db.Exec(`INSERT INTO dealer_expenses (dealer_id, period, category, amount, description)
				VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
				d.ID, period, cat, amount, expenseDesc)
				expenseCount++
			}
		}
	}
	log.Printf("Dealer expenses created: %d", expenseCount)

	// 13. Create alerts for each dealer
	log.Println("Creating alerts for dealers...")
	alertCount := 0
	for _, d := range dealers {
		var dbPlan, dbFact, dbDebt float64
		db.Table("daily_goals").Where("user_id = ? AND target_date BETWEEN ? AND ?", d.ID, currentMonthStart, now).
			Select("COALESCE(SUM(sales_plan), 0)").Scan(&dbPlan)
		db.Table("leads").Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", d.ID, []string{"sale", "paid"}, currentMonthStart, now).
			Select("COALESCE(SUM(budget), 0)").Scan(&dbFact)
		db.Table("leads").Where("manager_id = ? AND status IN ? AND created_at BETWEEN ? AND ?", d.ID, []string{"contact", "meeting"}, currentMonthStart, now).
			Select("COALESCE(SUM(budget), 0)").Scan(&dbDebt)

		planPct := 0
		if dbPlan > 0 {
			planPct = int((dbFact / dbPlan) * 100)
		}

		if dbDebt > 50000 {
			db.Exec(`INSERT INTO alerts (tenant_id, user_id, category, priority, title, description, created_at)
				VALUES ($1, $2, 'debt', 'critical', 'Просрочка дебиторской задолженности', $3, NOW())`,
				franchiser.TenantID, d.ID,
				fmt.Sprintf("Сумма задолженности: %.0f ₽. Требуется немедленное внимание.", dbDebt))
			alertCount++
		}

		if planPct < 30 && dbPlan > 0 {
			db.Exec(`INSERT INTO alerts (tenant_id, user_id, category, priority, title, description, created_at)
				VALUES ($1, $2, 'plan', 'warning', 'Критическое отставание от плана', $3, NOW() - INTERVAL '6 hours')`,
				franchiser.TenantID, d.ID,
				fmt.Sprintf("Выполнение плана: %d%%. Текущий план: %.0f ₽, факт: %.0f ₽.", planPct, dbPlan, dbFact))
			alertCount++
		}

		if planPct < 50 {
			db.Exec(`INSERT INTO alerts (tenant_id, user_id, category, priority, title, description, created_at)
				VALUES ($1, $2, 'plan', 'warning', 'Выполнение плана ниже 50%%', $3, NOW() - INTERVAL '1 day')`,
				franchiser.TenantID, d.ID,
				fmt.Sprintf("План выполнен лишь на %d%%. Рекомендуется активизировать продажи.", planPct))
			alertCount++
		}

		db.Exec(`INSERT INTO alerts (tenant_id, user_id, category, priority, title, description, created_at)
			VALUES ($1, $2, 'info', 'info', 'Еженедельный отчёт готов', $3, NOW() - INTERVAL '2 days')`,
			franchiser.TenantID, d.ID,
			fmt.Sprintf("Отчёт за период %s – %s доступен в разделе аналитики.",
				currentMonthStart.Format("02.01"), now.Format("02.01.2006")))
		alertCount++
	}
	log.Printf("Alerts created: %d", alertCount)

	// 14. Create tasks for each dealer (recent + historical)
	log.Println("Creating tasks for dealers...")
	taskCount := 0
	taskTemplates := []struct {
		title       string
		status      string
		daysAgo     int
		dueDaysDiff int // due_date = created_at + dueDaysDiff дней
	}{
		{"Оформить витрину по новому планшету", "pending", 2, 7},
		{"Обновить ценники на коллекцию", "done", 30, -2},
		{"Провести обучение продавцов", "in_progress", 3, 14},
		{"Предоставить отчёт по остаткам", "overdue", 45, -10},
		{"Провести инвентаризацию склада", "pending", 1, 5},
		{"Подготовить отчёт по продажам за месяц", "done", 60, -5},
		{"Согласовать рекламный бюджет", "overdue", 90, -20},
		{"Сдать ежеквартальный отчёт", "overdue", 60, -15},
		{"Обновить фотографии товаров", "done", 15, -1},
		{"Утвердить план закупок", "done", 5, 2},
	}
	for _, d := range dealers {
		for _, tmpl := range taskTemplates {
			createdAt := now.AddDate(0, 0, -tmpl.daysAgo)
			dueDate := createdAt.AddDate(0, 0, tmpl.dueDaysDiff)
			db.Exec(`INSERT INTO tasks (id, assigned_to, created_by, title, status, due_date, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6)`,
				d.ID, d.ManagerID, tmpl.title, tmpl.status, dueDate, createdAt)
			taskCount++
		}
	}
	log.Printf("Tasks created: %d", taskCount)

	// 15. Seed dealer_tasks (brand → dealer tasks visible in communications tab)
	log.Println("Creating dealer_tasks...")
	dealerTaskCount := 0
	dealerTaskTemplates := []struct {
		title       string
		description string
		status      string
		priority    string
		daysAgo     int
		dueDaysDiff int
	}{
		{"Обновить каталог", "Разместить новые позиции из весенней коллекции", "new", "high", 0, 5},
		{"Сдать отчёт по продажам", "Подготовить сводку за прошлый месяц", "in_progress", "medium", 3, 7},
		{"Проверить остатки на складе", "Сверить остатки с учётной системой", "done", "medium", 10, -2},
		{"Утвердить рекламный бюджет", "Согласовать расходы на продвижение", "overdue", "high", 20, -5},
		{"Обновить витрину", "Обновить выкладку согласно планограмме", "new", "low", 1, 10},
	}
	for _, d := range dealers {
		for _, tmpl := range dealerTaskTemplates {
			createdAt := now.AddDate(0, 0, -tmpl.daysAgo)
			dueDate := createdAt.AddDate(0, 0, tmpl.dueDaysDiff)
			db.Exec(`INSERT INTO dealer_tasks (id, dealer_id, assigned_by, title, description, status, priority, due_date, created_at, updated_at)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $8)`,
				d.ID, d.ManagerID, tmpl.title, tmpl.description, tmpl.status, tmpl.priority, dueDate, createdAt)
			dealerTaskCount++
		}
	}
	log.Printf("Dealer tasks created: %d", dealerTaskCount)

	// 16. Seed territory_interactions for each dealer
	log.Println("Creating territory interactions...")
	interactionTypes := []string{"call", "meeting", "email", "task", "discount"}
	interactionDesc := []string{"Обсуждение плана продаж", "Проверка работы салона", "Направлен прайс-лист", "Согласование условий", "Консультация по ассортименту"}
	interactionResults := []string{"Договорились о встрече", "Замечания устранены", "Документы отправлены", "Скидка согласована", "Рекомендации даны"}
	intCount := 0
	for _, d := range dealers {
		for i := 0; i < 3; i++ {
			daysAgo := rng.Intn(60)
			createdAt := now.AddDate(0, 0, -daysAgo)
			ti := rng.Intn(len(interactionTypes))
			td := rng.Intn(len(interactionDesc))
			tr := rng.Intn(len(interactionResults))
			db.Exec(`INSERT INTO territory_interactions (id, dealer_id, type, description, result, created_by, created_at, date)
				VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6)`,
				d.ID, interactionTypes[ti], interactionDesc[td], interactionResults[tr], d.ManagerID, createdAt)
			intCount++
		}
	}
	log.Printf("Territory interactions created: %d", intCount)

	// 17. Seed product_inventory for each salon
	log.Println("Seeding product inventory...")
	invCount := 0
	for _, s := range salons {
		// 3-5 продуктов на салон
		numInv := 3 + rng.Intn(3)
		perm := rng.Perm(len(orderProducts))
		deficitAdded := false
		nonLiquidAdded := false
		for i := 0; i < numInv && i < len(perm); i++ {
			p := orderProducts[perm[i]]
			stockWH := 1 + rng.Intn(15)
			onDisp := 1 + rng.Intn(5)
			sold := 1 + rng.Intn(10)
			price := 15000.0 + rng.Float64()*135000.0
			turnover := 20 + rng.Intn(80)

			// Первый товар — дефицит (0 на складе, но был спрос)
			if !deficitAdded {
				stockWH = 0
				onDisp = 0
				sold = 3 + rng.Intn(5)
				turnover = 0
				deficitAdded = true
			}

			// Второй товар — не-ликвид (> 90 дней, нет продаж)
			if !nonLiquidAdded && i > 0 {
				stockWH = 10 + rng.Intn(10)
				onDisp = 2 + rng.Intn(3)
				sold = 0
				turnover = 95 + rng.Intn(30)
				nonLiquidAdded = true
			}

			totalVal := float64(stockWH+onDisp) * price
			db.Exec(`INSERT INTO product_inventory
				(id, salon_id, collection, category, stock_warehouse, on_display, sold_period, turnover_days, total_stock_value, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
				uuid.New().String(), s.ID, p.collection, p.category, stockWH, onDisp, sold, turnover, totalVal)
			invCount++
		}
	}
	log.Printf("Product inventory records created: %d", invCount)

	// 16. Create notifications for managers (unread)
	log.Println("Creating notifications...")
	notifCount := 0
	notifTemplates := []struct {
		title   string
		message string
		daysAgo int
	}{
		{"Новый отчёт", "Еженедельный отчёт по продажам готов", 1},
		{"Напоминание", "У дилера ИП Вектор просрочена задача", 3},
		{"Системное уведомление", "Обновление тарифов с 1 июля", 5},
	}
	for _, mgr := range managers {
		for _, tmpl := range notifTemplates {
			createdAt := now.AddDate(0, 0, -tmpl.daysAgo)
			db.Exec(`INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
				VALUES ($1, 'info', $2, $3, FALSE, $4)`,
				mgr.ID, tmpl.title, tmpl.message, createdAt)
			notifCount++
		}
	}

	// Демо-уведомления для дилеров
	dealerNotifTemplates := []struct {
		title   string
		message string
		daysAgo int
		alertType string
	}{
		{"Низкий остаток на складе", "Кухня «Модерн» — осталось 2 шт на складе", 0, "system"},
		{"Новый лид требует внимания", "Клиент Иванов А. запросил КП на диван", 1, "system"},
		{"Просрочена задача", "Инвентаризация склада просрочена на 3 дня", 2, "system"},
	}
	for _, d := range dealers {
		for _, tmpl := range dealerNotifTemplates {
			createdAt := now.AddDate(0, 0, -tmpl.daysAgo)
			data := fmt.Sprintf(`{"dealer_id":"%s"}`, d.ID)
			db.Exec(`INSERT INTO notifications (user_id, type, title, message, is_read, data, created_at)
				VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
				d.ID, tmpl.alertType, tmpl.title, tmpl.message, data, createdAt)
			notifCount++
		}
	}
	log.Printf("Notifications created: %d", notifCount)

	log.Println("=== Reset and Seed Data complete ===")
	return nil
}

func randomPhone(rng *rand.Rand) string {
	return "+7 (999) " + fmt.Sprintf("%03d-%02d-%02d", rng.Intn(999), rng.Intn(99), rng.Intn(99))
}

func roundVal(v float64) float64 {
	return float64(int(v*100)) / 100
}
