-- Миграция для очистки слотов уведомлений для несуществующих привычек и тем терапии
-- Удаляет слоты, где habit_id или topic_key ссылаются на несуществующие записи

-- Удаляем слоты для привычек, которые больше не существуют
-- Используем NOT EXISTS для более эффективной проверки
DELETE FROM notification_slots ns
WHERE ns.kind = 'habits'
  AND ns.habit_id IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли привычка по id или slug
    SELECT 1 FROM habits h
    WHERE (h.id::text = ns.habit_id OR h.slug = ns.habit_id)
  )
  AND ns.habit_id NOT IN (
    -- Исключаем готовые шаблоны из каталога (читаемые ключи)
    'water', 'sleep', 'steps', 'meditation', 'nutrition', 'focus_start',
    'gratitude', 'morning_routine', 'planning', 'smoking', 'alcohol',
    'sugar', 'procrastination', 'screentime', 'caffeine', 'sport'
  );

-- Удаляем слоты для тем терапии, которые больше не существуют
DELETE FROM notification_slots ns
WHERE ns.kind = 'therapy'
  AND ns.topic_key IS NOT NULL
  AND NOT EXISTS (
    -- Проверяем, существует ли тема по id или slug
    SELECT 1 FROM therapy_topics_custom ttc
    WHERE (ttc.id::text = ns.topic_key OR ttc.slug = ns.topic_key)
  )
  AND ns.topic_key NOT IN (
    -- Исключаем готовые шаблоны из каталога (читаемые ключи)
    'anxiety', 'stress', 'mood', 'sleep', 'relationships', 'work',
    'self_esteem', 'trauma', 'grief', 'addiction'
  );

-- Логируем количество удаленных слотов (для информации)
-- Это можно проверить вручную после выполнения миграции

