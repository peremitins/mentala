-- Расширение pg_trgm для триграммного поиска
-- ВАЖНО: Для создания расширения нужны права суперпользователя
-- Если расширение не создаётся, проверьте:
-- 1. Установлен ли пакет postgresql-contrib (sudo apt-get install postgresql-contrib)
-- 2. Есть ли права суперпользователя у текущего пользователя БД
-- 3. Создано ли расширение в базе данных template1 (для новых БД)

-- Проверка наличия расширения
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    -- Попытка создать расширение
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
END $$;

-- Триграммный индекс для поиска по полю content
-- Создаётся только если расширение pg_trgm успешно установлено
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_cp_content_trgm ON content_posts USING gin (content gin_trgm_ops);
  ELSE
    RAISE NOTICE 'Расширение pg_trgm не установлено. Триграммный индекс не создан.';
    RAISE NOTICE 'Для установки выполните от имени суперпользователя: CREATE EXTENSION pg_trgm;';
  END IF;
END $$;

