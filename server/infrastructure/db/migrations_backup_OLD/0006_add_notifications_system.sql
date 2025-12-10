-- Миграция: Система персонализированных уведомлений
-- Версия: 2.2 (2025-11-05)
-- Описание: Таблицы для therapy и habits уведомлений с поддержкой FCM

-- ==========================================
-- 1. Таблица привычек
-- ==========================================
CREATE TABLE IF NOT EXISTS "habits" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "name" varchar(120) NOT NULL,
  "category" varchar(50) NOT NULL, -- 'health' | 'quit' | 'productivity' | 'custom'
  "emoji" varchar(8),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Индекс для выборки привычек пользователя
CREATE INDEX "habits_user_id_idx" ON "habits" ("user_id");

-- Уникальное имя привычки на пользователя
CREATE UNIQUE INDEX "habits_user_id_name_unique" ON "habits" ("user_id", "name");

-- ==========================================
-- 2. Глобальные настройки пользователя
-- ==========================================
CREATE TABLE IF NOT EXISTS "user_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE,
  "addressing" varchar(20) DEFAULT 'informal' NOT NULL, -- 'informal' | 'formal'
  "tone" varchar(20) DEFAULT 'neutral' NOT NULL, -- 'delicate' | 'neutral' | 'uplifting' | 'resolute' | 'demanding'
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Уникальный индекс по user_id (один набор настроек на пользователя)
CREATE UNIQUE INDEX "user_preferences_user_id_idx" ON "user_preferences" ("user_id");

-- ==========================================
-- 3. Локальные настройки уведомлений (по типу)
-- ==========================================
CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "kind" varchar(20) NOT NULL, -- 'therapy' | 'habits'
  "habit_id" varchar(255), -- опционально, для habits
  "enabled" boolean DEFAULT true NOT NULL,
  "times_per_day" integer NOT NULL,
  "directness" varchar(20) NOT NULL, -- 'soft' | 'moderate' | 'hard'
  "timezone" varchar(100) NOT NULL, -- IANA timezone
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Уникальность для therapy: один набор настроек (userId + kind, без habitId)
CREATE UNIQUE INDEX "notification_preferences_user_id_kind_no_habit_idx"
  ON "notification_preferences" ("user_id", "kind")
  WHERE habit_id IS NULL;

-- Уникальность для habits: одна запись на привычку (userId + kind + habitId)
CREATE UNIQUE INDEX "notification_preferences_user_id_kind_habit_idx"
  ON "notification_preferences" ("user_id", "kind", "habit_id")
  WHERE habit_id IS NOT NULL;

-- Индекс для выборки настроек пользователя
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences" ("user_id");

-- FK: связь с habits
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_habit_fk"
  FOREIGN KEY ("habit_id") REFERENCES "habits" ("id")
  ON DELETE CASCADE;

-- ==========================================
-- 4. Запланированные слоты уведомлений
-- ==========================================
CREATE TABLE IF NOT EXISTS "notification_slots" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "kind" varchar(20) NOT NULL, -- 'therapy' | 'habits'
  "habit_id" varchar(255), -- опционально, для habits
  "scheduled_at" timestamp with time zone NOT NULL, -- UTC с джиттером
  "payload" jsonb NOT NULL, -- { title, body, templateId, action, deepLink, ... }
  "template_id" varchar(255),
  "status" varchar(20) DEFAULT 'planned' NOT NULL, -- planned | sent | skipped | failed
  "snoozed_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Индекс для выборки слотов пользователя по статусу и типу
CREATE INDEX "notification_slots_user_id_kind_status_idx"
  ON "notification_slots" ("user_id", "kind", "status");

-- Индекс для выборки по времени (для воркера)
CREATE INDEX "notification_slots_user_id_scheduled_at_idx"
  ON "notification_slots" ("user_id", "scheduled_at");

-- Индекс для выборки слотов по привычке
CREATE INDEX "notification_slots_habit_id_idx"
  ON "notification_slots" ("habit_id")
  WHERE habit_id IS NOT NULL;

-- Индекс для due-выборки воркером (ускоряет поиск слотов к отправке)
CREATE INDEX "notification_slots_due_idx"
  ON "notification_slots" ("status", "scheduled_at")
  WHERE status = 'planned';

-- FK: связь с habits (при удалении привычки — SET NULL)
ALTER TABLE "notification_slots"
  ADD CONSTRAINT "notification_slots_habit_fk"
  FOREIGN KEY ("habit_id") REFERENCES "habits" ("id")
  ON DELETE SET NULL;

-- ==========================================
-- 5. Регистрация FCM токенов устройств
-- ==========================================
CREATE TABLE IF NOT EXISTS "user_devices" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token" text NOT NULL UNIQUE, -- FCM token (уникальный)
  "platform" varchar(20) NOT NULL, -- 'ios' | 'android' | 'web'
  "last_seen" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Индекс для выборки устройств пользователя
CREATE INDEX "user_devices_user_id_idx" ON "user_devices" ("user_id");

-- ==========================================
-- 6. Факты взаимодействия с уведомлениями
-- ==========================================
CREATE TABLE IF NOT EXISTS "notification_interactions" (
  "id" text PRIMARY KEY NOT NULL,
  "slot_id" text NOT NULL,
  "user_id" integer NOT NULL,
  "action" varchar(20) NOT NULL, -- 'yes' | 'no' | 'later' | 'dismissed' | 'unanswered'
  "action_at" timestamp with time zone DEFAULT now(),
  "meta" jsonb,
  "kind" varchar(20) NOT NULL, -- 'therapy' | 'habits' (денормализация)
  "type" varchar(50), -- breath_cue | grounding | body_scan | reframe | mi_prompt | sos | custom
  "metric" varchar(50), -- steps | training | breath | ... (для habits)
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Индекс для аналитики по пользователю
CREATE INDEX "notification_interactions_user_id_kind_action_at_idx"
  ON "notification_interactions" ("user_id", "kind", "action_at");

-- FK: связь со слотами
ALTER TABLE "notification_interactions"
  ADD CONSTRAINT "notification_interactions_slot_fk"
  FOREIGN KEY ("slot_id") REFERENCES "notification_slots" ("id")
  ON DELETE CASCADE;

-- ==========================================
-- 7. Дневная агрегация метрик
-- ==========================================
CREATE TABLE IF NOT EXISTS "daily_adherence" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "date" varchar(10) NOT NULL, -- 'YYYY-MM-DD'
  "kind" varchar(20) NOT NULL, -- 'therapy' | 'habits'
  "asked" integer DEFAULT 0 NOT NULL,
  "yes" integer DEFAULT 0 NOT NULL,
  "no" integer DEFAULT 0 NOT NULL,
  "later" integer DEFAULT 0 NOT NULL,
  "dismissed" integer DEFAULT 0 NOT NULL,
  "unanswered" integer DEFAULT 0 NOT NULL,
  "completion_rate" varchar(10) DEFAULT '0.0' NOT NULL, -- Храним как строку для точности
  "streak" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Уникальная тройка: userId + date + kind
CREATE UNIQUE INDEX "daily_adherence_user_id_date_kind_idx"
  ON "daily_adherence" ("user_id", "date", "kind");

-- Индекс для выборки по пользователю и типу
CREATE INDEX "daily_adherence_user_id_kind_date_idx"
  ON "daily_adherence" ("user_id", "kind", "date");

