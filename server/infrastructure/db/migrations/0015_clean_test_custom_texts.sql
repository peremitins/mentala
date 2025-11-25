-- Очистка уведомлений и настроек для удалённых привычек и терапий
-- Удаляем настройки уведомлений для привычек, которых больше не существует
DELETE FROM notification_preferences
WHERE kind = 'habits'
  AND habit_id IS NOT NULL
  AND habit_id NOT IN (
    -- Исключаем базовые привычки (water, smoking и т.д.)
    SELECT DISTINCT habit_key
    FROM habits
    WHERE habit_key IS NOT NULL
  )
  AND habit_id NOT IN (
    -- Исключаем кастомные привычки (где habitKey = id)
    SELECT id
    FROM habits
    WHERE habit_key IS NULL OR habit_key = id
  );

-- Удаляем запланированные уведомления для удалённых привычек
DELETE FROM notification_slots
WHERE kind = 'habits'
  AND status = 'planned'
  AND habit_id IS NOT NULL
  AND habit_id NOT IN (
    SELECT DISTINCT habit_key
    FROM habits
    WHERE habit_key IS NOT NULL
  )
  AND habit_id NOT IN (
    SELECT id
    FROM habits
    WHERE habit_key IS NULL OR habit_key = id
  );

-- Удаляем настройки уведомлений для терапий, которых больше не существует
DELETE FROM notification_preferences
WHERE kind = 'therapy'
  AND topic_key IS NOT NULL
  AND topic_key NOT IN (
    -- Базовые темы терапии (anxiety, stress, mood и т.д.) не удаляем
    -- Удаляем только кастомные темы, которых нет в therapy_topics_custom
    SELECT id
    FROM therapy_topics_custom
  );

-- Удаляем запланированные уведомления для удалённых терапий
DELETE FROM notification_slots
WHERE kind = 'therapy'
  AND status = 'planned'
  AND topic_key IS NOT NULL
  AND topic_key NOT IN (
    SELECT id
    FROM therapy_topics_custom
  );

