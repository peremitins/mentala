-- Миграция: Рефакторинг generationMode -> textSource
-- Убираем дублирование полей, оставляем только textSource

-- 1. Обновить notification_preferences.meta: generationMode -> textSource
-- manual -> templates, ai -> ai
UPDATE notification_preferences
SET meta = jsonb_set(
  COALESCE(meta, '{}'::jsonb) - 'generationMode',
  '{textSource}',
  CASE 
    WHEN meta->>'generationMode' = 'manual' THEN '"templates"'
    WHEN meta->>'generationMode' = 'ai' THEN '"ai"'
    ELSE COALESCE(meta->>'textSource', '"templates"')
  END::jsonb
)
WHERE meta IS NOT NULL;

-- 2. Переименовать колонку generation_mode -> text_source в ai_generated_notification_texts
ALTER TABLE ai_generated_notification_texts 
RENAME COLUMN generation_mode TO text_source;

-- 3. Очистка данных (опционально, если нужно начать с чистого листа)
-- Раскомментируйте, если нужно удалить все данные:
-- TRUNCATE TABLE notification_slots CASCADE;
-- TRUNCATE TABLE ai_generated_notification_texts CASCADE;
