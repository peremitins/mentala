# Mentala Content Automation — Техническое задание (v1)

**Файл:** `TECHNICAL_SPEC_MENTALA_CONTENT_AUTOMATION.md`  
**Версия:** v1 (упрощённая под текущую реализацию)  
**Цель:** автоматизация генерации контента для Telegram + Instagram через **n8n + LLM + PostgreSQL**.

**Процесс:**

1. Форма в n8n собирает параметры генерации
2. n8n нормализует данные формы (маппинг русских значений в коды)
3. n8n генерирует контент через LLM (AI Agent) с проверкой безопасности
4. n8n парсит результат и сохраняет посты в БД через SQL запросы
5. Админ просматривает посты в приложении Mentala
6. Админ копирует понравившийся текст и публикует вручную в Telegram/Instagram
7. Админ может пометить пост как `selected` или `published` в приложении

---

## 0) Ключевые решения (согласованные)

1. **n8n работает напрямую с БД** через SQL запросы (Postgres node).
2. **Генерация происходит сразу** при отправке формы в n8n (без очереди запросов).
3. **Tone & Safety validation** обязателен (защита от токсичного/триггерного контента).
4. **Instagram форматы** поддерживаются: `carousel_7_9`, `carousel_5_7`, `single_post`, `reels_script_20_35`.
5. **Публикация вручную**: админ выбирает посты в приложении и публикует вручную. Автопубликация — в будущем.

**Требования к коду (согласно правилам проекта):**

- Все асинхронные операции через `async/await` (не `.then()/.catch()`)
- Валидация через Zod схемы в `shared/dto/` (для будущего веб-приложения)
- Использование Drizzle ORM для работы с БД
- Кроссплатформенность: проверка доступности API перед использованием
- Обработка ошибок через `try/catch` блоки

---

## 1) Архитектура (общее)

### 1.1 Поток данных

**n8n Form** → **Normalization (Code)** → **Switch (Platform)** → **AI Agent (LLM)** → **Parse Result (Code)** → **PostgreSQL (INSERT)** → **Admin UI (Mentala)** (просмотр/копирование/ручная публикация)

**Процесс:**

1. Форма в n8n собирает параметры генерации
2. Code-нода нормализует данные (маппинг русских значений в коды, очистка пустых полей)
3. Switch направляет поток в нужный AI Agent по платформе (Telegram/Instagram)
4. AI Agent генерирует контент через LLM с подробным промптом
5. Code-нода парсит JSON-ответ, заменяет `\\n` на переводы строк, чистит спец-символы
6. Postgres-нода сохраняет посты в БД через SQL INSERT
7. Админ просматривает посты в приложении Mentala
8. Админ копирует текст и публикует вручную

### 1.2 Разделение ответственности

- **n8n Workflow:** сбор параметров через форму, нормализация данных, генерация контента через LLM, валидация безопасности, работа с БД через SQL
- **PostgreSQL:** хранение сгенерированного контента и статусов
- **Admin UI (Mentala):** просмотр постов, копирование, ручная публикация, изменение статусов

---

## 2) Структура данных для генерации

### 2.1 Параметры генерации (из формы n8n)

```json
{
  "platform": "telegram",
  "format": "post",
  "topic": "Прокрастинация и «завтра»",
  "goal": "engage",
  "tone_level": 7,
  "addressing": "ты",
  "length": "medium",
  "cta_type": "comment",
  "cta_text": "Напиши в комменты: что ты откладываешь сегодня?",
  "cta_payload": null,
  "must_include": ["идеального момента не будет"],
  "must_avoid": ["стыд", "диагнозы", "обесценивание"],
  "emoji_mode": "minimal",
  "language": "ru",
  "posts_count": 1,
  "platform_specific": {
    "tg_comments_enabled": true,
    "tg_extra_titles": true,
    "tg_extra_cta_variants": true,
    "ig_cover_title": null,
    "ig_reels_style": null,
    "ig_reels_hook": null,
    "ig_carousel_style": null
  }
}
```

### 2.2 Допустимые значения

- `platform`: `telegram | instagram`
- `format`:
  - Telegram: `post`
  - Instagram: `carousel_7_9 | carousel_5_7 | single_post | reels_script_20_35`
- `goal` (примерный enum):  
  `saves | comments | go_to_telegram | beta_signup | dm_keyword | engage`
- `tone_level`: `1..10` (но safety-логика может ограничить итоговую жёсткость)
- `addressing`: `ты | вы`
- `length`: `short | medium | long`
  - **Telegram post:**
    - `short`: 300-600 символов
    - `medium`: 600-1200 символов
    - `long`: 1200-2000 символов
  - **Instagram carousel:**
    - `short`: 3-5 слайдов, caption 200-400 символов
    - `medium`: 5-7 слайдов, caption 400-800 символов
    - `long`: 7-9 слайдов, caption 800-1200 символов
  - **Instagram single_post:**
    - `short`: caption 200-400 символов
    - `medium`: caption 400-800 символов
    - `long`: caption 800-1500 символов
  - **Instagram reels_script_20_35:**
    - `short`: 20-25 секунд скрипта
    - `medium`: 25-30 секунд скрипта
    - `long`: 30-35 секунд скрипта
- `cta_type`:  
  `none | comment | save | subscribe | go_to_telegram | beta_signup | dm_keyword`
- `emoji_mode`: `none | minimal | moderate | strong`
- `language`: `ru | en` (в v1 основная логика заточена под русский)

### 2.3 Описание формы (входящие данные)

**Пример структуры формы для n8n:**

Форма содержит следующие поля:

- **Платформа** (dropdown): Telegram / Instagram
- **Формат** (dropdown): зависит от платформы
- **Тема** (dropdown): список тем контента
- **Фокус темы** (textarea): описание темы контента
- **Цель** (dropdown): Сохранения / Комментарии / Переход в Telegram / Регистрация в бета-версии / DM по ключевому слову / Вовлечение
- **Уровень тона** (number): от 1 до 10
- **Обращение** (radio): Ты / Вы
- **Длина** (dropdown): Короткая / Средняя / Длинная
- **Тип CTA** (dropdown): Нет / Комментарий / Сохранить / Подписаться / Перейти в Telegram / Регистрация в бета-версии / DM по ключевому слову
- **Текст CTA** (textarea): опционально
- **Payload CTA** (textarea): опционально
- **Обязательно включить** (textarea): каждый элемент с новой строки, максимум 10
- **Обязательно избегать** (textarea): каждый элемент с новой строки, максимум 20
- **Режим эмодзи** (dropdown): Нет / Минимальный / Умеренный / Сильный
- **Язык** (dropdown): Русский / Английский
- **Количество постов** (number): от 1 до 50

**Платформо-специфичные поля:**

- **Telegram:**
  - Включить комментарии в Telegram (checkbox)
  - Дополнительные заголовки для Telegram (checkbox)
  - Дополнительные варианты CTA для Telegram (checkbox)
- **Instagram:**
  - Заголовок обложки для Instagram (textarea)
  - Стиль Reels для Instagram (textarea)
  - Хук для Reels (textarea)
  - Стиль карусели для Instagram (textarea)

**Примечания:**

- Поля, специфичные для Telegram, показываются только при выборе платформы "Telegram"
- Поля, специфичные для Instagram, показываются только при выборе платформы "Instagram"
- Формат меняется в зависимости от выбранной платформы (для Telegram доступен только "Пост", для Instagram — остальные варианты)
- Поля "Обязательно включить" и "Обязательно избегать" могут быть многострочными (каждый элемент с новой строки)

### 2.4 Структура данных в БД

**Упрощённая Zod схема (для будущего веб-приложения):**

```typescript
// shared/dto/content-generation.dto.ts
import { z } from 'zod';

// Базовые схемы
const baseContentGenerationSchema = {
  topic: z.string().min(1).max(500),
  goal: z
    .enum([
      'saves',
      'comments',
      'go_to_telegram',
      'beta_signup',
      'dm_keyword',
      'engage',
    ])
    .optional(),
  tone_level: z.number().int().min(1).max(10),
  addressing: z.enum(['ты', 'вы']),
  length: z.enum(['short', 'medium', 'long']),
  cta_type: z.enum([
    'none',
    'comment',
    'save',
    'subscribe',
    'go_to_telegram',
    'beta_signup',
    'dm_keyword',
  ]),
  cta_text: z.string().max(500).nullable().optional(),
  cta_payload: z.string().max(1000).nullable().optional(),
  must_include: z.array(z.string().max(200)).min(0).max(10).default([]),
  must_avoid: z.array(z.string().max(200)).min(0).max(20).default([]),
  emoji_mode: z.enum(['none', 'minimal', 'moderate', 'strong']),
  language: z.string().default('ru'),
  posts_count: z.number().int().min(1).max(50),
};

// Telegram-специфичная схема
const telegramPlatformSpecificSchema = z.object({
  tg_comments_enabled: z.boolean().optional(),
  tg_extra_titles: z.boolean().optional(),
  tg_extra_cta_variants: z.boolean().optional(),
});

// Instagram-специфичная схема
const instagramPlatformSpecificSchema = z.object({
  ig_cover_title: z.string().max(200).nullable().optional(),
  ig_reels_style: z.string().max(100).nullable().optional(),
  ig_reels_hook: z.string().max(300).nullable().optional(),
  ig_carousel_style: z.string().max(100).nullable().optional(),
});

// Discriminated union по platform
export const contentGenerationInputSchema = z.discriminatedUnion('platform', [
  z.object({
    ...baseContentGenerationSchema,
    platform: z.literal('telegram'),
    format: z.literal('post'),
    platform_specific: telegramPlatformSpecificSchema.default({}),
  }),
  z.object({
    ...baseContentGenerationSchema,
    platform: z.literal('instagram'),
    format: z.enum([
      'carousel_7_9',
      'carousel_5_7',
      'single_post',
      'reels_script_20_35',
    ]),
    platform_specific: instagramPlatformSpecificSchema.default({}),
  }),
]);

export type ContentGenerationInput = z.infer<
  typeof contentGenerationInputSchema
>;
```

**Преимущества:**

- Исключает невалидные комбинации (например, `reels_script_20_35` для Telegram)
- Строгая типизация `platform_specific` по платформе
- Лимиты на массивы и строки (защита от раздувания промпта)
- Валидация длины строк (защита от DoS)

---

## 3) База данных (PostgreSQL) — таблицы и миграции

> **ВАЖНО:** Проект использует **Drizzle ORM**. Все таблицы должны быть описаны в `server/infrastructure/db/schema.ts` через Drizzle schema, а миграции генерируются через `pnpm db:generate` и применяются через `pnpm db:migrate`.

**Порядок действий при реализации:**

1. Добавить таблицы в `server/infrastructure/db/schema.ts` (Drizzle schema)
2. Выполнить `pnpm db:generate` для генерации миграций
3. Создать отдельную SQL-миграцию для расширения PostgreSQL (pg_trgm)
4. Создать отдельную SQL-миграцию для триграммного индекса (если Drizzle не поддерживает)
5. Выполнить `pnpm db:migrate` для применения миграций

### 3.1 Расширения PostgreSQL

**pg_trgm** (рекомендуется для поиска по тексту в приложении)

Расширение создаётся отдельной SQL-миграцией или при инициализации БД:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Примечание:** Drizzle не создаёт расширения автоматически. Нужно либо:

1. Создать SQL-миграцию вручную для расширения
2. Или выполнить SQL напрямую при деплое/инициализации БД

### 3.2 Таблица `content_posts`

Хранит сгенерированные посты и их статусы.

**Реализация через Drizzle ORM:**

```typescript
// server/infrastructure/db/schema.ts
export const contentPosts = pgTable(
  'content_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Параметры генерации (денормализованы для производительности)
    platform: varchar('platform', { length: 20 }).notNull(),
    format: varchar('format', { length: 50 }).notNull(),
    topic: text('topic').notNull(),
    goal: varchar('goal', { length: 50 }),
    toneLevel: integer('tone_level').notNull(),
    addressing: varchar('addressing', { length: 10 }).notNull(),
    length: varchar('length', { length: 20 }).notNull(),
    ctaType: varchar('cta_type', { length: 50 }).notNull(),
    ctaText: text('cta_text'),
    ctaPayload: text('cta_payload'),
    // Контент
    content: text('content').notNull(), // форматированный (с markdown/HTML)
    assets: jsonb('assets').notNull().default({}), // slides, cover_titles, story_prompts, reels_script, extra_titles, extra_cta_variants etc.
    safetyFlags: jsonb('safety_flags').notNull().default({}), // sensitive_topic, disclaimer_added, rejected_reason etc.
    status: varchar('status', { length: 20 }).notNull().default('draft'), // draft|selected|published|rejected|needs_review
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedPlatform: varchar('published_platform', { length: 20 }), // telegram|instagram
    publishedUrl: text('published_url'),
    tags: jsonb('tags').$type<string[]>().default([]), // теги для организации (v2, но можно добавить сразу)
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    platformStatusCreatedIdx: index('idx_cp_platform_status_created_at').on(
      table.platform,
      table.status,
      table.createdAt
    ),
    requestIdIdx: index('idx_cp_topic_created_at').on(
      table.topic,
      table.createdAt
    ),
  })
);

// Триграммный индекс создаётся отдельной SQL-миграцией (Drizzle не поддерживает напрямую)
// CREATE INDEX idx_cp_content_trgm ON content_posts USING gin (content gin_trgm_ops);
```

**SQL эквивалент (для справки):**

```sql
CREATE TABLE IF NOT EXISTS content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform VARCHAR(20) NOT NULL,
  format VARCHAR(50) NOT NULL,
  topic TEXT NOT NULL,
  goal VARCHAR(50) NULL,
  tone_level INT NOT NULL,
  addressing VARCHAR(10) NOT NULL,
  length VARCHAR(20) NOT NULL,
  cta_type VARCHAR(50) NOT NULL,
  cta_text TEXT NULL,
  cta_payload TEXT NULL,
  content TEXT NOT NULL,
  assets JSONB NOT NULL DEFAULT '{}'::jsonb,
  safety_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft|selected|published|rejected|needs_review
  published_at TIMESTAMPTZ NULL,
  published_platform VARCHAR(20) NULL,
  published_url TEXT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cp_platform_status_created_at ON content_posts(platform, status, created_at DESC);
CREATE INDEX idx_cp_topic_created_at ON content_posts(topic, created_at DESC);
CREATE INDEX idx_cp_content_trgm ON content_posts USING gin (content gin_trgm_ops);
```

**Примечание о денормализации:** Поля `platform`, `format`, `topic`, `goal`, `tone_level`, `addressing`, `length`, `cta_type`, `cta_text`, `cta_payload` хранятся напрямую в таблице для производительности (избегаем JOIN при частых запросах). Это осознанное решение денормализации.

---

## 4) Мастер‑промпты (логика генерации)

> Промпты хранятся в n8n AI Agent узлах. Для каждой платформы (Telegram/Instagram) используется отдельный AI Agent с подробным промптом.

### 4.1 Общие правила бренда (всегда добавлять)

- Не лечить, не диагностировать, не назначать лекарства.
- Без "инфоцыганства", хайпа и клише.
- Тон: прямой, взрослый, местами жёсткий, но уважительный.
- 1 CTA.
- Короткие абзацы.
- Уникальность: не повторять тезисы/структуры последних постов.

### 4.2 Telegram output requirements

- Заголовок + хук
- Блоки: механизм, признаки, шаги, ловушка, микро-вопрос, CTA
- Опционально: 5 заголовков + 3 CTA варианта (если включено в `platform_specific`)

**Формат вывода (JSON):**

```json
{
  "content": "форматированный текст с markdown",
  "assets": {
    "extra_titles": ["...", "..."],
    "extra_cta_variants": ["...", "..."]
  },
  "cta_text": "..."
}
```

### 4.3 Instagram output requirements (по format)

- `carousel_*`: SLIDES + CAPTION + COVER TITLES + STORY PROMPTS
- `single_post`: CAPTION + 10 cover titles (как варианты первой строки)
- `reels_script_20_35`: SCRIPT + ON_SCREEN_TEXT + HOOK + CTA

**Формат вывода (JSON):**

```json
{
  "assets": {
    "slides": ["Slide 1 ...", "Slide 2 ..."],
    "caption": "...",
    "cover_titles": ["...", "..."],
    "story_prompts": ["...", "..."]
  },
  "cta_text": "..."
}
```

---

## 5) n8n: Подробная реализация (работа с БД через SQL)

### 5.1 Подключение к базе данных

**Настройка Postgres node в n8n:**

1. Добавить узел "Postgres" из палитры
2. Настроить подключение:
   - Host: адрес вашей БД
   - Port: `5432`
   - Database: имя базы данных
   - User: пользователь БД
   - Password: пароль БД
   - SSL: `require` (для production) или `disable` (для dev)

**Альтернатива (если нет доступа к Credentials):**

Хранить параметры подключения в Function node:

```javascript
// Function node: "DB Config"
const dbConfig = {
  host: 'your-db-host',
  port: 5432,
  database: 'your-db-name',
  user: 'your-db-user',
  password: 'your-db-password',
  ssl: 'require',
};

return {
  dbConfig: dbConfig,
};
```

Затем использовать эти параметры в Postgres node.

### 5.2 Работа с OpenAI API

**Использовать AI Agent node в n8n:**

- AI Agent node автоматически управляет подключением к OpenAI API
- Настройка модели и параметров происходит в самом узле
- Промпт передаётся через поле "User Message" в AI Agent

**Альтернатива через HTTP Request node:**

- URL: `https://api.openai.com/v1/chat/completions`
- Method: `POST`
- Headers:
  - `Authorization: Bearer YOUR_OPENAI_API_KEY` (хранить в Function node как константу)
  - `Content-Type: application/json`
- Body: JSON с параметрами запроса

**Пример для генерации текста:**

```json
{
  "model": "gpt-4o-mini",
  "messages": [
    {
      "role": "system",
      "content": "Ты эксперт по ментальному здоровью..."
    },
    {
      "role": "user",
      "content": "{{$json.prompt}}"
    }
  ],
  "temperature": 0.7,
  "response_format": { "type": "json_object" }
}
```

### 5.3 SQL запросы для записи данных (INSERT)

**Вставка сгенерированного поста:**

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

**Параметры для Postgres node:**

- `$1` — `{{$json.platform}}`
- `$2` — `{{$json.format}}`
- `$3` — `{{$json.topic}}`
- `$4` — `{{$json.goal}}` (может быть null)
- `$5` — `{{$json.tone_level}}`
- `$6` — `{{$json.addressing}}`
- `$7` — `{{$json.length}}`
- `$8` — `{{$json.cta_type}}`
- `$9` — `{{$json.cta_text}}` (может быть null)
- `$10` — `{{$json.cta_payload}}` (может быть null)
- `$11` — `{{$json.posts[0].content}}` (из парсинга результата LLM)
- `$12` — `{{JSON.stringify($json.posts[0].assets)}}` (JSONB)
- `$13` — `{{JSON.stringify($json.posts[0].safety_flags || {})}}` (JSONB)

**Настройка Postgres node:**

- Operation: `Execute Query`
- Query: SQL запрос выше
- Parameters: массив значений из `{{$json}}`

---

## 6) n8n workflow: текущая реализация (пошагово)

### 6.1 Узлы и порядок

**Текущий workflow:**

1. **Form Trigger** — форма для сбора параметров генерации
2. **Code: Normalize Form Data** — нормализация данных формы:
   - Маппинг русских значений в коды (например, "Telegram" → "telegram", "Короткая" → "short")
   - Очистка пустых/неиспользуемых полей
   - Подготовка данных для AI Agent
3. **Switch** — разделение потока по платформе (`telegram` / `instagram`)
4. **AI Agent (Telegram)** — генерация контента для Telegram через LLM
5. **AI Agent (Instagram)** — генерация контента для Instagram через LLM
6. **Code: Parse Result** — парсинг JSON-ответа от LLM:
   - Парсинг JSON-строки из `output`
   - Замена `\\n` на реальные переводы строк
   - Очистка спец-символов
   - Формирование объекта `posts` с нормальным `content`
7. **Loop Over Items** — цикл по каждому посту в `posts`
8. **Postgres: Insert Post** — сохранение поста в БД через SQL INSERT

### 6.2 Узел 1: Form Trigger

**Настройка в n8n:**

1. Добавить узел "Form Trigger" из палитры
2. Настроить поля формы согласно разделу 2.3
3. Форма собирает все параметры генерации

### 6.3 Узел 2: Code: Normalize Form Data

**Цель:** нормализовать данные формы для дальнейшей обработки.

**JavaScript код:**

```javascript
// Получаем данные формы
const formData = $input.item.json;

// Маппинг русских значений в коды
const platformMap = {
  Telegram: 'telegram',
  Instagram: 'instagram',
};

const formatMap = {
  Пост: 'post',
  'Карусель 7-9 слайдов': 'carousel_7_9',
  'Карусель 5-7 слайдов': 'carousel_5_7',
  'Одиночный пост': 'single_post',
  'Reels скрипт 20-35 сек': 'reels_script_20_35',
};

const goalMap = {
  Сохранения: 'saves',
  Комментарии: 'comments',
  'Переход в Telegram': 'go_to_telegram',
  'Регистрация в бета-версии': 'beta_signup',
  'DM по ключевому слову': 'dm_keyword',
  Вовлечение: 'engage',
};

const addressingMap = {
  Ты: 'ты',
  Вы: 'вы',
};

const lengthMap = {
  Короткая: 'short',
  Средняя: 'medium',
  Длинная: 'long',
};

const ctaTypeMap = {
  Нет: 'none',
  Комментарий: 'comment',
  Сохранить: 'save',
  Подписаться: 'subscribe',
  'Перейти в Telegram': 'go_to_telegram',
  'Регистрация в бета-версии': 'beta_signup',
  'DM по ключевому слову': 'dm_keyword',
};

const emojiModeMap = {
  Нет: 'none',
  Минимальный: 'minimal',
  Умеренный: 'moderate',
  Сильный: 'strong',
};

const languageMap = {
  Русский: 'ru',
  Английский: 'en',
};

// Нормализация данных
const normalized = {
  platform: platformMap[formData.platform] || formData.platform,
  format: formatMap[formData.format] || formData.format,
  topic: formData.topic || formData.topic_focus,
  goal: goalMap[formData.goal] || null,
  tone_level: parseInt(formData.tone_level) || 5,
  addressing: addressingMap[formData.addressing] || 'ты',
  length: lengthMap[formData.length] || 'medium',
  cta_type: ctaTypeMap[formData.cta_type] || 'none',
  cta_text: formData.cta_text || null,
  cta_payload: formData.cta_payload || null,
  must_include: formData.must_include
    ? formData.must_include
        .split('\n')
        .filter((s) => s.trim())
        .slice(0, 10)
    : [],
  must_avoid: formData.must_avoid
    ? formData.must_avoid
        .split('\n')
        .filter((s) => s.trim())
        .slice(0, 20)
    : [],
  emoji_mode: emojiModeMap[formData.emoji_mode] || 'moderate',
  language: languageMap[formData.language] || 'ru',
  posts_count: parseInt(formData.posts_count) || 1,
  platform_specific: {},
};

// Платформо-специфичные поля
if (normalized.platform === 'telegram') {
  normalized.platform_specific = {
    tg_comments_enabled:
      formData.tg_comments_enabled === 'Да' ||
      formData.tg_comments_enabled === true,
    tg_extra_titles:
      formData.tg_extra_titles === 'Да' || formData.tg_extra_titles === true,
    tg_extra_cta_variants:
      formData.tg_extra_cta_variants === 'Да' ||
      formData.tg_extra_cta_variants === true,
  };
} else if (normalized.platform === 'instagram') {
  normalized.platform_specific = {
    ig_cover_title: formData.ig_cover_title || null,
    ig_reels_style: formData.ig_reels_style || null,
    ig_reels_hook: formData.ig_reels_hook || null,
    ig_carousel_style: formData.ig_carousel_style || null,
  };
}

return normalized;
```

### 6.4 Узел 3: Switch

**Настройка:**

- Добавить узел "Switch"
- Условие: `{{$json.platform}}`
- Ветки:
  - `telegram` → AI Agent (Telegram)
  - `instagram` → AI Agent (Instagram)

### 6.5 Узел 4-5: AI Agent (Telegram/Instagram)

**Цель:** сгенерировать контент через LLM с подробным промптом.

**Настройка AI Agent node:**

1. Добавить узел "AI Agent" из палитры
2. Настроить подключение к OpenAI (Chat Model)
3. В поле "User Message" передать подробный промпт с параметрами генерации

**Пример промпта для Telegram:**

```
Ты — эксперт по ментальному здоровью. Создай пост для Telegram.

Тема: {{$json.topic}}
{{#if $json.goal}}Цель: {{$json.goal}}{{/if}}
Тон: {{$json.tone_level}}/10
Обращение: {{$json.addressing}}
Длина: {{$json.length}}
Режим эмодзи: {{$json.emoji_mode}}

{{#if $json.must_include.length}}
Обязательно включи:
{{#each $json.must_include}}
- {{this}}
{{/each}}
{{/if}}

{{#if $json.must_avoid.length}}
Избегай:
{{#each $json.must_avoid}}
- {{this}}
{{/each}}
{{/if}}

{{#if $json.platform_specific.tg_extra_titles}}
Дополнительно создай 5 вариантов заголовков.
{{/if}}

{{#if $json.platform_specific.tg_extra_cta_variants}}
Дополнительно создай 3 варианта CTA.
{{/if}}

Формат вывода (строго JSON):
{
  "content": "форматированный текст с markdown",
  "assets": {
    "extra_titles": ["...", "..."],
    "extra_cta_variants": ["...", "..."]
  },
  "cta_text": "..."
}
```

**Пример промпта для Instagram:**

```
Ты — эксперт по ментальному здоровью. Создай контент для Instagram.

Формат: {{$json.format}}
Тема: {{$json.topic}}
{{#if $json.goal}}Цель: {{$json.goal}}{{/if}}
Тон: {{$json.tone_level}}/10
Обращение: {{$json.addressing}}
Длина: {{$json.length}}
Режим эмодзи: {{$json.emoji_mode}}

{{#if $json.must_include.length}}
Обязательно включи:
{{#each $json.must_include}}
- {{this}}
{{/each}}
{{/if}}

{{#if $json.must_avoid.length}}
Избегай:
{{#each $json.must_avoid}}
- {{this}}
{{/each}}
{{/if}}

{{#if $json.platform_specific.ig_cover_title}}
Заголовок обложки: {{$json.platform_specific.ig_cover_title}}
{{/if}}

{{#if $json.platform_specific.ig_reels_style}}
Стиль Reels: {{$json.platform_specific.ig_reels_style}}
{{/if}}

{{#if $json.platform_specific.ig_reels_hook}}
Хук для Reels: {{$json.platform_specific.ig_reels_hook}}
{{/if}}

{{#if $json.platform_specific.ig_carousel_style}}
Стиль карусели: {{$json.platform_specific.ig_carousel_style}}
{{/if}}

Формат вывода (строго JSON):
{
  "assets": {
    "slides": ["Slide 1 ...", "Slide 2 ..."],
    "caption": "...",
    "cover_titles": ["...", "..."],
    "story_prompts": ["...", "..."]
  },
  "cta_text": "..."
}
```

````

### 6.6 Узел 6: Code: Parse Result

**Цель:** распарсить JSON-ответ от LLM и подготовить данные для записи в БД.

**JavaScript код:**

```javascript
// Получаем данные из предыдущего узла
const inputData = $input.item.json;

// Парсим JSON-строку из output AI Agent
let parsedResult;
try {
  // AI Agent возвращает результат в поле output или message.content
  const jsonString =
    inputData.output || inputData.message?.content || inputData.json?.output;
  parsedResult = JSON.parse(jsonString);
} catch (e) {
  // Если уже объект, используем как есть
  parsedResult = inputData.output || inputData.json || inputData;
}

// Функция для замены \\n на реальные переводы строк
const normalizeNewlines = (text) => {
  if (!text) return '';
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

// Функция для очистки спец-символов
const cleanText = (text) => {
  if (!text) return '';
  return text
    .replace(/\u200B/g, '') // Zero-width space
    .replace(/\u200C/g, '') // Zero-width non-joiner
    .replace(/\u200D/g, '') // Zero-width joiner
    .trim();
};

// Формируем массив постов
const posts = [];

// Если posts_count > 1, нужно сгенерировать несколько постов
// Для упрощения v1: генерируем один пост, но структура позволяет расширение
const post = {
  content: cleanText(
    normalizeNewlines(
      parsedResult.content || parsedResult.assets?.caption || ''
    )
  ),
  // Формируем assets из доступных данных
  assets: parsedResult.assets || (parsedResult.titles ? { extra_titles: parsedResult.titles } : {}),
  // CTA может быть в разных полях в зависимости от формата ответа LLM
  cta: parsedResult.cta || parsedResult.cta_text || inputData.cta_text || null,
  // titles могут быть отдельным полем или внутри assets
  titles: parsedResult.titles || parsedResult.assets?.extra_titles || [],
  safety_flags: parsedResult.safety_flags || {},
};

posts.push(post);

// Возвращаем данные с массивом постов
return {
  ...inputData,
  posts: posts,
};
````

### 6.7 Узел 7: Loop Over Items

**Настройка:**

- Добавить узел "Loop Over Items" или "Split In Batches"
- Входные данные: `{{$json.posts}}` (массив постов из предыдущего узла)
- Для каждого поста выполняем следующий шаг

### 6.8 Узел 8: Postgres: Insert Post

**Цель:** сохранить сгенерированный пост в БД.

**SQL запрос:**

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

**Параметры для Postgres node:**

- `$1` — `{{$('Code: Normalize Form Data').item.json.platform}}`
- `$2` — `{{$('Code: Normalize Form Data').item.json.format}}`
- `$3` — `{{$('Code: Normalize Form Data').item.json.topic}}`
- `$4` — `{{$('Code: Normalize Form Data').item.json.goal}}`
- `$5` — `{{$('Code: Normalize Form Data').item.json.tone_level}}`
- `$6` — `{{$('Code: Normalize Form Data').item.json.addressing}}`
- `$7` — `{{$('Code: Normalize Form Data').item.json.length}}`
- `$8` — `{{$('Code: Normalize Form Data').item.json.cta_type}}`
- `$9` — `{{$json.posts[0].cta || $json.posts[0].cta_text}}` (из текущего поста, может быть `cta` или `cta_text`)
- `$10` — `{{$('Code: Normalize Form Data').item.json.cta_payload}}`
- `$11` — `{{$json.posts[0].content}}` (из текущего поста)
- `$12` — `{{JSON.stringify($json.posts[0].assets || { titles: $json.posts[0].titles || [] })}}` (JSONB, формируется из `assets` или `titles`)
- `$13` — `{{JSON.stringify($json.posts[0].safety_flags || $json.safety_flags || {})}}` (JSONB)

**Настройка Postgres node:**

- Operation: `Execute Query`
- Query: SQL запрос выше
- Parameters: массив значений из `{{$json}}` и предыдущих узлов

**После успешной вставки:**

- Workflow завершается
- Пост доступен в приложении Mentala для просмотра и публикации

---

## 7) Админка Mentala (UI)

### 7.1 Экран "Библиотека"

**Основной функционал для v1:**

- Просмотр всех сгенерированных постов
- Копирование текста в буфер обмена
- Ручная публикация (админ копирует текст и публикует вручную в Telegram/Instagram)

**Фильтры:**

- platform (telegram/instagram)
- format (post/carousel_7_9/carousel_5_7/single_post/reels_script_20_35)
- status (draft/selected/published/rejected/needs_review)
- дата создания (range picker)
- поиск по тексту (триграммный поиск по полю `content`)

**Действия:**

- **Copy** (копировать в буфер обмена) — основной функционал для v1
- **Edit** (редактировать контент) — опционально
- **Select** (пометить как selected) — опционально, для пометки понравившихся
- **Reject** (отклонить с причиной) — опционально
- **Mark as Published** (TG/IG) с указанием URL — для отметки уже опубликованных вручную

**Поля в таблице:**

- preview (первые 200 символов)
- platform, format
- status
- published_url, published_at
- created_at, updated_at

**Предпросмотр:**

- Модальное окно с полным контентом
- Для Instagram carousel: предпросмотр слайдов
- Для Reels: предпросмотр скрипта

---

## 8) Чеклист готовности v1 (перед запуском)

### 8.1 База данных

- [ ] Создано расширение PostgreSQL (pg_trgm)
- [ ] Создана таблица `content_posts` через Drizzle schema
- [ ] Сгенерированы и применены миграции (`pnpm db:generate`, `pnpm db:migrate`)
- [ ] Создан триграммный индекс для поиска по полю `content` (отдельной SQL-миграцией)

### 8.2 n8n

- [ ] n8n credentials настроены (Postgres + OpenAI)
- [ ] Форма настроена с всеми необходимыми полями
- [ ] Code-нода нормализации данных работает корректно
- [ ] Switch по платформе настроен правильно
- [ ] AI Agent узлы настроены с подробными промптами
- [ ] Code-нода парсинга результата работает корректно
- [ ] Postgres-нода записи в БД настроена и тестирована
- [ ] Обработка ошибок настроена (try/catch в Code-нодах)

### 8.3 UI

- [ ] Экран "Библиотека" с фильтрами и действиями
- [ ] Предпросмотр контента
- [ ] Копирование в буфер обмена
- [ ] Изменение статусов постов

### 8.4 Безопасность

- [ ] Валидация длины полей (защита от DoS)
- [ ] Лимиты на массивы (must_include, must_avoid)

---

## 9) Обработка ошибок

### 9.1 Типы ошибок

1. **Ошибки валидации формы** (400): неверные данные → возврат ошибки пользователю
2. **Ошибки LLM** (500): таймаут/rate limit → retry с экспоненциальной задержкой
3. **Ошибки БД** (500): connection error → retry, логирование
4. **Ошибки парсинга** (500): невалидный JSON → пометить как `needs_review`

### 9.2 Retry стратегия

- **LLM запросы:** 3 попытки с задержками 1s, 2s, 4s (настроить в AI Agent node)
- **БД запросы:** 2 попытки с задержкой 500ms (настроить в Postgres node)

### 9.3 Логирование

- Все ошибки логировать в n8n execution logs
- Критичные ошибки отправлять в Sentry (если настроено)
- При ошибке парсинга сохранять сырой ответ LLM в `safety_flags.error_message`

---

## 10) Roadmap v2 (не блокирует v1)

- Автопостинг TG (Bot API)
- Автопостинг IG (Meta Graph API) при соблюдении условий
- Проверка на похожесть (embeddings + similarity search)
- Content analytics + learning loop (оптимизация промптов на основе метрик)
- Версионирование редактур (таблица `content_post_versions`)
- Шаблоны генерации (presets) для часто используемых комбинаций
- Теги и категоризация постов
- A/B тестирование промптов
- Экспорт контента (CSV/JSON) для внешней аналитики
- Интеграция с внешними аналитическими системами
- Backend API для веб-приложения (REST эндпоинты для генерации через n8n webhook)

---

## 11) Примечания по качеству контента

- Telegram: сильный заголовок + хук + блоки + микро-вопрос + 1 CTA
- Instagram: формат-зависимый output
- Запрет на "магическое мышление", клише и "вылечу за 7 дней"
- Тон: прямой, взрослый, местами жёсткий, но уважительный

---

## 12) Примеры структуры данных

### 12.1 Пример результата для Telegram

```json
{
  "content": "**Заголовок**\n\nХук: ...\n\nМеханизм: ...\n\nПризнаки: ...\n\nШаги: ...\n\nЛовушка: ...\n\nМикро-вопрос: ...\n\nCTA: ...",
  "assets": {
    "extra_titles": ["Вариант заголовка 1", "Вариант заголовка 2", ...],
    "extra_cta_variants": ["Вариант CTA 1", "Вариант CTA 2", ...]
  },
  "cta_text": "Напиши в комменты: что ты откладываешь сегодня?"
}
```

### 12.2 Пример результата для Instagram Carousel

```json
{
  "assets": {
    "slides": [
      "Slide 1: Заголовок и основной тезис",
      "Slide 2: Развитие темы",
      "Slide 3: Практические шаги",
      ...
    ],
    "caption": "Полный текст caption для Instagram...",
    "cover_titles": ["Вариант заголовка обложки 1", "Вариант заголовка обложки 2", ...],
    "story_prompts": ["Промпт для Story 1", "Промпт для Story 2", ...]
  },
  "cta_text": "Сохрани этот пост, чтобы не потерять"
}
```

---

**Конец документа**
