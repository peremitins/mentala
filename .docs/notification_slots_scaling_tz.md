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

Для каждого пользователя с `enabled` настройками:

1. **Target horizon:** `target_horizon_days = 2` (today + tomorrow).
2. **Минимальная норма горизонта:** `min_horizon_hours = 36` (эквивалентно 1.5 дня, можно держать как env).
3. **Горизонт считается по** `planned + queued` (не только planned).

## 3.2 Формула запуска регенерации

1. `expected_slots = Σ(times_per_day по активным prefs) * horizon_days`
2. `actual_slots = count(planned + queued на горизонте)`
3. `regen_threshold = floor(expected_slots * SLOTS_REGEN_THRESHOLD_PERCENT/100)` (по умолчанию 80%)
4. Регенерация нужна, если:
   - `actual_slots < regen_threshold`, или
   - `actual_slots_by_hours < min_horizon_hours`.

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
6. Алгоритм обхода:
   - round-robin по shard;
   - внутри shard — incremental batch по `user_id`.
7. Защита от «вечного первого шарда»:
   - если `cursor_state.updated_at` stale > `SLOTS_CURSOR_STALE_MS`,
   - курсор сбрасывается и планировщик переходит к следующему shard.

## 5.2 Контракт дедупликации job

1. Стандартный формат:
   - `jobId = slotsgen:{userId}:{bucket}`.
2. `bucket = floor(now / SLOTS_JOB_BUCKET_MS)`.
3. `SLOTS_JOB_BUCKET_MS` и dedup TTL фиксируются в env.
4. Если job с тем же `jobId` уже есть в `waiting|active|delayed`, новую не ставим.
5. Чтобы дедуп не ломался при queue lag:
   - `jobId` должен строиться от стабильного `cycle_id/window_id` планировщика, а не от локального `Date.now()` воркера.
6. При reschedule воркер обязан переиспользовать исходный `cycle_id` (не создавать новый bucket).

## 5.3 Lock-стратегия (single source of truth)

1. Использовать **Postgres advisory lock** как основной lock механизм.
2. Lock key: `hash(user_id, 'slots_generation')`.
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

---

## 6. Безопасный алгоритм регенерации (delete/insert)

Регенерация выполняется **в транзакции**:

1. Вычислить границы пересоздания:
   - `regen_range_start = now + safe_window_minutes`;
   - `regen_range_end = now + target_horizon_hours`.
2. Границы считаются в timezone пользователя, сравнение `scheduled_at` выполняется в UTC.
3. Посчитать целевой набор слотов в `regen_range_start..regen_range_end`.
4. Удалить только `planned` в диапазоне пересоздания.
5. `queued` в `queued-safe-window` не трогать.
6. Вставить новые `planned` через upsert-подход.
7. Применить anti-overlap идемпотентно.

Ограничения:

1. Лимит строк на 1 регенерацию (`SLOTS_MAX_ROWS_PER_REGEN`).
2. Лимит длительности транзакции (`SLOTS_REGEN_TX_TIMEOUT_MS`).

---

## 7. Требования к БД

## 7.1 Индексы

1. `notification_preferences(enabled, user_id)` — обязательный.
2. `notification_slots(user_id, status, scheduled_at)` — обязательный.
3. Partial index для `status IN ('planned','queued')` — обязательный.

## 7.2 Идемпотентность на уровне БД

1. Добавить уникальность активных слотов **без поля status**:
   - `UNIQUE(user_id, kind, entity_key, scheduled_at) WHERE status IN ('planned','queued')`.
2. Вставка слотов через `INSERT ... ON CONFLICT DO NOTHING` (или эквивалент Drizzle upsert).
3. Переход `planned -> queued` должен быть `UPDATE` той же строки (не `INSERT` новой).

---

## 8. Конфигурация и детерминированный backpressure

## 8.1 Env параметры

1. `SLOTS_SCHEDULER_BATCH_SIZE`
2. `SLOTS_SCHEDULER_INTERVAL_MS`
3. `SLOTS_SCHEDULER_JITTER_MS`
4. `SLOTS_WORKER_CONCURRENCY`
5. `SLOTS_REGEN_THRESHOLD_PERCENT` (default 80)
6. `SLOTS_SAFE_QUEUED_WINDOW_MINUTES`
7. `SLOTS_JOB_BUCKET_MS`
8. `SLOTS_LOCK_TIMEOUT_MS`
9. `SLOTS_FAIRNESS_MAX_DELAY_HOURS`
10. `SLOTS_BACKPRESSURE_QUEUE_DEPTH`
11. `SLOTS_BACKPRESSURE_QUEUE_LAG_MS`
12. `SLOTS_BACKPRESSURE_RECOVERY_CYCLES`
13. `SLOTS_CURSOR_STALE_MS`
14. `SLOTS_SCHEDULER_SHARDS`
15. `SLOTS_REGEN_MAX_RUNTIME_MS`

## 8.2 Правила реакции

Если `queue_depth > X` или `queue_lag > Y`:

1. Увеличить `SLOTS_SCHEDULER_INTERVAL_MS` (например, x2).
2. Уменьшить `SLOTS_SCHEDULER_BATCH_SIZE` (например, /2).
3. Временно включить режим `only_users_below_horizon=true`.

Где:

1. `X = SLOTS_BACKPRESSURE_QUEUE_DEPTH`
2. `Y = SLOTS_BACKPRESSURE_QUEUE_LAG_MS`
3. возврат к baseline только после `SLOTS_BACKPRESSURE_RECOVERY_CYCLES` подряд «здоровых» циклов.

Если метрики восстановились `N` циклов подряд:

1. Возвращать параметры по шагам к baseline.

---

## 9. Наблюдаемость

## 9.1 Метрики

1. Active users с `enabled` prefs.
2. Jobs enqueued/skipped/failed по `notification-slots-generation`.
3. p50/p95 генерации слотов на пользователя.
4. Delete/insert rows/min в `notification_slots`.
5. Queue depth/lag.
6. % пользователей ниже `min_horizon_hours`.

## 9.2 Structured logs (обязательные поля)

На каждую регенерацию:

1. `user_id`
2. `job_id`
3. `trace_id`
4. `reason` (`threshold_hit|cron|manual|login|prefs_changed|below_horizon|prefs_missing_or_disabled`)
5. `horizon_before`, `horizon_after`
6. `deleted_count`, `inserted_count`
7. `lock_acquire_ms`
8. `took_ms`

## 9.3 Алерты

1. Queue lag > Y минут.
2. Worker error-rate > Z%.
3. Пользователей ниже горизонта > K% более N минут.

---

## 10. Rollout-план

1. **Phase 0:** индексы, метрики, feature flags.
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

## 13. Открытые вопросы

1. Финальная форма уникального ключа слота (после анализа исторических данных).
2. Целевой `queue_lag` для бизнеса.
3. Вынос slots worker в отдельный процесс обязателен или опционален.
4. Точный `queued-safe-window` (5/10/15 минут).

---

## Результат этого ТЗ

После реализации по этому ТЗ система поддерживает целевой горизонт слотов при росте нагрузки, с предсказуемым профилем БД, прозрачной диагностикой и детерминированным поведением при деградации.
