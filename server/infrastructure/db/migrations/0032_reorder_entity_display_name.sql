BEGIN;

-- ============================================================================
-- Перемещение entity_display_name сразу после entity_key в notification_slots
-- ============================================================================

-- Создаем временную таблицу с правильным порядком колонок
CREATE TABLE notification_slots_new (
  id text PRIMARY KEY NOT NULL,
  user_id integer NOT NULL,
  kind varchar(20) NOT NULL,
  entity_key varchar(255),
  entity_display_name varchar(255), -- Теперь сразу после entity_key
  scheduled_at timestamp with time zone NOT NULL,
  payload jsonb NOT NULL,
  template_id varchar(255),
  status varchar(20) DEFAULT 'planned' NOT NULL,
  snoozed_until timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Копируем данные из старой таблицы
INSERT INTO notification_slots_new (
  id, user_id, kind, entity_key, entity_display_name, 
  scheduled_at, payload, template_id, status, snoozed_until, created_at
)
SELECT 
  id, user_id, kind, entity_key, entity_display_name,
  scheduled_at, payload, template_id, status, snoozed_until, created_at
FROM notification_slots;

-- Восстанавливаем индексы
CREATE INDEX notification_slots_user_id_kind_status_idx 
  ON notification_slots_new (user_id, kind, status);
CREATE INDEX notification_slots_user_id_scheduled_at_idx 
  ON notification_slots_new (user_id, scheduled_at);
CREATE INDEX notification_slots_due_idx 
  ON notification_slots_new (status, scheduled_at)
  WHERE status = 'planned';

-- Удаляем старую таблицу и переименовываем новую
DROP TABLE notification_slots;
ALTER TABLE notification_slots_new RENAME TO notification_slots;

-- ============================================================================
-- Перемещение entity_display_name сразу после entity_key в ai_generated_notification_texts
-- ============================================================================

-- Создаем временную таблицу с правильным порядком колонок
CREATE TABLE ai_generated_notification_texts_new (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  kind varchar(20) NOT NULL,
  entity_key varchar(255) NOT NULL,
  entity_display_name varchar(255), -- Теперь сразу после entity_key
  preference_id text NOT NULL,
  text_source varchar(20) NOT NULL,
  texts jsonb NOT NULL,
  generation_config_hash text NOT NULL,
  provider varchar(50) NOT NULL,
  model varchar(100),
  tokens_used integer,
  cost_usd numeric(10, 6),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone,
  UNIQUE(user_id, preference_id, generation_config_hash)
);

-- Копируем данные из старой таблицы
INSERT INTO ai_generated_notification_texts_new (
  id, user_id, kind, entity_key, entity_display_name, preference_id,
  text_source, texts, generation_config_hash, provider, model, 
  tokens_used, cost_usd, created_at, updated_at, expires_at
)
SELECT 
  id, user_id, kind, entity_key, entity_display_name, preference_id,
  text_source, texts, generation_config_hash, provider, model,
  tokens_used, cost_usd, created_at, updated_at, expires_at
FROM ai_generated_notification_texts;

-- Восстанавливаем индексы (если они есть)
-- Проверяем существующие индексы и создаем их заново
CREATE INDEX idx_ai_texts_user_pref 
  ON ai_generated_notification_texts_new (user_id, preference_id);
CREATE INDEX idx_ai_texts_config_hash 
  ON ai_generated_notification_texts_new (generation_config_hash);
CREATE INDEX idx_ai_texts_entity 
  ON ai_generated_notification_texts_new (user_id, kind, entity_key);

-- Обновляем последовательность для id (чтобы избежать конфликтов при следующих вставках)
SELECT setval(
  pg_get_serial_sequence('ai_generated_notification_texts_new', 'id'),
  COALESCE((SELECT MAX(id) FROM ai_generated_notification_texts_new), 1),
  true
);

-- Удаляем старую таблицу и переименовываем новую
DROP TABLE ai_generated_notification_texts CASCADE;
ALTER TABLE ai_generated_notification_texts_new RENAME TO ai_generated_notification_texts;

-- Восстанавливаем внешние ключи (если они были удалены CASCADE)
-- Проверяем, есть ли внешний ключ в ai_notification_text_usage
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'ai_notification_text_usage'
      AND kcu.column_name = 'ai_text_id'
      AND tc.constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE ai_notification_text_usage
    ADD CONSTRAINT ai_notification_text_usage_ai_text_id_fk
    FOREIGN KEY (ai_text_id) REFERENCES ai_generated_notification_texts(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

