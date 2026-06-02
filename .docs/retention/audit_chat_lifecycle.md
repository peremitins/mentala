# Аудит lifecycle чата (`app/pages/chat.vue` + сопутствующие модули)

Дата: 2026-05-16. Статус: артефакт Этапа 1 из `retention/retention_long_term_strategy.md`.

Цель документа — собрать в одном месте **все** места, где сейчас:
- стартует / завершается billing-сессия (`therapySession`),
- регистрируются слушатели `visibilitychange` / `pagehide` / `beforeunload` / Capacitor `appStateChange` / route-leave,
- освобождаются ресурсы voice-dictation / scene-audio / realtime voice / TTS / chat stream.

Без этой карты рефакторинг чата (Этап 4 в `retention/retention_long_term_strategy.md`) рискует пропустить триггер → пользователь будет терять минуты или, наоборот, видеть «зависшие» биллинг-сессии.

> Объём аудита: `app/pages/chat.vue` (1753 строки) + хранилище `app/stores/chat.ts` + composables `useRealtimeVoiceSession`, `useVoiceDictationInput`, `useSceneAudioFocus` + плагины `app/plugins/session-finish.client.ts`, `app/plugins/activity-ping.client.ts` + `app/stores/auth.ts` (logout path).

---

## 1. Жизненный цикл billing-сессии (`therapySession`)

`therapySession` — это серверная сущность (таблица `therapy_sessions`), которая считает минуты для биллинга PRO/Premium. Клиент её **создаёт лениво** при первом user-сообщении и **обязан закрыть** при любом уходе из чата.

### 1.1. Старт сессии (lazy)

| Где | Файл / строка | Что делает |
| --- | --- | --- |
| `chat.startTherapySession()` | [app/stores/chat.ts:448-491](app/stores/chat.ts:448) | `POST /api/therapy/session/start`. До этого вызывает `flushPendingTherapySessionEnds()` — добивает старые незакрытые сессии. Защита от двойного старта: ранний `return` если уже есть `therapySessionId`. |
| Триггер 1: первый `sendMessage` пользователя | [app/stores/chat.ts:1393](app/stores/chat.ts:1393) (внутри `sendMessage`) | Перед `POST /api/chat/stream` зовётся `await this.startTherapySession()`. |
| Триггер 2: `startConversation` (auto-start приветствия) | [app/stores/chat.ts:1243](app/stores/chat.ts:1243), вызывается из [chat.vue:875](app/pages/chat.vue:875) | `chat.startSession()` (генерит client `sessionId`) + `chat.startConversation()`. В пути `startConversation` также вызывается `startTherapySession`. |
| Триггер 3: первый user-turn в realtime voice | [app/stores/chat.ts:901-908](app/stores/chat.ts:901) (`addRuntimeMessage`) | Realtime voice идёт своим путём (`useRealtimeVoiceSession` сам открывает `realtimeSessionId`), но при первой user-реплике в `chat.messages` проставляется `sessionStartedAt` — это нужно для eligibility порогов. |

### 1.2. Активность (поддержание открытой сессии)

- `chat.updateActivity()` ([app/stores/chat.ts:671-707](app/stores/chat.ts:671)) — обновляет `lastActivityAt`, троттлинг `POST /api/therapy/session/ping` раз в 10s.
- Idle timeout: `chat.resetIdleTimeout()` ставит таймер на `runtimeConfig.public.chatIdleTimeoutMs`, по истечении вызывает `endTherapySession()` ([app/stores/chat.ts:711-720](app/stores/chat.ts:711)).
- Активность вызывается изнутри стрима (по каждому turn'у).

### 1.3. Закрытие сессии — все точки

| № | Точка | Файл / строка | Семантика |
| - | --- | --- | --- |
| 1 | Кнопка «Подвести итог» в шапке чата | [chat.vue:684-729](app/pages/chat.vue:684) — `handleFinishSession` | Если активен realtime voice — сначала `realtimeVoice.stop('user_stop')`. Затем `chat.endSessionAndSummarize({ trigger: 'manual' })`. Триггерит summary + `endTherapySession`. |
| 2 | `chat.endSessionAndSummarize` | [app/stores/chat.ts:298-342](app/stores/chat.ts:298) | Центральный сценарий. `_requestSessionSummary` + `endTherapySession` + `_hardClearChatClient`. `trigger ∈ 'manual' \| 'logout' \| 'app-hidden'`. |
| 3 | `onBeforeUnmount` страницы `/chat` | [chat.vue:1477-1493](app/pages/chat.vue:1477) | `stopMic()` + `chat.endTherapySession()` + `subscriptionStore.invalidateCache()`. Запускается при уходе с маршрута. |
| 4 | Глобальный плагин `session-finish.client.ts` | [app/plugins/session-finish.client.ts](app/plugins/session-finish.client.ts) | На `visibilitychange → hidden`, `pagehide`, `beforeunload`, Capacitor `appStateChange → isActive=false` — зовёт `chat.endTherapySession()`. На `online`, `focus`, `visibility → visible`, Capacitor `appStateChange → isActive=true` — `flushPendingTherapySessionEnds()`. |
| 5 | Idle timeout внутри стора | [app/stores/chat.ts:711-720](app/stores/chat.ts:711) | Тихо вызывает `endTherapySession()` после периода тишины. |
| 6 | `chat.clearMessages()` | [app/stores/chat.ts:734-747](app/stores/chat.ts:734) | Очищает стор и зовёт `endTherapySession()`. Используется для возврата к welcome (legacy). |
| 7 | `chat.finishSession()` | [app/stores/chat.ts:275-283](app/stores/chat.ts:275) | Сбрасывает client `sessionId` + `endTherapySession()` если активна. |
| 8 | Pre-logout в auth-store | [app/stores/auth.ts:769-783](app/stores/auth.ts:769) `_endChatSessionBeforeLogout` | До инвалидации session-token ждёт `await chat.endTherapySession()`. |
| 9 | Handoff text → realtime voice | [app/stores/chat.ts:639-667](app/stores/chat.ts:639) `handoffTextSessionToRealtimeVoice` | `POST /api/session/handoff` — серверный handoff закрывает source session, клиент локально вызывает `resetTherapySessionState`. |
| 10 | Handoff realtime → text | [useRealtimeVoiceSession.ts:964-988](app/composables/useRealtimeVoiceSession.ts:964) `handoffRealtimeSessionToText`, вызывается из `stop()` строка 1504 | Закрывает realtime session, после чего страница `/chat` должна сбросить `therapySessionId`, чтобы следующее сообщение открыло новую text-session. |
| 11 | Persistent retry-queue | [app/stores/chat.ts:577-604](app/stores/chat.ts:577) `flushPendingTherapySessionEnds` | Используется когда `endTherapySession` упал на сети. Записи в `enqueuePendingTherapySessionEnd` сохраняются между сессиями (localStorage / Capacitor Preferences). Запускается из плагина при `online`/`focus`/`visibilitychange → visible`. |

### 1.4. Endpoint'ы биллинга

- `POST /api/therapy/session/start` — старт (через `$api`).
- `POST /api/therapy/session/end` — финал. Использует `fetch({ keepalive: true })`, X-Session-Token + CSRF из localStorage. Реализован в `chat.ts:_postEndTherapySessionRequest` ([app/stores/chat.ts:503-560](app/stores/chat.ts:503)). Терминальные коды (404/409) считаются успехом; ретраябл коды попадают в persistent retry queue.
- `POST /api/therapy/session/ping` — троттлинг 10s ([app/stores/chat.ts:687-703](app/stores/chat.ts:687)). На 404/409 сбрасывает `therapySessionId` (сессия уже закрыта серверным cron).
- `POST /api/session/handoff` — переключение режимов.
- `POST /api/session-summaries-user` — серверная очередь summary (вариант с `keepalive: true` для `app-hidden`, см. [app/stores/chat.ts:364-444](app/stores/chat.ts:364)).
- `GET /api/therapy/session/active` — восстановление backlog при cold start ([app/stores/chat.ts:748-811](app/stores/chat.ts:748) `restoreActiveSessionFromServer`).

### 1.5. Eligibility «Подвести итог»

Пороги: `SESSION_SUMMARY_MIN_USER_MESSAGES`, `SESSION_SUMMARY_MIN_DURATION_SECONDS`, `SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES`, плюс bypass `SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES`. Импортируются из `app/stores/chat.ts` и считаются:
- На уровне стора — getter `isEligibleForSummary` ([app/stores/chat.ts:239-254](app/stores/chat.ts:239)).
- На уровне страницы — `isEligibleForSummary` computed ([chat.vue:609-619](app/pages/chat.vue:609)), плюс `tickerInterval` с тиком 1s ([chat.vue:578, 1345-1347](app/pages/chat.vue:1345)) для реактивности по времени.

> При рефакторинге **обязаны** перенести и стор-уровневую логику, и page-level ticker. Иначе кнопка «Дальше» в Roadmap-чате будет «зависать» на границе времени так же, как когда-то зависала «Подвести итог».

---

## 2. Слушатели lifecycle страницы / приложения

### 2.1. Глобальные (плагин `session-finish.client.ts`)

`app/plugins/session-finish.client.ts:31-58`:

| Источник события | Слушатель | Реакция |
| --- | --- | --- |
| `document.visibilitychange` → `hidden` | На уровне document | `chat.endTherapySession()` |
| `document.visibilitychange` → `visible` | На уровне document | `chat.flushPendingTherapySessionEnds()` |
| `window.pagehide` | На уровне window | `chat.endTherapySession()` (keepalive) |
| `window.beforeunload` | На уровне window | `chat.endTherapySession()` (keepalive) — iOS Safari почти не вызывает, тут он скорее как страховка |
| `window.online` | На уровне window | `chat.flushPendingTherapySessionEnds()` |
| `window.focus` | На уровне window | `chat.flushPendingTherapySessionEnds()` |
| Capacitor `App.addListener('appStateChange', { isActive: false })` | Только Capacitor | `chat.endTherapySession()` |
| Capacitor `App.addListener('appStateChange', { isActive: true })` | Только Capacitor | `chat.flushPendingTherapySessionEnds()` |

Слушатели **никогда не отписываются** — это глобальный плагин на всё приложение. Это правильное поведение, потому что чат может быть открыт не только на `/chat`, и `endTherapySession` идемпотентен.

> При рефакторинге глобальные слушатели **оставляем как есть**. Они страхуют unmount-сценарии (см. п. 6.4 стратегии).

### 2.2. Page-level (`app/pages/chat.vue`)

- `onMounted` ([chat.vue:1341-1411](app/pages/chat.vue:1341)) — старт `tickerInterval`, восстановление backlog через `chat.restoreActiveSessionFromServer()`, иначе auto-start от ассистента.
- `onBeforeUnmount` ([chat.vue:1477-1493](app/pages/chat.vue:1477)) — `clearInterval(tickerInterval)`, `stopMic()`, `chat.endTherapySession()`, `subscriptionStore.invalidateCache()`. Никаких `removeEventListener` — глобальные слушатели не page-scoped.
- **Маршрутных хуков (`router.beforeEach`) у страницы нет.** Уход с `/chat` приводит к Vue `onBeforeUnmount`, который и делает финализацию.

### 2.3. В composable'ах

- `useRealtimeVoiceSession` ([app/composables/useRealtimeVoiceSession.ts:1565-1580](app/composables/useRealtimeVoiceSession.ts:1565)) регистрирует **свой** `window.pagehide` → `handlePageLeave` (cleanup транспорта + `POST /api/realtime/session/end` с `keepalive: true` + `POST /api/therapy/session/end` с `keepalive: true`). На `onScopeDispose` отписывается **и** вызывает `handlePageLeave()` defensive'но.
- `useRealtimeVoiceSession` дополнительно делает `onScopeDispose(() => realtimeVoiceUi.reset())` ([useRealtimeVoiceSession.ts:430](app/composables/useRealtimeVoiceSession.ts:430)).
- `useVoiceDictationInput` ([app/composables/useVoiceDictationInput.ts:232-236](app/composables/useVoiceDictationInput.ts:232)) — `onScopeDispose` помечает `isDisposed`, отпускает `dictationAudioLock` через `releaseDictationAudioFocus()`. Сам `stopListening` явно не вызывается — speech engine сам приведёт состояние.
- Дополнительный watcher ([useVoiceDictationInput.ts:160-170](app/composables/useVoiceDictationInput.ts:160)) — при выпадении `speechStore.isListening` в `false` (например, по таймеру тишины на iOS) отпускает scene-audio lock.

---

## 3. Voice / audio / TTS / chat-stream ресурсы

Помимо billing-сессии в чате крутится сразу несколько runtime-ресурсов. Каждый из них должен быть освобождён при unmount / переходе / уходе в фон.

### 3.1. Chat stream (SSE)

- `chat.stopChatStream()` ([app/stores/chat.ts:1035](app/stores/chat.ts:1035)) — отменяет fetch-стрим `/api/chat/stream` через `AbortController`.
- Вызывается из:
  - `_hardClearChatClient` ([app/stores/chat.ts:348](app/stores/chat.ts:348)),
  - `clearMessages` ([app/stores/chat.ts:741](app/stores/chat.ts:741)),
  - `restoreActiveSessionFromServer` перед заполнением backlog ([app/stores/chat.ts:768](app/stores/chat.ts:768)),
  - `startConversation` / `sendMessage` для отмены прошлого стрима ([app/stores/chat.ts:1280, 1437](app/stores/chat.ts:1280)),
  - `useRealtimeVoiceSession.onBeforeStart` через callback из `chat.vue:768` ([chat.vue:767-779](app/pages/chat.vue:767)) — перед стартом realtime гасит активный текстовый стрим,
  - `auth._stopActiveRequests` ([app/stores/auth.ts:741](app/stores/auth.ts:741)) перед logout.
- На `onBeforeUnmount` страницы `/chat` `stopChatStream` **не вызывается явно**. Опираемся на то, что `endTherapySession` и `_hardClearChatClient` вызовут его в нужных путях.

### 3.2. TTS (`useTTS`)

- `speakTTS(text)` / `stopTTS()` ([chat.vue:676](app/pages/chat.vue:676)).
- `stopTTS` вызывается:
  - В `useRealtimeVoiceSession.onBeforeStart` callback ([chat.vue:769](app/pages/chat.vue:769)),
  - В `AvatarVoiceControls.toggleVoice` при выключении голоса ([app/components/AvatarVoiceControls.vue:73](app/components/AvatarVoiceControls.vue:73)).
- На `onBeforeUnmount` страницы `/chat` **stopTTS НЕ вызывается явно**. Это потенциальный leak: если ассистент договаривает реплику и юзер уходит на главную — TTS продолжит играть до конца. (См. п. 6.7 ниже — кандидат на правку в новом `useChatSession`.)

### 3.3. Voice dictation (`useVoiceDictationInput` + `speechStore`)

- `toggleMic` / `stopMic` / `clearVoiceBase` ([chat.vue:744-765](app/pages/chat.vue:744)).
- `stopMic()` вызывается:
  - В `onBeforeUnmount` страницы ([chat.vue:1485](app/pages/chat.vue:1485)),
  - Перед `sendText` если активно слушание ([chat.vue:950-953](app/pages/chat.vue:950)),
  - Перед стартом realtime voice через `onBeforeStart` ([chat.vue:771-773](app/pages/chat.vue:771)),
  - В `auth._stopActiveRequests` ([app/stores/auth.ts:744-748](app/stores/auth.ts:744)) на pre-logout (через прямой `useSpeechEngine().stop()`).
- Composable сам по себе на `onScopeDispose` освобождает scene-audio lock; native dictation listeners живут в `useSpeechEngine` и отписываются там же.

### 3.4. Scene-audio focus (фоновая сцена)

- `useSceneAudioFocus` управляет «лок-стеком» аудио-фокуса. Захватывается:
  - В `useVoiceDictationInput.acquireDictationAudioFocus` ([app/composables/useVoiceDictationInput.ts:65-78](app/composables/useVoiceDictationInput.ts:65)) — `kind='speech-dictation'`,
  - В `useRealtimeVoiceSession` ([app/composables/useRealtimeVoiceSession.ts:1412](app/composables/useRealtimeVoiceSession.ts:1412)) — `kind='realtime-voice'`,
- Освобождается:
  - В `useVoiceDictationInput.releaseDictationAudioFocus` (на `stopListening` и `onScopeDispose`),
  - В `useRealtimeVoiceSession.cleanupLocalTransport` ([app/composables/useRealtimeVoiceSession.ts:1003-1006](app/composables/useRealtimeVoiceSession.ts:1003)),
  - Глобально при logout — `useSceneAudio().resetRuntimeState()` ([app/stores/auth.ts:752-753](app/stores/auth.ts:752)).
- Освобождается **не** в `onBeforeUnmount` страницы, а в `onScopeDispose` composable'а — это важно сохранить при переезде в `ChatRoom.vue`.

### 3.5. Realtime voice (`useRealtimeVoiceSession`)

Самый сложный жизненный цикл. Содержит:
- WebRTC peer connection (`transport.stop()` в `cleanupLocalTransport`),
- Native foreground service (`stopRealtimeVoiceForegroundService`),
- Native audio session (`deactivateRealtimeVoiceNativeAudioSession`),
- Scene-audio lock,
- Сообщения-плейсхолдеры в чате (`adapter.pruneEmptyMessages`),
- Серверные endpoints: `POST /api/realtime/session/end` + `POST /api/therapy/session/end`.

Точки выхода:
- `stop(reason)` ([useRealtimeVoiceSession.ts:1493-1542](app/composables/useRealtimeVoiceSession.ts:1493)) — нормальный путь: `cleanupLocalTransport` → `handoffRealtimeSessionToText` (если ок — `therapySessionId` остаётся у text-сессии) → fallback `finalizeSessionOnServer + finalizeTherapySessionOnServer` → `chat.resetTherapySessionState`.
- `handlePageLeave` ([useRealtimeVoiceSession.ts:1544-1563](app/composables/useRealtimeVoiceSession.ts:1544)) — на `window.pagehide` и `onScopeDispose`: `cleanupLocalTransport` + `finalizeSessionOnServer({ keepalive })` + `finalizeTherapySessionOnServer({ keepalive })`.
- Старт-ошибка handshake ([useRealtimeVoiceSession.ts:1466-1490](app/composables/useRealtimeVoiceSession.ts:1466)) — `cleanupLocalTransport` + `finalizeSessionOnServer(failureReason)` если `sessionId` уже создан.

**Связь с text billing-сессией:** `useRealtimeVoiceSession` хранит у себя `therapySessionId` (отдельная ссылка), потому что realtime открывает свою therapy_session. Через handoff source therapy_session переходит к text-режиму; через fallback finalize — закрывается напрямую. Клиентский `chat.resetTherapySessionState(therapySessionId)` синхронизирует store.

> Это критичная развилка для рефакторинга: `useRealtimeVoiceSession` остаётся отдельным composable'ом, но `ChatRoom.vue` обязан передавать вниз корректные коллбеки `onBeforeStart`/`onAfterStop`.

### 3.6. Subscription store

`subscriptionStore.invalidateCache()` ([chat.vue:1490-1492](app/pages/chat.vue:1490)) — на unmount чата сбрасывает кеш подписки, чтобы при следующем заходе пользователь увидел свежие лимиты. Не критично к leak'ам, но семантически принадлежит lifecycle чата.

### 3.7. Ticker eligibility

`tickerInterval` ([chat.vue:578-579, 1345-1347, 1479-1482](app/pages/chat.vue:1345)) — 1s setInterval для реактивности `liveSessionDurationSeconds`. Останавливается в `onBeforeUnmount`. Тривиально, но забыть очистить = утечка таймера и продолжающиеся реактивные re-renders в фоне.

---

## 4. Сводная карта по триггерам финализации

| Сценарий | Кто ловит сейчас | Куда переезжает (после рефакторинга) |
| --- | --- | --- |
| «Подвести итог» (кнопка) | `chat.vue:handleFinishSession` | `useChatSession.finalize({ reason: 'manual_summary' })` |
| Уход с `/chat` через router | `chat.vue:onBeforeUnmount` | `useChatSession.finalize({ reason: 'unmount' })` (вешать на `onScopeDispose` composable'а, чтобы покрывало и `ChatRoom` внутри Roadmap) |
| `visibilitychange → hidden` | Глобальный плагин `session-finish.client.ts` | Не менять — оставить глобальный плагин как safety net |
| `pagehide` | Глобальный плагин + `useRealtimeVoiceSession` | Не менять — оставить глобальный плагин; в `useChatSession` свои слушатели не вешать |
| `beforeunload` | Глобальный плагин | Не менять |
| Capacitor `appStateChange → isActive=false` | Глобальный плагин | Не менять |
| Logout | `auth._endChatSessionBeforeLogout` + `_stopActiveRequests` | Не менять — auth-store уже знает про чат |
| Idle timeout | `chat.resetIdleTimeout` → `endTherapySession` | Не менять (логика в сторе) |
| Network failure при `end` | `_schedulePendingEndSessionRetry` + persistent queue | Не менять |
| Roadmap-шаг: пользователь нажал «Дальше» | **нет** | `useChatSession.finalize({ reason: 'roadmap_next' })` — обязательный manual-summary с порогами eligibility |
| Roadmap-шаг: `ChatRoom` unmount'ится | **нет** | `onScopeDispose` в `useChatSession` defensively вызывает `finalize({ reason: 'unmount' })` |
| Roadmap-шаг: ChatRoom unmount'ится после успешного `roadmap_next` | — | Должен быть idempotent: повторный `finalize` ничего не делает (server возвращает 404/409, клиент трактует как success — это уже работает в `_postEndTherapySessionRequest`) |

---

## 5. Риски, которые надо удержать в голове при рефакторинге

1. **Дублирующие `finalize` на cleanup.** `onScopeDispose` в `useChatSession` сработает **и** при unmount `ChatRoom`, **и** глобальный плагин выстрелит на `pagehide` параллельно. Сервер обязан быть идемпотентным по `sessionId` — он уже такой, но любые новые endpoint'ы (например, отдельный `roadmap_chat_done`) должны соблюдать это правило.
2. **Realtime voice финализирует свою therapy_session, а потом text-чат повторно** через `chat.endTherapySession`. Это нормально, потому что `endTherapySession` принимает только тот `sessionId`, который записан в сторе, а realtime уже сделал `chat.resetTherapySessionState`. Регрессия здесь = двойное закрытие или, что хуже, потеря закрытия.
3. **iOS Safari `beforeunload` почти не вызывается** — реальная защита это `pagehide` + Capacitor `appStateChange`. Поэтому **нельзя** в новом `useChatSession` опираться на `beforeunload`.
4. **`keepalive: true` ограничен 64 КБ payload.** Сейчас summary с client-fallback transcript (`clientMessages.slice(-200) × 8000 chars`) на грани лимита. При рефакторинге внимательно следить, если будем добавлять что-то в payload.
5. **Eligibility ticker** живёт сейчас на странице. После переезда — **обязательно** в composable, иначе и `/chat`, и Roadmap-шаг будут зависать на границе порога.
6. **`tickerInterval` clearInterval** — забыть = утечка таймера + ненужные re-renders на каждой странице.
7. **`subscriptionStore.invalidateCache()`** на unmount. После рефакторинга это должно вызываться `useChatSession.dispose()`, иначе после Roadmap-шага юзер не увидит обновлённые минуты сразу.
8. **TTS leak.** Сейчас `onBeforeUnmount` НЕ вызывает `stopTTS()`. Это известная мелкая бага (см. п. 3.2). При рефакторинге добавить `stopTTS()` в `useChatSession.dispose()`.
9. **Realtime voice `pagehide` слушатель** конфликтует с глобальным плагином: оба пытаются закрыть therapy_session одновременно. Сейчас это работает благодаря серверной идемпотентности и handoff-логике, но **не убирать** ни один из двух слушателей — они защищают разные кейсы (`pagehide` ловит закрытие вкладки до того, как глобальный плагин успеет, в случае mobile Safari).

---

## 6. Чек-лист обязательных triggers для нового `useChatSession()`

Минимальный inventory, который **обязан** выдержать рефакторинг:

- [ ] `startSession()` — lazy, при первом user-сообщении.
- [ ] `finalize({ reason: 'manual_summary' })` — кнопка «Подвести итог».
- [ ] `finalize({ reason: 'roadmap_next' })` — НОВОЕ: при нажатии «Дальше» в Roadmap-шаге.
- [ ] `finalize({ reason: 'unmount' })` — defensive в `onScopeDispose`.
- [ ] Сохранение глобального плагина `session-finish.client.ts` без изменений — он закроет `visibilitychange`/`pagehide`/`beforeunload`/Capacitor `appStateChange`.
- [ ] `eligibility` getter (`messages + duration + qualifying`) + bypass на FORCE_MIN — реактивно, с тикером 1s.
- [ ] `stopChatStream` при finalize.
- [ ] `stopTTS` при finalize (исправляем существующую забывчивость).
- [ ] `stopMic` при finalize (уже есть в `onBeforeUnmount`).
- [ ] `subscriptionStore.invalidateCache()` при finalize.
- [ ] Restore-flow: `chat.restoreActiveSessionFromServer()` на mount (для `/chat`-страницы; для Roadmap-шага решаем отдельно — там пользователь начинает с `topicPrompt`, не с восстановления).
- [ ] Совместимость с `useRealtimeVoiceSession` — `onBeforeStart` callback должен по-прежнему гасить text stream + TTS + dictation.

---

## 7. Что **не** трогаем при рефакторинге

- Глобальный `app/plugins/session-finish.client.ts` (страховочный слой, его роль не меняется).
- Стор-уровневую логику `flushPendingTherapySessionEnds`, `_postEndTherapySessionRequest`, persistent retry queue.
- Серверные endpoints `/api/therapy/session/{start,end,ping,active}`.
- `useRealtimeVoiceSession` — он остаётся отдельным composable, используется ChatRoom как есть.
- `useVoiceDictationInput` — остаётся отдельным composable.
- Auth-store pre-logout пути (`_stopActiveRequests`, `_endChatSessionBeforeLogout`).
- `subscriptionStore.invalidateCache()` — переносим вызов, не меняем сам store.

---

## 8. Связь с глобальной стратегией

- Этап 1 в `retention/retention_long_term_strategy.md` — настоящий документ закрыт.
- Этап 4 (рефактор chat → ChatRoom + useChatSession) — может стартовать на основе этого аудита.
- Этап 5 (ProgramAiChatAction + новый action type) — зависит от Этапа 4.
- QA-чеклист п. 6.6 стратегии остаётся обязательным перед мержем Этапа 4 в `main`.
