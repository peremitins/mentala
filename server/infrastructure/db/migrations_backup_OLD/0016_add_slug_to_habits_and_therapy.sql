-- Добавляем slug в habits
ALTER TABLE habits
ADD COLUMN slug VARCHAR(255);

-- Добавляем slug в therapy_topics_custom
ALTER TABLE therapy_topics_custom
ADD COLUMN slug VARCHAR(255);

-- Создаем индексы для быстрого поиска
CREATE INDEX idx_habits_user_slug ON habits(user_id, slug);
CREATE INDEX idx_therapy_custom_user_slug ON therapy_topics_custom(user_id, slug);

-- Примечание: Генерация slug для существующих записей будет выполнена
-- при первом обновлении записи через API или через отдельный скрипт миграции данных

