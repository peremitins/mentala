# ТЗ: Миграция избранных промптов дневника благодарности из localStorage в БД

## 1. Текущее состояние

### 1.1. Каталог промптов (категории + вопросы)

**Где хранится:** статический TypeScript-файл `shared/gratitude-diary/catalog.ts`  
**Как отдаётся:** сервер в `server/api/gratitude-diary/prompts.get.ts` просто импортирует константу `GRATITUDE_PROMPT_CATEGORIES` и возвращает её клиенту as-is.  
**Проблема:** контент жёстко зашит в коде — нельзя менять промпты без деплоя, нет возможности A/B-тестирования, персонализации по языку/локали.

### 1.2. Избранные промпты пользователя

**Где хранится:** `localStorage` браузера, ключ `gratitude-diary.favorite-prompts.v1`  
**Структура данных в localStorage:**

```json
{
  "catalogPromptIds": ["self-1", "health-3"],
  "customPrompts": [
    { "id": "fav-custom-1700000000000-abc12", "text": "Мой кастомный вопрос" }
  ]
}
```

**Два типа избранного:**

1. **Каталожные промпты** (`catalogPromptIds`) — пользователь нажимает ❤️ на системном вопросе; в localStorage сохраняется только его `id` из каталога.
2. **Кастомные промпты** (`customFavoritePrompts`) — пользователь создаёт свой вопрос через кнопку «Добавить свой»; в localStorage сохраняется `id` (сгенерированный на клиенте) + `text`.

**Ключевые функции в `editor.vue`:**
| Функция | Описание |
|---|---|
| `loadFavoritePromptsFromStorage()` | Читает данные из localStorage при mount |
| `persistFavoritePrompts()` | Записывает в localStorage при любом изменении |
| `togglePromptFavorite(prompt)` | Добавить/убрать каталожный промпт из избранного |
| `createCustomFavoritePrompt(text)` | Создать кастомный промпт |
| `removeFavoritePrompt(prompt)` | Удалить из избранного |
| `submitFavoritePromptModal()` | Создать или отредактировать кастомный промпт |

### 1.3. Шаблон воркшита

**Где хранится:** БД, таблица `gratitude_diary_worksheet_templates` (JSONB-колонка `items`)  
**Статус:** уже корректно реализован через базу данных — это образец правильного подхода.

---

## 2. Проблемы текущей реализации

| Проблема                                      | Влияние                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Данные привязаны к устройству/браузеру        | Потеря избранных при смене устройства, браузера или очистке кеша                |
| Несинхронизированы между устройствами         | Пользователь iOS-приложения и веб-версии видит разные избранные                 |
| Недоступны при SSR/Capacitor                  | `localStorage` недоступен на сервере, в Capacitor (iOS/Android) требует обёртки |
| Нет истории изменений                         | Нельзя восстановить данные после случайного удаления                            |
| Каталог промптов не локализован               | Все промпты только на русском; нет возможности перевода без деплоя              |
| ID кастомных промптов генерируются на клиенте | `fav-custom-${Date.now()}-${random}` — нестабильно, нет гарантий уникальности   |

---

## 3. Целевая архитектура

### 3.1. Новые таблицы в БД

#### Таблица `gratitude_diary_favorite_prompts`

Хранит избранные промпты пользователя: и ссылки на каталожные, и пользовательские кастомные.

```sql
CREATE TABLE gratitude_diary_favorite_prompts (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Тип промпта: 'catalog' — ссылка на системный, 'custom' — созданный пользователем
  prompt_type VARCHAR(10) NOT NULL CHECK (prompt_type IN ('catalog', 'custom')),

  -- Для catalog: id промпта из каталога (например 'self-1', 'health-3')
  catalog_prompt_id VARCHAR(64),

  -- Для custom: текст промпта (max 220 символов)
  custom_text VARCHAR(220),

  -- Порядок отображения (для ручного перетаскивания в будущем)
  sort_order  INTEGER NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CHECK constraint: гарантирует консистентность полиморфных записей.
  -- catalog-запись ОБЯЗАНА иметь catalog_prompt_id и НЕ ДОЛЖНА иметь custom_text.
  -- custom-запись ОБЯЗАНА иметь custom_text и НЕ ДОЛЖНА иметь catalog_prompt_id.
  CONSTRAINT chk_gratitude_favorite_type CHECK (
    (prompt_type = 'catalog' AND catalog_prompt_id IS NOT NULL AND custom_text IS NULL)
    OR
    (prompt_type = 'custom' AND custom_text IS NOT NULL AND catalog_prompt_id IS NULL)
  )
);

-- Partial unique index: один каталожный промпт в избранном одного пользователя.
-- PostgreSQL не поддерживает partial unique constraint внутри CREATE TABLE —
-- только через CREATE UNIQUE INDEX.
CREATE UNIQUE INDEX uk_gratitude_favorite_user_catalog
  ON gratitude_diary_favorite_prompts (user_id, catalog_prompt_id)
  WHERE catalog_prompt_id IS NOT NULL;

-- Partial unique index: дедупликация кастомных промптов по тексту.
-- Защита от двойной миграции (пользователь открыл 2 вкладки одновременно).
CREATE UNIQUE INDEX uk_gratitude_favorite_user_custom_text
  ON gratitude_diary_favorite_prompts (user_id, custom_text)
  WHERE custom_text IS NOT NULL;

-- Индекс для быстрой выборки избранного пользователя (сортировка по created_at DESC).
-- sort_order заложен в схему для будущего ручного перетаскивания.
CREATE INDEX idx_gratitude_favorite_user_created
  ON gratitude_diary_favorite_prompts (user_id, created_at DESC);
```

**В Drizzle ORM:**

```typescript
export const gratitudeDiaryFavoritePrompts = pgTable(
  'gratitude_diary_favorite_prompts',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: integer('user_id').notNull(),
    promptType: varchar('prompt_type', { length: 10 }).notNull(), // 'catalog' | 'custom'
    catalogPromptId: varchar('catalog_prompt_id', { length: 64 }),
    customText: varchar('custom_text', { length: 220 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // CHECK constraint: консистентность полиморфных записей (аналог SQL CONSTRAINT chk_...)
    typeConsistencyCheck: check(
      'chk_gratitude_favorite_type',
      sql`(prompt_type = 'catalog' AND catalog_prompt_id IS NOT NULL AND custom_text IS NULL)
          OR (prompt_type = 'custom' AND custom_text IS NOT NULL AND catalog_prompt_id IS NULL)`
    ),
    // Индекс для сортировки по дате (текущая сортировка: created_at DESC)
    userCreatedIdx: index('idx_gratitude_favorite_user_created').on(
      table.userId,
      table.createdAt
    ),
    // Уникальность каталожного промпта в избранном одного пользователя (partial unique index)
    userCatalogUniqueIdx: uniqueIndex('uk_gratitude_favorite_user_catalog')
      .on(table.userId, table.catalogPromptId)
      .where(sql`catalog_prompt_id IS NOT NULL`),
    // Дедупликация кастомных промптов по тексту (защита от двойной миграции)
    userCustomTextUniqueIdx: uniqueIndex(
      'uk_gratitude_favorite_user_custom_text'
    )
      .on(table.userId, table.customText)
      .where(sql`custom_text IS NOT NULL`),
  })
);
```

#### Таблица `gratitude_diary_prompt_catalog` (опционально, для v2)

Если в будущем нужно управлять каталогом промптов из админки или поддерживать локализацию — вынести каталог в БД. Для текущей задачи — **не в scope**, оставляем статический каталог в коде.

### 3.2. API-эндпоинты

#### `GET /api/gratitude-diary/prompts`

**Изменение:** к существующему ответу добавляем поле `favoritePrompts`.

```typescript
// Ответ:
{
  categories: GratitudePromptCategory[],    // каталог (без изменений, из catalog.ts)
  worksheet: GratitudeWorksheetItem[],       // воркшит (без изменений)
  canEditWorksheet: boolean,
  worksheetFeatureKey: string,
  favoritePrompts: {                         // НОВОЕ
    id: number,                              // PK из БД
    promptType: 'catalog' | 'custom',
    catalogPromptId: string | null,
    customText: string | null,
    sortOrder: number,
  }[]
}
```

**Важно:** при формировании ответа фильтровать записи с `catalog_prompt_id`, которых нет в текущем каталоге (промпт мог быть удалён из каталога). Такие записи игнорировать на уровне API и не возвращать клиенту.

#### `POST /api/gratitude-diary/favorites` — добавить в избранное

```typescript
// Body:
{
  promptType: 'catalog' | 'custom',
  catalogPromptId?: string,   // обязателен при promptType === 'catalog'
  customText?: string,        // обязателен при promptType === 'custom', max 220 chars
}

// Ответ (201): возвращаем полный актуальный список избранных пользователя.
// Это избавляет фронт от необходимости синхронизировать порядок самостоятельно
// и устраняет race conditions при параллельных запросах.
{
  items: FavoritePromptItem[]
}
```

**Логика:**

- Для `catalog`:
  - Проверить что `catalogPromptId` существует в каталоге.
  - Сделать `INSERT ... ON CONFLICT DO NOTHING` (идемпотентно).
- Для `custom`:
  - Валидировать текст (непустой, ≤ 220 символов).
  - Проверить лимит: `SELECT count(*) WHERE user_id = ? AND prompt_type = 'custom'`. Если `>= 50` → вернуть ошибку `422` с сообщением об превышении лимита.
  - INSERT.
- Авторизация: обязательна.

#### `PATCH /api/gratitude-diary/favorites/:id` — редактировать кастомный промпт

```typescript
// Только для promptType === 'custom'
// Body: { customText: string }  (max 220 chars)
// Ответ (200): { item: {...} }
```

**Логика:**

- Запрос к БД: `WHERE id = :id AND user_id = :userId AND prompt_type = 'custom'`.
  - Проверка `prompt_type = 'custom'` обязательна в самом SQL-запросе — защита от редактирования каталожных промптов через баг на фронте.
- Обновить `custom_text` и `updated_at`.

#### `DELETE /api/gratitude-diary/favorites/:id` — удалить из избранного

```typescript
// Body: не нужен (id в URL)
// Ответ (200): { removedId: number }
// — возвращаем удалённый ID, чтобы UI точно знал какую запись убрать из списка.
```

**Логика:**

- `DELETE WHERE id = :id AND user_id = :userId` — безопасно, ошибку не бросать если не найдено (идемпотентно).

### 3.3. DTO и валидация (Zod)

Добавить в `shared/dto/index.ts` (или в отдельный файл `shared/dto/gratitude-diary.ts`):

```typescript
export const GratitudeDiaryFavoriteCreateDto = z.discriminatedUnion(
  'promptType',
  [
    z.object({
      promptType: z.literal('catalog'),
      catalogPromptId: z.string().min(1).max(64),
    }),
    z.object({
      promptType: z.literal('custom'),
      customText: z.string().min(1).max(220).trim(),
    }),
  ]
);

export const GratitudeDiaryFavoriteUpdateDto = z.object({
  customText: z.string().min(1).max(220).trim(),
});
```

### 3.4. Composable `useGratitudeDiaryFavorites`

Вынести всю логику работы с избранными промптами из `editor.vue` в отдельный composable:

```typescript
// app/composables/useGratitudeDiaryFavorites.ts

export function useGratitudeDiaryFavorites() {
  const { $api } = useNuxtApp();

  const favorites = ref<FavoritePromptItem[]>([]);
  const isLoading = ref(false);

  // Вычисляемый Map для O(1) поиска каталожных избранных.
  // Ключ: catalogPromptId, значение: FavoritePromptItem.
  // Избегает O(n) поиска через find() при каждой проверке isPromptFavorite().
  const catalogFavoriteMap = computed(() =>
    new Map(
      favorites.value
        .filter((f) => f.promptType === 'catalog' && f.catalogPromptId)
        .map((f) => [f.catalogPromptId, f])
    )
  );

  // Инициализация — вызывается из loadPromptCatalog()
  function setInitialFavorites(items: FavoritePromptItem[]) { ... }

  // Проверить, является ли каталожный промпт избранным (O(1) через Map)
  function isPromptFavorite(catalogPromptId: string): boolean {
    return catalogFavoriteMap.value.has(catalogPromptId);
  }

  // Добавить каталожный промпт в избранное
  async function addCatalogFavorite(catalogPromptId: string): Promise<void> { ... }

  // Убрать промпт из избранного
  async function removeFavorite(favoriteId: number): Promise<void> { ... }

  // Создать кастомный промпт
  async function createCustomFavorite(text: string): Promise<FavoritePromptItem | null> { ... }

  // Редактировать кастомный промпт
  async function updateCustomFavorite(favoriteId: number, text: string): Promise<void> { ... }

  return {
    favorites,
    isLoading,
    catalogFavoriteMap,
    setInitialFavorites,
    isPromptFavorite,
    addCatalogFavorite,
    removeFavorite,
    createCustomFavorite,
    updateCustomFavorite,
  };
}
```

### 3.5. Оптимистичные обновления UI

Для мгновенного отклика интерфейса без ожидания ответа сервера применяем паттерн **optimistic update + rollback**:

```
1. Сохранить предыдущее состояние favorites (snapshot)
2. Обновить локальный favorites ref оптимистично (как будто уже готово)
3. Отправить запрос к API
4. При успехе — обновить данными от сервера (id для кастомных, актуальный список)
5. При ошибке — откатить favorites к snapshot + показать тост с ошибкой
```

Пример паттерна:

```typescript
async function addCatalogFavorite(catalogPromptId: string) {
  // Сохраняем snapshot для rollback
  const snapshot = [...favorites.value];

  // Оптимистичное обновление
  favorites.value.push({ id: -1, promptType: 'catalog', catalogPromptId, ... });

  try {
    const { items } = await $api.post('/gratitude-diary/favorites', { ... });
    // Заменяем оптимистичные данные реальными от сервера
    favorites.value = items;
  } catch (e) {
    // Rollback к предыдущему состоянию
    favorites.value = snapshot;
    showErrorToast(e);
  }
}
```

---

## 4. Миграция данных

### Стратегия:

1. **Новые пользователи** — работают сразу с БД, localStorage не используется.
2. **Существующие пользователи** — при первом открытии редактора после деплоя:
   - Прочитать `localStorage['gratitude-diary.favorite-prompts.v1']`
   - Если данные есть — отправить `POST /api/gratitude-diary/favorites/migrate` (батч-эндпоинт)
   - После успешной миграции — удалить ключ из localStorage и записать флаг `gratitude-diary.favorites-migrated.v1 = true`

### Батч-эндпоинт для миграции `POST /api/gratitude-diary/favorites/migrate`:

```typescript
// Body:
{
  catalogPromptIds: string[],    // из старого localStorage
  customPrompts: { text: string }[]
}

// Логика:
// INSERT ... ON CONFLICT DO NOTHING для каталожных (идемпотентно).
// INSERT ... ON CONFLICT (user_id, custom_text) DO NOTHING для кастомных.
// Дедупликация кастомных по тексту защищает от двойной миграции:
// если пользователь открыл 2 вкладки одновременно — второй запрос просто ничего не создаст.
// Ответ: { imported: number }
```

---

## 5. Ограничения и правила бизнес-логики

| Правило                                                                       | Значение                                                                                              |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Максимум кастомных промптов на пользователя                                   | 50 (проверяется в `POST /favorites` перед INSERT)                                                     |
| Максимальная длина текста кастомного промпта                                  | 220 символов (VARCHAR(220) на уровне БД + Zod на уровне API)                                          |
| Максимальная длина `catalog_prompt_id`                                        | 64 символа                                                                                            |
| Кастомный промпт создаётся у пользователя без тарифных ограничений            | Избранное доступно всем тарифам                                                                       |
| Каталожный промпт можно "редактировать" только через создание кастомной копии | Как сейчас                                                                                            |
| При загрузке избранных — фильтровать "мёртвые" ссылки                         | Если `catalog_prompt_id` не найден в текущем каталоге → запись игнорируется (не возвращается клиенту) |

---

## 6. Порядок реализации

### Этап 1 — БД и бэкенд

1. **schema.ts** — добавить таблицу `gratitude_diary_favorite_prompts`
2. Запустить `pnpm db:generate && pnpm db:migrate`
3. **`server/api/gratitude-diary/prompts.get.ts`** — добавить загрузку избранных из БД в ответ (с фильтрацией "мёртвых" ссылок на каталог)
4. **`server/api/gratitude-diary/favorites.post.ts`** — создать эндпоинт (с проверкой лимита 50)
5. **`server/api/gratitude-diary/favorites/[id].patch.ts`** — создать эндпоинт
6. **`server/api/gratitude-diary/favorites/[id].delete.ts`** — создать эндпоинт
7. **`server/api/gratitude-diary/favorites/migrate.post.ts`** — батч-миграция из localStorage

### Этап 2 — Фронтенд

1. **`shared/dto/index.ts`** — добавить Zod-схемы `GratitudeDiaryFavoriteCreateDto`, `GratitudeDiaryFavoriteUpdateDto`
2. **`app/composables/useGratitudeDiaryFavorites.ts`** — создать composable с `catalogFavoriteMap` и rollback-паттерном
3. **`app/pages/practices/gratitude-diary/editor.vue`** — рефакторинг:
   - Убрать `FAVORITE_PROMPTS_STORAGE_KEY`, `persistFavoritePrompts()`, `loadFavoritePromptsFromStorage()`
   - Подключить composable `useGratitudeDiaryFavorites`
   - Обновить `loadPromptCatalog()` — инициализировать избранные из ответа API
   - Добавить логику однократной миграции из localStorage

### Этап 3 — Тестирование

1. Тест: добавление каталожного промпта в избранное
2. Тест: создание кастомного промпта
3. Тест: попытка создать 51-й кастомный промпт — должна вернуться ошибка 422
4. Тест: редактирование кастомного промпта
5. Тест: попытка редактировать каталожный промпт через PATCH — должна вернуться ошибка
6. Тест: удаление из избранного (проверить что `removedId` совпадает)
7. Тест: миграция из localStorage
8. Тест: двойная миграция (две вкладки одновременно) — не должно быть дублей
9. Тест: синхронизация между двумя вкладками/устройствами (открыть два браузера)
10. Тест: rollback оптимистичного обновления при ошибке сети

---

## 7. Схема взаимодействия (итоговая)

```
[Пользователь открывает editor.vue]
    │
    ▼
GET /api/gratitude-diary/prompts
    │
    ├── categories (из catalog.ts — статично)
    ├── worksheet (из БД — как сейчас)
    └── favoritePrompts (из gratitude_diary_favorite_prompts — НОВОЕ,
                         без "мёртвых" ссылок на удалённые промпты каталога)
    │
    ▼
[Проверка флага миграции в localStorage]
    ├── Если нет флага и есть старые данные → migrate.post.ts → удалить из LS
    └── Иначе — пропустить
    │
    ▼
[Пользователь нажимает ❤️ на промпте]
    │
    ├── Оптимистичное обновление UI (мгновенно)
    ▼
POST /api/gratitude-diary/favorites
    { promptType: 'catalog', catalogPromptId: 'self-1' }
    │
    ▼
[Ответ 201 с полным актуальным списком items → обновить ref favorites]
[При ошибке → rollback к snapshot + тост]

[Пользователь нажимает 🗑️ на избранном]
    │
    ├── Оптимистичное обновление UI (мгновенно)
    ▼
DELETE /api/gratitude-diary/favorites/:id
    │
    ▼
[Ответ 200 с { removedId } → подтвердить удаление]
[При ошибке → rollback к snapshot + тост]
```

---

## 8. Файлы, которые будут изменены/созданы

### Новые файлы

| Файл                                                   | Описание                             |
| ------------------------------------------------------ | ------------------------------------ |
| `server/api/gratitude-diary/favorites.post.ts`         | POST — добавить в избранное          |
| `server/api/gratitude-diary/favorites/[id].patch.ts`   | PATCH — редактировать кастомный      |
| `server/api/gratitude-diary/favorites/[id].delete.ts`  | DELETE — удалить из избранного       |
| `server/api/gratitude-diary/favorites/migrate.post.ts` | POST — батч-миграция из localStorage |
| `app/composables/useGratitudeDiaryFavorites.ts`        | Composable для работы с избранными   |

### Изменяемые файлы

| Файл                                             | Что меняется                                            |
| ------------------------------------------------ | ------------------------------------------------------- |
| `server/infrastructure/db/schema.ts`             | Добавить таблицу `gratitude_diary_favorite_prompts`     |
| `server/api/gratitude-diary/prompts.get.ts`      | Добавить загрузку `favoritePrompts` из БД               |
| `shared/dto/index.ts`                            | Добавить Zod DTO для избранных                          |
| `app/pages/practices/gratitude-diary/editor.vue` | Рефакторинг: убрать localStorage, подключить composable |
| `.docs/architecture.md`                          | Обновить описание модуля Gratitude Diary                |

---

## 9. Примечания

- **Нет paywall:** избранные промпты доступны на всех тарифах — это базовая персонализация.
- **Идемпотентность:** все операции добавления (как каталожного, так и батч-миграция) должны быть идемпотентны — повторный запрос не должен создавать дубликат.
- **Мягкое удаление:** в текущей задаче `soft delete` не нужен — физическое удаление строки достаточно.
- **Сортировка:** пока сортируем по `created_at DESC` (новые сверху). `sort_order` заложен в схему для будущего ручного перетаскивания, индекс для него можно добавить когда будет нужен.
- **Удалённые промпты каталога:** при загрузке избранных — записи с `catalog_prompt_id`, которых нет в текущем каталоге, игнорируются. Физически из БД не удаляются — на случай если промпт вернут обратно.
- **Консистентность данных:** `CHECK constraint` гарантирует что в БД не попадёт "мусор" (catalog без id или custom без текста). Это защищает от багов на уровне приложения.
