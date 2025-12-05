BEGIN;

-- ============================================================================
-- Создание таблицы notification_texts
-- ============================================================================

CREATE TABLE notification_texts (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  entity_key      TEXT NOT NULL,
  user_id         INTEGER NULL,
  preference_id   TEXT NULL,
  source          TEXT NOT NULL,
  intent          TEXT NULL,
  subtype         TEXT NULL,
  directness      TEXT NOT NULL,
  addressing      TEXT NOT NULL,
  locale          TEXT NOT NULL,
  text            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Индексы для производительности
CREATE INDEX idx_notification_texts_lookup 
  ON notification_texts(kind, entity_key, user_id, is_deleted, locale);

CREATE INDEX idx_notification_texts_filters 
  ON notification_texts(intent, subtype, directness, addressing) 
  WHERE is_deleted = FALSE;

CREATE INDEX idx_notification_texts_user 
  ON notification_texts(user_id) 
  WHERE user_id IS NOT NULL AND is_deleted = FALSE;

CREATE INDEX idx_notification_texts_sort 
  ON notification_texts(kind, entity_key, sort_order, created_at) 
  WHERE is_deleted = FALSE;

-- ============================================================================
-- Создание таблицы notification_text_presets
-- ============================================================================

CREATE TABLE notification_text_presets (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL,
  entity_key      TEXT NOT NULL,
  intent          TEXT NULL,
  subtype         TEXT NULL,
  directness      TEXT NOT NULL,
  addressing      TEXT NOT NULL,
  locale          TEXT NOT NULL,
  text            TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Индексы для быстрого поиска при восстановлении
CREATE INDEX idx_notification_text_presets_lookup 
  ON notification_text_presets(kind, entity_key);

COMMIT;


