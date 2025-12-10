-- Миграция: Изоляция данных пользователей для текстов уведомлений
-- Мигрирует существующие глобальные тексты (userId IS NULL) в персональные копии для каждого пользователя
--
-- Стратегия: Мигрируем текущее состояние глобальных текстов как "истину" для всех пользователей.
-- Если кто-то уже правил глобальные userId=null тексты, эти изменения будут размножены всем пользователям.
-- После миграции каждый пользователь сможет кастомизировать свои копии независимо.

BEGIN;

-- Создаем временную таблицу для отслеживания уже мигрированных комбинаций (userId, kind, entityKey)
CREATE TEMP TABLE IF NOT EXISTS migration_tracking (
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, entity_key)
);

-- Для каждого пользователя с notificationPreferences копируем тексты
DO $$
DECLARE
  user_rec RECORD;
  pref_rec RECORD;
  text_rec RECORD;
  new_id TEXT;
BEGIN
  -- Перебираем всех пользователей, у которых есть notificationPreferences
  FOR user_rec IN 
    SELECT DISTINCT user_id 
    FROM notification_preferences
  LOOP
    -- Для каждой пары (kind, entityKey) из preferences пользователя
    FOR pref_rec IN
      SELECT DISTINCT kind, entity_key
      FROM notification_preferences
      WHERE user_id = user_rec.user_id
        AND entity_key IS NOT NULL
    LOOP
      -- Проверяем, не мигрировали ли уже эту комбинацию
      IF EXISTS (
        SELECT 1 FROM migration_tracking
        WHERE user_id = user_rec.user_id
          AND kind = pref_rec.kind
          AND entity_key = pref_rec.entity_key
      ) THEN
        CONTINUE; -- Уже мигрировано, пропускаем
      END IF;

      -- Проверяем, есть ли уже тексты у пользователя для этой сущности
      IF EXISTS (
        SELECT 1 FROM notification_texts
        WHERE user_id = user_rec.user_id
          AND kind = pref_rec.kind
          AND entity_key = pref_rec.entity_key
          AND source = 'default'
          AND is_deleted = FALSE
      ) THEN
        -- Уже есть тексты, помечаем как мигрированное и пропускаем
        INSERT INTO migration_tracking (user_id, kind, entity_key)
        VALUES (user_rec.user_id, pref_rec.kind, pref_rec.entity_key)
        ON CONFLICT DO NOTHING;
        CONTINUE;
      END IF;

      -- Копируем все глобальные тексты (userId IS NULL) для этой сущности в тексты пользователя
      FOR text_rec IN
        SELECT *
        FROM notification_texts
        WHERE user_id IS NULL
          AND kind = pref_rec.kind
          AND entity_key = pref_rec.entity_key
          AND source = 'default'
          AND is_deleted = FALSE
      LOOP
        -- Генерируем новый ID (используем UUID для миграции, так как nanoid недоступен в SQL)
        new_id := gen_random_uuid()::text;

        -- Вставляем копию текста с userId = user_id
        INSERT INTO notification_texts (
          id,
          kind,
          entity_key,
          user_id,
          preference_id,
          source,
          intent,
          subtype,
          directness,
          addressing,
          locale,
          text,
          sort_order,
          is_deleted,
          created_at,
          updated_at
        ) VALUES (
          new_id,
          text_rec.kind,
          text_rec.entity_key,
          user_rec.user_id, -- НЕ NULL! Персональная копия пользователя
          NULL,
          'default',
          text_rec.intent,
          text_rec.subtype,
          text_rec.directness,
          text_rec.addressing,
          text_rec.locale,
          text_rec.text,
          text_rec.sort_order,
          text_rec.is_deleted,
          text_rec.created_at,
          text_rec.updated_at
        );
      END LOOP;

      -- Помечаем как мигрированное
      INSERT INTO migration_tracking (user_id, kind, entity_key)
      VALUES (user_rec.user_id, pref_rec.kind, pref_rec.entity_key)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Удаляем временную таблицу
DROP TABLE IF EXISTS migration_tracking;

-- Логирование результатов
DO $$
DECLARE
  migrated_count INTEGER;
  global_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM notification_texts
  WHERE user_id IS NOT NULL
    AND source = 'default'
    AND is_deleted = FALSE;

  SELECT COUNT(*) INTO global_count
  FROM notification_texts
  WHERE user_id IS NULL
    AND source = 'default'
    AND is_deleted = FALSE;

  RAISE NOTICE 'Миграция завершена. Мигрировано текстов: %, Осталось глобальных: %', migrated_count, global_count;
END $$;

COMMIT;

-- После миграции:
-- 1. Глобальные тексты (userId IS NULL) больше не используются кодом
-- 2. Каждый пользователь имеет свои копии дефолтных текстов (userId IS NOT NULL, source='default')
-- 3. Глобальные тексты можно удалить в будущей миграции после проверки работы системы

