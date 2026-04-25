# Чат и AI память

## Чат — поведение
- Welcome-ответ при пустых `messages`; `entryContext` из `/habits`, `/therapy`, `/quick-help` учитывается в prompt
- `onboarding_reasons` передаётся как мягкий вектор персонализации (не навязывается поверх актуальной темы)
- Кризисный контур: server-side детектор в `crisis-protocol.service.ts` подмешивает safety prompt (`CRISIS_HIGH`/`CRISIS_WATCH`); LLM отвечает всегда, без short-circuit. Подробнее: `crysis_prompt.md`
- Приветствие по имени — не чаще 1 раза в день, отметки в `chat_settings.last_greeting_at`
- `tone` из user preferences влияет на стиль ответов LLM
- Suggested chips: text-chips генерирует LLM, action-chips строятся детерминированно server-side
- Phobias: отдельный сервис `phobias-entry.service.ts` для входа через терапию страхов

## Трёхслойная память
1. **Session-scoped** (`chat_session_memories`): chain/runtime compact-state для активной `therapySession`
2. **Handoff summary** (`session_summaries`): summary последней завершённой сессии (темы, паттерны, guidance)
3. **Durable profile** (`user_memory_profiles`): устойчивые факты и предпочтения пользователя (JSON: `schemaVersion/name/facts/preferences/context`)

## Lifecycle текстовой сессии
- Внутри сессии: `previous_response_id` (Responses API) + `truncation: auto`
- Привязка к `chatSessionId`: новый `chatSessionId` = новый lifecycle, сервер закрывает предыдущую session
- Для text chat server-side transient transcript пишется на каждом завершённом turn даже если `enablePreviousResponseId=false`; это источник истины для `sessionSummaryUser`
- При cold start `/chat` клиент восстанавливает весь несуммаризованный backlog пользователя из server transcript; если последняя billing-сессия уже ended/stale, история всё равно показывается, но новые сообщения стартуют новую `therapySession`
- При hide/pagehide/app background клиент всегда пытается отправить `therapy/session/end`; при сетевой ошибке request не теряется, а попадает в persistent retry queue и добивается после следующего startup/online/foreground
- При завершении: BullMQ job `chat-session-summary` строит handoff-summary + обновляет durable profile одним LLM-вызовом, но transcript удаляется только когда user summary уже завершена или точно не нужна
- Inline fallback если Redis/BullMQ недоступны

## Runtime token guard
- `SOFT_INPUT_TOKENS=10000`, `MAX_INPUT_TOKENS=15000`, `MAX_TURNS_PER_CHAIN=24`
- Приоритет: explicit_end > MAX_INPUT_TOKENS > MAX_TURNS > SOFT
- Forced compaction не включает текущее user-message

## Prompt assembly
- **Session bootstrap** (первый ход chain): system + developer bootstrap + memory blocks (durable profile / handoff / compact state)
- **Per-turn**: только developer context + user-message (без дублирования стабильных слоёв)
- Если `previous_response_id` уже недоступен, но клиент прислал восстановленный несуммаризованный backlog, bootstrap строится от `active backlog context` текущего диалога; он имеет приоритет над `handoff` прошлой завершённой сессии и над durable profile, чтобы `продолжим` не уводило модель в старые темы
- `systemCore` запрещает вводное "понимаю/слышу/вижу, что ты хочешь" на прямые вопросы и просьбы; фраза валидации нужна для эмоциональных сообщений без прямой просьбы.

## Durable profile memory
- Short JSON: `facts<=3`, `preferences<=3`, `context<=2`, `name<=40 chars`, `item<=80 chars`
- Обновление model-driven: модель получает previous profile + transcript → возвращает обновлённый profile
- Подмешивается только в bootstrap новой chain, не в каждый turn

## Handoff Text ↔ Voice
- `/api/session/handoff` закрывает source-session, строит handoff summary, target-mode стартует как новая session
- Realtime Voice: runtime compaction по тем же бюджетам, compaction строится text-моделью (не realtime)
- После realtime→text handoff клиент обязан сбросить активный `therapySessionId`
  в chat store: source voice-session уже закрыта, а следующий текстовый ход
  должен открыть новую therapy-session с тем же client chat lifecycle.
- Фоновый `therapy/session/ping` не показывает toast на 404/409 и всегда сбрасывает только тот `therapySessionId`, который был отправлен в конкретном ping-запросе. Это защищает realtime→text переключение от stale-ответа старой сессии.
- Summary строится по всему transcript сессии, не только по хвосту после compaction
- WebRTC handshake для Realtime Voice должен деградировать fail-soft:
  - transient ошибки relay / OpenAI / сети классифицируются отдельно
  - клиент делает один быстрый автоповтор handshake перед финальным fail
  - пользователю показывается короткое human-readable сообщение без сырого upstream текста
  - диагностический `error.code` сохраняется при server-side завершении voice session

## Хранение
- Encrypted по умолчанию: AES-256-GCM (`SUMMARY_AES_KEY`), plaintext только через `SUMMARY_ENCRYPTION_DISABLED=true` (dev)
- Все memory-payload versioned (`schemaVersion`)
- Пользовательский `sessionSummaryUser` prompt персонализируется по `users.locale`, `user_preferences.addressing` и `users.gender`; если пол не задан, prompt требует нейтральные формулировки без предположений о роде
- `sessionSummaryUser` в текущем client lifecycle реально запускается вручную (`manual`) и nightly cron; logout больше не триггерит user-summary, а только отправляет `therapy/session/end`
- Дата пользовательского итога берётся из начала обобщённого backlog (`sessionStartedAt` / первое transcript-сообщение), а не из `createdAt` ночной генерации; в UI показывается только дата без точного времени
- Client-side auto-summary на `pagehide/beforeunload` для web отключён: browser refresh должен восстанавливать историю, а не завершать сессию перед restore
- После успешной `sessionSummaryUser` очищается только тот unsummarized backlog, который реально вошёл в итог; более новая параллельная сессия пользователя не затрагивается
- Старый `not_eligible` backlog чистится nightly retention-проходом, если он не стал summary-worthy и завис дольше нескольких дней

## AI Relay
- Внутренний стрим: дельты текста, SSE в `server/api/chat/stream.post.ts`
- `relayClient` — подпись HMAC, парсинг SSE, сохранение `response_id`
- Relay не удаляет summary/entryContext (качество)

## Feedback
- `POST /api/chat/feedback` привязка к `therapySessionId` + `assistantMessageClientId`
- Состояние в Pinia, retention комментариев 60 дней
