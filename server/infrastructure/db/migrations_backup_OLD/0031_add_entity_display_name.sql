BEGIN;

-- Добавляем поле entity_display_name в таблицу ai_generated_notification_texts
-- Это поле хранит читаемое название сущности (для удобства разработчиков, не участвует в логике)
ALTER TABLE ai_generated_notification_texts
ADD COLUMN IF NOT EXISTS entity_display_name VARCHAR(255);

-- Добавляем поле entity_display_name в таблицу notification_slots
-- Это поле хранит читаемое название сущности (для удобства разработчиков, не участвует в логике)
ALTER TABLE notification_slots
ADD COLUMN IF NOT EXISTS entity_display_name VARCHAR(255);

COMMIT;

