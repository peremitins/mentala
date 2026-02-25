-- Удаляем legacy-данные уведомлений для удалённых шаблонных тем терапии
-- Ключи удалены из каталога: mood, grief, loneliness

DELETE FROM ai_notification_text_usage
WHERE ai_text_id IN (
  SELECT id
  FROM ai_generated_notification_texts
  WHERE kind = 'therapy'
    AND entity_key IN ('mood', 'grief', 'loneliness')
);

DELETE FROM ai_generated_notification_texts
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');

DELETE FROM notification_slots
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');

DELETE FROM notification_preferences
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');

DELETE FROM notification_image_rotation
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');

DELETE FROM notification_texts
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');

DELETE FROM notification_text_presets
WHERE kind = 'therapy'
  AND entity_key IN ('mood', 'grief', 'loneliness');
