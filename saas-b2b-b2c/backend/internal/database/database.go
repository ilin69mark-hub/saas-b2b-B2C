package database

import (
	"fmt"
	"log"

	"github.com/spf13/viper"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func ConnectDB() (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		viper.GetString("db_host"),
		viper.GetString("db_user"),
		viper.GetString("db_password"),
		viper.GetString("db_name"),
		viper.GetString("db_port"),
	)

	var err error
	DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to connect database: %w", err)
	}

	log.Println("Database connected")

	if err := runMigrations(DB); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	log.Println("Database migrated")

	if err := SeedUsers(DB); err != nil {
		log.Printf("Warning: SeedUsers failed: %v", err)
	}

	return DB, nil
}

func runMigrations(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}

	migrations := []func(*gorm.DB) error{
		migrateUsers,
		migrateTenants,
		migrateSalons,
		migrateOrders,
		migrateTasks,
		migrateChecklists,
		migratePlans,
		migrateNotifications,
		migrateInvoices,
		migrateLeads,
		migrateLeadActivities,
		migrateChecklistTemplates,
		migrateChecklistTemplateItems,
		migrateAssignedChecklists,
		migrateChecklistResponses,
		migrateGoals,
		migrateReports,
		migrateManagerPlans,
		migrateNormalizePhones,
		migrateTerritoryDeviations,
		migrateTerritoryInteractions,
		migrateDealerExpenses,
		migrateUnitTemplates,
		migrateProductInventory,
	}

	for _, m := range migrations {
		if err := m(db); err != nil {
			return err
		}
	}

	_ = sqlDB
	return nil
}

func migrateUsers(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			email VARCHAR(255) NOT NULL,
			password_hash TEXT,
			role VARCHAR(50) NOT NULL,
			status VARCHAR(50) DEFAULT 'active',
			tenant_id UUID,
			salon_id UUID,
			managed_by UUID,
			first_name VARCHAR(255),
			last_name VARCHAR(255),
			phone VARCHAR(50),
			deleted_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error; err != nil {
		return err
	}
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS salon_id UUID`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS managed_by UUID`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS position VARCHAR(255)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS quote VARCHAR(255)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS user_status VARCHAR(50) DEFAULT 'online'`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS available_for_questions BOOLEAN DEFAULT true`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS achievements TEXT`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_email_visible BOOLEAN DEFAULT true`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_phone_visible BOOLEAN DEFAULT true`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_phone VARCHAR(50)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_telegram VARCHAR(100)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_whatsapp VARCHAR(50)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contacts_working_hours VARCHAR(100)`)
	db.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS territory VARCHAR(255)`)
	return nil
}

func migrateTenants(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS tenants (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			name VARCHAR(255) NOT NULL,
			status VARCHAR(50) DEFAULT 'active',
			plan_id UUID REFERENCES plans(id),
			legal_entity TEXT,
			inn VARCHAR(20),
			max_users INTEGER DEFAULT 10,
			paid_until TIMESTAMP,
			grace_period_days INTEGER DEFAULT 7,
			deleted_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error; err != nil {
		return err
	}
	// Удалить FK если есть проблемы
	db.Exec(`ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_id_fkey`)
	// Добавить колонки если таблица уже существует
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS legal_entity TEXT`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS inn VARCHAR(20)`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 10`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS paid_until TIMESTAMP`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 7`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
	db.Exec(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
	// Сделать plan_id nullable без constraint
	db.Exec(`ALTER TABLE tenants ALTER COLUMN plan_id DROP NOT NULL`)
	return nil
}

func migrateSalons(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS salons (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id UUID NOT NULL,
			name VARCHAR(255) NOT NULL,
			address TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateOrders(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS orders (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			tenant_id UUID,
			salon_id UUID,
			total DECIMAL(10,2) DEFAULT 0,
			status VARCHAR(50) DEFAULT 'pending',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateTasks(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS tasks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID,
			tenant_id UUID,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			status VARCHAR(50) DEFAULT 'pending',
			due_date TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error; err != nil {
		return err
	}
	for _, col := range []string{
		"ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to UUID",
		"ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by UUID",
		"ALTER TABLE tasks ADD COLUMN IF NOT EXISTS salon_id UUID",
		"ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
	} {
		if err := db.Exec(col).Error; err != nil {
			return err
		}
	}
	return nil
}

func migrateChecklists(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS checklists (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID,
			tenant_id UUID,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			status VARCHAR(50) DEFAULT 'pending',
			priority VARCHAR(50) DEFAULT 'normal',
			assigned_to UUID,
			start_date TIMESTAMP,
			end_date TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migratePlans(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS plans (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			owner_id UUID,
			name VARCHAR(255) NOT NULL,
			price DECIMAL(10,2) DEFAULT 0,
			max_salons INT DEFAULT 1,
			max_users INT DEFAULT 5,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateNotifications(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS notifications (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			type VARCHAR(50) DEFAULT 'info',
			title VARCHAR(255) NOT NULL,
			message TEXT,
			is_read BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateInvoices(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS invoices (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id UUID NOT NULL,
			amount DECIMAL(10,2) DEFAULT 0,
			status VARCHAR(50) DEFAULT 'pending',
			due_date TIMESTAMP,
			paid_at TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateLeads(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS leads (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			salon_id UUID,
			manager_id UUID,
			full_name VARCHAR(255) NOT NULL,
			phone VARCHAR(50),
			email VARCHAR(255),
			interest_product TEXT,
			budget DECIMAL(12,2),
			status VARCHAR(50) DEFAULT 'new',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateLeadActivities(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS lead_activities (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			lead_id UUID NOT NULL,
			user_id UUID,
			type VARCHAR(50) DEFAULT 'note',
			description TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateChecklistTemplates(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS checklist_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			tenant_id UUID,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateChecklistTemplateItems(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS checklist_template_items (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			template_id UUID NOT NULL,
			title VARCHAR(255) NOT NULL,
			description TEXT,
			order_num INT DEFAULT 0
		)
	`).Error
}

func migrateAssignedChecklists(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS assigned_checklists (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			template_id UUID,
			status VARCHAR(50) DEFAULT 'pending',
			start_date TIMESTAMP,
			end_date TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateChecklistResponses(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS checklist_responses (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			assigned_checklist_id UUID NOT NULL,
			item_id UUID NOT NULL,
			user_id UUID,
			is_completed BOOLEAN DEFAULT FALSE,
			response_text TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateGoals(db *gorm.DB) error {
	if err := db.Exec(`
		CREATE TABLE IF NOT EXISTS goals (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			assigner_id UUID,
			assignee_id UUID,
			role VARCHAR(50) NOT NULL,
			sales_plan NUMERIC(15,2) DEFAULT 0,
			sales_fact NUMERIC(15,2) DEFAULT 0,
			leads_plan INT DEFAULT 0,
			calls_plan INT DEFAULT 0,
			meetings_plan INT DEFAULT 0,
			period VARCHAR(20) DEFAULT 'month',
			status VARCHAR(20) DEFAULT 'active',
			start_date DATE,
			end_date DATE,
			target_date DATE,
			tenant_id UUID,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error; err != nil {
		return err
	}
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS sales_fact NUMERIC(15,2) DEFAULT 0`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS period VARCHAR(20) DEFAULT 'month'`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS start_date DATE`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS end_date DATE`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS tenant_id UUID`)
	db.Exec(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS assigner_id UUID`)
	db.Exec(`ALTER TABLE goals ALTER COLUMN assigner_id DROP NOT NULL`)
	return nil
}

func migrateReports(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS reports (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL,
			period VARCHAR(50),
			date VARCHAR(50),
			start_date VARCHAR(20),
			end_date VARCHAR(20),
			file_path TEXT,
			status VARCHAR(20) DEFAULT 'draft',
			blocks TEXT,
			comment TEXT,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateManagerPlans(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS manager_plans (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			manager_id UUID NOT NULL,
			month DATE NOT NULL,
			sales_plan NUMERIC(15,2) DEFAULT 0,
			target_dealers INT DEFAULT 0,
			target_red_dealers INT DEFAULT 0,
			target_sla INT DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(manager_id, month)
		)
	`).Error
}

// migrateNormalizePhones приводит существующие телефоны к каноническому
// формату +7XXXXXXXXXX. Идемпотентно: уже нормализованные строки пропускаются.
//
// Поддерживаемые варианты на входе:
//   8XXXXXXXXXX, 7XXXXXXXXXX, +7XXXXXXXXXX, +7(XXX)-XXX-XX-XX
//
// Применяется к колонкам: users.phone, users.contacts_phone, leads.phone.
func migrateNormalizePhones(db *gorm.DB) error {
	stmts := []string{
		`UPDATE users SET phone = '+7' || substring(regexp_replace(phone, '\D', '', 'g') FROM 2 FOR 10)
		 WHERE phone IS NOT NULL AND phone <> ''
		   AND regexp_replace(phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
		   AND phone !~ '^\+7\d{10}$'`,
		`UPDATE users SET contacts_phone = '+7' || substring(regexp_replace(contacts_phone, '\D', '', 'g') FROM 2 FOR 10)
		 WHERE contacts_phone IS NOT NULL AND contacts_phone <> ''
		   AND regexp_replace(contacts_phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
		   AND contacts_phone !~ '^\+7\d{10}$'`,
		`UPDATE leads SET phone = '+7' || substring(regexp_replace(phone, '\D', '', 'g') FROM 2 FOR 10)
		 WHERE phone IS NOT NULL AND phone <> ''
		   AND regexp_replace(phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
		   AND phone !~ '^\+7\d{10}$'`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			return fmt.Errorf("normalize phones: %w", err)
		}
	}
	return nil
}

func migrateTerritoryDeviations(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS territory_deviations (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			dealer_id UUID NOT NULL,
			period VARCHAR(20) NOT NULL,
			reason TEXT DEFAULT '',
			actions TEXT DEFAULT '',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(dealer_id, period)
		)
	`).Error
}

func migrateTerritoryInteractions(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS territory_interactions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			dealer_id UUID NOT NULL,
			type VARCHAR(50) NOT NULL,
			description TEXT DEFAULT '',
			result TEXT DEFAULT '',
			created_by UUID,
			date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateDealerExpenses(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS dealer_expenses (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			dealer_id UUID NOT NULL,
			period VARCHAR(7) NOT NULL,
			category VARCHAR(50) NOT NULL,
			amount NUMERIC(15,2) DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(dealer_id, period, category)
		)
	`).Error
}

func migrateUnitTemplates(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS unit_templates (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			dealer_id UUID NOT NULL,
			name VARCHAR(255) NOT NULL,
			category VARCHAR(50) NOT NULL DEFAULT 'other',
			input JSONB NOT NULL DEFAULT '{}',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func migrateProductInventory(db *gorm.DB) error {
	return db.Exec(`
		CREATE TABLE IF NOT EXISTS product_inventory (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			salon_id UUID NOT NULL,
			collection VARCHAR(255) NOT NULL,
			category VARCHAR(100) NOT NULL DEFAULT '',
			stock_warehouse INT NOT NULL DEFAULT 0,
			on_display INT NOT NULL DEFAULT 0,
			sold_period INT NOT NULL DEFAULT 0,
			turnover_days INT NOT NULL DEFAULT 0,
			total_stock_value DECIMAL(12,2) NOT NULL DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`).Error
}

func GetDB() *gorm.DB {
	return DB
}