ТЗ: Надежная атомарная смена расписания через schedule_version

1. Цель
   Исключить промежуточное состояние "пустого расписания" и дубли слотов при регенерации.
   Новое расписание становится активным только после полной генерации.

2. Изменения в БД

2.1. Новое поле schedule_version в notification_slots
ALTER TABLE notification_slots
ADD COLUMN schedule_version TEXT NOT NULL DEFAULT 'legacy';

2.2. Новое поле active_schedule_version в users
ALTER TABLE users
ADD COLUMN active_schedule_version TEXT;

2.3. Индексы
CREATE INDEX idx_notification_slots_user_version_status
ON notification_slots (user_id, schedule_version, status);

CREATE INDEX idx_notification_slots_user_version_scheduled
ON notification_slots (user_id, schedule_version, scheduled_at);

2.4. Бэкфилл legacy
UPDATE users
SET active_schedule_version = 'legacy'
WHERE active_schedule_version IS NULL;

3. Новая бизнес-логика

3.1. Генерация слотов (global-orchestration)
Правило: сначала создаем новые слоты с новой версией, затем переключаем активную.

Алгоритм:

1. Получить активную версию до расчета sentToday:
   const activeVersion = await getActiveScheduleVersion(userId);
2. newVersion = `${Date.now()}-${nanoid()}`;
3. Сгенерировать слоты (today + tomorrow).
4. Вставить все слоты с schedule_version = newVersion (батчами).
5. Переключить users.active_schedule_version = newVersion.
6. Удалить planned/queued старой версии в горизонте (today + tomorrow).

Важно:

- Старая версия остается активной до шага 5.
- sentToday считается только по activeVersion.

  3.2. Доставка (delivery worker)
  Все due-слоты берем только для активной версии пользователя.

Псевдокод:
const dueSlots = await db
.select()
.from(notificationSlots)
.innerJoin(users, eq(users.id, notificationSlots.userId))
.where(and(
eq(notificationSlots.status, 'planned'),
lte(notificationSlots.scheduledAt, nowUTC),
eq(notificationSlots.scheduleVersion, users.activeScheduleVersion)
))
.orderBy(asc(notificationSlots.scheduledAt))
.limit(100);

3.3. Подсчет sent для текущего дня
Подсчет учитывает активную версию:
countSentSlotsForToday(userId, kind, entityKey, start, end, activeVersion)

3.4. preventSimultaneousNotifications
Работает только с активной версией.
Порядок: вызывать после переключения версии, иначе новая версия не будет учтена.

3.5. UI/эндпоинты
Все API, которые возвращают или мутируют слоты, обязаны фильтровать по active_schedule_version.
Список минимум:

- server/api/notifications/pending.get.ts
- server/api/notifications/snooze.post.ts
- server/api/notifications/interaction.post.ts
- любые internal/debug endpoints со слотами

  3.6. NULL active_schedule_version
  getActiveScheduleVersion возвращает 'legacy' как fallback.
  В миграции установить active_schedule_version = 'legacy' для всех NULL.

4. Транзакции и надежность

4.1. Атомарность переключения
Переключение версии и удаление старых planned/queued выполняются атомарно.
Рекомендуемая транзакция:
await db.transaction(async (tx) => {
await insertSlotsBatch(newSlots, newVersion, timezone, tx);
await tx.update(users)
.set({ activeScheduleVersion: newVersion })
.where(eq(users.id, userId));
await deleteOldVersionSlots(userId, oldVersion, startOfTodayUTC, endOfTomorrowUTC, tx);
});
// ВАЖНО: preventSimultaneousNotifications вызывается ПОСЛЕ транзакции,
// чтобы работать с новой активной версией (она уже переключена в БД)

4.2. Ошибки при частичной генерации
Если генерация/вставка падает:

- транзакция откатывается;
- активная версия остается прежней;
- новая версия не активируется.

5. Батчинг вставок
   Обязательно использовать batch insert.
   Пример: insertSlotsBatch(slots, newVersion, timezone, tx)
   Размер батча: 200 (стартовое значение), дальше тюнится по метрикам БД.

6. Удаление старых версий
   Удалять только planned/queued в горизонте (today + tomorrow).
   sent/skipped не удалять (история).
   Историю версий не храним, удаление выполняем сразу после переключения версии.

7. Формат версии
   По умолчанию: `${Date.now()}-${nanoid()}`.
   userId не обязателен, так как хранится в слотах.

8. Параллельные регенерации
   Сохраняем существующую защиту в scheduler.service.ts.
   Если активная регенерация есть:

- новый вызов ждет ее завершения;
- повторный запуск не требуется.

9. Вопросы и ответы

9.1. История версий
История не нужна, старые planned/queued удаляем сразу после переключения.

9.2. snoozedUntil
snoozedUntil считаем неактуальным при смене версии.
При переключении версии planned/queued старой версии удаляются, snoozedUntil теряется.
Это ожидаемое поведение на текущем этапе.

9.3. Откат версии
Откат не нужен.

9.4. Параллельные регенерации
Решение:

- использовать activeRegenerations в scheduler.service.ts;
- второй вызов ждет завершения первого и не запускает новый.

10. Изменения в коде (с кодом)

10.1. schema.ts
notificationSlots:
scheduleVersion: text('schedule_version').notNull().default('legacy'),

users:
activeScheduleVersion: text('active_schedule_version'),

10.2. orchestrateAllSlotsForUser
const activeVersion = await getActiveScheduleVersion(userId);
const newVersion = `${Date.now()}-${nanoid()}`;
... расчет slotsToday с sentToday по activeVersion ...
await db.transaction(async (tx) => {
await insertSlotsBatch(allSlots, newVersion, timezone, tx);
await tx.update(users).set({ activeScheduleVersion: newVersion }).where(eq(users.id, userId));
await deleteOldVersionSlots(userId, activeVersion, startOfTodayUTC, endOfTomorrowUTC, tx);
});
// ВАЖНО: preventSimultaneousNotifications вызывается ПОСЛЕ переключения версии
// чтобы работать с новой активной версией
await preventSimultaneousNotifications(userId, SCHEDULE_CONFIG.minGapMinutes);

10.3. delivery.service.ts (processDueSlots)
Фильтр по active_version в запросе due slots.

10.4. notification-slots.repository.ts
countSentSlotsForToday принимает scheduleVersion.
findPlannedSlotsForUserAfterNow фильтрует по scheduleVersion.
insertSlot/insertSlotsBatch требуют scheduleVersion.

Сигнатуры:
export async function insertSlotsBatch(
slots: Array<{ scheduleVersion: string } & Record<string, unknown>>,
timezone: string,
tx?: Transaction
): Promise<void>

export async function deleteOldVersionSlots(
userId: number,
oldVersion: string,
startOfTodayUTC: Date,
endOfTomorrowUTC: Date,
tx?: Transaction
): Promise<number>

10.5. getActiveScheduleVersion
Возвращает activeScheduleVersion или 'legacy'.

11. QA сценарии

1) Включить новую тему: не видеть "пустого" расписания.
2) Часто менять настройки: без пачек уведомлений, без дублей.
3) До активации новой версии delivery шлет старые слоты.
4) После активации новая версия полностью замещает старую.
5) При ошибке генерации старая версия остается активной.

12. Изменения в архитектуре
    В architecture.md добавить:

- schedule_version для атомарной смены расписания;
- delivery и подсчеты работают только по active_schedule_version.

13. Оптимизация на будущее (производительность и масштаб)
    Цель: выдерживать десятки тысяч пользователей без деградации при массовых изменениях настроек.

Примечание: блок 13 описывает оптимизации, которые можно реализовать позже при росте нагрузки.
Для MVP достаточно батчинга вставок (13.1) и правильных индексов (13.5).

13.1. Батчинг вставок (обязательно для MVP)
Перевести вставку слотов на batched insert (200/батч).
Эффект: уменьшение количества SQL-запросов в 10-20 раз.

Примечание: это критично для производительности, должно быть реализовано сразу.

13.2. Подсчет sent за день одним запросом
Заменить N запросов countSentSlotsForToday на один GROUP BY по всем источникам пользователя.

Сигнатура функции:
export async function countSentSlotsForAllPreferences(
userId: number,
preferences: Array<{ kind: NotificationKind; entityKey: string | null }>,
startOfTodayUTC: Date,
endOfTodayUTC: Date,
scheduleVersion: string
): Promise<Map<string, number>> // Ключ: `${kind}:${entityKey || 'null'}`, значение: количество

Эффект: уменьшение количества COUNT-запросов в N раз (где N = количество preferences).

13.3. Очереди и дебаунсинг регенерации (опционально для MVP)
Регенерацию отправлять в очередь (BullMQ) и дебаунсить:

- если пользователь сохраняет настройки несколько раз подряд, выполнять только последнюю задачу;
- ограничить частоту регенерации на пользователя (например, не чаще 1 раза в 10-20 секунд).

Примечание: для MVP достаточно существующей защиты от параллельных регенераций в scheduler.service.ts.
Очереди можно добавить позже при росте нагрузки.

13.4. Асинхронное удаление старых версий
Если удаление старых planned/queued начинает тормозить, выносить в фоновую задачу.

13.5. Индексы под новые фильтры (обязательно для MVP)
Добавить/проверить индексы:

- (user_id, schedule_version, status, scheduled_at) - для доставки
- (user_id, schedule_version, kind, entity_key, status, scheduled_at) - для подсчета sent слотов

Примечание: индексы из раздела 2.3 обязательны для базовой функциональности.
Дополнительные индексы из этого раздела можно добавить при необходимости.

13.6. Метрики
Логировать время генерации слотов, количество вставок и батчей по пользователю.
Добавить алерты на аномально долгие регенерации.
