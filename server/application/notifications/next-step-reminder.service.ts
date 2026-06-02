import { nanoid } from 'nanoid';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationSlots, users } from '@/server/infrastructure/db/schema';
import { applyGender } from '@/server/application/programs/gendered-text';
import { nextLocalHourAt } from '@/server/application/programs/retention-timezone';
import type { NotificationPayload } from '@/shared/dto/notifications';

async function getUserGenderForPush(
  userId: number
): Promise<'male' | 'female'> {
  const [row] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.gender === 'female' ? 'female' : 'male';
}

export const SYSTEM_NEXT_STEP_TEMPLATE_ID = 'system_next_step_available';

// Утреннее напоминание о следующем шаге. Уходит в 10:00 по локальному
// времени пользователя после засчитанного reward за предыдущий шаг.
// Тон: без вины, без "ты пропустил", просто мягкое приглашение.
const NEXT_STEP_PUSH_TEXT = {
  title: 'Сад ждёт тебя',
  // {готов|готова} резолвится по полу пользователя через applyGender.
  body: 'Следующий шаг доступен. Загляни в сад, когда {будешь готов|будешь готова}.',
} as const;

/**
 * Планирует утренний push про следующий шаг программы.
 *
 * Вызывается из `completeProgramStep`, когда reward засчитан и программа
 * ещё не завершена. Уведомление уходит в 10:00 следующего дня по локальному
 * времени пользователя.
 *
 * Идемпотентно: entityKey `next_step:{slug}:{stepNum}` защищает от дублей.
 */
export async function scheduleNextStepReminder(params: {
  userId: number;
  programSlug: string;
  programTitle: string;
  nextStepNumber: number;
  timezone: string;
}): Promise<boolean> {
  const entityKey = `next_step:${params.programSlug}:${params.nextStepNumber}`;
  const scheduledAt = nextLocalHourAt(10, params.timezone, new Date());
  const slotId = nanoid();
  const gender = await getUserGenderForPush(params.userId);
  const payload: NotificationPayload = {
    title: NEXT_STEP_PUSH_TEXT.title,
    body: applyGender(NEXT_STEP_PUSH_TEXT.body, gender),
    data: {
      slotId,
      kind: 'system',
      templateId: SYSTEM_NEXT_STEP_TEMPLATE_ID,
      deepLink: `/programs/${params.programSlug}/map`,
      programSlug: params.programSlug,
      stepNumber: String(params.nextStepNumber),
    },
  };

  const inserted = await db
    .insert(notificationSlots)
    .values({
      id: slotId,
      userId: params.userId,
      kind: 'system',
      entityKey,
      entityDisplayName: params.programTitle,
      scheduledAt,
      scheduledAtLocal: sql`timezone(${params.timezone}, ${scheduledAt})`,
      payload,
      templateId: SYSTEM_NEXT_STEP_TEMPLATE_ID,
      status: 'planned',
    })
    .onConflictDoNothing({
      target: [
        notificationSlots.userId,
        notificationSlots.kind,
        notificationSlots.entityKey,
        notificationSlots.scheduledAt,
      ],
      where: sql`${notificationSlots.status} IN ('planned', 'queued')`,
    })
    .returning({ id: notificationSlots.id });

  return inserted.length > 0;
}

/**
 * Отменяет запланированный утренний push, если пользователь уже вернулся
 * и стартовал следующий шаг сам. Вызывается из `startProgramStep`.
 */
export async function cancelPendingNextStepReminder(params: {
  userId: number;
  programSlug: string;
  stepNumber: number;
}): Promise<void> {
  const entityKey = `next_step:${params.programSlug}:${params.stepNumber}`;
  await db
    .update(notificationSlots)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(notificationSlots.userId, params.userId),
        eq(notificationSlots.kind, 'system'),
        eq(notificationSlots.entityKey, entityKey),
        sql`${notificationSlots.status} IN ('planned', 'queued')`
      )
    );
}
