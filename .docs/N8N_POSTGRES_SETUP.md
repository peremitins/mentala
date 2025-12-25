# Инструкция по настройке Postgres node в n8n для записи постов

## Шаг 1: Применение миграции расширения pg_trgm

**ВАЖНО:** После применения основной миграции (`pnpm db:migrate`) нужно вручную применить SQL миграцию для расширения `pg_trgm`.

### Вариант 1: Если есть права суперпользователя

Выполните в вашем SQL клиенте (psql, pgAdmin, DBeaver и т.д.) от имени суперпользователя:

```sql
-- Расширение pg_trgm для триграммного поиска
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Триграммный индекс для поиска по полю content
CREATE INDEX IF NOT EXISTS idx_cp_content_trgm ON content_posts USING gin (content gin_trgm_ops);
```

### Вариант 2: Если получаете ошибку "operator class gin_trgm_ops does not exist"

Если вы получаете ошибку `ERROR: operator class "gin_trgm_ops" does not exist`, выполните следующие шаги:

#### Шаг 2.1: Проверьте, установлено ли расширение

```sql
-- Проверить наличие расширения в системе
SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';

-- Проверить, создано ли расширение в текущей БД
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

#### Шаг 2.2: Если расширение не установлено в системе

Установите пакет `postgresql-contrib`:

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-contrib

# macOS (Homebrew) - обычно уже включено
brew install postgresql

# После установки перезапустите PostgreSQL
sudo systemctl restart postgresql  # Linux
brew services restart postgresql   # macOS
```

#### Шаг 2.3: Создайте расширение от имени суперпользователя

Подключитесь к базе данных от имени суперпользователя (обычно `postgres`):

```sql
-- От имени суперпользователя
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Проверка
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';
```

Если вы используете облачную БД (например, Supabase, AWS RDS, Neon), расширение может быть уже доступно, но нужно создать его через SQL:

```sql
-- Для Supabase, Neon и других облачных провайдеров
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

#### Шаг 2.4: После успешного создания расширения создайте индекс

```sql
CREATE INDEX IF NOT EXISTS idx_cp_content_trgm ON content_posts USING gin (content gin_trgm_ops);
```

#### Шаг 2.5: Альтернатива (если расширение недоступно)

Если расширение `pg_trgm` недоступно, используйте альтернативные индексы:

**Вариант A: Полнотекстовый поиск (GIN на tsvector)**

```sql
-- GIN индекс для полнотекстового поиска
CREATE INDEX IF NOT EXISTS idx_cp_content_fts ON content_posts USING gin (to_tsvector('russian', content));
```

**Вариант B: Простой индекс для ILIKE (медленнее)**

```sql
-- Индекс для ILIKE поиска (работает без расширений)
CREATE INDEX IF NOT EXISTS idx_cp_content_lower ON content_posts (lower(content) text_pattern_ops);
```

**Вариант C: Без индекса (для v1, если данных мало)**

```sql
-- Можно обойтись без индекса для поиска, если постов будет немного (< 1000)
-- Поиск будет работать через обычный ILIKE без индекса
```

### Проверка:

```sql
-- Проверить расширение pg_trgm
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Проверить триграммный индекс
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'content_posts'
AND indexname = 'idx_cp_content_trgm';

-- Проверить все индексы на таблице
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'content_posts';
```

### Рекомендация для v1:

Если расширение `pg_trgm` недоступно, можно временно обойтись без триграммного индекса. Поиск будет работать через `ILIKE` или полнотекстовый поиск PostgreSQL (`to_tsvector`). Триграммный индекс можно добавить позже, когда будет доступ к расширению.

## Шаг 2: Настройка Postgres node в n8n

1. Добавьте узел **Postgres** из палитры n8n
2. Настройте подключение к базе данных:
   - **Host**: адрес вашей БД
   - **Port**: `5432`
   - **Database**: имя базы данных
   - **User**: пользователь БД
   - **Password**: пароль БД
   - **SSL**: `require` (для production) или `disable` (для dev)

## Шаг 3: Настройка SQL запроса для вставки поста

### Operation

Выберите: **Execute Query**

### Query

```sql
INSERT INTO content_posts (
  id,
  platform,
  format,
  topic,
  goal,
  tone_level,
  addressing,
  length,
  cta_type,
  cta_text,
  cta_payload,
  content,
  assets,
  safety_flags,
  status
) VALUES (
  gen_random_uuid(),
  $1,  -- platform
  $2,  -- format
  $3,  -- topic
  $4,  -- goal (nullable)
  $5,  -- tone_level
  $6,  -- addressing
  $7,  -- length
  $8,  -- cta_type
  $9,  -- cta_text (nullable)
  $10, -- cta_payload (nullable)
  $11, -- content (форматированный текст)
  $12::jsonb, -- assets
  $13::jsonb, -- safety_flags
  'draft' -- status по умолчанию
)
RETURNING id;
```

### Parameters (массив значений)

В поле **Parameters** введите массив из 13 элементов:

```json
[
  "{{$('Code: Normalize Form Data').item.json.platform}}",
  "{{$('Code: Normalize Form Data').item.json.format}}",
  "{{$('Code: Normalize Form Data').item.json.topic}}",
  "{{$('Code: Normalize Form Data').item.json.goal}}",
  "{{$('Code: Normalize Form Data').item.json.tone_level}}",
  "{{$('Code: Normalize Form Data').item.json.addressing}}",
  "{{$('Code: Normalize Form Data').item.json.length}}",
  "{{$('Code: Normalize Form Data').item.json.cta_type}}",
  "{{$json.posts[0].cta || $json.posts[0].cta_text}}",
  "{{$('Code: Normalize Form Data').item.json.cta_payload || null}}",
  "{{$json.posts[0].content}}",
  "{{JSON.stringify($json.posts[0].assets || { titles: $json.posts[0].titles || [] })}}",
  "{{JSON.stringify($json.posts[0].safety_flags || $json.safety_flags || {})}}"
]
```

**Примечание:**

- Параметр `$9` использует `cta` или `cta_text` в зависимости от структуры данных из Code node
- Параметр `$12` формирует `assets` из поля `assets` или создаёт объект с `titles`, если `assets` отсутствует
- Если у вас структура `posts[0].titles` как массив, то `assets` будет `{ "titles": [...] }`

### Вариант параметров (если используете Loop Over Items)

Если вы используете **Loop Over Items** и итерируете по `posts`, то `$json` уже является элементом поста, и параметры будут проще:

```json
[
  "{{$('Code: Normalize Form Data').item.json.platform}}",
  "{{$('Code: Normalize Form Data').item.json.format}}",
  "{{$('Code: Normalize Form Data').item.json.topic}}",
  "{{$('Code: Normalize Form Data').item.json.goal}}",
  "{{$('Code: Normalize Form Data').item.json.tone_level}}",
  "{{$('Code: Normalize Form Data').item.json.addressing}}",
  "{{$('Code: Normalize Form Data').item.json.length}}",
  "{{$('Code: Normalize Form Data').item.json.cta_type}}",
  "{{$json.cta || $json.cta_text}}",
  "{{$('Code: Normalize Form Data').item.json.cta_payload || null}}",
  "{{$json.content}}",
  "{{JSON.stringify($json.assets || { titles: $json.titles || [] })}}",
  "{{JSON.stringify($json.safety_flags || {})}}"
]
```

В этом случае `$json` уже является элементом из массива `posts`, поэтому не нужно использовать `posts[0]`.

## Шаг 4: Альтернативный вариант (если не работает доступ к предыдущим узлам)

Если выражения типа `{{$('Code: Normalize Form Data').item.json.platform}}` не работают, можно передать все данные через один объект из Code node перед Postgres node.

### В Code node перед Postgres (например, "Prepare DB Data"):

```javascript
// Получаем данные из предыдущих узлов
const normalizedData = $('Code: Normalize Form Data').item.json;
const postData = $json; // данные из Loop Over Items (текущий пост)

// Формируем массив параметров для SQL
return {
  params: [
    normalizedData.platform,
    normalizedData.format,
    normalizedData.topic,
    normalizedData.goal || null,
    normalizedData.tone_level,
    normalizedData.addressing,
    normalizedData.length,
    normalizedData.cta_type,
    postData.cta_text || null,
    normalizedData.cta_payload || null,
    postData.content,
    JSON.stringify(postData.assets || {}),
    JSON.stringify(postData.safety_flags || {}),
  ],
};
```

### В Postgres node:

**Parameters**: `{{$json.params}}`

## Шаг 5: Проверка результата

После успешной вставки узел вернёт объект с полем `id` (UUID созданного поста). Это можно использовать для логирования или дальнейшей обработки.

## Пример полного workflow

1. **Form Trigger** → собирает данные формы
2. **Code: Normalize Form Data** → нормализует данные
3. **Switch** → разделяет по платформе
4. **AI Agent (Telegram/Instagram)** → генерирует контент
5. **Code: Parse Result** → парсит JSON ответ
6. **Loop Over Items** → цикл по постам
7. **Postgres: Insert Post** → вставляет пост в БД (этот узел)

## Обработка ошибок

Если возникает ошибка при вставке:

1. Проверьте, что все параметры передаются корректно
2. Убедитесь, что JSON поля (`assets`, `safety_flags`) правильно сериализованы через `JSON.stringify()`
3. Проверьте, что `null` значения передаются как `null`, а не как строка `"null"`
4. Убедитесь, что таблица `content_posts` создана в БД (миграция применена)

## Полезные SQL запросы для проверки

```sql
-- Проверить, что таблица создана
SELECT * FROM content_posts LIMIT 1;

-- Проверить последние посты
SELECT id, platform, format, topic, status, created_at
FROM content_posts
ORDER BY created_at DESC
LIMIT 10;

-- Проверить расширение pg_trgm
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- Проверить триграммный индекс
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'content_posts'
AND indexname = 'idx_cp_content_trgm';
```
