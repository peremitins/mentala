-- Миграция training → steps (объединение в канонический ключ habitsCatalog)
-- См. .docs/training-steps-analysis.md

-- 1. notification_preferences: удалить дубликаты — у пользователей с обоими (steps и training) удаляем training
DELETE FROM notification_preferences np_t
WHERE np_t.kind = 'habits'
  AND np_t.entity_key = 'training'
  AND EXISTS (
    SELECT 1 FROM notification_preferences np_s
    WHERE np_s.user_id = np_t.user_id
      AND np_s.kind = 'habits'
      AND np_s.entity_key = 'steps'
  );

-- 2. Остальные training → steps в notification_preferences
UPDATE notification_preferences
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';

-- 3. habits
UPDATE habits
SET habit_key = 'steps'
WHERE habit_key = 'training';

-- 4. notification_slots
UPDATE notification_slots
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';

-- 5. notification_text_presets
UPDATE notification_text_presets
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';

-- 6. notification_texts
UPDATE notification_texts
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';

-- 7. notification_interactions (metric хранит habit/topic key)
UPDATE notification_interactions
SET metric = 'steps'
WHERE metric = 'training';

-- 8. ai_generated_notification_texts
UPDATE ai_generated_notification_texts
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';

-- 9. notification_image_rotation
UPDATE notification_image_rotation
SET entity_key = 'steps'
WHERE kind = 'habits' AND entity_key = 'training';
