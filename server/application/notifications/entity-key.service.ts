/**
 * Сервис для определения типа сущности (кастом или шаблон)
 * и нормализации entityKey
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { habits, therapyTopicsCustom } from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';

export interface ResolvedEntityKey {
  normalized: string | null;
  isCustom: boolean;
}

/**
 * Определяет, является ли entityKey кастомной сущностью, и возвращает нормализованный ключ
 * @param userId - ID пользователя
 * @param kind - тип уведомлений ('habits' | 'therapy')
 * @param entityKey - ключ сущности (ID для кастомных, ключ шаблона для готовых)
 * @returns объект с нормализованным ключом и флагом isCustom
 */
export async function resolveEntityKeyForSlots(
  userId: number,
  kind: NotificationKind,
  entityKey?: string
): Promise<ResolvedEntityKey> {
  if (!entityKey) {
    return { normalized: null, isCustom: false };
  }

  if (kind === 'habits') {
    const [habit] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
      .limit(1);

    if (habit) {
      return { normalized: habit.id, isCustom: true };
    }
    return { normalized: entityKey, isCustom: false };
  } else if (kind === 'therapy') {
    const [topic] = await db
      .select({ id: therapyTopicsCustom.id })
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, entityKey),
          eq(therapyTopicsCustom.userId, userId)
        )
      )
      .limit(1);

    if (topic) {
      return { normalized: topic.id, isCustom: true };
    }
    return { normalized: entityKey, isCustom: false };
  }

  // Для других типов используем entityKey как есть
  return { normalized: entityKey, isCustom: false };
}
