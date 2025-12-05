/**
 * Репозиторий для работы с настройками уведомлений (notification_preferences)
 */

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';

/**
 * Находит все активные настройки уведомлений для пользователя
 * @param userId - ID пользователя
 * @returns массив активных настроек
 */
export async function findEnabledPreferencesByUser(
  userId: number
): Promise<(typeof notificationPreferences.$inferSelect)[]> {
  return await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.enabled, true)
      )
    );
}

/**
 * Находит настройку для конкретного источника
 * @param userId - ID пользователя
 * @param kind - тип уведомлений
 * @param normalizedEntityKey - нормализованный ключ сущности (или null для общих настроек)
 * @returns настройка или null если не найдена
 */
export async function findPreferenceForSource(
  userId: number,
  kind: NotificationKind,
  normalizedEntityKey: string | null
): Promise<typeof notificationPreferences.$inferSelect | null> {
  const conditions = [
    eq(notificationPreferences.userId, userId),
    eq(notificationPreferences.kind, kind),
  ];

  if (normalizedEntityKey) {
    conditions.push(eq(notificationPreferences.entityKey, normalizedEntityKey));
  } else {
    // Общие настройки (без entityKey)
    conditions.push(isNull(notificationPreferences.entityKey));
  }

  const [pref] = await db
    .select()
    .from(notificationPreferences)
    .where(and(...conditions))
    .limit(1);

  return pref || null;
}
