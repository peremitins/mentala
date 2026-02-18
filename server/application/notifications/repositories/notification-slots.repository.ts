/**
 * Репозиторий для работы со слотами уведомлений (notification_slots)
 */

import {
  and,
  asc,
  count,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import type {
  NotificationKind,
  NotificationPayload,
} from '@/shared/dto/notifications';

type DbExecutor = typeof db;

/**
 * Удаляет все planned слоты для источника, которые запланированы после указанного времени
 * @param userId - ID пользователя
 * @param kind - тип уведомлений
 * @param entityKey - ключ сущности (или null для общих слотов)
 * @param now - текущее время (удаляются только будущие слоты)
 * @returns количество удалённых слотов
 */
export async function deletePlannedFutureSlotsForSource(
  userId: number,
  kind: NotificationKind,
  entityKey: string | null,
  now: Date,
  executor: DbExecutor = db
): Promise<number> {
  const deleteConditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    eq(notificationSlots.status, 'planned'), // queued никогда не удаляем при регене
    gt(notificationSlots.scheduledAt, now), // ТОЛЬКО будущие слоты
  ];

  if (entityKey) {
    deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
  } else {
    deleteConditions.push(isNull(notificationSlots.entityKey));
  }

  const result = await executor
    .delete(notificationSlots)
    .where(and(...deleteConditions));

  return result.rowCount || 0;
}

/**
 * Подсчитывает количество planned слотов начиная с указанной даты
 * @param userId - ID пользователя
 * @param from - дата начала подсчёта
 * @returns количество слотов
 */
export async function countPlannedSlotsFromDate(
  userId: number,
  from: Date,
  executor: DbExecutor = db
): Promise<number> {
  const [result] = await executor
    .select({ count: count() })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gte(notificationSlots.scheduledAt, from)
      )
    );

  return result?.count || 0;
}

/**
 * Подсчитывает количество planned и queued слотов начиная с указанной даты
 * Используется для проверки наличия активного расписания после логина
 * @param userId - ID пользователя
 * @param from - дата начала подсчёта
 * @returns количество слотов
 */
export async function countActiveSlotsFromDate(
  userId: number,
  from: Date,
  executor: DbExecutor = db
): Promise<number> {
  const [result] = await executor
    .select({ count: count() })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        sql`${notificationSlots.status} IN ('planned', 'queued')`,
        gte(notificationSlots.scheduledAt, from)
      )
    );

  return result?.count || 0;
}

/**
 * Подсчитывает количество planned слотов для ночного режима на завтра
 * @param userId - ID пользователя
 * @param from - дата начала подсчёта (обычно завтра 00:00)
 * @returns количество слотов
 */
export async function countPlannedSlotsForTomorrowNightMode(
  userId: number,
  from: Date,
  executor: DbExecutor = db
): Promise<number> {
  const [result] = await executor
    .select({ count: count() })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gte(notificationSlots.scheduledAt, from)
      )
    );

  return result?.count || 0;
}

/**
 * Находит все planned-слоты пользователя после указанного времени
 * @param userId - ID пользователя
 * @param now - текущее время
 * @returns массив слотов, отсортированных по времени
 */
export async function findPlannedSlotsForUserAfterNow(
  userId: number,
  now: Date,
  executor: DbExecutor = db
): Promise<(typeof notificationSlots.$inferSelect)[]> {
  return await executor
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gt(notificationSlots.scheduledAt, now)
      )
    )
    .orderBy(asc(notificationSlots.scheduledAt));
}

/**
 * Обновляет время слота
 * @param slotId - ID слота
 * @param newTime - новое время (UTC)
 * @param timezone - часовой пояс пользователя (например, 'Europe/Moscow')
 * @param payloadData - опциональные данные для обновления payload
 */
export async function updateSlotTime(
  slotId: string,
  newTime: Date,
  timezone: string,
  payloadData?: any,
  executor: DbExecutor = db
): Promise<void> {
  const updateData: {
    scheduledAt: Date;
    scheduledAtLocal: any; // SQL выражение
    payload?: any;
  } = {
    scheduledAt: newTime,
    scheduledAtLocal: sql`timezone(${timezone}, ${newTime})`,
  };

  if (payloadData) {
    updateData.payload = payloadData;
  }

  await executor
    .update(notificationSlots)
    .set(updateData)
    .where(eq(notificationSlots.id, slotId));
}

/**
 * Удаляет все planned и queued слоты пользователя в пределах горизонта планирования (сегодня и завтра)
 * @param userId - ID пользователя
 * @param startOfTodayLocal - начало текущего дня в локальном времени (UTC)
 * @param endOfTomorrowLocal - конец завтрашнего дня в локальном времени (UTC)
 * @returns количество удалённых слотов
 */
export async function deleteAllPlannedSlotsForUser(
  userId: number,
  startOfTodayLocal: Date,
  endOfTomorrowLocal: Date,
  executor: DbExecutor = db
): Promise<number> {
  const result = await executor
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gte(notificationSlots.scheduledAt, startOfTodayLocal),
        lte(notificationSlots.scheduledAt, endOfTomorrowLocal)
      )
    );

  return result.rowCount || 0;
}

/**
 * Удаляет planned-слоты в диапазоне с ограничением количества строк.
 * Нужен как safety guard для длительности транзакции.
 */
export async function deletePlannedSlotsInRangeWithLimit(
  userId: number,
  rangeStartUtc: Date,
  rangeEndUtc: Date,
  maxRows: number,
  executor: DbExecutor = db
): Promise<number> {
  const rows = await executor
    .select({ id: notificationSlots.id })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned'),
        gte(notificationSlots.scheduledAt, rangeStartUtc),
        lte(notificationSlots.scheduledAt, rangeEndUtc)
      )
    )
    .orderBy(asc(notificationSlots.scheduledAt))
    .limit(Math.max(1, maxRows));

  if (rows.length === 0) {
    return 0;
  }

  const result = await executor.delete(notificationSlots).where(
    and(
      eq(notificationSlots.userId, userId),
      eq(notificationSlots.status, 'planned'),
      inArray(
        notificationSlots.id,
        rows.map((row) => row.id)
      )
    )
  );

  return result.rowCount || 0;
}

/**
 * Удаляет ВСЕ planned и queued слоты пользователя без ограничения по дате
 * Используется для полного сброса расписания перед пересозданием
 * @param userId - ID пользователя
 * @returns количество удалённых слотов
 */
export async function deleteAllPlannedSlotsForUserCompletely(
  userId: number,
  executor: DbExecutor = db
): Promise<number> {
  const result = await executor
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        eq(notificationSlots.status, 'planned')
      )
    );

  return result.rowCount || 0;
}

/**
 * Подсчитывает количество отправленных слотов для источника за текущий день
 * @param userId - ID пользователя
 * @param kind - тип уведомлений
 * @param entityKey - ключ сущности (или null для общих слотов)
 * @param startOfTodayLocal - начало текущего дня в локальном времени (UTC)
 * @param endOfTodayLocal - конец текущего дня в локальном времени (UTC)
 * @returns количество отправленных слотов
 */
export async function countSentSlotsForToday(
  userId: number,
  kind: NotificationKind,
  entityKey: string | null,
  startOfTodayLocal: Date,
  endOfTodayLocal: Date,
  executor: DbExecutor = db
): Promise<number> {
  const conditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    sql`${notificationSlots.status} IN ('sent', 'skipped')`,
    gte(notificationSlots.scheduledAt, startOfTodayLocal),
    lte(notificationSlots.scheduledAt, endOfTodayLocal),
  ];

  if (entityKey) {
    conditions.push(eq(notificationSlots.entityKey, entityKey));
  } else {
    conditions.push(isNull(notificationSlots.entityKey));
  }

  const [result] = await executor
    .select({ count: count() })
    .from(notificationSlots)
    .where(and(...conditions));

  return result?.count || 0;
}

/**
 * Создаёт новый слот
 * @param slot - данные слота
 * @param timezone - часовой пояс пользователя (например, 'Europe/Moscow')
 */
export async function insertSlot(
  slot: {
    id: string;
    userId: number;
    kind: NotificationKind;
    entityKey: string | null;
    entityDisplayName: string | null;
    scheduledAt: Date; // UTC время
    payload: NotificationPayload;
    templateId: string;
    status: 'planned';
  },
  timezone: string,
  executor: DbExecutor = db
): Promise<boolean> {
  // Используем SQL функцию для преобразования UTC времени в локальное время пользователя
  // timezone(timezone_name, timestamp) преобразует UTC timestamp в локальное время указанного часового пояса
  // Результат будет timestamp without time zone с компонентами локального времени
  const inserted = await executor
    .insert(notificationSlots)
    .values({
      id: slot.id,
      userId: slot.userId,
      kind: slot.kind,
      entityKey: slot.entityKey,
      entityDisplayName: slot.entityDisplayName,
      scheduledAt: slot.scheduledAt,
      scheduledAtLocal: sql`timezone(${timezone}, ${slot.scheduledAt})`,
      payload: slot.payload,
      templateId: slot.templateId,
      status: slot.status,
    })
    .onConflictDoNothing({
      target: [
        notificationSlots.userId,
        notificationSlots.kind,
        notificationSlots.entityKey,
        notificationSlots.scheduledAt,
      ],
      // Важно для partial unique index uk_notification_slots_active
      where: sql`${notificationSlots.status} IN ('planned', 'queued')`,
    })
    .returning({ id: notificationSlots.id });

  return inserted.length > 0;
}

/**
 * Считает активные слоты в диапазоне с разбиением planned/queued.
 */
export async function countActiveSlotsInRange(
  userId: number,
  rangeStart: Date,
  rangeEnd: Date,
  executor: DbExecutor = db
): Promise<{
  plannedCount: number;
  queuedCount: number;
  totalCount: number;
}> {
  const [result] = await executor
    .select({
      plannedCount: sql<number>`count(*) filter (where ${notificationSlots.status} = 'planned')`,
      queuedCount: sql<number>`count(*) filter (where ${notificationSlots.status} = 'queued')`,
    })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        gte(notificationSlots.scheduledAt, rangeStart),
        lte(notificationSlots.scheduledAt, rangeEnd),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    );

  const plannedCount = toNumber(result?.plannedCount);
  const queuedCount = toNumber(result?.queuedCount);

  return {
    plannedCount,
    queuedCount,
    totalCount: plannedCount + queuedCount,
  };
}

/**
 * Возвращает хвост горизонта по active слотам (planned + queued).
 */
export async function getActiveSlotsHorizonTail(
  userId: number,
  rangeStart: Date,
  rangeEnd: Date,
  executor: DbExecutor = db
): Promise<{
  lastScheduledAt: Date | null;
  lastCreatedAt: Date | null;
}> {
  const [result] = await executor
    .select({
      lastScheduledAt: sql<Date | null>`max(${notificationSlots.scheduledAt})`,
      lastCreatedAt: sql<Date | null>`max(${notificationSlots.createdAt})`,
    })
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        gte(notificationSlots.scheduledAt, rangeStart),
        lte(notificationSlots.scheduledAt, rangeEnd),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    );

  return {
    // Агрегаты max(...) могут приходить как строка в зависимости от драйвера.
    // Нормализуем к Date, чтобы вызывающий код безопасно использовал getTime().
    lastScheduledAt: toDateOrNull(result?.lastScheduledAt),
    lastCreatedAt: toDateOrNull(result?.lastCreatedAt),
  };
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  return null;
}
