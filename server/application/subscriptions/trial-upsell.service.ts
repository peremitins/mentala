import { and, count, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  userProgramStepProgress,
  userPrograms,
  users,
} from '@/server/infrastructure/db/schema';
import { isTrialActiveAt } from './trial-billing.service';

/**
 * Контрольные точки промо-paywall привязки карты в триале.
 * Считаются по суммарному числу пройденных шагов across всех программ.
 */
export const TRIAL_UPSELL_MILESTONES = [1, 5, 10] as const;

export interface TrialUpsellPrompt {
  show: boolean;
  milestone: number;
}

/**
 * Выбирает контрольную точку для показа: наибольшую достигнутую (<= completedCount),
 * которую ещё не показывали (> lastMilestone). Наибольшую, а не первую, чтобы
 * не показывать устаревшие точки, если пользователь проскочил несколько шагов
 * между сессиями. Возвращает null, если показывать нечего.
 */
export function pickDueMilestone(
  completedCount: number,
  lastMilestone: number
): number | null {
  return (
    TRIAL_UPSELL_MILESTONES.filter(
      (milestone) => milestone <= completedCount && milestone > lastMilestone
    ).at(-1) ?? null
  );
}

/**
 * Считает суммарное число завершённых шагов пользователя по всем программам.
 */
async function countCompletedSteps(userId: number): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(userProgramStepProgress)
    .innerJoin(
      userPrograms,
      eq(userProgramStepProgress.userProgramId, userPrograms.id)
    )
    .where(
      and(
        eq(userPrograms.userId, userId),
        eq(userProgramStepProgress.status, 'completed')
      )
    );

  return Number(rows[0]?.value ?? 0);
}

/**
 * Решает, нужно ли показать промо-paywall после завершения шага.
 *
 * Показываем только если:
 * - триал активен (есть смысл предлагать «привязать карту, дни сохранятся»);
 * - карта ещё не привязана;
 * - нет запланированного списания (юзер ещё не оформил);
 * - достигнута новая контрольная точка (1 / 5 / 10), которую ещё не показывали.
 *
 * Отметку о показе НЕ ставим здесь: её ставит markTrialUpsellMilestoneShown
 * в момент фактического показа модалки на клиенте.
 */
export async function resolveTrialUpsellAfterStep(params: {
  userId: number;
  now?: Date;
}): Promise<TrialUpsellPrompt | null> {
  const now = params.now ?? new Date();

  const userRows = await db
    .select({
      trialEndedAt: users.trialEndedAt,
      paymentMethodBound: users.paymentMethodBound,
      billingCollectionStatus: users.billingCollectionStatus,
      trialUpsellLastMilestone: users.trialUpsellLastMilestone,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return null;
  }

  // Промо имеет смысл только пока триал активен и карта не привязана.
  if (!isTrialActiveAt(user.trialEndedAt, now)) {
    return null;
  }
  if (user.paymentMethodBound) {
    return null;
  }
  if (user.billingCollectionStatus !== 'none') {
    return null;
  }

  const completedCount = await countCompletedSteps(params.userId);
  const lastMilestone = Number(user.trialUpsellLastMilestone ?? 0);
  const dueMilestone = pickDueMilestone(completedCount, lastMilestone);

  if (!dueMilestone) {
    return null;
  }

  return { show: true, milestone: dueMilestone };
}

/**
 * Отмечает контрольную точку как показанную (last-write-wins по максимуму).
 * Идемпотентна: повторный вызов с тем же/меньшим milestone ничего не сломает.
 */
export async function markTrialUpsellMilestoneShown(params: {
  userId: number;
  milestone: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();

  const userRows = await db
    .select({
      trialUpsellLastMilestone: users.trialUpsellLastMilestone,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const current = Number(userRows[0]?.trialUpsellLastMilestone ?? 0);
  const next = Math.max(current, params.milestone);

  if (next === current) {
    return;
  }

  await db
    .update(users)
    .set({
      trialUpsellLastMilestone: next,
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));
}
