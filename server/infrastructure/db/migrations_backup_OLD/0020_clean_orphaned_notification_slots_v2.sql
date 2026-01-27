-- Миграция для очистки "осиротевших" слотов уведомлений
-- Удаляет слоты, где habit_id или topic_key ссылаются на несуществующие кастомные привычки/терапию
-- 
-- Проблема: после удаления кастомных привычек/тем их слоты остаются в БД
-- и продолжают отображаться в системе уведомлений
--
-- ВАЖНО: Эта миграция проверяет принадлежность привычек/терапии конкретному пользователю
-- чтобы не удалить слоты других пользователей

-- ============================================================================
-- ШАГ 1: Удаляем слоты для кастомных привычек, которые больше не существуют
-- ============================================================================

-- Удаляем слоты для привычек, которые больше не существуют у данного пользователя
DELETE FROM notification_slots ns
WHERE ns.kind = 'habits'
  AND ns.habit_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли привычка по slug или id для этого пользователя
    SELECT 1 FROM habits h
    WHERE h.user_id = ns.user_id
      AND (h.slug = ns.habit_id OR h.id::text = ns.habit_id)
  )
  AND ns.habit_id NOT IN (
    -- Исключаем стандартные ключи из каталога (готовые шаблоны)
    'water', 'steps', 'meditation', 'nutrition', 'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
    'sugar', 'procrastination', 'screentime', 'caffeine', 'sport'
  );

-- ============================================================================
-- ШАГ 2: Удаляем слоты для кастомных тем терапии, которые больше не существуют
-- ============================================================================

-- Удаляем слоты для тем терапии, которые больше не существуют у данного пользователя
DELETE FROM notification_slots ns
WHERE ns.kind = 'therapy'
  AND ns.topic_key IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли тема по slug или id для этого пользователя
    SELECT 1 FROM therapy_topics_custom ttc
    WHERE ttc.user_id = ns.user_id
      AND (ttc.slug = ns.topic_key OR ttc.id::text = ns.topic_key)
  )
  AND ns.topic_key NOT IN (
    -- Исключаем стандартные ключи из каталога (готовые шаблоны)
    'anxiety', 'stress', 'mood', 'anger', 'selfesteem', 'self_esteem',
    'relations', 'relationships', 'grief', 'sos', 'work', 'trauma', 'addiction'
  );

-- ============================================================================
-- ЛОГИРОВАНИЕ (для проверки результатов)
-- ============================================================================

-- После выполнения миграции можно проверить:
-- SELECT COUNT(*) FROM notification_slots WHERE kind = 'habits' AND habit_id IS NOT NULL;
-- SELECT COUNT(*) FROM notification_slots WHERE kind = 'therapy' AND topic_key IS NOT NULL;
-- 
-- Также можно проверить, остались ли orphaned слоты:
-- SELECT ns.* FROM notification_slots ns
-- WHERE ns.kind = 'habits'
--   AND ns.habit_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM habits h
--     WHERE h.user_id = ns.user_id
--       AND (h.slug = ns.habit_id OR h.id::text = ns.habit_id)
--   )
--   AND ns.habit_id NOT IN ('water', 'steps', 'meditation', 'nutrition', --     'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
--     'sugar', 'procrastination', 'screentime', 'caffeine', 'sport');

