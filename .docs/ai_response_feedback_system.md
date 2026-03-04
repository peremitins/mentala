# AI Response Feedback System (актуализация под текущую кодовую базу)

Дата актуализации: 4 марта 2026

## 1. Контекст текущей реализации (as-is)

- В приложении пока нет реализованной системы оценки ответа ассистента.
- Чат рендерится на `app/pages/index.vue`, сообщения берутся из `app/stores/chat.ts`.
- Текущая модель сообщения в сторе: `{ role, content }`, без стабильного `messageId`.
- Бэкенд чата: `POST /api/chat/stream` и `POST /api/chat`.
- Для чата обязателен `therapySessionId` (server-side проверка доступа и биллинга).
- На клиенте в API-запросах уже отправляются заголовки `X-Platform` и `X-Timezone` (`app/plugins/api.ts`).
- На сервере уже есть middleware `x-request-id` (`server/middleware/request-id.ts`).

## 2. Цель и scope MVP

Цель: дать пользователю быстрый способ оценить конкретный ответ ассистента и отправить негативный репорт с минимальным, но достаточным контекстом для расследования.

В scope MVP:

- Оценка `like/dislike` на каждом сообщении ассистента.
- Для `dislike` опциональная тема и опциональный комментарий.
- Возможность изменить оценку (upsert, не плодим записи).
- Серверный rate limit.
- Хранение минимальных метаданных без автосохранения полного диалога.

Вне scope MVP:

- Полноценная админ-страница в UI (на этом этапе используем API/SQL-выгрузку).
- Автоотправка истории переписки в feedback.

## 3. UX и UI

### 3.1 Размещение

- Блок feedback рендерится только под сообщениями ассистента.
- Используем иконки Lucide, без эмодзи:
- `ThumbsUp`, `ThumbsDown`.

### 3.2 Состояния

- `idle`: обе кнопки нейтральные.
- `liked`: активен `ThumbsUp`.
- `disliked`: активен `ThumbsDown`.
- `submitting`: обе кнопки disable + компактный loader.
- `success`: короткий toast/подпись.
- `error`: откат optimistic state + сообщение об ошибке.

### 3.3 Поведение

- `like` отправляется в один клик.
- `dislike` открывает модалку:
- поле `topic` (опциональное),
- поле `comment` (опционально, до 1000 символов).

## 4. Нормализованные темы

UI-лейбл → код для БД:

- Неверно по фактам → `FACTUAL_ERROR`
- Не по теме → `OFF_TOPIC`
- Не помогло / слишком общее → `NOT_HELPFUL`
- Неподходящий тон → `TONE_ISSUE`
- Опасный или вредный совет → `UNSAFE_ADVICE`
- Нарушение приватности / запрос лишних данных → `PRIVACY_CONCERN`
- Не учтён контекст → `MISSED_CONTEXT`
- Другое → `OTHER`

## 5. Ключевая правка архитектуры идентификаторов

В текущем коде нет `assistantMessageId`, поэтому для привязки фидбека нужно добавить клиентский идентификатор сообщения ассистента.

Решение для MVP:

- Расширить тип сообщений в `chat` store до:
- `id: string` (nanoid),
- `role: 'user' | 'assistant'`,
- `content: string`.
- При создании assistant-сообщения в `startConversation/sendMessage` генерировать `id`.
- Именно `assistantMessageClientId` отправлять в feedback API.

Дополнительно в payload:

- `therapySessionId` (обязательный, уже есть в архитектуре),
- `sessionId` (опционально, для дополнительной корреляции).
- `assistantMessageText` (опционально, текст конкретного ответа ИИ для расследования жалоб).

## 6. База данных (Drizzle / Postgres)

Новая таблица: `chat_response_feedback`

Поля:

- `id` `bigserial` PK
- `user_id` `integer` not null (FK на `users.id`)
- `therapy_session_id` `integer` not null (FK на `therapy_sessions.id`)
- `session_id` `text` null
- `assistant_message_client_id` `varchar(64)` not null (`nanoid(21)`, оставляем запас)
- `rating` `smallint` not null (`1` или `-1`)
- `topic_code` `varchar(40)` null (опционально для `rating = -1`)
- `comment` `text` null
- `assistant_message_text` `text` null (до 8000 символов)
- `platform` `varchar(20)` not null (`ios|android|web`)
- `timezone` `varchar(100)` null
- `locale` `varchar(8)` null
- `request_id` `text` null
- `created_at` `timestamptz` default now not null
- `updated_at` `timestamptz` default now not null

Ограничения и индексы:

- `unique (user_id, therapy_session_id, assistant_message_client_id)`
- `index (therapy_session_id, created_at)`
- `index (rating, created_at)`
- `index (topic_code, created_at)`
- `check (rating in (-1, 1))`
- `check (comment is null or length(comment) <= 1000)`
- `check (assistant_message_text is null or length(assistant_message_text) <= 8000)`
- `check ((rating = 1 and topic_code is null) or (rating = -1))`

Опционально (не для MVP): `chat_response_feedback_events` для истории изменений.

## 7. API-контракты

### 7.1 Upsert feedback

`POST /api/chat/feedback`

Body:

- `therapySessionId: number` (required)
- `assistantMessageClientId: string` (required)
- `sessionId?: string`
- `rating: 1 | -1`
- `topicCode?: string` (optional, запрещён при `rating = 1`)
- `comment?: string` (0..1000)
- `assistantMessageText?: string` (0..8000)

Ответ:

- `{ ok: true, item: { id, rating, topicCode, comment, assistantMessageText, updatedAt } }`

Ошибки:

- Единый формат проекта: `{ error: { code, message, details? } }`
- Коды: `E_VALIDATION`, `E_AUTH`, `E_NOT_FOUND`, `E_RATE`, `E_UNKNOWN`.

### 7.2 Получение фидбеков сессии

`GET /api/chat/feedback?therapySessionId=123`

Ответ:

- `{ items: [{ assistantMessageClientId, rating, topicCode, assistantMessageText, updatedAt }] }`

Примечание: в текущем UX клиент не использует этот endpoint для восстановления состояния после reload (чат очищается при перезагрузке страницы). Endpoint оставляем для служебного использования (выгрузки/диагностика).

## 8. Серверная логика

- Проверить авторизацию и владельца `therapySessionId`.
- По возможности валидировать, что `assistantMessageClientId` указывает на сообщение ассистента в истории чата; если такая история недоступна в MVP, использовать клиентский контракт как fallback.
- Выполнить upsert по `unique (user_id, therapy_session_id, assistant_message_client_id)`.
- Заполнить контекст из запроса/заголовков:
- `platform`: из `X-Platform`,
- `timezone`: из `X-Timezone`,
- `request_id`: из `x-request-id`,
- `locale`: из профиля пользователя или текущей локали запроса.

## 9. Приватность и безопасность

- Не сохранять полный диалог в таблицу feedback.
- Не логировать `comment` в `console/pino/sentry`.
- Не добавлять отдельный флаг согласия `allowImprovement`: пользователь отправляет feedback явным действием.
- Для поля `comment` включить автоочистку: удалять (или обнулять) комментарии старше 60 дней.
- Рекомендация для реализации: ежедневный cleanup job (cron/worker), который обрабатывает только `comment`, не удаляя саму запись оценки.
- Базовый SQL cleanup:

```sql
update chat_response_feedback
set comment = null
where comment is not null
  and created_at < now() - interval '60 days';
```

- Обновить `public/legal/privacy-policy-ru.html` и `public/legal/privacy-policy-en.html` после внедрения фичи: явно описать feedback-данные и цель обработки.

## 10. Rate limit

Глобальный middleware уже действует (`/api/*`). Дополнительно для endpoint:

- на пользователя: `20` запросов / `10` минут,
- на `(user_id, therapy_session_id, assistant_message_client_id)`: `5` изменений / `1` минуту.
- на пользователя: максимум `200` feedback-событий в сутки.

Реализовать через `checkRateLimit` (Redis), как в auth endpoints.

## 11. Клиентская реализация (минимум)

- Добавить UI-компонент feedback в рендере assistant bubble на `app/pages/index.vue`.
- Расширить тип сообщений в `app/stores/chat.ts` и генерацию `id` для assistant messages.
- Реализовать optimistic update + rollback.
- Для `dislike` использовать диалог на shadcn-vue.
- Для `like` и успешного `dislike` показывать toast-подтверждение.
- Все async операции только через `async/await` + `try/catch`.

## 12. Тесты

Минимальный набор:

- unit: валидация DTO (`rating/topic/comment`),
- integration: `POST /api/chat/feedback` happy-path + валидация + unauthorized + rate limit,
- integration: upsert при смене `1 -> -1` и `-1 -> 1`.

## 13. Definition of Done

1. На сообщении ассистента есть блок feedback с Lucide-иконками.
2. `like` отправляется одним действием.
3. `dislike` открывает форму с опциональной темой.
4. Upsert работает, смена оценки не создаёт дублей.
5. Реализован отдельный rate limit endpoint.
6. Данные пишутся в `chat_response_feedback` с корректными индексами и текстом assistant-ответа (`assistant_message_text`).
7. Полный текст диалога не сохраняется в feedback.
8. Есть тесты API на happy-path и ошибки.
9. После изменения `schema.ts` выполнены `pnpm db:generate` и `pnpm db:migrate`.
10. После перезагрузки страницы состояние чата/feedback не восстанавливается (as-is поведение продукта), feedback работает в рамках активной runtime-сессии вкладки.

## 14. Open Questions (для фиксации перед разработкой)

На текущем этапе открытых вопросов нет.
