/**
 * Репозиторий для работы со слотами уведомлений (notification_slots)
 */

import { and, asc, count, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots } from '@/server/infrastructure/db/schema';
import type {
  NotificationKind,
  NotificationPayload,
} from '@/shared/dto/notifications';

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
  now: Date
): Promise<number> {
  const deleteConditions = [
    eq(notificationSlots.userId, userId),
    eq(notificationSlots.kind, kind),
    sql`${notificationSlots.status} IN ('planned', 'queued')`, // Удаляем planned и queued
    gt(notificationSlots.scheduledAt, now), // ТОЛЬКО будущие слоты
  ];

  if (entityKey) {
    deleteConditions.push(eq(notificationSlots.entityKey, entityKey));
  } else {
    deleteConditions.push(isNull(notificationSlots.entityKey));
  }

  const result = await db
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
  from: Date
): Promise<number> {
  const [result] = await db
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
 * Подсчитывает количество planned слотов для ночного режима на завтра
 * @param userId - ID пользователя
 * @param from - дата начала подсчёта (обычно завтра 00:00)
 * @returns количество слотов
 */
export async function countPlannedSlotsForTomorrowNightMode(
  userId: number,
  from: Date
): Promise<number> {
  const [result] = await db
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
 * Находит все planned и queued слоты пользователя после указанного времени
 * @param userId - ID пользователя
 * @param now - текущее время
 * @returns массив слотов, отсортированных по времени
 */
export async function findPlannedSlotsForUserAfterNow(
  userId: number,
  now: Date
): Promise<(typeof notificationSlots.$inferSelect)[]> {
  return await db
    .select()
    .from(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        sql`${notificationSlots.status} IN ('planned', 'queued')`, // Включаем planned и queued
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
  payloadData?: any
): Promise<void> {
  const updateData: {
    scheduledAt: Date;
    scheduledAtLocal: any; // SQL выражение
    payload?: any;
  } = {
    scheduledAt: newTime,
    scheduledAtLocal: sql`timezone(${sql.raw(`'${timezone}'`)}, ${newTime})`,
  };

  if (payloadData) {
    updateData.payload = payloadData;
  }

  await db
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
  endOfTomorrowLocal: Date
): Promise<number> {
  const result = await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        sql`${notificationSlots.status} IN ('planned', 'queued')`,
        gte(notificationSlots.scheduledAt, startOfTodayLocal),
        lte(notificationSlots.scheduledAt, endOfTomorrowLocal)
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
  userId: number
): Promise<number> {
  const result = await db
    .delete(notificationSlots)
    .where(
      and(
        eq(notificationSlots.userId, userId),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
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
  endOfTodayLocal: Date
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

  const [result] = await db
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
  timezone: string
): Promise<void> {
  // Используем SQL функцию для преобразования UTC времени в локальное время пользователя
  // timezone(timezone_name, timestamp) преобразует UTC timestamp в локальное время указанного часового пояса
  // Результат будет timestamp without time zone с компонентами локального времени
  await db.insert(notificationSlots).values({
    id: slot.id,
    userId: slot.userId,
    kind: slot.kind,
    entityKey: slot.entityKey,
    entityDisplayName: slot.entityDisplayName,
    scheduledAt: slot.scheduledAt,
    scheduledAtLocal: sql`timezone(${sql.raw(`'${timezone}'`)}, ${slot.scheduledAt})`,
    payload: slot.payload,
    templateId: slot.templateId,
    status: slot.status,
  });
}
