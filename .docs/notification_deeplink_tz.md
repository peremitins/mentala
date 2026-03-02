# ТЗ: Deep‑link навигация по push‑уведомлениям (home / meditation / breathing)

Версия: 1.0
Дата: 2026-02-06
Статус: draft

## 0. Контекст в проекте

- Payload для слота формируется в `server/application/notifications/global-orchestration.service.ts` и уже содержит `action` и `deepLink`.
- Отправка в FCM происходит через `server/application/notifications/delivery.service.ts`; все поля `data` приводятся к строкам.
- На клиенте обработка тапа на push находится в `app/plugins/push-notifications.client.ts` и сейчас навигация делается через `data.deepLink`.
- Для медитаций используются маршруты `/meditations`, `/meditations/[id]` и query `trackId` (редирект из `/meditations/[id]` уже реализован).
- Для дыхательных практик используются маршруты `/breath-practices` и `/breath-practices/[slug]`.

## 1. Цель

Сделать стандартное поведение при тапе по push‑уведомлению:

- приложение открывается на мобильных
- по умолчанию открывается главная
- если уведомление рекомендует медитацию — открывается конкретная медитация
- если уведомление рекомендует дыхательную практику — открывается квадратное дыхание `4-4-4-4` (box-breathing)

## 2. Проблема

Сейчас тап по уведомлению может не открывать приложение и не приводит к нужному экрану. Нужно сделать маршрут явно управляемым с бэкенда и не зависящим от парсинга текста на клиенте.

## 3. Нефункциональные требования

- Кроссплатформенность: iOS 13+ и Android 8+.
- Никакого парсинга текста на клиенте.
- Все контракты проходят через `shared/dto/*`.
- В push‑payload не передавать PII.
- Fallback всегда ведёт на главную.
- Приложение открывается только по явному тапу пользователя на push (без автозапуска при получении).

## 4. Термины

- **Navigation action** — структурированная цель перехода (тип + параметры).
- **Deep link** — внутренний путь приложения, который можно передать в payload.

## 5. Контракт данных

### 5.1. Новая навигационная структура

Добавить в payload объект `navigation`.

Типы:

```ts
// shared/dto/notifications.ts (новый тип)
export type NotificationNavigation =
  | { type: 'home' }
  | { type: 'meditation_track'; trackId: string }
  | { type: 'breath_practices' }
  | { type: 'breath_practice'; slug: string };
```

Правила:

- `home` → `/`
- `meditation_track` → `/meditations?trackId={trackId}`
- `breath_practices` → `/breath-practices`
- `breath_practice` → `/breath-practices/{slug}` (для дефолтной `box-breathing`/4-4-4-4 добавляем `?group=popular`)

### 5.2. Пример payload (в БД и на сервере)

```json
{
  "title": "Поддержка на сегодня",
  "body": "Сделай короткую медитацию, чтобы мягко перезагрузиться.",
  "deepLink": "/meditations?trackId=ultimate-relaxation",
  "navigation": {
    "type": "meditation_track",
    "trackId": "ultimate-relaxation"
  },
  "data": {
    "kind": "therapy",
    "entityKey": "anxiety",
    "slotId": "..."
  }
}
```

### 5.3. Как это уходит в FCM

У FCM `data` принимает только строки. Поэтому при отправке:

- `deepLink` уходит как строка (как сейчас)
- `navigation` сериализуется в строку `data.navigation`
- дополнительно можно продублировать `data.navType` и `data.navId` как строковые поля для удобного парсинга
- `navigation` считается источником истины, `deepLink` используется только как fallback

## 6. Логика определения navigation

### 6.1. Источник истины

Navigation определяется на сервере, а не на клиенте. Клиент только выполняет переход.

### 6.2. Источники данных

- AI‑тексты: `ai_generated_notification_texts.texts[]` должны содержать `actionHint`.
- Шаблонные тексты: `notification_texts` и `notification_text_presets` получают поле `actionHint`.

### 6.3. Хранение actionHint для шаблонных текстов

Рекомендуемый вариант: новая колонка `action_hint` в `notification_texts` и `notification_text_presets`.

Изменения структуры БД выполняются через `server/infrastructure/db/schema.ts`, после этого обязательны `pnpm db:generate` и `pnpm db:migrate`.

### 6.4. Enum для actionHint

```ts
export type NotificationActionHint = 'none' | 'meditation' | 'breathing';
```

### 6.5. Правила маппинга

- `meditation` → `navigation = meditation_track` с дефолтным `trackId`.
- `breathing` → `navigation = breath_practice` с дефолтным `slug` (MVP).
- `none` → `navigation = home`.

Примечание про будущее:

- Сейчас `breathing` всегда ведёт на квадратное дыхание `4-4-4-4` (box-breathing).
- В дальнейшем возможно переключение на `breath_practices` (список) без изменения контракта.

## 7. Дефолтные цели

Дефолты должны быть изменяемыми без релиза приложения.

Рекомендуемые значения из текущего каталога:

- Медитация по умолчанию: `ultimate-relaxation` (есть в `server/infrastructure/db/seed-meditations.ts`).
- Дыхательная практика по умолчанию: `box-breathing` (4-4-4-4, есть в `app/lib/breathPracticesCatalog.ts`).

Хранение дефолтов:

- Вариант A: env конфиг на сервере `DEFAULT_MEDITATION_TRACK_ID`, `DEFAULT_BREATH_PRACTICE_SLUG`.
- Вариант B: таблица/конфиг в БД с возможностью редактирования из админки.

## 8. Изменения в AI‑промпте

В `server/application/notifications/ai-generation.service.ts` добавить требование:

- Каждый item должен возвращать `actionHint`.
- `actionHint = meditation`, если текст явно рекомендует медитацию.
- `actionHint = breathing`, если текст явно рекомендует дыхательную практику.
- В остальных случаях `actionHint = none`.

Пример формата ответа AI:

```json
{
  "items": [
    { "text": "...", "imageTag": null, "subtype": null, "actionHint": "none" },
    {
      "text": "... медитация ...",
      "imageTag": "meditation",
      "subtype": null,
      "actionHint": "meditation"
    }
  ]
}
```

## 9. Изменения на сервере

- `global-orchestration.service.ts`: при сборке `NotificationPayload` добавлять `navigation` и `deepLink` по правилам из раздела 6.
- `delivery.service.ts`: передавать `navigation` в FCM `data` как строку. Для Android пуши отправляются **data-only** (без `notification`), а `title/body/image` кладутся в `data` для нативного рендера.
- `action` в payload используется только для кнопок/трекинга (yes/no/later/snooze). Для навигации `action` не используется.

Важно: если в будущем понадобится кастомный `clickAction`, он должен быть синхронизирован с `intent-filter` в `AndroidManifest.xml`, иначе тап по уведомлению не откроет приложение.

## 10. Изменения на клиенте

- `app/plugins/push-notifications.client.ts`:
- навигация выполняется только при `actionId === 'tap'` (или эквиваленте для системного тапа), а не при `snooze/yes/no`.
- при получении push без тапа приложение не должно автозапускаться или делать навигацию.
- `navigation` является источником истины. Если он есть и валиден — использовать только его.
- `deepLink` использовать только как fallback, если `navigation` отсутствует или невалиден.
- если ничего нет, fallback на `/`.
- клиент не использует `actionHint` и не парсит текст уведомления.

## 11. Аналитика

- Добавить действие `open` в `notification_interactions` при системном тапе.
- В `meta` фиксировать `navigation.type` и `navigation.id`.

## 12. Acceptance Criteria

- iOS: тап по push открывает приложение и ведёт на нужный экран.
- Android: тап по push открывает приложение и ведёт на нужный экран.
- При `actionHint=meditation` открывается конкретная медитация.
- При `actionHint=breathing` открывается квадратное дыхание `4-4-4-4` (box-breathing).
- При отсутствии navigation/deepLink — всегда `/`.
- Snooze/yes/no не должны делать навигацию.

## 13. Edge cases

- Неверный `trackId` или `slug`: fallback на `/meditations` или `/breath-practices`.
- Пустой payload: fallback на `/`.
- Если контент платный: навигация выполняется всегда, а paywall решается на уровне экрана (не в обработчике push).

## 14. Тест‑план (минимум)

- Unit: маппинг `actionHint → navigation`.
- Unit: сборка deepLink.
- Интеграция: slot → payload → FCM data.
- E2E на девайсе: tap по push в фоне и при закрытом приложении.

## 15. Решения и открытые вопросы

Решено:

- Дефолтная медитация: `ultimate-relaxation`.
- Дыхательные ведут на квадратное дыхание `4-4-4-4` (box-breathing).
- Web‑поддержка пока не нужна.
- Action для «быстрых практик» пока не нужен.
- Приложение открывается только по тапу на уведомление (без автозапуска при получении).

Открыто:

- Нужно ли логировать невалидные `navigation` (для диагностики)?

## 16. Идеи для улучшения (не в MVP)

- Remote‑config и A/B‑тесты: разные дефолтные треки/практики.
- Персонализация по профилю: подбирать трек по теме тревоги/стресса.
- Переход не сразу на экран, а на preview‑sheet с CTA «Начать сейчас».
- Автоматический fallback на список, если трек недоступен.
- Единый роутер для action‑типов (использовать и для push, и для chat‑chips).
