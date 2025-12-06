-- Миграция для очистки таблиц уведомлений
-- Очищает таблицы уведомлений и AI-текстов для перехода на новую схему:
-- entityKey для кастомных сущностей = ID
-- entityKey для шаблонных сущностей = ключ шаблона

BEGIN;

-- Очищаем использование AI-текстов (связанная таблица)
DELETE FROM ai_notification_text_usage;

-- Очищаем слоты уведомлений
DELETE FROM notification_slots;

-- Очищаем настройки уведомлений
DELETE FROM notification_preferences;

-- Очищаем AI-тексты для уведомлений
DELETE FROM ai_generated_notification_texts;

COMMIT;

