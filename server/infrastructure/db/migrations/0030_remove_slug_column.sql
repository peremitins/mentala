-- Миграция для удаления колонки slug из таблиц habits и therapy_topics_custom
-- Колонка slug больше не используется в приложении

BEGIN;

-- Удаляем индексы, связанные со slug (если они существуют)
DROP INDEX IF EXISTS idx_habits_user_slug;
DROP INDEX IF EXISTS idx_therapy_custom_user_slug;

-- Удаляем колонку slug из таблицы habits
ALTER TABLE habits DROP COLUMN IF EXISTS slug;

-- Удаляем колонку slug из таблицы therapy_topics_custom
ALTER TABLE therapy_topics_custom DROP COLUMN IF EXISTS slug;

COMMIT;

