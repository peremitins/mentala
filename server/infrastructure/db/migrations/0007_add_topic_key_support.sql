-- ==========================================
-- Migration: Add topicKey support для unified notifications architecture
-- Version: 2.3 (Mentai Notifications v2)
-- Date: 2025-11-06
-- ==========================================

-- Добавляем topicKey в notification_preferences
ALTER TABLE notification_preferences
  ADD COLUMN topic_key VARCHAR(50);

-- Добавляем topicKey в notification_slots
ALTER TABLE notification_slots
  ADD COLUMN topic_key VARCHAR(50);

-- Добавляем meta для дополнительных параметров (techniques и т.д.)
ALTER TABLE notification_preferences
  ADD COLUMN meta JSONB;

-- ==========================================
-- Индексы для эффективных запросов
-- ==========================================

-- Для per-topic выборки
CREATE INDEX notification_preferences_topic_key_idx
  ON notification_preferences(topic_key)
  WHERE topic_key IS NOT NULL;

CREATE INDEX notification_slots_topic_key_idx
  ON notification_slots(topic_key)
  WHERE topic_key IS NOT NULL;

-- ==========================================
-- Уникальные индексы (гарантия целостности)
-- ==========================================

-- Для therapy с topicKey: (userId + kind + topicKey) уникальны
CREATE UNIQUE INDEX notification_preferences_user_therapy_topic
  ON notification_preferences(user_id, kind, topic_key)
  WHERE kind = 'therapy' AND topic_key IS NOT NULL;

-- Для therapy без topicKey: (userId + kind) уникальны (общий режим)
CREATE UNIQUE INDEX notification_preferences_user_therapy_general
  ON notification_preferences(user_id, kind)
  WHERE kind = 'therapy' AND topic_key IS NULL AND habit_id IS NULL;

-- Для habits: (userId + kind + habitId) уникальны
CREATE UNIQUE INDEX notification_preferences_user_habits
  ON notification_preferences(user_id, kind, habit_id)
  WHERE kind = 'habits' AND habit_id IS NOT NULL;

-- ==========================================
-- Комментарии для документации
-- ==========================================

COMMENT ON COLUMN notification_preferences.topic_key IS 'Support topic key (anxiety, stress, mood, etc.) для therapy notifications';
COMMENT ON COLUMN notification_slots.topic_key IS 'Support topic key для привязки слота к конкретной теме';
COMMENT ON COLUMN notification_preferences.meta IS 'Дополнительные параметры (techniques, goalType и т.д.) в формате JSONB';

