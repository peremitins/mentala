# Implementation Plan: Рефакторинг памяти и оптимизация токенов AI-чата

Версия: 1.1  
Дата: 2026-03-20  
Статус: draft  
Основание: `.docs/chat_token_optimization_tz.md`

## 1. Цель implementation plan

Этот документ переводит `.docs/chat_token_optimization_tz.md` в практический план внедрения:

- по этапам;
- по модулям;
- по порядку интеграции;
- по rollout-логике;
- по проверкам качества и стоимости.

План не запускает реализацию и не фиксирует построчный код. Его задача - задать безопасный порядок внедрения без большого одновременного rewrite.

## 2. Что именно внедряем

Реализация состоит из двух связанных направлений.

### 2.1. Основное направление

Перевести память текстового чата на session-scoped lifecycle:

- `previous_response_id` живёт только внутри одной `therapySession`;
- после завершения `therapySession` chain обрывается;
- следующая сессия получает только summary handoff, а не старую OpenAI chain.

### 2.2. Второе направление

Сократить токены внутри активной сессии:

- ввести runtime compaction;
- разделить `session-bootstrap` и `per-turn`;
- перестать бесконтрольно дублировать стабильные prompt-слои;
- измерять эффект по реальным usage-метрикам.

## 3. Зафиксированные входные параметры

Эти параметры уже утверждены ТЗ и не обсуждаются заново в рамках v1:

- `IDLE_TIMEOUT_MS = 15 * 60 * 1000`
- `MAX_TURNS_PER_CHAIN = 24`
- `SOFT_INPUT_TOKENS = 10000`
- `MAX_INPUT_TOKENS = 15000`
- `RUNTIME_COMPACTION_CONTRACT = separate_internal_contract`
- `SESSION_END_SUMMARY_CONTRACT = separate_handoff_contract`

Интерпретация:

- основной runtime-guard - размер входного контекста;
- лимит `24` turn-ов - fallback guard;
- при `summary_failed` старая chain всё равно сбрасывается;
- при `enablePreviousResponseId = false` summary не сохраняется и не подмешивается.

## 3.1. Каноническое определение turn

Для всех guard-ов и счётчиков chain фиксируется единое определение:

- `turn` = один пользовательский запрос, на который был создан один основной assistant response.

Не считаются обычными turn-ами chain:

- retries одного и того же основного запроса;
- `suggested chips`;
- session-end summary pipeline;
- runtime compaction pipeline.

## 3.2. Приоритет guard-ов

При одновременном срабатывании нескольких условий используется единый порядок приоритета:

1. `explicit_end`
2. `new_session_started`
3. `MAX_INPUT_TOKENS`
4. `MAX_TURNS_PER_CHAIN`
5. `SOFT_INPUT_TOKENS`
6. `idle_timeout`

Правила интерпретации:

- `explicit_end` и `new_session_started` безусловно завершают текущую session;
- `MAX_INPUT_TOKENS` важнее `MAX_TURNS_PER_CHAIN`;
- `SOFT_INPUT_TOKENS` сам по себе не форсит reset;
- `idle_timeout` не должен перебивать уже идущий active request.

## 4. Общая стратегия rollout

### 4.1. Принцип внедрения

Внедрение должно идти не одним большим PR, а по совместимым этапам.

Правила rollout:

- сначала зафиксировать baseline и целевой lifecycle;
- затем перепривязать storage памяти к `therapySessionId`;
- затем встроить session-end summary pipeline;
- затем ввести runtime compaction;
- только после этого оптимизировать prompt-слои внутри активной сессии;
- cleanup старой user-scoped памяти делать последним этапом.

### 4.2. Архитектурный принцип

Разделение ответственности:

- session lifecycle - server-side;
- chain memory storage - server-side;
- summary generation - server-side;
- runtime compaction decision - server-side;
- UI end-session signal - best effort client-side;
- usage truth - server-side logs OpenAI.

### 4.3. Правило без big bang rewrite

На переходном периоде допускается временное сосуществование:

- старого user-scoped `responseIdStore`;
- нового session-scoped memory store;
- старой выключенной summary-ветки;
- новой summary pipeline.

Но финальное чтение memory для текстового чата должно переключиться только на session-scoped схему.

## 5. Целевое распределение по слоям

### 5.1. Config layer

Назначение:

- idle-timeout;
- soft/hard token guard;
- max turns per chain;
- rollout flags при необходимости.

### 5.2. Storage layer

Назначение:

- session-scoped `response_id`;
- session-end handoff summary;
- runtime compact state;
- metadata для guard/compaction counters.
- `schemaVersion` для summary/compact-state.

### 5.3. Chat runtime layer

Назначение:

- получение current session memory;
- проверка runtime token guard;
- выполнение compaction/reset;
- сборка prompt слоёв;
- отправка запроса в OpenAI.

### 5.4. Session lifecycle layer

Назначение:

- start/end `therapySession`;
- idle close;
- new session pre-close;
- запуск session-end summary pipeline.

### 5.5. Client layer

Назначение:

- best-effort завершение сессии;
- корректная передача `therapySessionId`;
- отсутствие логики памяти на клиенте.

## 6. Файлы и модули, которые почти точно будут затронуты

### 6.1. Конфиг

- `server/config/subscription.ts`
- возможно отдельный конфиг-файл для token guard, если не хотим смешивать billing timeout и AI memory thresholds

### 6.2. Storage / DB

- `server/infrastructure/db/schema.ts`
- `server/utils/responseIdStore.ts`
- `server/utils/summaryStore.ts`

### 6.3. LLM runtime

- `server/infrastructure/llm/openai.ts`
- `server/infrastructure/llm/relayClient.ts`
- `server/utils/openaiUsage.ts`

### 6.4. Chat API

- `server/interface/api/chat.post.ts`
- `server/api/chat/stream.post.ts`
- `server/api/settings/chat.get.ts`
- `server/api/settings/chat.patch.ts`

### 6.5. Therapy session lifecycle

- `server/application/subscriptions/session-time.service.ts`
- `server/api/therapy/session/start.post.ts`
- `server/api/therapy/session/end.post.ts`

### 6.6. Client-side integration

- `app/stores/chat.ts`
- `app/plugins/session-finish.client.ts`

### 6.7. Документация

- `.docs/chat_token_optimization_tz.md`
- `.docs/architecture.md`
- этот implementation plan

## 7. Предлагаемые новые модули

Названия можно уточнить на этапе реализации, но логически понадобятся следующие модули.

### 7.1. Storage

- `server/utils/chatSessionMemoryStore.ts`
- `server/utils/chatSummaryStore.ts` или расширение текущего `summaryStore`

### 7.2. Summary / compaction

- `server/application/chat/chat-summary.service.ts`
- `server/application/chat/chat-runtime-compaction.service.ts`
- `server/application/chat/chat-memory-handoff.service.ts`
- `server/application/chat/chat-token-guard.service.ts`

### 7.3. Prompt assembly

- `server/application/chat/chat-context-layers.service.ts`

Цель:

- не держать финальную логику `session-bootstrap` и `per-turn` прямо внутри `openai.ts`.

## 8. Этап 0. Freeze baseline и подготовка design

### 8.1. Цель

Перед кодом зафиксировать baseline и подтвердить, что будущий rollout будет сравниваться с одинаковыми метриками.

### 8.2. Что сделать

- собрать baseline usage по:
  - `chat`
  - `chat_stream`
  - `chips`
  - `realtime`
- подтвердить реальный текущий idle timeout в коде и целевую замену с `2 минут` на `15 минут`
- подтвердить, что текущий `responseIdStore` реально привязан к `userId`
- подтвердить, что старая summary-ветка выключена и не участвует в runtime
- подтвердить, что `finishSession()` сейчас не встроен в каноническое server-side завершение `therapySession`

### 8.3. Артефакт этапа

- frozen baseline логов;
- frozen version ТЗ;
- frozen version этого implementation plan.

## 9. Этап 1. Session-scoped storage памяти

### 9.1. Цель

Перестать хранить `response_id` на уровне пользователя и перевести память на уровень `therapySession`.

### 9.2. Что меняем

- в схеме БД вводится session-scoped storage для `response_id`
- текущий `user_response_ids` перестаёт быть источником истины для текстового чата
- API чтения/сохранения памяти начинает принимать `therapySessionId`

### 9.3. Файлы

- `server/infrastructure/db/schema.ts`
- `server/utils/responseIdStore.ts` или новый `chatSessionMemoryStore.ts`
- `server/api/settings/chat.get.ts`
- `server/api/settings/chat.patch.ts`
- `server/infrastructure/llm/openai.ts`
- `server/api/chat/stream.post.ts`

### 9.4. Решение по совместимости

На переходном этапе:

- новый runtime читает session-scoped storage первым;
- старый user-scoped store можно читать только как fallback для миграции, но не дольше одного короткого переходного окна;
- после стабилизации fallback удаляется.

### 9.5. Проверка этапа

- новая `therapySession` не наследует `response_id` от старой;
- параллельные сессии одного пользователя не смешивают память;
- `isFirstSession` и related flags начинают считаться по session scope.

## 10. Этап 2. Server-side lifecycle закрытия сессии

### 10.1. Цель

Сделать сервер каноническим источником завершения text session и встроить туда memory reset pipeline.

### 10.2. Что меняем

- `CHAT_IDLE_TIMEOUT_MS` меняется с текущих `2 минут` на `15 минут`
- server-side end-session становится точкой запуска summary/reset
- `new_session_started` закрывает предыдущую активную session до старта новой
- client-side `page close` остаётся best effort, но не считается источником истины

### 10.3. Файлы

- `server/config/subscription.ts`
- `server/application/subscriptions/session-time.service.ts`
- `server/api/therapy/session/start.post.ts`
- `server/api/therapy/session/end.post.ts`
- `app/stores/chat.ts`
- `app/plugins/session-finish.client.ts`

### 10.4. Важный нюанс

Сейчас `endTherapySession()` только завершает billing/session timing. После рефакторинга оно должно либо:

- само вызывать session-end memory pipeline;
- либо вызывать orchestration service, который завершает session timing и затем запускает summary/reset.

Предпочтительно второе, чтобы billing-логика не обрастала LLM-ответственностью.

### 10.5. Проверка этапа

- server-side idle close работает на `15 минут`;
- новый session start корректно закрывает старую активную session;
- завершение session больше не зависит только от `keepalive` запроса клиента.

## 11. Этап 3. Session-end summary pipeline

### 11.1. Цель

Вернуть summary-механизм в обновлённом виде и сделать его официальным межсессионным handoff.

### 11.2. Что меняем

- старая ветка `finishSession()` перестаёт быть “мертвым кодом”
- summary строится по новому handoff contract
- после summary происходит обязательный reset chain
- при `summary_failed` применяется `fallback_empty`, но chain всё равно сбрасывается
- summary storage получает явное `schemaVersion`

### 11.3. Файлы

- `server/infrastructure/llm/openai.ts`
- `server/utils/summaryStore.ts`
- новый `server/application/chat/chat-summary.service.ts`
- новый `server/application/chat/chat-memory-handoff.service.ts`

### 11.4. Что не переносим из старой логики как есть

- `lastK = allMessages.slice(-12)` не принимается как целевая схема
- plaintext summary storage не принимается как целевая схема
- подмешивание нескольких старых summary в runtime не принимается как целевая схема

### 11.5. Минимальный контракт v1

Session-end handoff summary должен хранить:

- короткий overview;
- active themes;
- patterns/triggers;
- helpful interventions;
- unfinished threads;
- risk state;
- next session guidance.

Дополнительное правило:

- session-end handoff summary должен строиться из канонической серверной картины, доступной на этот момент;
- incremental обновление допустимо только поверх уже валидного summary-state, а не поверх чернового “хвоста”.

### 11.6. Проверка этапа

- после normal end summary сохраняется;
- после summary save chain reset выполняется;
- после summary failure chain reset всё равно выполняется;
- при следующем старте сессии подмешивается только последнее summary.

## 12. Этап 4. Opt-in и privacy policy для summary

### 12.1. Цель

Привести summary storage и usage policy к требованиям приватности и к текущей настройке `enablePreviousResponseId`.

### 12.2. Что меняем

- summary не сохраняется, если `enablePreviousResponseId = false`
- summary не подмешивается в новую сессию, если `enablePreviousResponseId = false`
- storage summary приводится к корректной политике хранения
- runtime умеет безопасно игнорировать неизвестный `schemaVersion`

### 12.3. Файлы

- `server/utils/storage.ts`
- `server/utils/summaryStore.ts`
- `server/api/settings/chat.get.ts`
- `server/api/settings/chat.patch.ts`
- `server/infrastructure/db/schema.ts`

### 12.4. Отдельное уточнение

Сейчас `summaryStore` пишет plaintext в `summaryCt`, хотя schema комментируется как encrypted storage. До merge v1 это несоответствие должно быть устранено.

### 12.5. Проверка этапа

- пользователь с выключенным memory flag не создаёт summary;
- summary из старых сессий не утягивается в runtime для такого пользователя;
- storage policy соответствует требованиям проекта.

## 13. Этап 5. Runtime compaction и token guard

### 13.1. Цель

Обрезать дорогие chain ещё до формального конца session.

### 13.2. Что меняем

- вводим `SOFT_INPUT_TOKENS = 10000`
- вводим `MAX_INPUT_TOKENS = 15000`
- вводим `MAX_TURNS_PER_CHAIN = 24`
- создаём runtime compact state по отдельному internal contract
- после compaction старая chain сбрасывается, но текущая `therapySession` остаётся той же
- `estimated_tokens` считается по real usage + server-side conservative estimate, а не только по символам

### 13.3. Триггеры

Soft zone:

- chain помечается кандидатом на compaction;
- пишется диагностический лог;
- compaction можно выполнить на ближайшем удобном turn без резкого UX-обрыва.

Hard zone:

- продолжение старой chain запрещено;
- forced compaction/reset выполняется до следующего обычного ответа.

Fallback guard:

- если chain не достигла hard token threshold, но дошла до `24` turn-ов, выполняется forced compaction.

Правило обработки текущего user-message:

- если forced compaction нужен в момент прихода нового user-message, compaction строится по уже накопленному состоянию без этого нового сообщения;
- текущее сообщение пользователя становится первым сообщением новой chain после compaction;
- двойная обработка одного и того же user-message запрещена.

Правило расчёта `estimated_tokens`:

- primary signal - реальные usage предыдущих OpenAI-запросов;
- к ним добавляется server-side оценка размера следующего payload по отправляемым ролям;
- если точный preflight расчёт невозможен, используется conservative estimate по последнему observed usage и текущему составу input;
- локальная оценка только по длине строки не считается достаточной для runtime guard.

### 13.4. Файлы

- новый `server/application/chat/chat-token-guard.service.ts`
- новый `server/application/chat/chat-runtime-compaction.service.ts`
- `server/infrastructure/llm/openai.ts`
- `server/api/chat/stream.post.ts`
- `server/interface/api/chat.post.ts`

### 13.5. Важная архитектурная оговорка

Runtime compaction не должен превращаться в мини-session-end summary. Его контракт должен быть максимально коротким и ориентированным на продолжение текущего разговора, а не на межсессионный handoff.

Для v1 runtime compaction и session-end handoff не используют общий контракт. Общая база полей может обсуждаться только отдельным решением в будущем.

### 13.6. Проверка этапа

- soft guard логируется;
- hard guard останавливает продолжение старой chain;
- runtime compaction не меняет `therapySessionId`;
- после compaction следующий запрос идёт уже по новой короткой chain.

## 14. Этап 6. Prompt-layer split

### 14.1. Цель

Уменьшить дублирование стабильных prompt-слоёв без потери safety и flow logic.

### 14.2. Что меняем

- явно выделяем `session-bootstrap`
- явно выделяем `per-turn`
- стабилизируем состав того, что считается session-level
- сохраняем явными crisis / flow / responseNumber-dependent overlays

### 14.3. Файлы

- `server/infrastructure/llm/openai.ts`
- `server/application/prompts/index.ts`
- новый `server/application/chat/chat-context-layers.service.ts`
- возможно `server/application/chat/crisis-protocol.service.ts`
- возможно `server/application/chat/phobias-entry.service.ts`

### 14.4. Порядок внедрения

- сначала описать текущие слои как есть;
- затем перенести сборку слоёв в отдельный service;
- затем убрать повторную отправку того, что признано стабильным;
- затем переснять baseline/post-change по usage.

### 14.5. Проверка этапа

- crisis handling не деградирует;
- welcome flow не ломается;
- phobias overlays не теряются;
- addressing/tone продолжают работать;
- повторный turn реально становится дешевле baseline.

## 15. Этап 7. Budget/usage semantics и approximate cost cleanup

### 15.1. Цель

Привести локальную оценку стоимости в соответствие с новой архитектурой и не вводить команду в заблуждение.

### 15.2. Что меняем

- явно помечаем approximate estimate как approximate-only;
- не используем её как “истину” о chain cost;
- опираемся на реальные OpenAI `usage` для post-analysis;
- при необходимости меняем wording и guard-политику локального estimate.

### 15.3. Файлы

- `server/interface/api/chat.post.ts`
- возможно `server/application/llm.service.ts`
- возможно `server/application/chat/chat-guard.service.ts`

### 15.4. Проверка этапа

- локальная estimate больше не противоречит наблюдаемой реальности;
- аналитика до/после строится по server logs, а не по approximate formula.

## 16. Этап 8. Cleanup legacy памяти

### 16.1. Цель

Удалить или окончательно вывести из runtime старую user-scoped memory logic.

### 16.2. Что меняем

- убираем чтение user-scoped `response_id` из runtime;
- удаляем legacy fallback;
- оставляем только session-scoped memory path;
- legacy store чистим миграционно или через maintenance task.

### 16.3. Файлы

- `server/utils/responseIdStore.ts`
- `server/api/settings/chat.get.ts`
- `server/api/settings/chat.patch.ts`
- `server/infrastructure/llm/openai.ts`
- `server/api/chat/stream.post.ts`

### 16.4. Проверка этапа

- код не читает user-scoped memory для text chat;
- baseline regression после cleanup отсутствует.

## 17. Suggested chips: как учитывать в rollout

`suggested chips` не входят в основной memory refactor, но должны сопровождать rollout.

Правила:

- chips метрики снимаются отдельно;
- chips не должны случайно начать пользоваться session-end summary вместо реального локального контекста;
- если после основного rollout chips остаются дорогими, для них планируется отдельная мини-оптимизация вторым шагом.

## 18. Проверки и тестовая матрица

### 18.1. Unit / service level

Нужно покрыть:

- reset policy при `summary_failed`
- session-scoped retrieval/save/delete memory
- runtime token guard decisions
- turn-count fallback guard
- opt-out behavior при `enablePreviousResponseId = false`
- handoff injection только последнего summary
- turn counting semantics
- guard priority resolution
- unknown `schemaVersion` handling

### 18.2. Integration level

Нужно проверить:

- start session -> several turns -> end session -> next session
- idle timeout end -> summary/reset -> next session
- new session start while previous active -> previous close -> summary/reset
- runtime compaction внутри длинной активной session
- stream chat и non-stream chat

### 18.3. Product scenarios

Нужно проверить:

- welcome flow
- обычный терапевтический диалог
- long-running dialog на десятки turn-ов
- crisis guidance
- phobias flow
- chips generation после основного ответа

### 18.4. Metrics validation

Сравниваем минимум:

- cost второго turn baseline vs post-change
- cost третьего turn baseline vs post-change
- cost первого turn новой session после handoff
- frequency runtime compaction
- average input tokens до compaction и после compaction
- latency до/после

## 19. Feature flags и безопасный rollout

Если нужен особо безопасный rollout, вводятся временные флаги:

- `CHAT_SESSION_SCOPED_MEMORY_V1`
- `CHAT_SESSION_END_SUMMARY_V1`
- `CHAT_RUNTIME_COMPACTION_V1`
- `CHAT_PROMPT_LAYER_SPLIT_V1`

Порядок включения:

1. session-scoped memory
2. session-end summary/reset
3. runtime compaction
4. prompt-layer split

Если команда считает rollout manageable без флагов, допускается staged merge по этапам без runtime switch, но только при маленьких PR и явной валидации каждого этапа.

## 20. Definition of Done для implementation plan

Implementation plan считается готовым к переходу в код, если:

- подтверждён порядок этапов;
- подтверждён session-scoped lifecycle памяти;
- подтверждён session-end summary pipeline;
- подтверждён runtime compaction contract;
- подтверждены thresholds и timeout;
- понятны файлы первой волны изменений;
- понятен набор baseline/post-change метрик;
- понятен rollback/rollout порядок.
