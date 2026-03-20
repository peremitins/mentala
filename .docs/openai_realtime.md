# Mentala: ТЗ на Realtime Voice Mode через OpenAI Realtime API

Статус: draft v1.0  
Дата актуализации: 17 марта 2026

Официальные источники OpenAI, на которые должен опираться rollout:

- Realtime overview: https://platform.openai.com/docs/guides/realtime
- WebRTC guide: https://platform.openai.com/docs/guides/realtime-webrtc
- Realtime client secrets: https://platform.openai.com/docs/api-reference/realtime-client-secrets
- Realtime conversations / VAD / events: https://platform.openai.com/docs/guides/realtime-conversations
- Pricing: https://platform.openai.com/docs/pricing

## 1. Цель

Добавить в Mentala отдельный режим голосового общения в реальном времени, в котором пользователь:

- говорит без ручной отправки сообщений;
- получает голосовой ответ с низкой задержкой;
- может перебивать ассистента;
- продолжает разговор в рамках одной realtime-сессии;
- видит текстовую расшифровку обеих сторон прямо в текущем чате.

Важно: это не замена текущего текстового чата и не замена текущей диктовки. Это отдельный режим внутри существующего чата.

## 2. Зафиксированные продуктовые решения

Ниже решения уже приняты и не считаются open questions:

1. Realtime voice доступен только на тарифе `Premium`.
2. Действует жёсткий лимит `60 минут` на один месячный quota-период.
3. Realtime voice дополнительно расходует существующие weekly AI minutes текстового чата.
4. Во время активной realtime voice-сессии:
   - текстовое поле ввода отключено;
   - обычная кнопка диктовки отключена;
   - обычная отправка текста отключена.
   - это осознанное ограничение MVP, чтобы не смешивать voice и text flow в одной активной сессии; не считать это продуктовым правилом навсегда.
5. Текстовая расшифровка:
   - должна появляться в `chat.messages` как обычная история текущего экрана;
   - не должна сохраняться на сервере после завершения realtime-сессии.
6. Fallback-путь в первой версии не реализуется:
   - основной и единственный клиентский транспорт: `WebRTC`.
7. Модель в первой версии фиксирована, а голос определяется пользовательской assistant voice setting:
   - без runtime-смены голоса внутри уже активной realtime-сессии;
   - новый голос применяется только со следующего запуска realtime;
   - без выбора модели пользователем.
8. Функция должна работать на:
   - Web;
   - iOS;
   - Android.

## 3. Область изменений

Нужно добавить:

- новую кнопку запуска realtime voice в интерфейсе чата;
- изолированный клиентский контроллер realtime voice-сессии;
- отдельные backend endpoints `/api/realtime/*`;
- отдельный quota/usage-слой для realtime voice;
- отдельный провайдерный адаптер OpenAI Realtime;
- отдельное логирование метаданных realtime voice-сессии;
- отображение транскрипции в текущем `chat.messages`;
- корректный interrupt flow;
- гарантированный cleanup при закрытии/уходе со страницы/ошибке.

Не входит в первую итерацию:

- хранение исходного аудио;
- хранение полной расшифровки на сервере;
- reconnect после background/background-resume;
- режим работы в фоне;
- lip sync / avatar coupling;
- runtime voice switching;
- перевод речи между языками;
- WebSocket fallback;
- глубокое смешивание realtime-транскрипта с серверной persisted chat history.

## 4. Архитектурные принципы

Реализация должна быть максимально изолированной и переиспользуемой.

Обязательные принципы:

1. Никакой логики OpenAI Realtime прямо внутри страницы чата.
2. Никакой прямой работы UI с WebRTC-соединением без промежуточного controller/composable слоя.
3. Никакой логики доступа/лимитов внутри UI-компонентов.
4. Никакой логики OpenAI API внутри API-handler’ов.
5. Никакого дублирования prompt/context logic между текстовым и realtime-режимом.
6. Никакого сохранения transcript на сервере.
7. Никакой раздачи постоянного OpenAI API key на клиент.

## 5. High-Level архитектура

### 5.1 Frontend

На фронтенде должны появиться отдельные изолированные сущности:

1. `RealtimeVoiceController`

   - единая точка управления lifecycle voice-сессии;
   - знает только о состояниях, WebRTC, data channel, cleanup, timers, event dispatch.

2. `RealtimeVoiceTransport`

   - низкоуровневый адаптер WebRTC + data channel;
   - не знает о paywall, quota, chat page UI, business logic Mentala.

3. `RealtimeVoiceChatAdapter`

   - тонкий слой, который пишет transient transcript в `chat.messages`;
   - работает только с публичным интерфейсом chat-store;
   - не мутирует произвольное состояние страницы.

4. `RealtimeVoiceSessionViewModel`

   - вычисляет UI-state:
     - `idle`
     - `connecting`
     - `listening`
     - `thinking`
     - `speaking`
     - `interrupted`
     - `error`

5. `RealtimeVoiceEntryButton` / `RealtimeVoicePanel`
   - UI-компоненты, не содержащие провайдерной логики.

### 5.2 Backend

На бэкенде должны появиться отдельные сервисы:

1. `RealtimeVoiceAccessService`

   - entitlement-check (`Premium only`);
   - переиспользование существующего weekly AI usage gate;
   - kill-switch check с абсолютным приоритетом над entitlement и quota;
   - rate-limit;
   - hard monthly realtime quota;
   - вычисление effective max session duration как пересечение всех активных лимитов.

2. `RealtimeVoiceQuotaService`

   - считает использованные минуты realtime voice;
   - не дублирует generic weekly AI usage логику;
   - не смешивает realtime monthly quota с generic weekly AI quota в одной таблице и одном интерфейсе;
   - умеет вернуть `used / remaining / limit / resetAt`.

3. `RealtimeVoiceSessionService`

   - создаёт локальную voice-session в Mentala;
   - готовит server-side OpenAI session config для будущего handshake;
   - завершает локальную voice-session;
   - агрегирует session metrics.

4. `RealtimeVoiceEventService`

   - принимает клиентские технические события;
   - дедуплицирует их;
   - обновляет агрегированную модель сессии.

5. `OpenAIRealtimeProvider`
   - единственный слой, который знает текущие OpenAI endpoints и payload schema;
   - инкапсулирует текущий unified Realtime/WebRTC contract и серверный SDP proxy flow.

### 5.3 Изоляция от существующего текстового чата

Realtime voice не должен ломать текущий текстовый чат.

Для этого:

- существующий `chat` store остаётся главным источником сообщений экрана;
- realtime-модуль может только:
  - добавить user message bubble;
  - добавить assistant message bubble;
  - дозаписывать transcript delta в уже созданные bubble;
  - помечать runtime-only сообщения как transient;
- существующий text send flow, feedback flow, welcome flow и обычная диктовка не переписываются, а только получают небольшой integration contract.

## 6. OpenAI integration contract

### 6.1 Актуальный провайдерный путь

Использовать нужно текущий официальный путь OpenAI:

1. Backend на `POST /api/realtime/session` создаёт локальную realtime-session Mentala и строит OpenAI session config.

2. Session config сохраняется на короткое время на сервере как server-side state, привязанный к `sessionId`.

3. Клиент устанавливает WebRTC-соединение не напрямую с OpenAI, а через backend proxy:

   - `POST /api/realtime/call?sessionId=...&handshakeToken=...`

4. Backend отправляет в OpenAI unified multipart request:
   - `POST https://api.openai.com/v1/realtime/calls`
   - поля multipart: `sdp` + `session`

Важно:

- не завязывать старт voice-сессии на отдельный ephemeral `client_secrets` шаг;
- provider adapter должен быть написан так, чтобы смена OpenAI payload schema затрагивала только один модуль.

### 6.2 Session config

В первой версии session config фиксируется сервером.

Обязательные поля:

- `type: "realtime"`
- `model: "gpt-realtime-mini"` либо актуальный production-safe alias, задаваемый сервером
- `audio.input.turn_detection.type: "server_vad"`
- `audio.input.turn_detection.threshold`
- `audio.input.turn_detection.prefix_padding_ms`
- `audio.input.turn_detection.silence_duration_ms`
- `audio.output.voice: <фиксированное значение>`
- `output_modalities: ["audio"]`

Дополнительно:

- язык входной транскрипции должен задаваться явно;
- системные инструкции должны собираться сервером из существующего prompt/context слоя Mentala;
- текстовые transcript events используются только для UI текущей сессии.

### 6.3 Interrupt contract

Если пользователь начинает говорить во время ответа модели:

- система должна считать это interrupt;
- текущий ответ модели должен быть остановлен;
- новый пользовательский аудио-turn должен идти как продолжение текущего разговора.

Технический контракт на клиенте:

- использовать события VAD / speech start;
- при ручном прерывании отправлять:
  - `response.cancel`
  - затем `output_audio_buffer.clear`

## 7. Product UX / UI requirements

### 7.1 Entry point

В существующем чате появляется новая отдельная кнопка realtime voice.

Требования:

- не заменять текущую кнопку обычной диктовки;
- визуально разделять режимы:
  - `диктовка текста`
  - `онлайн-голосовой диалог`
- кнопка realtime должна быть платной функцией по стандартному paywall-паттерну Mentala:
  - функция всегда видима;
  - рядом отображается badge тарифа;
  - при отсутствии доступа открывается `FeaturePaywallModal`;
  - feature key проверяется через `useEntitlements`.

Новый feature key:

- `chat.realtime_voice`

### 7.2 Поведение интерфейса во время активной сессии

Во время активной realtime-сессии:

- textarea disabled;
- send button disabled;
- обычная кнопка диктовки disabled;
- realtime entry button превращается в кнопку завершения/панель статуса;
- пользователь видит, что чат находится в отдельном voice mode.

Важно:

- это ограничение фиксируется как решение первой версии;
- в будущих итерациях смешанный voice+text режим может быть пересмотрен отдельно, но не должен “просочиться” в MVP неявно.

### 7.3 Обязательные UI-state

Нужны состояния:

- `idle`
- `connecting`
- `listening`
- `thinking`
- `speaking`
- `interrupted`
- `error`

Для каждого состояния должен быть отдельный и однозначный UI:

- `idle`: готовность к запуску;
- `connecting`: лоадер и блокировка повторного старта;
- `listening`: активный микрофон и визуальный cue “говорите”;
- `thinking`: ассистент перестал слушать и готовит ответ;
- `speaking`: ассистент говорит; input disabled;
- `interrupted`: короткое промежуточное состояние после перебивания;
- `error`: сообщение об ошибке + возможность retry.

### 7.4 Transcript UX

Обязательное поведение:

- каждый realtime turn обязан иметь стабильный runtime identifier на клиенте;
- когда пользователь говорит, в `chat.messages` создаётся ровно один user bubble на один user turn и дальше только обновляется;
- когда модель отвечает голосом, в `chat.messages` создаётся ровно один assistant bubble на один assistant turn и дальше только обновляется;
- transcript должен стримиться по мере поступления событий, а не только по завершении фразы;
- все `transcript delta` обязаны дозаписываться в уже существующий bubble своего turn, а не создавать новый;
- `interim transcript` обновляет только текущий черновик bubble;
- `final transcript` фиксирует итоговый текст bubble и завершает turn;
- после finalization дальнейшие delta в уже финализированный bubble писать нельзя;
- финализация bubble должна быть привязана к конкретному turn / response identifier, а не к “последнему открытому сообщению”;
- transcript хранится только в текущем состоянии экрана.

После завершения сессии:

- transcript остаётся видимым на текущем экране;
- но на сервер не сохраняется.

## 8. Серверные API контракты Mentala

### 8.1 `POST /api/realtime/session`

Назначение:

- создать локальную realtime voice-сессию Mentala;
- проверить доступ;
- проверить лимиты;
- создать ephemeral client secret у OpenAI;
- вернуть клиенту всё необходимое для WebRTC-старта.

Request body:

```json
{
  "entryContext": null,
  "chatSessionId": "optional-client-chat-session-id",
  "clientPlatformHint": "web"
}
```

Response body:

```json
{
  "session": {
    "id": "local_realtime_session_id",
    "therapySessionId": 123,
    "status": "created",
    "model": "gpt-realtime-mini",
    "voice": "marin",
    "maxDurationSeconds": 3600,
    "idleTimeoutSeconds": 60
  },
  "openai": {
    "clientSecret": "ephemeral_secret",
    "expiresAt": 1742200000,
    "webrtcUrl": "https://api.openai.com/v1/realtime/calls"
  },
  "quota": {
    "limitMinutes": 60,
    "usedMinutes": 12,
    "remainingMinutes": 48,
    "resetsAt": "2026-04-01T00:00:00.000Z"
  }
}
```

Обязательные правила:

- endpoint тонкий;
- бизнес-логика только в application service;
- secret value не логируется;
- `maxDurationSeconds` вычисляется сервером динамически и не задаётся клиентом;
- `therapySessionId` используется только как технический мост в существующий session-time / weekly AI usage контур и не означает отдельную продуктовую “терапевтическую сессию” в UI;
- `clientPlatformHint` является только client hint; source of truth для хранения и аналитики — серверное нормализованное значение `client_platform` из фиксированного enum `web | ios | android`;
- один пользователь не может иметь более одной active realtime-session одновременно;
- stale-session detection обязательна на сервере и не может опираться только на frontend cleanup;
- повторный старт при живой сессии должен либо вернуть existing session, либо корректно завершить протухшую/осиротевшую сессию и создать новую без ручного вмешательства.

### 8.2 `POST /api/realtime/session/event`

Назначение:

- принимать клиентские технические события;
- обновлять агрегированную статистику сессии;
- не хранить transcript.

Поддерживаемые event types в первой версии:

- `started`
- `interrupted`
- `response_started`
- `response_completed`
- `failed`

Request body:

```json
{
  "sessionId": "local_realtime_session_id",
  "eventId": "client_generated_unique_id",
  "type": "interrupted",
  "at": "2026-03-17T12:00:00.000Z",
  "metrics": {
    "inputAudioSecondsDelta": 3,
    "outputAudioSecondsDelta": 2,
    "inputAudioTokensDelta": 120,
    "outputAudioTokensDelta": 90
  },
  "error": null
}
```

Обязательные правила:

- event handler идемпотентен;
- повтор события с тем же `eventId` не должен повторно увеличивать counters;
- transcript и raw audio не принимаются.

### 8.3 `POST /api/realtime/session/end`

Назначение:

- завершить локальную сессию Mentala;
- закрыть session aggregate;
- зафиксировать расход в существующем weekly AI usage контуре через общий session-time слой;
- списать итоговую длительность в realtime quota;
- вернуть итоговую статистику.

Request body:

```json
{
  "sessionId": "local_realtime_session_id",
  "reason": "user_stop"
}
```

`reason`:

- `user_stop`
- `timeout`
- `page_leave`
- `network_error`
- `provider_error`
- `replaced_by_new_session`

Response body:

```json
{
  "session": {
    "id": "local_realtime_session_id",
    "status": "completed",
    "durationSeconds": 214,
    "interruptCount": 2,
    "inputAudioSeconds": 98,
    "outputAudioSeconds": 76
  },
  "quota": {
    "limitMinutes": 60,
    "usedMinutes": 16,
    "remainingMinutes": 44,
    "resetsAt": "2026-04-01T00:00:00.000Z"
  }
}
```

## 9. Data model

### 9.1 Таблица `realtime_voice_sessions`

Обязательные поля:

- `id`
- `user_id`
- `therapy_session_id`
- `status`
- `end_reason`
- `provider`
- `provider_model`
- `provider_voice`
- `started_at`
- `ended_at`
- `last_activity_at`
- `duration_seconds`
- `user_turns_count`
- `assistant_turns_count`
- `interrupt_count`
- `input_audio_seconds`
- `output_audio_seconds`
- `input_audio_tokens`
- `output_audio_tokens`
- `quota_period_key`
- `error_code`
- `error_message`
- `client_platform`
- `created_at`
- `updated_at`

Обязательные правила:

- `therapy_session_id` используется только как техническая связь с существующим usage/session-time контуром;
- realtime voice не должен создавать в продуктовой модели отдельную “терапевтическую сессию” для интерфейса;
- `client_platform` хранится только в нормализованном enum `web | ios | android`;
- клиент может прислать platform hint, но raw-значения вроде `iOS`, `iphone`, `capacitor-ios` или `mobile-ios` не должны сохраняться как есть;
- `last_activity_at` нужен для server-side stale-session detection и не зависит от того, успел ли клиент вызвать cleanup.

Явный запрет:

- не добавлять в эту таблицу transcript;
- не добавлять raw audio url/path;
- не добавлять persistent message history.

### 9.2 Таблица `realtime_voice_session_events`

Нужна для надёжности и дедупликации.

Обязательные поля:

- `id`
- `session_id`
- `event_id`
- `type`
- `occurred_at`
- `payload_json`
- `created_at`

Обязательные инварианты:

- unique `(session_id, event_id)`;
- события используются только для техаудита и idempotency;
- payload не содержит transcript.

## 10. Quota и доступ

### 10.1 Feature access

Новый платный feature key:

- `chat.realtime_voice`

Правило доступа:

- только `Premium`.

Поведение lock/paywall:

- использовать существующий `feature_access_policies`;
- показывать функцию в UI всегда;
- блокировку делать через общий paywall-механизм.

Приоритет правил доступа:

- server-side `kill switch` имеет абсолютный приоритет над entitlement, paywall и quota checks;
- при активном kill switch клиент не должен иметь возможности стартовать realtime-сессию даже при валидном Premium-доступе и доступном quota.

### 10.2 Hard quota

Нужен отдельный hard limit:

- `60 минут` realtime voice на один месячный quota-период.

Правило best practice:

- quota считается не по календарному месяцу, а по выделенному product quota period;
- quota period должен быть детерминирован и не зависеть от локального устройства;
- расчёт должен жить в отдельном `RealtimeVoiceQuotaService`, а не внутри общего chat usage-кода.

Рекомендуемый вариант для реализации:

- quota period привязать к access period пользователя;
- для годового Premium не копить 720 минут в одном bucket, а использовать помесячные buckets внутри активного доступа;
- realtime quota проверяется до выдачи client secret.
- длительность одной realtime-сессии не ограничивается отдельным продуктовым cap на `15 минут`;
- server-side effective session duration cap вычисляется динамически как минимум из:
  - remaining realtime monthly minutes;
  - remaining weekly AI minutes;
  - технического hard ceiling `3600 секунд`.

### 10.3 Связь с существующим AI usage

ТЗ требует отдельный realtime monthly quota-слой.

При этом realtime voice дополнительно расходует существующие weekly AI minutes текстового чата.

Обязательные правила:

- generic weekly AI usage не переписывается заново в новом модуле;
- realtime flow должен переиспользовать существующий session-time / therapy-session usage контур;
- realtime monthly quota живёт отдельно и является дополнительным gate;
- старт realtime-сессии разрешён только если одновременно проходят оба ограничения:
  - weekly AI usage gate;
  - monthly realtime voice quota gate;
- effective `maxDurationSeconds` должен рассчитываться сервером динамически и возвращаться клиенту;
- связь между двумя лимитами должна быть явной и не “прятаться” в одной таблице.

## 11. Prompt / context reuse

Realtime voice обязан переиспользовать текущий prompt/context слой Mentala.

Обязательные требования:

- не копировать prompt rules в новый отдельный текст руками;
- собрать server-side `RealtimeSessionInstructionsBuilder`;
- переиспользовать:
  - addressing;
  - tone;
  - onboarding reasons;
  - entry context;
  - safety/crisis rules;
  - общую persona Mentala.

Дополнительные realtime-specific rules:

- ответы короче и разговорнее, чем в текстовом чате;
- без markdown;
- без длинных дисклеймеров в начале;
- с естественными короткими фразами;
- с корректной реакцией на перебивание.

## 12. Надёжность и отказоустойчивость

### 12.1 Обязательные guardrails

1. Один активный realtime voice session на пользователя.
2. Один активный `RealtimeVoiceController` на клиент.
3. Гарантированный cleanup:
   - stop tracks;
   - close data channel;
   - close RTCPeerConnection;
   - finish local session;
   - re-enable textarea/send/dictation.
4. Идемпотентный `/end`.
5. Дедупликация `/event`.
6. Таймауты на:
   - создание client secret;
   - получение микрофона;
   - WebRTC handshake;
   - end-session finalize.
7. Локальная защита от двойного старта кнопкой.
8. Frontend cleanup считается best effort и не является единственной гарантией корректного завершения сессии.

### 12.2 Автоостановка

Нужны две независимые защиты:

1. `max session duration`
2. `idle silence timeout`

Значения должны быть параметризованы конфигом и не хардкодиться по проекту в нескольких местах.

Рекомендуемые дефолты MVP:

- `maxSessionDurationSeconds = 3600` (60 минут как верхний hard ceiling)
- `idleSilenceTimeoutSeconds = 60`

Дополнение:

- effective `maxSessionDurationSeconds` для конкретного старта не обязан всегда быть `3600`;
- он должен вычисляться как `min(remaining realtime monthly quota, remaining weekly AI minutes, 3600 секунд)`.

### 12.3 Что делать при ошибке

При любой ошибке:

- показать явный UI-state `error`;
- завершить локальную realtime-сессию;
- не оставлять частично активный transport;
- вернуть чат в обычный режим;
- не ломать текстовый чат.

### 12.4 Hard reload / stale-session recovery

Нужно явно покрыть жёсткие сценарии:

- hard reload вкладки;
- crash браузерной вкладки;
- убийство приложения системой;
- mobile suspend без корректного resume/cleanup.

Обязательные правила:

- backend обязан уметь автоматически считать realtime-сессию протухшей по server-side признакам активности;
- active-сессия не должна оставаться блокирующей бесконечно только потому, что клиент не успел вызвать `/end`;
- следующая попытка старта должна безопасно завершать stale/осиротевшую сессию и продолжать flow без ручного вмешательства пользователя или админа;
- stale-session recovery должен быть идемпотентным и атомарным относительно нового старта;
- frontend cleanup остаётся желательным, но backend является последней линией защиты от “призраков” active session.

## 13. Client state machine

```text
idle
  -> connecting
  -> listening
  -> thinking
  -> speaking
  -> interrupted
  -> listening
  -> speaking
  -> completed -> idle

любое состояние
  -> error -> idle
```

Правила переходов:

- `idle -> connecting`: пользователь нажал realtime entry;
- `connecting -> listening`: WebRTC и data channel готовы;
- `listening -> thinking`: пользователь закончил говорить, server VAD закрыл turn;
- `thinking -> speaking`: модель начала отдавать аудио;
- `speaking -> interrupted`: пользователь начал говорить во время ответа;
- `interrupted -> listening`: output buffer очищен, новый turn начат;
- `* -> error`: transport/provider/session failure;
- `* -> idle`: session завершена корректно.

## 14. Integration contract с chat.messages

Realtime не должен напрямую переписывать существующий text chat flow.

Нужен отдельный адаптер записи в `chat.messages`:

- `createUserRealtimeMessage()`
- `appendUserRealtimeTranscriptDelta()`
- `finalizeUserRealtimeMessage()`
- `createAssistantRealtimeMessage()`
- `appendAssistantRealtimeTranscriptDelta()`
- `finalizeAssistantRealtimeMessage()`
- `markRealtimeMessageError()`

Требования:

- все realtime bubble помечаются как runtime-only;
- на один realtime turn создаётся ровно один runtime message;
- адаптер обязан хранить явное соответствие `turn identifier -> runtime message id`;
- повторное событие того же turn должно переиспользовать существующий bubble, а не создавать новый;
- `append*TranscriptDelta()` работает только для ещё не финализированного bubble;
- `finalize*RealtimeMessage()` фиксирует финальный текст строго по turn identifier и закрывает возможность дальнейшей дозаписи;
- feedback-кнопки для assistant bubble можно оставить выключенными в первой версии;
- сервер их не сохраняет после завершения voice session.

## 15. Логирование и observability

Нужно логировать:

- факт старта;
- факт завершения;
- время handshake;
- длительность сессии;
- число interrupt;
- суммарные input/output audio seconds;
- суммарные input/output audio tokens;
- quota rejection;
- provider failure;
- cleanup failure.

Нельзя логировать:

- transcript;
- raw audio payload;
- ephemeral secret value;
- SDP offer/answer целиком.

Sentry / structured logs должны содержать:

- `userId`
- `localSessionId`
- `therapySessionId`
- `requestId`
- `platform`
- `status`
- `reason`

## 16. Тестирование

### 16.1 Unit / service tests

Обязательны тесты на:

- access gate `Premium only`;
- абсолютный приоритет kill switch над entitlement/quota;
- hard quota `60 min/month`;
- period boundary logic quota;
- session event dedupe;
- session end idempotency;
- stale active session replacement;
- server-side stale-session detection после hard reload/app kill;
- нормализацию `client_platform`;
- payload validation `/api/realtime/*`.

### 16.2 Frontend tests

Обязательны тесты на:

- disabled textarea/send/dictation во время voice session;
- корректные UI-state transitions;
- transcript append в `chat.messages`;
- один assistant bubble на один assistant turn без дублей;
- корректный переход `interim transcript -> final transcript` без задвоения текста;
- cleanup после stop/error/unmount;
- невозможность двойного запуска.

### 16.3 Manual QA matrix

Проверить:

- Chrome / Safari / Firefox / Edge;
- iOS Safari / iOS WebView / Capacitor iOS;
- Android Chrome / Capacitor Android;
- выдачу микрофонных разрешений;
- interrupt flow;
- timeout flow;
- quota reached flow;
- paywall flow;
- page leave flow;
- hard reload во время active session;
- новый старт после stale session без ручного восстановления.

## 17. Критерии готовности

Функция считается готовой, если:

- в чате есть отдельная кнопка realtime voice;
- Premium user может начать realtime-сессию;
- non-Premium user получает штатный paywall;
- во время active session textarea/send/dictation disabled;
- пользователь говорит без ручной отправки;
- ассистент отвечает голосом;
- пользователь может перебить ассистента;
- transcript обеих сторон стримится в `chat.messages`;
- transcript не сохраняется на сервере;
- метаданные сессии сохраняются на сервере;
- realtime voice корректно расходует существующие weekly AI minutes;
- hard limit `60 минут` реально блокирует новые сессии;
- hard reload / app kill не оставляет session-призрак, который блокирует следующий старт;
- cleanup не ломает обычный текстовый чат.

## 18. Рекомендуемый rollout plan

### Wave 1

Сделать обязательно:

- isolated backend services;
- `/api/realtime/session`;
- `/api/realtime/session/event`;
- `/api/realtime/session/end`;
- WebRTC transport;
- базовый voice UI;
- server VAD;
- interrupt flow;
- transcript в `chat.messages`;
- hard Premium quota;
- интеграцию с существующим weekly AI usage;
- session metadata logging.

### Wave 2

Сделать потом:

- polishing UI;
- richer analytics;
- better error recovery;
- feature flags / staged rollout by percent;
- A/B тест voice entry CTA.

### Wave 3

Сделать потом:

- avatar integration;
- emotional voice tuning;
- blended voice/text mode.

## 19. Текущий статус решений

Блокирующих открытых вопросов по MVP в этом ТЗ сейчас нет.

Зафиксировано:

- realtime voice дополнительно расходует существующие weekly AI minutes;
- product-level cap `15 минут` не используется;
- верхний hard ceiling одной сессии — `60 минут`, но effective duration cap вычисляется сервером динамически;
- `idle silence auto-stop = 60 секунд`.
