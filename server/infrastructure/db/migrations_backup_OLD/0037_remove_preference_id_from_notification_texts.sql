-- Миграция: Удаление колонки preference_id из таблицы notification_texts
-- Тексты уведомлений больше не связаны с notification_preferences напрямую
-- Они существуют независимо и идентифицируются по userId, kind, entityKey

BEGIN;

-- Удаляем колонку preference_id из таблицы notification_texts
ALTER TABLE notification_texts 
DROP COLUMN IF EXISTS preference_id;

COMMIT;

