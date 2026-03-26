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
- При завершении: BullMQ job `chat-session-summary` строит handoff-summary + обновляет durable profile одним LLM-вызовом, затем чистит transcript
- Inline fallback если Redis/BullMQ недоступны

## Runtime token guard
- `SOFT_INPUT_TOKENS=10000`, `MAX_INPUT_TOKENS=15000`, `MAX_TURNS_PER_CHAIN=24`
- Приоритет: explicit_end > MAX_INPUT_TOKENS > MAX_TURNS > SOFT
- Forced compaction не включает текущее user-message

## Prompt assembly
- **Session bootstrap** (первый ход chain): system + developer bootstrap + memory blocks (durable profile / handoff / compact state)
- **Per-turn**: только developer context + user-message (без дублирования стабильных слоёв)

## Durable profile memory
- Short JSON: `facts<=3`, `preferences<=3`, `context<=2`, `name<=40 chars`, `item<=80 chars`
- Обновление model-driven: модель получает previous profile + transcript → возвращает обновлённый profile
- Подмешивается только в bootstrap новой chain, не в каждый turn

## Handoff Text ↔ Voice
- `/api/session/handoff` закрывает source-session, строит handoff summary, target-mode стартует как новая session
- Realtime Voice: runtime compaction по тем же бюджетам, compaction строится text-моделью (не realtime)
- Summary строится по всему transcript сессии, не только по хвосту после compaction

## Хранение
- Encrypted по умолчанию: AES-256-GCM (`SUMMARY_AES_KEY`), plaintext только через `SUMMARY_ENCRYPTION_DISABLED=true` (dev)
- Все memory-payload versioned (`schemaVersion`)

## AI Relay
- Внутренний стрим: дельты текста, SSE в `server/api/chat/stream.post.ts`
- `relayClient` — подпись HMAC, парсинг SSE, сохранение `response_id`
- Relay не удаляет summary/entryContext (качество)

## Feedback
- `POST /api/chat/feedback` привязка к `therapySessionId` + `assistantMessageClientId`
- Состояние в Pinia, retention комментариев 60 дней
