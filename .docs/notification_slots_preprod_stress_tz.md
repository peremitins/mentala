# ВАЖНО! ТЗ: Предрелизные стресс-тесты slots scheduler/worker

## 1. Цель

Перед выходом в production подтвердить, что новая архитектура генерации слотов уведомлений устойчива под нагрузкой и отказами:

- sharded scheduler (`notification-slots-generation` enqueue);
- slots worker (regen/generation);
- delivery worker (`planned -> queued -> sent/failed`);
- backpressure и lock-стратегия;
- инварианты горизонта и идемпотентность данных.

## 2. Обязательный стресс-сценарий (must-have)

**Прогнать нагрузочный сценарий 1k/5k/10k пользователей именно на новом scheduler+worker split.**

Проверять по каждой ступени:

- время прогрева системы до стабильного горизонта;
- `queue_lag_p95`, `queue_depth`, throughput enqueue/worker;
- p95 времени регенерации на пользователя;
- p95 lock wait / lock timeout;
- write ops в `notification_slots` и p95 lock wait в Postgres;
- долю пользователей ниже `min_horizon_hours`.

## 3. Обязательные нагрузочные тесты

### 3.1 Baseline load (steady state)

- Длительность: минимум 2 часа на профиль.
- Профили: `1k`, `5k`, `10k` активных пользователей.
- Распределение:
  - mix `timesPerDay` (1..5),
  - mix `customSlotTimes`/гибких слотов,
  - mix timezone.
- Проверки:
  - нет неограниченного роста `queue_lag`,
  - нет роста error-rate воркеров,
  - `planned+queued` держат целевой горизонт.

### 3.2 Burst load (thundering herd simulation)

- Одновременный всплеск событий (массовое изменение prefs/login/timezone).
- Цель: проверить, что дедуп `jobId=slotsgen:{userId}:{cycle_id}` и шардирование предотвращают лавину.
- Проверки:
  - рост нагрузки ограничен и детерминирован,
  - нет массовых дублей в `notification_slots`,
  - система возвращается к baseline без ручного вмешательства.

### 3.3 Scheduler fairness under pressure

- Проверка fairness при normal/soft/hard backpressure.
- Метрика: любой активный пользователь должен быть проверен в пределах `SLOTS_FAIRNESS_MAX_DELAY_HOURS`.
- Отдельно проверить stale-cursor recovery (`SLOTS_CURSOR_STALE_MS`).

### 3.4 Worker concurrency scaling

- Прогон с `SLOTS_WORKER_CONCURRENCY=1/2/3/4`.
- Цель: найти безопасную рабочую точку без деградации БД.
- Проверки:
  - сравнение p95 latency regeneration,
  - lock timeout rate,
  - DB wait/CPU/IO.

### 3.5 Delivery contention

- Параллельный прогон delivery + regeneration + enqueue.
- Цель: подтвердить корректность state machine:
  - `planned -> queued -> sent|failed`,
  - нет `queued -> planned`,
  - `queued` не удаляются регенерацией.

## 4. Chaos/Failure тесты (обязательные)

### 4.1 Redis деградация/отказ

- Временная недоступность Redis или резкий рост latency.
- Проверки:
  - enqueue ошибки не ломают cursor-state навсегда,
  - после восстановления нет лавины дублей.

### 4.2 Postgres timeouts/lock contention

- Инъекция lock wait и statement timeout.
- Проверки:
  - regen корректно откатывается,
  - reschedule работает с backoff,
  - нет повреждения данных.

### 4.3 Kill worker mid-transaction

- Принудительное завершение процесса slots worker в критической секции.
- Проверки:
  - нет частично применённых изменений,
  - повторный запуск не создаёт дублей/потерь.

### 4.4 Dual scheduler start

- Запуск двух scheduler процессов одновременно.
- Проверки:
  - advisory lock scheduler предотвращает удвоение enqueue,
  - cursor/cycle остаются консистентными.

## 5. Тесты целостности данных

### 5.1 Идемпотентность слотов

- Проверить уникальность активных слотов:
  - `UNIQUE(user_id, kind, entity_key, scheduled_at) WHERE status IN ('planned','queued')`.
- Проверить, что конфликт вставки считается штатным исходом.

### 5.2 Точность fixed time слотов

- Для `customSlotTimes` (без дублей non-null) подтверждать:
  - слот в БД имеет точное `scheduled_at_local` (например 12:45),
  - отправка происходит в это же локальное время.
- Проверить, что API отклоняет дубли non-null времен.

### 5.3 Horizon invariants

- Для активных пользователей:
  - корректный расчет `actual_slots = planned + queued`,
  - корректный trigger регенерации по threshold и `min_horizon_hours`.

## 6. Наблюдаемость и отчёт

Для каждого прогона сохранить:

- конфигурацию env (`SLOTS_*`, concurrency, split topology);
- период прогона и профиль нагрузки;
- ключевые графики:
  - `queue_lag_p95`, `queue_depth`,
  - worker error-rate,
  - regen p95,
  - DB lock wait p95,
  - % пользователей ниже горизонта;
- список инцидентов/аномалий;
- итог: pass/fail и блокеры релиза.

## 7. Критерии Go/No-Go

Release blocked, если выполняется хотя бы одно:

- не пройден сценарий `1k/5k/10k` на scheduler+worker split;
- наблюдается устойчивый рост `queue_lag` без восстановления;
- фиксируются потери/дубли слотов;
- нарушается state machine переходов;
- p95 lock wait в БД устойчиво выше целевого порога;
- доля пользователей ниже горизонта превышает допустимый порог в течение длительного окна.

Release allowed, если:

- все обязательные сценарии из разделов 2–5 пройдены;
- есть подтверждённый отчёт с метриками и без блокеров;
- зафиксированы production baseline значения `SLOTS_*`.
