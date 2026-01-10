-- Remove deprecated notification keys from preferences, slots, and texts

DELETE FROM ai_notification_text_usage
WHERE ai_text_id IN (
  SELECT id
  FROM ai_generated_notification_texts
  WHERE entity_key IN ('sleep', 'focus', 'focus_start')
);

DELETE FROM ai_generated_notification_texts
WHERE entity_key IN ('sleep', 'focus', 'focus_start');

DELETE FROM notification_slots
WHERE entity_key IN ('sleep', 'focus', 'focus_start');

DELETE FROM notification_preferences
WHERE entity_key IN ('sleep', 'focus', 'focus_start');

DELETE FROM notification_texts
WHERE entity_key IN ('sleep', 'focus', 'focus_start');

DELETE FROM notification_text_presets
WHERE entity_key IN ('sleep', 'focus', 'focus_start');
