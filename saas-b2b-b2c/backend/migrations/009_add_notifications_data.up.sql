-- Migration: 009_add_notifications_data
-- Добавляет колонку data в notifications для хранения JSON-метаданных (link, lead_id и т.д.)

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data TEXT DEFAULT '';
