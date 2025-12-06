BEGIN;

-- ============================================================================
-- Удаление таблиц notification_texts и notification_text_presets
-- Используется для пересоздания таблиц с нуля
-- ============================================================================

-- Удаляем индексы перед удалением таблиц (опционально, но для чистоты)
DROP INDEX IF EXISTS idx_notification_texts_lookup;
DROP INDEX IF EXISTS idx_notification_texts_filters;
DROP INDEX IF EXISTS idx_notification_texts_user;
DROP INDEX IF EXISTS idx_notification_texts_sort;

DROP INDEX IF EXISTS idx_notification_text_presets_lookup;

-- Удаляем таблицы
DROP TABLE IF EXISTS notification_texts CASCADE;
DROP TABLE IF EXISTS notification_text_presets CASCADE;

COMMIT;


