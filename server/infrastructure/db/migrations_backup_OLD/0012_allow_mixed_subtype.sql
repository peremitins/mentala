-- ==========================================
-- Migration: Allow mixed subtype in notification preferences
-- Version: 0.4
-- Date: 2025-11-14
-- ==========================================
-- Цель: расширить ограничение CHECK для notification_preferences.subtype,
--       чтобы поддерживать значение 'mixed' (используется как дефолт для habits).
-- ==========================================

ALTER TABLE notification_preferences
  DROP CONSTRAINT IF EXISTS notification_prefs_subtype_check;

ALTER TABLE notification_preferences
  ADD CONSTRAINT notification_prefs_subtype_check
  CHECK (
    subtype IS NULL
    OR subtype IN ('reminder', 'informational', 'motivational', 'mixed')
  );

COMMENT ON COLUMN notification_preferences.subtype IS
  'Тип уведомления: reminder (напоминание), informational (информационное), motivational (мотивационное), mixed (случайный выбор из трёх)';

