-- ==========================================
-- Migration: Restructure habits system
-- Version: 0.3 (Mentala Notifications v3)
-- Date: 2025-11-07
-- ==========================================
-- Описание: Реструктуризация системы привычек
-- - Заменяем category на intent (build | quit | custom)
-- - Добавляем habit_key для маппинга на шаблоны
-- - Добавляем subtype в notification_preferences (reminder | informational | motivational)
-- ==========================================

-- ==========================================
-- 1. Таблица habits: category -> intent, добавляем habit_key
-- ==========================================

-- Переименовываем category в intent (если колонка category существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'habits'
      AND column_name = 'category'
  ) THEN
    ALTER TABLE habits RENAME COLUMN category TO intent;
  END IF;
END
$$;

-- Обновляем значения: 'quit' -> 'quit', остальные -> 'build'
-- (только если колонка intent существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'habits'
      AND column_name = 'intent'
  ) THEN
    EXECUTE 'UPDATE habits SET intent = CASE WHEN intent = ''quit'' THEN ''quit'' ELSE ''build'' END';
  END IF;
END
$$;

-- Добавляем ограничение для intent (если его еще нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'habits'
      AND constraint_name = 'habits_intent_check'
  ) THEN
    ALTER TABLE habits
      ADD CONSTRAINT habits_intent_check
      CHECK (intent IN ('build', 'quit', 'custom'));
  END IF;
END
$$;

-- Добавляем habit_key для маппинга на шаблоны
ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS habit_key VARCHAR(50);

-- Маппинг существующих данных (пример)
UPDATE habits
SET habit_key = CASE
  WHEN name ILIKE '%вода%' OR name ILIKE '%water%' THEN 'water'
  WHEN name ILIKE '%курить%' OR name ILIKE '%smoking%' OR name ILIKE '%сигарет%' THEN 'smoking'
  WHEN name ILIKE '%алкоголь%' OR name ILIKE '%alcohol%' THEN 'alcohol'
  WHEN name ILIKE '%сахар%' OR name ILIKE '%sugar%' OR name ILIKE '%сладк%' THEN 'sugar'
  WHEN name ILIKE '%сон%' OR name ILIKE '%sleep%' THEN 'sleep'
  WHEN name ILIKE '%шаг%' OR name ILIKE '%steps%' OR name ILIKE '%ходьб%' THEN 'steps'
  WHEN name ILIKE '%трениров%' OR name ILIKE '%training%' OR name ILIKE '%спорт%' THEN 'training'
  WHEN name ILIKE '%кофе%' OR name ILIKE '%caffeine%' THEN 'caffeine'
  WHEN name ILIKE '%экран%' OR name ILIKE '%screentime%' OR name ILIKE '%телефон%' THEN 'screentime'
  WHEN name ILIKE '%прокрастин%' OR name ILIKE '%procrastination%' THEN 'procrastination'
  WHEN name ILIKE '%никотин%' OR name ILIKE '%nicotine%' THEN 'nicotine_alt'
  ELSE NULL
END
WHERE habit_key IS NULL;

-- Индекс для быстрого поиска по habit_key
CREATE INDEX IF NOT EXISTS habits_habit_key_idx
  ON habits(habit_key)
  WHERE habit_key IS NOT NULL;

-- ==========================================
-- 2. Таблица notification_preferences: добавляем subtype
-- ==========================================

-- Добавляем subtype для типов уведомлений
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS subtype VARCHAR(20);

-- Устанавливаем дефолт для существующих записей
UPDATE notification_preferences
SET subtype = 'reminder'
WHERE kind = 'habits' AND subtype IS NULL;

-- Добавляем ограничение для subtype (если его еще нет)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'notification_preferences'
      AND constraint_name = 'notification_prefs_subtype_check'
  ) THEN
    ALTER TABLE notification_preferences
      ADD CONSTRAINT notification_prefs_subtype_check
      CHECK (subtype IS NULL OR subtype IN ('reminder', 'informational', 'motivational'));
  END IF;
END
$$;

-- Индекс для фильтрации по subtype
CREATE INDEX IF NOT EXISTS notification_prefs_subtype_idx
  ON notification_preferences(subtype)
  WHERE subtype IS NOT NULL;

-- ==========================================
-- Комментарии для документации
-- ==========================================

COMMENT ON COLUMN habits.intent IS 'Тип привычки: build (привить), quit (отказаться), custom (своя)';
COMMENT ON COLUMN habits.habit_key IS 'Нормализованный ключ для маппинга на шаблоны уведомлений (water, smoking, etc.)';
COMMENT ON COLUMN notification_preferences.subtype IS 'Тип уведомления: reminder (напоминание), informational (информационное), motivational (мотивационное)';


