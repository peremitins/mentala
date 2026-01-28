# AI Relay (Нидерланды) — ТЗ и ответы на уточняющие вопросы

Документ описывает relay-сервис для запросов к OpenAI вне России, ответы на уточняющие вопросы по кодовой базе Mentala и итоговое ТЗ для реализации.

---

## Ответы на уточняющие вопросы

### 1. OpenAI: Chat Completions или Responses API, есть ли стриминг?

**Используется OpenAI Responses API**, не Chat Completions.

- **Эндпоинт**: `https://api.openai.com/v1/responses` (константа `OPENAI_URL` в `server/infrastructure/llm/openai.ts`).
- **Стриминг в чате**: да. Реализован через `openai.responses.stream()` (SDK `openai` v4). Цепочка: клиент → `POST /api/chat/stream` → `chatStreamViaProvider` → `openaiProvider.chatStream` → `openai.responses.stream()` → Nitro отдаёт SSE клиенту.
- **Где формируется SSE-ответ**: `server/api/chat/stream.post.ts`. Используется **не** `send(eventStream)`, а явные заголовки и запись в `event.node.res`:
  - `setHeader(event, 'Content-Type', 'text/event-stream')`, `Cache-Control: no-cache`, `Connection: keep-alive`;
  - цикл `for await (const delta of stream)` → `res.write(\`data: ${JSON.stringify({ output_text_delta: delta })}\n\n\`)`;
  - после стрима — один чанк `data: ${JSON.stringify({ chips })}\n\n` (если есть чипы);
  - в конце — `res.write('data: [DONE]\n\n')`, затем `res.end()`.
- **Формат событий, которые получает клиент**: объекты `{ output_text_delta: string }`, объект `{ chips: SuggestedChip[] }`, строка `[DONE]`, при ошибке — объект `{ error: { code, message, data? } }`. Других `event.type` из OpenAI (например `response.completed`) клиенту не отдаём — только дельты текста и финальные chips/DONE.
- **Нестриминговые вызовы** к тому же Responses API через `$fetch(OPENAI_URL, ...)` используются для:
  - чат без стрима (`chatViaProvider` → `openaiProvider.chat`);
  - генерация suggested chips (JSON schema / fallback без schema);
  - finish session (summary);
  - генерация текстов уведомлений.

Итого: один API — **Responses API**; стриминг в чате есть и активно используется (`CHAT_STREAM_MODE = true`). **Важно**: Nitro сейчас не проксирует raw SSE OpenAI — он получает от SDK поток дельт, сам собирает формат `data: {"output_text_delta":"..."}`, `data: {"chips":[...]}`, `data: [DONE]`. В ТЗ зафиксирован **вариант А**: Relay транслирует ответ OpenAI в этот же формат Mentala (см. раздел 6.1), чтобы Nitro почти не менялся — только читает стрим от Relay и пишет чанки как есть.

---

### 2. Где живёт код генерации уведомлений?

Генерация уведомлений реализована **в том же репозитории (Nitro + BullMQ)**:

- **Сервис**: `server/application/notifications/ai-generation.service.ts` — функция `generateNotificationTexts()`, внутри вызывается `chatViaProvider({ provider: 'openai', ... })`.
- **Очередь**: BullMQ, очередь `AI_TEXT_POOL_QUEUE` (`server/application/notifications/queues/aiTextPool.queue.ts`), лимитер 5 задач/сек.
- **Воркер**: `server/application/notifications/workers/aiTextPool.worker.ts` — в job вызывает `refillTextPool()` из того же `ai-generation.service.ts`, который в итоге дергает `chatViaProvider`.
- **Триггеры**: инициализация/обновление преференций уведомлений, планировщик `aiTextPool.scheduler.ts` и т.п. — все ведут к этому сервису.

Отдельного микросервиса нет: и чат, и генерация уведомлений идут через Nitro (API routes) и воркеры BullMQ в одном проекте. **Важно**: API routes и воркеры — разные runtime-контексты (HTTP-запрос с `event.node.req` vs job без request context). Единый клиент к AI (relay или прямой OpenAI) должен работать в обоих контекстах **без зависимости от `event`, `event.node.req` и т.п.** — иначе в воркере вызов упадёт.

---

### 3. Примерная нагрузка

В коде явных цифр по пиковой нагрузке нет. По конфигу и очередям можно оценить:

- **Rate limit API**: в `server/config/index.ts` задано `rateLimit: { windowMs: 60_000, max: 60 }`. Применяется в **middleware** `server/middleware/rate-limit.ts`: ключ — `x-forwarded-for` или `event.node.req.socket.remoteAddress`, в пределах одного окна (60 с) допускается не более 60 запросов, иначе 429 и `Retry-After`. Это **глобальный** лимит на приложение (все маршруты), не отдельно на чат.
- **Чат**: один запрос на одно сообщение пользователя; стрим один на сессию. Пиковое количество одновременных чатов не задано — разумно заложить **порядка 20–50 параллельных стримов** для smoke-теста (как в ТЗ) и лимиты Relay выставить с запасом (например, 120/мин на чат по `X-Relay-Client`).
- **Генерация уведомлений**: очередь `aiTextPool` — **5 jobs/сек** (limiter в `server/application/notifications/queues/aiTextPool.queue.ts`). В час — до ~18 000 задач при постоянной нагрузке; реально меньше, так как догенерация вызывается по событиям. Для ТЗ: **до 100–200 генераций в час** в среднем, пики — несколько сотен в час.

Итого для ТЗ: **пик одновременных чатов ~20–50**, **генераций уведомлений до нескольких сотен в час**; baseline лимиты Relay для MVP зафиксированы в разделе 7.

---

### 4. Нужно ли Relay с несколькими ключами OpenAI?

Сейчас в коде **один набор** ключей OpenAI, без ротации: `NUXT_OPENAI_API_KEY` (обязательный), опционально `NUXT_OPENAI_ORG_ID` / `OPENAI_ORG_ID`, `NUXT_OPENAI_PROJECT_ID` / `OPENAI_PROJECT_ID`, плюс `NUXT_OPENAI_ENABLE_ENCRYPTED_REASONING` для чата. Все читаются в `server/infrastructure/llm/openai.ts` из `process.env`. Разных ключей на окружения (dev/stage/prod) или ротации нет.

Для MVP Relay достаточно **одного ключа** (и при необходимости org/project) на инстанс. Требование «несколько ключей (ротация или по окружениям)» заложено в ТЗ как **опциональное расширение**.

---

### 5. Строгая изоляция: запрет передавать в OpenAI user id, email и т.д.?

По текущей реализации (проверено по **телу запроса** к OpenAI, а не по логам):

- **Формирование payload** в `server/infrastructure/llm/openai.ts`: для `chat` тело запроса собирается в переменную `body` (см. строки ~561–623): `model`, `input`, `max_output_tokens`, `temperature`, `store`, `metadata`, `text`, `truncation`, при необходимости `previous_response_id`, `include`, `reasoning`. Поля **userId**, **user**, **email** в этот объект не добавляются — они используются только на нашем бэкенде (responseIdStore, summaryStore, welcome prompt, chat_settings). В **input** попадают только тексты сообщений, в которых уже подставлены `user_name`, `user_gender` из промптов (`server/application/prompts`).
- **В генерации уведомлений** в системный промпт попадают: имя пользователя, пол, тон, обращение, название/описание привычки или темы — без email и без числового id.

Итого: **строгая изоляция «вообще не передавать идентификаторы и email»** при желании достижима, но потребует не передавать в OpenAI имя/пол в открытом виде (или только обезличенные значения). В ТЗ зафиксировано: **(1) минимизация в логах Relay** — не логировать контент сообщений и системные промпты в сыром виде; **(2) опциональный режим строгой минимизации** — флаг (например env или заголовок), при включении которого персонализация (имя, пол) в запросах к OpenAI отключается или обезличивается, чтобы можно было быстро закрутить гайки без переписывания промптов.

---

## Дополнительно по кодовой базе (для ТЗ)

- **TTS и Whisper** тоже используют `NUXT_OPENAI_API_KEY`:
  - TTS: `server/api/tts/openai.post.ts`, `server/api/tts/openai.stream.get.ts` — `https://api.openai.com/v1/audio/speech`;
  - STT: `server/api/stt/whisper.post.ts` — `https://api.openai.com/v1/audio/transcriptions`.
- В черновике ТЗ речь про «чат и генерацию уведомлений». TTS/STT можно либо тоже вести через Relay (отдельные эндпоинты или универсальный прокси к `/v1/audio/*`), либо оставить прямой вызов с ключом на Яндексе и вынести в следующий этап. В данном ТЗ фокус — **Responses API (чат, чипы, finish session, уведомления)**; TTS/STT в разделе «Расширения».

Ниже — итоговое ТЗ с учётом кодовой базы.

---

# Техническое задание: AI Relay (на основе кодовой базы Mentala)

## 1. Цели и не цели

### Цели

1. Все запросы к **OpenAI Responses API** (чат, стрим, чипы, finish session, генерация текстов уведомлений) выполняются с сервера вне России (Нидерланды).
2. Ключи OpenAI не хранятся в Яндекс-окружении.
3. Минимизация передачи персональных данных в OpenAI (data minimization) и в логах Relay.
4. Надёжность: таймауты, ретраи, деградация.
5. Наблюдаемость: метрики, логи, трассировка.

### Обязательное требование: переключатель внутренний / внешний транспорт

- **Текущую логику не убираем**: все существующие вызовы к OpenAI (прямой `$fetch(OPENAI_URL)`, `openai.responses.stream()` и т.д.) остаются в коде и продолжают использоваться, когда выбран **внутренний** режим (без Relay).
- **Добавляем только переключатель** (одна переменная окружения или один флаг), по которому выбирается транспорт:
  - **Внешний сервер (Relay)** — запросы идут на `AI_RELAY_URL` с подписью; используется в проде на Яндексе (ключ OpenAI только на Relay).
  - **Внутреннее использование (как сейчас)** — запросы идут напрямую в OpenAI с `NUXT_OPENAI_API_KEY`; используется в локальной разработке, на стендах без Relay или при откате.
- Реализация: **не заменять** текущий код на Relay, а **добавить** ветку «если включён Relay — идём в Relay, иначе — текущий прямой вызов». Переключение без изменения кода — только через конфиг/env.

### Не цели

- Полная анонимизация до уровня «невозможно восстановить смысл» — делаем минимизацию, не магию.
- Замена архитектуры чата Mentala — меняется только транспорт до OpenAI (через Relay вместо прямого вызова), при этом прямой транспорт остаётся и доступен по переключателю.
- В первой версии: TTS/STT через Relay — опционально (см. раздел расширений).

---

## 2. Контекст из кодовой базы Mentala

### 2.1. Текущие вызовы OpenAI (всё в одном проекте)

| Сценарий              | Где вызывается                                                                               | API / метод                                | Стриминг           |
| --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------ |
| Чат (сообщения)       | `server/api/chat/stream.post.ts`                                                             | Responses API, `openai.responses.stream()` | Да (SSE)           |
| Чат (non-stream)      | Маршрут `server/api/chat.post.ts` (реэкспорт handler из `server/interface/api/chat.post.ts`) | Responses API, `$fetch(OPENAI_URL)`        | Нет                |
| Suggested chips       | `server/application/suggested-chips.service.ts` → openai                                     | Responses API, `$fetch(OPENAI_URL)`        | Нет                |
| Finish session        | `server/api/session/finish.post.ts` → openaiProvider                                         | Responses API, `$fetch(OPENAI_URL)`        | Нет                |
| Генерация уведомлений | `server/application/notifications/ai-generation.service.ts` → `chatViaProvider`              | Responses API, `$fetch(OPENAI_URL)`        | Нет                |
| TTS                   | `server/api/tts/openai.post.ts`, `openai.stream.get.ts`                                      | `/v1/audio/speech`                         | Опционально stream |
| STT (Whisper)         | `server/api/stt/whisper.post.ts`                                                             | `/v1/audio/transcriptions`                 | Нет                |

Общий слой: `server/application/llm.service.ts` (`chatViaProvider`, `chatStreamViaProvider`), провайдер `server/infrastructure/llm/openai.ts`. Ключ: `NUXT_OPENAI_API_KEY`.

### 2.2. Что передаётся в OpenAI сейчас

- В **input** (Responses API): сообщения с ролями `system`, `user`, `assistant`, `developer`; в текстах подставляются `user_name`, `user_gender` (из `server/application/prompts`). Числовой `userId` и email в запрос к OpenAI не попадают.
- **Поля тела запроса Responses API по сценариям** (все читаются/формируются в `server/infrastructure/llm/openai.ts`):
  - **Всегда**: `model`, `input`, `temperature`, `max_output_tokens` (или из конфига по сценарию).
  - **Чат (stream и non-stream)**: плюс `store`, `truncation`, опционально `previous_response_id`, `metadata`, при включённом reasoning — `include`, `reasoning`.
  - **Только чипы**: плюс `text.format` с `json_schema` (при fallback без schema — `text: {}`).
  - **Finish session**: тот же Responses API, отдельный вызов с промптом под summary и structured output.
  - **Уведомления**: через `chatViaProvider` — те же поля, что чат (без previous_response_id), модель и лимиты из `config.llm.openai.settings.notifications`.

### 2.3. Переменные окружения (Яндекс сегодня)

- **Где читаются**: `NUXT_OPENAI_API_KEY`, `NUXT_OPENAI_ORG_ID`, `OPENAI_ORG_ID`, `NUXT_OPENAI_PROJECT_ID`, `OPENAI_PROJECT_ID`, `NUXT_OPENAI_ENABLE_ENCRYPTED_REASONING` — все в `server/infrastructure/llm/openai.ts` из `process.env`. Для Whisper ключ дополнительно пробрасывается в runtimeConfig в `nuxt.config.ts` (`openaiApiKey`) и читается в `server/api/stt/whisper.post.ts` через `useRuntimeConfig(event).openaiApiKey`.
- После внедрения Relay на Яндексе: оставить только `AI_RELAY_URL`, `AI_RELAY_AUTH_SECRET`, `AI_RELAY_CLIENT_ID`; `NUXT_OPENAI_API_KEY` и перечисленные OpenAI-\* — удалить из Яндекс-окружения.

---

## 3. Инфраструктура и размещение Relay

- **Регион**: Нидерланды (или другая не российская локация). Варианты: Hetzner Cloud (Амстердам), DigitalOcean (Амстердам), AWS (eu-west-1 / eu-central-1), OVH (Европа).
- **Запуск**: Docker-контейнер.
- **Вход**: только HTTPS (TLS).
- **Домен**: например `ai-relay.mentala.app` (или отдельный поддомен).

---

## 4. Секреты и конфигурация

**На AI Relay:**

- `OPENAI_API_KEY` — только здесь.
- Опционально: `OPENAI_ORG_ID`, `OPENAI_PROJECT_ID` (если нужны для Responses API).
- `RELAY_AUTH_SECRET` — секрет для подписи запросов (HMAC).
- `ALLOWED_CLIENTS` — список идентификаторов клиентов (например `mentala-yc-prod`), если нужно несколько.
- Таймауты и лимиты (см. ниже).

**На Яндекс-сервере (Nitro + воркеры):**

- `AI_RELAY_URL=https://ai-relay.mentala.app`
- `AI_RELAY_AUTH_SECRET` — тот же секрет.
- `AI_RELAY_CLIENT_ID=mentala-yc-prod` (или иной идентификатор).
- Никаких `NUXT_OPENAI_API_KEY` и других OpenAI-ключей.

---

## 5. Авторизация запросов Яндекс → Relay

**Вариант А (рекомендуется). Подпись HMAC**

- Заголовки: `X-Relay-Client`, `X-Relay-Timestamp` (unix_ms), `X-Relay-Nonce` (uuid), `X-Relay-Signature` (base64(hmac_sha256(secret, canonicalString))).
- **Каноническая строка для подписи** (одна строка, поля в указанном порядке, разделитель — один символ перевода строки `\n`):
  1. HTTP method (uppercase), например `POST`
  2. path (без хоста и query), например `/v1/responses`
  3. значение `X-Relay-Timestamp`
  4. значение `X-Relay-Nonce`
  5. hex-строка SHA-256 от **raw body запроса** (если тела нет — пустая строка)
  6. значение `X-Relay-Client`
  Формат: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256_HEX\nCLIENT_ID`.
- **Практические нюансы (иначе 401 в проде):**
  1. **Хеш тела** считается от **сырых байт тела**, а не от «объекта после своего JSON.stringify внутри $fetch». На стороне Mentala (relayClient): явно сформировать `const rawBody = JSON.stringify(body)` (один раз), этим же `rawBody` отправить запрос (body: rawBody или эквивалент) и от **этих же байт** посчитать SHA-256 для канонической строки. Иначе одна сторона подпишет один объём, другая проверит другой — подпись не сойдётся.
  2. **Кодировка**: зафиксировать `Content-Type: application/json; charset=utf-8` при отправке и при проверке на Relay, чтобы байты тела были однозначны.
- Relay проверяет: timestamp не старше 60 с, nonce не повторялся, подпись совпадает. **Хранение nonce**: для MVP — **in-memory** с TTL (например 120 с), при рестарте Relay дубли nonce допустимы. Redis — опциональное расширение для распределённой проверки.
- **Вариант Б.** mTLS — по желанию, для усиления безопасности.

---

## 6. API Relay

### 6.1. POST /v1/responses

Универсальный эндпоинт под **OpenAI Responses API** (чат, чипы, finish session, уведомления).

**Контракт (минимальные правки в Mentala):** тело запроса **совпадает с OpenAI Responses API один в один**. Mentala не формирует обёртку — отправляет тот же `body`, что и при прямом вызове в `https://api.openai.com/v1/responses`. Служебные поля передаются **в заголовках**:

- **Заголовки от Mentala**: `X-Request-Id` (идемпотентность/трассировка), `X-Purpose` (`chat` | `chat_stream` | `chips` | `finish_session` | `notification` | `other`). Плюс заголовки подписи HMAC (см. раздел 5).
- **Тело**: ровно как в OpenAI — `model`, `input`, `temperature`, `max_output_tokens`, `previous_response_id`, `store`, `truncation`, `text.format` (для чипов) и т.д. Никакой обёртки с полями `requestId`, `purpose` в body — только заголовки.

Relay:

- Читает тело как JSON, валидирует (Zod) против схемы OpenAI Responses API.
- При необходимости «чистит» запрос (убирает явные персональные поля, ограничивает размер input).
- Подставляет свой `OPENAI_API_KEY` и опционально org/project.
- Отправляет запрос в `https://api.openai.com/v1/responses` с этим телом.
- Ответ: при non-stream — как у OpenAI, плюс заголовок `X-Relay-Request-Id` для трассировки; при stream — см. ниже.

**Стриминг (заголовок `X-Purpose: chat_stream` или параметр stream в теле):** выбран **вариант А — Relay транслирует в формат Mentala**. Relay читает SSE от OpenAI, извлекает текстовые дельты (и при необходимости `response.completed` и т.д.), и стримит клиенту **текущий формат Mentala**:
- чанки `data: {"output_text_delta":"<delta>"}\n\n`;
- в конце (после стрима) при необходимости `data: [DONE]\n\n`.
Чипы генерируются на стороне Mentala после стрима, в поток Relay не входят. Nitro (`server/api/chat/stream.post.ts`) **почти не меняется**: вместо `openai.responses.stream()` получает стрим от Relay (те же строки/чанки в формате Mentala) и пишет их в `res.write(...)` как сейчас. Заголовки ответа при стриме: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.

### 6.2. GET /health и GET /ready

- **GET /health**: статус сервиса, без вызовов в OpenAI. (GET — типичный ожидаемый метод для healthcheck у балансировщиков.)
- **GET /ready**: опционально — проверка DNS, доступности наружу и т.д.

### 6.3. (Опционально) Диагностика исходящего IP

- Эндпоинт для админа: запрос к сервису «what is my ip» и возврат исходящего IP/региона — для проверки, что трафик к OpenAI идёт не из России.

---

## 7. Лимиты и защита

- **Rate limit по `X-Relay-Client`** (baseline для MVP):
  - `chat_stream`: 120 запросов в минуту;
  - `chat` (non-stream): 120 запросов в минуту;
  - `notification`: 600 запросов в минуту, плюс ограничение параллелизма — не более 10 одновременных запросов на инстанс на purpose `notification`.
- **Связь с текущим rate limit приложения (Mentala):**
  - Глобальный rate limit (`server/config/index.ts`, `server/middleware/rate-limit.ts`) применяется к HTTP-запросам. **Стриминг чата не должен ломаться**: лимит должен считаться на **один запрос открытия стрима** (один вызов `POST /api/chat/stream`), а не на каждый SSE-чанк. То есть один открытый стрим = один учтённый запрос в окне.
  - Генерация уведомлений идёт через воркеры BullMQ, которые вызывают Relay **напрямую** (через relayClient), минуя HTTP-маршруты приложения. Поэтому воркеры **не упираются** в глобальный rate limit middleware — лимиты применяются только на стороне Relay (по `X-Relay-Client` и purpose).
- **Размер тела**: 256 KB на запрос.
- **Таймауты**: connect 5 с, response 60 с; для стриминга не обрывать активный поток пока приходят чанки.
- **Ретраи**: только на сетевые ошибки и 429, 500, 503; экспоненциальная задержка, макс. 2 повтора; идемпотентность через `X-Request-Id` при необходимости (краткое хранение результатов на Relay для защиты от дублей).

---

## 8. Логи и приватность

- **Логировать**: X-Request-Id, X-Purpose (purpose), model, latencyMs, statusCode, tokens (если доступно), X-Relay-Request-Id.
- **Не логировать**: текст сообщений пользователя, системные промпты целиком (допустимо только хеш, например SHA-256). **Запрещено логировать** заголовки `Authorization` и любые bearer-токены (в т.ч. входящие от клиента и исходящие к OpenAI).
- `LOG_LEVEL=info|warn|error`; в проде без debug.

---

## 9. Наблюдаемость

- **Метрики Prometheus**: `relay_requests_total{purpose, status}`, `relay_latency_ms_bucket{purpose}`, `relay_openai_errors_total{code}`. **Обязательно**: gauge `relay_open_streams_active` (или аналог) — количество активных стрим-соединений, чтобы можно было диагностировать нагрузку и «почему сервер умирает».
- **Трейсинг OpenTelemetry**: проброс `X-Request-Id` / `traceparent`.

---

## 10. Изменения в коде Mentala

### 10.0. Переключатель: внутреннее использование vs внешний Relay (обязательно)

- **Сохраняем текущее поведение**: существующая логика прямых вызовов в OpenAI (`OPENAI_URL`, `openai.responses.stream()`, `NUXT_OPENAI_API_KEY`) **не удаляется**. Она используется, когда выбран режим «внутреннее использование».
- **Переключатель** — одна переменная окружения, по которой выбирается транспорт:
  - **Вариант А (рекомендуется)**: если задан и не пустой `AI_RELAY_URL` — используем Relay (внешний сервер); иначе — прямой вызов в OpenAI (внутреннее использование, как сейчас). Никакого удаления ключа из кода: при отсутствии `AI_RELAY_URL` по-прежнему читается `NUXT_OPENAI_API_KEY`.
  - **Вариант Б (опционально)**: явный флаг `AI_USE_RELAY=true|false`; при `false` или отсутствии — внутреннее использование, при `true` — Relay (при этом `AI_RELAY_URL` обязателен).
- В коде: в начале каждой точки вызова (chat, chatStream, chips, finishSession, уведомления) — проверка «если включён Relay → relayClient.\*, иначе → текущая реализация». Текущая реализация остаётся одним из двух путей, без дублирования бизнес-логики.
- Итог: **лёгкий способ переключиться** без правок кода — в проде на Яндексе выставляем `AI_RELAY_URL` (и не выставляем `NUXT_OPENAI_API_KEY`); локально/на стенде без Relay не выставляем `AI_RELAY_URL`, оставляем `NUXT_OPENAI_API_KEY` — всё работает как сейчас.

### 10.1. Единый клиент к AI и место логики подписи

- **Логика подписи HMAC** и вызов Relay: вынести в отдельный модуль, например `server/infrastructure/llm/relayClient.ts` (или альтернатива — внутри `openai.ts` как альтернативный транспорт). Модуль вызывается **только когда переключатель указывает на Relay**. Модуль должен: формировать каноническую строку, считать HMAC, выставлять заголовки, делать запрос на `AI_RELAY_URL + path` (без зависимости от `event` или `event.node.req`).
- Слой **расширяем**, а не заменяем: при «Relay включён» — вызов relayClient; при «внутреннее использование» — существующий прямой вызов в OpenAI (текущая реализация в `openai.ts`).

### 10.2. Конкретные изменения в `server/infrastructure/llm/openai.ts`

- **В начале каждого метода** (chat, chatStream, chips, finishSession): проверка переключателя (например `if (process.env.AI_RELAY_URL) { return relayClient.*(...); }`), иначе — выполнение **текущей** логики без изменений.
- **Non-stream** (chat, chips, finish session, уведомления): при включённом Relay — тело запроса **то же**, что и в OpenAI (без обёртки). Отправка: сформировать `rawBody = JSON.stringify(body)` один раз, от этих же байт посчитать SHA-256 для подписи; заголовки: подпись HMAC, `X-Request-Id`, `X-Purpose`, `Content-Type: application/json; charset=utf-8`; body: тот же объект (или rawBody, см. раздел 5). Вызов: `$fetch(AI_RELAY_URL + '/v1/responses', { method: 'POST', headers, body })`. При внутреннем использовании — оставляем как есть: `$fetch(OPENAI_URL, { method: 'POST', headers: { Authorization: Bearer ... }, body })`.
- **Stream**: при включённом Relay — Relay возвращает стрим в **формате Mentala** (чанки `data: {"output_text_delta":...}\n\n`, затем `data: [DONE]\n\n`). Nitro читает этот стрим от Relay и пишет в `res.write(...)` как сейчас; контракт с `server/api/chat/stream.post.ts` не меняется (тот же формат чанков). При внутреннем использовании — оставляем как есть: `openai.responses.stream(streamOptions)`.
- Итог: **не переписывать слой** — добавить ветку «если Relay — relayClient, иначе — текущий код»; текущий прямой вызов остаётся вторым путём.

### 10.3. Переменные окружения

- **Переключатель (обязательно)**:
  - **Внешний Relay**: задаём `AI_RELAY_URL`, `AI_RELAY_AUTH_SECRET`, `AI_RELAY_CLIENT_ID`. На Яндексе в проде при использовании Relay ключ OpenAI не задаём (`NUXT_OPENAI_API_KEY` отсутствует или не используется в этой ветке).
  - **Внутреннее использование (как сейчас)**: не задаём `AI_RELAY_URL` (или явно `AI_USE_RELAY=false`, если выбран вариант с флагом). Задаём `NUXT_OPENAI_API_KEY` и при необходимости org/project/encrypted-reasoning — запросы идут напрямую в OpenAI.
- Добавить в проект: `AI_RELAY_URL`, `AI_RELAY_AUTH_SECRET`, `AI_RELAY_CLIENT_ID` (используются только когда выбран Relay).
- В окружении, где Relay не используется (локальная разработка, стенд без Relay): оставляем только `NUXT_OPENAI_API_KEY` и т.д., как сейчас — переключение без изменения кода.

### 10.4. Обработка ошибок (маппинг)

| Код от Relay | Действие                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401          | Проблема подписи/секрета — **критичный алерт**, не ретраить.                                                                                                                                        |
| 429          | Мягкий ретрай с backoff; для воркеров уведомлений — **обязательно** ретрай (job retry).                                                                                                             |
| 5xx          | Ретрай до 2 раз с экспоненциальной задержкой; после неудачи — для чата вернуть пользователю понятный текст без внутренних деталей, для воркеров — dead letter / логирование и повтор по расписанию. |

### 10.5. Воркеры BullMQ

- Воркер `aiTextPool.worker.ts` и все вызовы `chatViaProvider` для уведомлений используют тот же клиент (провайдер OpenAI с транспортом Relay). **Требование**: никаких зависимостей от request context (`event`, `event.node.req`, cookies и т.д.) — клиент должен работать только с env и переданными параметрами, иначе в воркере вызов упадёт.

---

## 11. Тестирование Relay

- **Unit**: проверка подписи, timestamp и nonce, валидация схемы.
- **Integration**: мок OpenAI (nock), проверка стриминга.
- **Load smoke**: 20 параллельных чатов (стрим), 100 генераций уведомлений, без утечек памяти.

---

## 12. Критерии приемки

1. **Переключатель работает**: при отсутствии `AI_RELAY_URL` (внутреннее использование) все запросы к OpenAI идут как сейчас (прямой вызов с `NUXT_OPENAI_API_KEY`); при заданном `AI_RELAY_URL` все запросы идут через Relay. Переключение — только сменой env, без правок кода.
2. В режиме Relay: на Яндекс-сервере не используется ключ OpenAI для Responses API (чат, чипы, finish session, уведомления); все эти вызовы успешно проходят через Relay; стриминг чата работает.
3. При недоступности Relay (режим Relay включён) система корректно деградирует: чат показывает ошибку пользователю, генератор уведомлений может ставить задачу на повтор (как сейчас при ошибках).
4. В логах Relay нет контента сообщений.
5. Есть метрики и health/ready эндпоинты.
6. Режим «внутреннее использование» сохранён: тот же код и та же логика, что до внедрения Relay, работают при отключённом Relay (например локально или при откате).

---

## 13. Расширения (вне первой версии)

- **TTS/STT**: проксирование `/v1/audio/speech` и `/v1/audio/transcriptions` через Relay, чтобы и аудио-трафик шёл из Нидерландов и ключ не хранился на Яндексе.
- **Несколько ключей OpenAI**: ротация или разные ключи по окружениям на стороне Relay.
- **Строгая изоляция / режим строгой минимизации**: режим, в котором Relay не передаёт в OpenAI имя/пол пользователя (или передаёт только обезличенные значения). Реализуется флагом (env или заголовок), чтобы можно было отключить персонализацию без переписывания промптов; конфигурируемо по `purpose` или заголовку.

---

## 14. Ссылки на файлы кодовой базы

Пути проверены по репозиторию: маршрут Nitro для non-stream чата — `server/api/chat.post.ts`, он реэкспортирует handler из `server/interface/api/chat.post.ts` (именно такая структура в проекте).

| Назначение                                               | Файл(ы)                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Провайдер OpenAI, Responses API, стрим                   | `server/infrastructure/llm/openai.ts`                                                                    |
| Выбор провайдера, chatViaProvider, chatStreamViaProvider | `server/application/llm.service.ts`                                                                      |
| API чата (стрим), формирование SSE                       | `server/api/chat/stream.post.ts`                                                                         |
| API чата (non-stream): маршрут и handler                 | `server/api/chat.post.ts` → `server/interface/api/chat.post.ts`                                         |
| Чипы                                                     | `server/application/suggested-chips.service.ts`                                                          |
| Finish session                                           | `server/api/session/finish.post.ts`                                                                      |
| Генерация уведомлений                                    | `server/application/notifications/ai-generation.service.ts`                                              |
| Воркер уведомлений                                       | `server/application/notifications/workers/aiTextPool.worker.ts`                                          |
| Очередь уведомлений                                      | `server/application/notifications/queues/aiTextPool.queue.ts`                                            |
| Конфиг LLM и rate limit                                  | `server/config/index.ts`, `server/middleware/rate-limit.ts`                                              |
| Промпты (user_name, user_gender)                         | `server/application/prompts/index.ts`                                                                    |
| Порт LLM                                                 | `server/ports/index.ts`                                                                                  |
| TTS/STT (опционально в Relay)                            | `server/api/tts/openai.post.ts`, `server/api/tts/openai.stream.get.ts`, `server/api/stt/whisper.post.ts` |
