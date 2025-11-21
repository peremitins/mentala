-- Миграция: Рефакторинг habitId/topicKey -> entityKey
-- Объединяем два поля в одно для упрощения кода

-- ============================================================================
-- ШАГ 1: Обновление notification_preferences
-- ============================================================================

-- Добавить новое поле
ALTER TABLE notification_preferences 
ADD COLUMN entity_key varchar(255);

-- Заполнить данными из старых полей
UPDATE notification_preferences 
SET entity_key = COALESCE(habit_id, topic_key)
WHERE habit_id IS NOT NULL OR topic_key IS NOT NULL;

-- Удалить старые поля
ALTER TABLE notification_preferences 
DROP COLUMN habit_id, 
DROP COLUMN topic_key;

-- ============================================================================
-- ШАГ 2: Обновление notification_slots
-- ============================================================================

-- Добавить новое поле
ALTER TABLE notification_slots 
ADD COLUMN entity_key varchar(255);

-- Заполнить данными из старых полей
UPDATE notification_slots 
SET entity_key = COALESCE(habit_id, topic_key)
WHERE habit_id IS NOT NULL OR topic_key IS NOT NULL;

-- Удалить старые поля
ALTER TABLE notification_slots 
DROP COLUMN habit_id, 
DROP COLUMN topic_key;

-- ============================================================================
-- ШАГ 3: Переименование entity_id в entity_key для консистентности
-- ============================================================================

-- Переименовать entity_id в entity_key для консистентности
ALTER TABLE ai_generated_notification_texts 
RENAME COLUMN entity_id TO entity_key;

-- ============================================================================
-- ЛОГИРОВАНИЕ (для проверки результатов)
-- ============================================================================

-- После выполнения миграции можно проверить:
-- SELECT COUNT(*) FROM notification_preferences WHERE entity_key IS NOT NULL;
-- SELECT COUNT(*) FROM notification_slots WHERE entity_key IS NOT NULL;
-- SELECT COUNT(*) FROM ai_generated_notification_texts WHERE entity_key IS NOT NULL;

