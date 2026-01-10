-- Миграция для очистки "осиротевших" данных уведомлений
-- Удаляет настройки уведомлений, слоты и AI-тексты для несуществующих привычек и тем терапии
-- 
-- Проблема: после удаления привычек/тем их настройки уведомлений остаются в БД
-- и продолжают учитываться при подсчете общего количества уведомлений

-- ============================================================================
-- ШАГ 1: Удаляем AI-сгенерированные тексты для несуществующих сущностей
-- ============================================================================

-- Удаляем AI-тексты для привычек, которые больше не существуют
DELETE FROM ai_generated_notification_texts aint
WHERE aint.kind = 'habits'
  AND aint.entity_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли привычка по slug или id
    SELECT 1 FROM habits h
    WHERE (h.slug = aint.entity_id OR h.id::text = aint.entity_id)
  )
  AND aint.entity_id NOT IN (
    -- Исключаем стандартные ключи из каталога
    'water', 'steps', 'meditation', 'nutrition', 'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
    'sugar', 'procrastination', 'screentime', 'caffeine'
  );

-- Удаляем AI-тексты для тем терапии, которые больше не существуют
DELETE FROM ai_generated_notification_texts aint
WHERE aint.kind = 'therapy'
  AND aint.entity_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли тема по slug или id
    SELECT 1 FROM therapy_topics_custom ttc
    WHERE (ttc.slug = aint.entity_id OR ttc.id::text = aint.entity_id)
  )
  AND aint.entity_id NOT IN (
    -- Исключаем стандартные ключи из каталога (включая старые варианты для совместимости)
    'anxiety', 'stress', 'mood', 'anger', 'selfesteem', 'self_esteem',
    'relations', 'relationships', 'grief', 'sos', 'work', 'trauma', 'addiction'
  );

-- ============================================================================
-- ШАГ 2: Удаляем слоты уведомлений для несуществующих сущностей
-- ============================================================================

-- Удаляем слоты для привычек, которые больше не существуют
DELETE FROM notification_slots ns
WHERE ns.kind = 'habits'
  AND ns.habit_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли привычка по slug или id
    SELECT 1 FROM habits h
    WHERE (h.slug = ns.habit_id OR h.id::text = ns.habit_id)
  )
  AND ns.habit_id NOT IN (
    -- Исключаем стандартные ключи из каталога (включая старые варианты)
    'water', 'steps', 'meditation', 'nutrition', 'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
    'sugar', 'procrastination', 'screentime', 'caffeine', 'sport'
  );

-- Удаляем слоты для тем терапии, которые больше не существуют
DELETE FROM notification_slots ns
WHERE ns.kind = 'therapy'
  AND ns.topic_key IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли тема по slug или id
    SELECT 1 FROM therapy_topics_custom ttc
    WHERE (ttc.slug = ns.topic_key OR ttc.id::text = ns.topic_key)
  )
  AND ns.topic_key NOT IN (
    -- Исключаем стандартные ключи из каталога (включая старые варианты для совместимости)
    'anxiety', 'stress', 'mood', 'anger', 'selfesteem', 'self_esteem',
    'relations', 'relationships', 'grief', 'sos', 'work', 'trauma', 'addiction'
  );

-- ============================================================================
-- ШАГ 3: Удаляем настройки уведомлений для несуществующих сущностей
-- ============================================================================

-- Удаляем настройки для привычек, которые больше не существуют
DELETE FROM notification_preferences np
WHERE np.kind = 'habits'
  AND np.habit_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли привычка по slug или id
    SELECT 1 FROM habits h
    WHERE (h.slug = np.habit_id OR h.id::text = np.habit_id)
  )
  AND np.habit_id NOT IN (
    -- Исключаем стандартные ключи из каталога (включая старые варианты)
    'water', 'steps', 'meditation', 'nutrition', 'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
    'sugar', 'procrastination', 'screentime', 'caffeine', 'sport'
  );

-- Удаляем настройки для тем терапии, которые больше не существуют
DELETE FROM notification_preferences np
WHERE np.kind = 'therapy'
  AND np.topic_key IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли тема по slug или id
    SELECT 1 FROM therapy_topics_custom ttc
    WHERE (ttc.slug = np.topic_key OR ttc.id::text = np.topic_key)
  )
  AND np.topic_key NOT IN (
    -- Исключаем стандартные ключи из каталога (включая старые варианты для совместимости)
    'anxiety', 'stress', 'mood', 'anger', 'selfesteem', 'self_esteem',
    'relations', 'relationships', 'grief', 'sos', 'work', 'trauma', 'addiction'
  );

-- ============================================================================
-- ШАГ 4: Дополнительная очистка - удаляем настройки без habit_id/topic_key
-- (legacy данные, которые не должны учитываться)
-- ============================================================================

-- Удаляем настройки habits без habit_id (legacy)
DELETE FROM notification_preferences
WHERE kind = 'habits' AND habit_id IS NULL;

-- Удаляем настройки therapy без topic_key (legacy)
DELETE FROM notification_preferences
WHERE kind = 'therapy' AND topic_key IS NULL;

-- ============================================================================
-- ЛОГИРОВАНИЕ (для проверки результатов)
-- ============================================================================

-- После выполнения миграции можно проверить:
-- SELECT COUNT(*) FROM notification_preferences WHERE enabled = true;
-- SELECT COUNT(*) FROM notification_slots WHERE status = 'planned';
-- SELECT COUNT(*) FROM ai_generated_notification_texts;

