# ТЗ: Масштабирование генерации слотов уведомлений (DB Load / Reliability)

## Статус

- **Тип:** проектирование (без реализации)
- **Цель:** убрать риски деградации БД и падений при росте активной базы пользователей
- **Scope:** только генерация/поддержание `notification_slots` и связанные фоновые процессы

---

## 1. Проблема

Периодическая постановка задач на генерацию слотов решает функциональную проблему «слоты закончились и не пополнились», но при росте MAU остаются системные риски:

1. Массовые сканы `notification_preferences` и короткие burst-окна enqueue.
2. Пиковые операции delete+insert в `notification_slots`.
3. Гонки статусов `planned/queued/sent` при параллельной работе воркеров.
4. Нечёткие инварианты «нормального горизонта» и порога регенерации.
5. Недостаточно формализованный backpressure.

---

## 2. Цели

1. Стабильно поддерживать целевой горизонт слотов без действий пользователя.
2. Снизить и выровнять нагрузку на БД при росте 10x от текущей базы.
3. Исключить thundering herd в scheduler/worker.
4. Гарантировать идемпотентность и отсутствие дублей/потерь.

---

## 3. Формальные инварианты и пороги (обязательная норма)

## 3.1 Инвариант горизонта

Для каждого пользователя с `enabled` настройками.

Определение active user для slots:

1. `active_user_for_slots = exists(notification_preferences where user_id = ? and enabled = true)`.
2. Если `active_user_for_slots = false`:
   - слоты не генерируем;
   - логируем `reason=prefs_missing_or_disabled`;
   - это штатный сценарий, не ошибка.

Для каждого active user:

1. **Target horizon:** `target_horizon_days = 2` (today + tomorrow).
2. **Минимальная норма горизонта:** `min_horizon_hours = 36` (эквивалентно 1.5 дня, можно держать как env).
3. **Горизонт считается по** `planned + queued` (не только planned).
4. В кодовой логике источник истины: `SLOTS_TARGET_HORIZON_HOURS` (например, 48).
   `target_horizon_days` остается документационным alias.

## 3.2 Формула запуска регенерации

1. `expected_slots = Σ(times_per_day по активным prefs) * horizon_days`
2. `actual_slots = count(status IN ('planned','queued') на горизонте)`
   - в логах раздельно: `planned_count`, `queued_count` для диагностики.
3. `regen_threshold = floor(expected_slots * SLOTS_REGEN_THRESHOLD_PERCENT/100)` (по умолчанию 80%)
4. Регенерация нужна, если:
   - `actual_slots < regen_threshold`, или
   - `actual_slots_by_hours < min_horizon_hours`.
5. Формальное определение:
   - `actual_slots_by_hours = max(0, hours(last_scheduled_at(planned+queued) - now))`,
   - где `last_scheduled_at` ищется в диапазоне `now..now+target_horizon_hours`.

## 3.3 Точность `expected_slots` и допущения

`expected_slots = Σ(times_per_day) * horizon_days` — это приближение.

Чтобы не получить ложные регены, в документе фиксируются два режима:

1. **Целевой (точный):**
   - считаем `expected_slots` по диапазону `now..now+target_horizon_hours`,
   - в локальном timezone пользователя,
   - с учётом `activeDays` и фактического попадания в окно уведомлений.
2. **Промежуточный (упрощённый):**
   - считаем по дням (как сейчас),
   - явно признаём возможные ложные срабатывания,
   - компенсируем `SLOTS_REGEN_THRESHOLD_PERCENT=80` и `min_horizon_hours`.

## 3.4 Источник окна уведомлений (quiet hours / time window)

Для точного режима расчета `expected_slots`:

1. Источник окна уведомлений: `notification_preferences.timeRangeStart/timeRangeEnd`.
2. Если окно отсутствует/битое, используется дефолт:
   - `timeRangeStart = 540` (09:00),
   - `timeRangeEnd = 1350` (22:30),
   - в timezone пользователя.
3. Реализация не должна «придумывать» альтернативные дефолты без изменения ТЗ.

---

## 4. Нефункциональные требования (SLO/SLA)

1. **Availability:** генерация слотов 99.9%.
2. **Latency:**
   - enqueue-планировщик p95 < 60 сек на 10k активных пользователей;
   - генерация для 1 пользователя p95 < 800 мс.
3. **DB protection:**
   - контролируемый лимит write ops/sec на `notification_slots`;
   - lock wait p95 < 2 сек.
4. **Graceful degradation:** при перегрузке сервис замедляется детерминированно, не «падает».

---

## 5. Архитектурные требования

## 5.1 Планировщик (enqueue): sharding + fairness

1. Incremental batch проход обязателен.
2. Вводится шардирование:
   - `shard = user_id % N`;
   - планировщик обрабатывает shard-by-shard.
3. Fairness-инвариант:
   - любой активный пользователь должен быть проверен минимум 1 раз в `T` часов (`SLOTS_FAIRNESS_MAX_DELAY_HOURS`).
4. Новые пользователи/дырки в `user_id` не должны ломать fairness.
5. Прогресс планировщика хранится явно:
   - `cursor_state = { shard, last_user_id, updated_at, cycle_id }`.
   - `cursor_state` хранится в Postgres (служебная таблица) как единый источник истины.
6. Алгоритм обхода:
   - round-robin по shard;
   - внутри shard — incremental batch по `user_id`.
   - `cycle_id` увеличивается только после полного прохода по всем shard.
7. Защита от «вечного первого шарда»:
   - если `cursor_state.updated_at` stale > `SLOTS_CURSOR_STALE_MS`,
   - курсор сбрасывается и планировщик переходит к следующему shard.
8. Атомарность курсора:
   - обновление `cursor_state` выполняется только после успешного enqueue batch;
   - обновление курсора — атомарная операция (транзакция/row lock).
9. Минимальный DDL-контракт:
   - cursor хранится **по shard** (не одна глобальная строка),
   - `PRIMARY KEY (shard)`,
   - поля: `shard`, `last_user_id`, `updated_at`, `cycle_id`.
10. `cycle_id`:

- хранится в отдельной таблице состояния scheduler (одна строка),
- либо обновляется как общий счетчик в рамках транзакции завершения полного прохода по всем shard.

## 5.2 Контракт дедупликации job

1. Единый стандарт:
   - `jobId = slotsgen:{userId}:{cycle_id}`.
2. `cycle_id` генерируется планировщиком и стабилен в рамках цикла.
3. Если job с тем же `jobId` уже есть в `waiting|active|delayed`, новую не ставим.
4. Чтобы дедуп не ломался при queue lag:
   - reschedule обязан переиспользовать исходный `cycle_id`, а не пересчитывать id от wall-clock.
5. Dedup TTL фиксируется в env (`SLOTS_JOB_DEDUP_TTL_MS`).

## 5.3 Lock-стратегия (single source of truth)

1. Использовать **Postgres advisory lock** как основной lock механизм (source of truth для межпроцессной координации).
   - In-memory Map (`activeRegenerations`) может оставаться как локальный оптимизатор (снижает лишние DB round-trip), но не является гарантией.
2. Нормализованный lock key (обязательный контракт):
   - использовать `pg_advisory_xact_lock(int, int)`,
   - `key1 = user_id`,
   - `key2 = LOCK_NAMESPACE_SLOTS_GENERATION` (константа, фиксированное int32 значение),
   - одинаковая формула во всех сервисах/воркерах.
3. Таймаут захвата lock: `SLOTS_LOCK_TIMEOUT_MS`.
4. Если lock не взят:
   - задача не падает;
   - reschedule с exponential backoff.
5. Lock удерживается только на критическую секцию регенерации (внутри транзакции), не на весь lifetime job.
6. Есть жесткий timeout выполнения регенерации: `SLOTS_REGEN_MAX_RUNTIME_MS`.
7. При timeout: транзакция откатывается, задача reschedule с backoff.

## 5.4 State machine статусов слота

Разрешённые переходы:

1. `planned -> queued -> sent`
2. `planned -> skipped`
3. `planned -> failed`
4. `queued -> sent`
5. `queued -> failed`

Запрещённые переходы:

1. `queued -> planned`
2. `sent -> *`
3. `skipped -> *`

Владелец переходов:

1. `planned -> queued`: delivery scheduler/worker.
2. `queued -> sent|failed`: delivery worker.
3. `planned -> skipped`: delivery scheduler (late-delivery grace).
4. Конкурентно-безопасный переход `planned -> queued`:
   - `UPDATE ... SET status='queued' WHERE id=? AND status='planned' RETURNING id`,
   - если `RETURNING` пустой — слот уже переведен другим воркером, это штатный исход,
   - enqueue side-effect выполняется только если `RETURNING` вернул строку.

---

## 6. Безопасный алгоритм регенерации (delete/insert)

Регенерация выполняется **в транзакции**:

1. Вычислить границы пересоздания:
   - `regen_range_start = now + SLOTS_REGEN_SAFE_WINDOW_MINUTES`;
   - `regen_range_end = now + target_horizon_hours`.
   - все `*_MINUTES` сначала конвертируются единым helper в ms/sec (без ручной арифметики в бизнес-коде),
   - в structured log обязательно писать `regen_range_start_utc` и `regen_range_end_utc`.
2. Границы считаются в timezone пользователя, сравнение `scheduled_at` выполняется в UTC.
   - source of truth timezone: `notification_preferences.timezone` (IANA, берём из первой enabled preference);
   - fallback при отсутствии/невалидном timezone: `Europe/Moscow`;
   - если среди enabled preferences разные timezone (аномалия): логируем `reason=timezone_conflict`, берём из первой, не падаем.
   - **Будущее:** перенос в `users.timezone` как отдельная фича и миграция.
3. Посчитать целевой набор слотов в `regen_range_start..regen_range_end`.
4. Удалить только `planned` в диапазоне пересоздания.
5. **`queued` не трогать вообще** в рамках регенерации:
   - queued уже связаны с BullMQ job; удаление создаст рассинхрон (job есть, запись нет → потеря уведомления);
   - удаление queued нарушает идемпотентность и может приводить к тихой потере уведомлений;
   - `SLOTS_SAFE_QUEUED_WINDOW_MINUTES` не используется как диапазон для удаления queued, а как дополнительный guard для расчёта `regen_range_start` (чтобы не создавать planned слишком близко к queued).
6. Вставить новые `planned` через upsert-подход.
7. Применить anti-overlap идемпотентно.
8. При изменении timezone запускается принудительный regen на горизонте (`reason=timezone_changed`).

Норматив по документам:

1. Источник истины по queued при регенерации — **этот** scaling-ТЗ.
2. Если в `.docs/NOTIFICATION_SCHEDULING_ORCHESTRATION.md` встречается удаление queued, такая формулировка считается устаревшей и должна быть приведена к этому ТЗ.

Ограничения:

1. Лимит строк на 1 регенерацию (`SLOTS_MAX_ROWS_PER_REGEN`).
2. Лимит длительности транзакции (`SLOTS_REGEN_TX_TIMEOUT_MS`).

---

## 6.1 Ночной режим (crossesMidnight)

Текущая логика `needsSlotRegeneration` для night mode содержит хрупкое ограничение `hoursSinceGeneration <= 2`, которое может быть пропущено при рестарте сервера или лагах scheduler.

**Решение:** убрать фиксированное «окно 2 часа». Заменить на:

1. Ночной режим **не блокирует** регенерацию; он влияет только на **планирование времени** слотов.
2. Частота регенерации per user ограничивается через `SLOTS_MIN_REGEN_INTERVAL_MINUTES` (rate-limit), а не через привязку к конкретному часу.
3. Дедуп через `cycle_id` (п. 5.2) дополнительно защищает от лавины.
4. Дефолт `SLOTS_MIN_REGEN_INTERVAL_MINUTES = 30`.
5. Safety valve: если `actual_slots_by_hours < min_horizon_hours / 2`, регенерация **игнорирует** rate-limit.

---

## 7. Требования к БД

## 7.1 Индексы

1. Для обхода batch по user_id:
   - partial index `ON notification_preferences(user_id) WHERE enabled=true` — обязательный.
2. `notification_slots(user_id, status, scheduled_at)` — обязательный.
3. Partial index для `status IN ('planned','queued')` — обязательный.

## 7.2 Идемпотентность на уровне БД

1. Добавить уникальность активных слотов **без поля status**:
   - `UNIQUE(user_id, kind, entity_key, scheduled_at) WHERE status IN ('planned','queued')`.
   - **Миграция в два шага:**
     1. Скрипт поиска и чистки дублей + отчёт по количеству.
     2. Добавление partial unique constraint.
2. Вставка слотов через `INSERT ... ON CONFLICT DO NOTHING` (или эквивалент Drizzle upsert).
   - конфликт unique считается штатным исходом, не ошибкой;
   - retry из-за самого факта конфликта не выполняется.
3. Если вставка пропущена по conflict:
   - `inserted_count` отражает только реально вставленные строки;
   - regen считается успешным при выполнении остальных шагов.
4. Переход `planned -> queued` должен быть `UPDATE` той же строки (не `INSERT` новой).

---

## 8. Конфигурация и детерминированный backpressure

## 8.1 Env параметры

1. `SLOTS_SCHEDULER_BATCH_SIZE`
2. `SLOTS_SCHEDULER_INTERVAL_MS`
3. `SLOTS_SCHEDULER_JITTER_MS`
4. `SLOTS_WORKER_CONCURRENCY`
5. `SLOTS_REGEN_THRESHOLD_PERCENT` (default 80)
6. `SLOTS_SAFE_QUEUED_WINDOW_MINUTES`
7. `SLOTS_REGEN_SAFE_WINDOW_MINUTES`
8. `SLOTS_TARGET_HORIZON_HOURS`
9. `SLOTS_LOCK_TIMEOUT_MS`
10. `SLOTS_FAIRNESS_MAX_DELAY_HOURS`
11. `SLOTS_BACKPRESSURE_QUEUE_DEPTH`
12. `SLOTS_BACKPRESSURE_QUEUE_LAG_MS`
13. `SLOTS_BACKPRESSURE_RECOVERY_CYCLES`
14. `SLOTS_CURSOR_STALE_MS`
15. `SLOTS_SCHEDULER_SHARDS`
16. `SLOTS_REGEN_MAX_RUNTIME_MS`
17. `SLOTS_JOB_DEDUP_TTL_MS`
18. `SLOTS_JITTER_MINUTES` (default 15)
19. `SLOTS_MIN_GAP_MINUTES` (default 10)
20. `SLOTS_MIN_REGEN_INTERVAL_MINUTES` (default 30; rate-limit частоты регенерации per user, заменяет хрупкое «окно 2 часа» для night mode)

## 8.2 Правила реакции

Пороги backpressure (двухуровневая модель):

1. SLO (норма): `queue_lag_p95 <= 2 минуты`.
2. Soft backpressure: `queue_lag >= 5 минут`.
3. Hard backpressure: `queue_lag >= 15 минут`.

Метрика lag:

1. `queue_lag` измеряется по очереди генерации слотов (`notification-slots-generation`), а не по «старейшей job в любой очереди».
2. Для SLO используется `queue_lag_p95` по окну наблюдения.

Если сработал **soft** (`queue_lag >= 5m` или `queue_depth > X`):

1. Увеличить `SLOTS_SCHEDULER_INTERVAL_MS` (например, x2).
2. Уменьшить `SLOTS_SCHEDULER_BATCH_SIZE` (например, /2).
3. Временно включить режим `only_users_below_horizon=true`.

Если сработал **hard** (`queue_lag >= 15m`):

1. Жёстко включить `only_users_below_horizon=true` (режим выживания).
2. Дополнительно снизить `SLOTS_SCHEDULER_BATCH_SIZE`.
3. Дополнительно увеличить `SLOTS_SCHEDULER_INTERVAL_MS`.
4. `SLOTS_WORKER_CONCURRENCY` не повышать; при признаках деградации БД допускается временно уменьшать.

Где:

1. `X = SLOTS_BACKPRESSURE_QUEUE_DEPTH`
2. `Y = SLOTS_BACKPRESSURE_QUEUE_LAG_MS`
3. возврат к baseline только после `SLOTS_BACKPRESSURE_RECOVERY_CYCLES` подряд «здоровых» циклов.

Если метрики восстановились `N` циклов подряд:

1. Возвращать параметры по шагам к baseline.
2. Baseline определяется как значения env, прочитанные при старте процесса.
3. Backpressure меняет только runtime effective параметры в памяти процесса.
4. Env не переписывается; после рестарта baseline инициализируется заново из env.

---

## 9. Наблюдаемость

## 9.1 Метрики

1. Active users с `enabled` prefs.
2. Jobs enqueued/skipped/failed по `notification-slots-generation`.
3. p50/p95 генерации слотов на пользователя.
4. Delete/insert rows/min в `notification_slots`.
5. Queue depth/lag для `notification-slots-generation` (отдельно от других очередей).
6. `queue_lag_p95` (целевая норма: <= 2 минуты).
7. % пользователей ниже `min_horizon_hours`.

## 9.2 Structured logs (обязательные поля)

На каждую регенерацию:

1. `user_id`
2. `job_id`
3. `trace_id`
4. `reason` (`threshold_hit|cron|manual|login|prefs_changed|timezone_changed|below_horizon|prefs_missing_or_disabled`)
5. `horizon_before`, `horizon_after`
6. `deleted_count`, `inserted_count`
   6a. `planned_count`, `queued_count` (раздельно для диагностики)
7. `lock_acquire_ms`
8. `took_ms`

## 9.3 Алерты

1. Queue lag > Y минут.
2. Worker error-rate > Z%.
3. Пользователей ниже горизонта > K% более N минут.

---

## 10. Rollout-план

1. **Phase 0:** индексы, чистка дублей + unique constraint, метрики, feature flags, миграции служебных таблиц scheduler state (`slots_scheduler_cursor`, `slots_scheduler_state`).
2. **Phase 1:** шардированный enqueue на 10% пользователей.
3. **Phase 2:** 50%, наблюдение за DB/queue/locks.
4. **Phase 3:** 100%.
5. **Phase 4:** tuning batch/concurrency/interval по baseline.

Rollback:

1. Feature flag выключает периодический scheduler.
2. Возврат на event-driven режим.

Обязательные feature flags:

1. `slots_scheduler_enabled`
2. `slots_regen_enabled`
3. `slots_sharding_enabled`
4. `slots_backpressure_enabled`
5. `slots_db_unique_constraint_enabled`

---

## 11. Критерии приёмки

1. Без действий пользователя слоты стабильно пополняются.
2. На 10k активных пользователей:
   - нет лавинообразного роста queue lag;
   - DB не уходит в деградацию по lock/wait.
3. Нет роста дублей/потерь слотов.
4. Нет неконтролируемого роста AI-генерации.

---

## 12. Тест-план

1. Нагрузка 1k / 5k / 10k активных пользователей.
2. Конкуренция: parallel enqueue + delivery + regeneration.
3. Отказы Redis/DB (временные ошибки, таймауты).
4. Kill worker в середине транзакции — повтор задачи не ломает данные.
5. Двойной запуск scheduler — очередь не удваивается.
6. Chaos с DB timeouts — ретраи не создают лавину дублей.

---

## 13. Закрытые вопросы (решения)

1. **Timezone source of truth:** `notification_preferences.timezone`, fallback `Europe/Moscow`. Перенос в `users.timezone` — отдельная фича.
2. **actual_slots:** считаем `planned + queued`. Регенерация реже — корректно для масштабирования.
3. **Queued при регенерации:** не трогаем вообще. Удаление queued создаёт рассинхрон с BullMQ job.
4. **Lock:** Postgres advisory lock как source of truth. Map — необязательный локальный оптимизатор.
5. **jitterMinutes / minGapMinutes:** выносим в env (`SLOTS_JITTER_MINUTES=15`, `SLOTS_MIN_GAP_MINUTES=10`).
6. **Индекс на notification_preferences:** добавляем миграцией.
7. **Unique constraint на notification_slots:** добавляем через чистку дублей + миграцию.
8. **Ночной режим «окно 2 часа»:** убираем. Заменяем на `SLOTS_MIN_REGEN_INTERVAL_MINUTES` rate-limit + дедуп через `cycle_id`.
9. **`SLOTS_MIN_REGEN_INTERVAL_MINUTES`:** фиксируем `30` минут.
10. **Критически низкий горизонт:** при `actual_slots_by_hours < min_horizon_hours / 2` rate-limit не применяется (форсированный regen).
11. **Логика распределения времени слотов:** вне scope этого ТЗ; `buildDailySequence`, `assignTimesToSequence`, интервалы, jitter, minGap и раскладка внутри дня не меняются.
12. **Служебные таблицы scheduler state:** обязательны и создаются миграциями:
    - `slots_scheduler_cursor(shard PK, last_user_id, updated_at, cycle_id)`;
    - `slots_scheduler_state(global_cycle_id, updated_at)`.
13. **State machine delivery:** переход `queued -> planned` считается багом корректности и фиксится в рамках этого этапа.
14. **`forceTodaySlots`:** признан техдолгом и оставлен вне scope текущего ТЗ (отдельная продуктовая задача).
15. **Целевой `queue_lag` для бизнеса:** фиксируется двухуровневая модель:
    - SLO: `queue_lag_p95 <= 2 минуты`;
    - soft: `queue_lag >= 5 минут`;
    - hard: `queue_lag >= 15 минут`.
16. **Выделение процессов в production:** slots worker выносится в отдельный процесс/контейнер обязательно.
    - Минимальный split: `scheduler (enqueue)`, `slots worker (regen/generation)`, `delivery worker (planned->queued, queued->sent/failed)`.
    - Для разработки/раннего этапа допускается совмещённый запуск (опционально).

## 14. Открытые вопросы

На текущем этапе открытые вопросы по масштабированию slots отсутствуют.

---

## 15. Результат этого ТЗ

После реализации по этому ТЗ система поддерживает целевой горизонт слотов при росте нагрузки, с предсказуемым профилем БД, прозрачной диагностикой и детерминированным поведением при деградации.
