import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  dailyThoughts,
  userMilestones,
  userPlants,
  userProgramStepAttempts,
  userStreakEvents,
} from '@/server/infrastructure/db/schema';
import type { MilestoneEventType } from '@/shared/dto/milestones';

export interface MilestoneAward {
  badgeId: string;
  earnedAt: Date;
}

// Минимальный разрыв в днях, после которого считается, что пользователь "вернулся после паузы".
const PAUSE_THRESHOLD_DAYS = 7;

export async function checkAndAwardMilestones(
  userId: number,
  event: MilestoneEventType,
  gardenSlug?: string
): Promise<MilestoneAward[]> {
  const alreadyEarned = await getEarnedBadgeIds(userId);
  const awarded: MilestoneAward[] = [];

  async function tryAward(badgeId: string): Promise<void> {
    if (alreadyEarned.has(badgeId)) return;
    try {
      const [row] = await db
        .insert(userMilestones)
        .values({ userId, badgeId })
        .onConflictDoNothing()
        .returning({ earnedAt: userMilestones.earnedAt });
      if (row) {
        awarded.push({ badgeId, earnedAt: row.earnedAt });
        alreadyEarned.add(badgeId);
      }
    } catch {
      // Игнорируем ошибки — не ломаем основной флоу
    }
  }

  if (event === 'step_completed') {
    if (!alreadyEarned.has('first_step')) {
      const [res] = await db
        .select({ total: count() })
        .from(userProgramStepAttempts)
        .where(
          and(
            eq(userProgramStepAttempts.userId, userId),
            eq(userProgramStepAttempts.status, 'completed')
          )
        );
      if ((res?.total ?? 0) <= 1) {
        await tryAward('first_step');
      }
    }

    // Проверяем все завершённые сады — возможно, только что завершился новый
    const completedPlants = await db
      .select({ programSlug: userPlants.programSlug })
      .from(userPlants)
      .where(eq(userPlants.userId, userId));

    for (const plant of completedPlants) {
      await tryAward(`garden_${plant.programSlug}`);
    }
  }

  if (event === 'garden_completed' && gardenSlug) {
    await tryAward(`garden_${gardenSlug}`);
  }

  if (event === 'thought_saved') {
    if (!alreadyEarned.has('first_thought_saved')) {
      const [res] = await db
        .select({ total: count() })
        .from(dailyThoughts)
        .where(
          and(
            eq(dailyThoughts.userId, userId),
            isNotNull(dailyThoughts.savedAt)
          )
        );
      if ((res?.total ?? 0) <= 1) {
        await tryAward('first_thought_saved');
      }
    }
  }

  // full_check: проверяем все условия сразу — используется при первом открытии
  // страницы достижений для бэкфилла пользователей с уже существующими данными.
  if (event === 'full_check') {
    // Шаги программ
    if (!alreadyEarned.has('first_step')) {
      const [res] = await db
        .select({ total: count() })
        .from(userProgramStepAttempts)
        .where(
          and(
            eq(userProgramStepAttempts.userId, userId),
            eq(userProgramStepAttempts.status, 'completed')
          )
        );
      if ((res?.total ?? 0) >= 1) await tryAward('first_step');
    }

    // Сохранённые мысли
    if (!alreadyEarned.has('first_thought_saved')) {
      const [res] = await db
        .select({ total: count() })
        .from(dailyThoughts)
        .where(
          and(
            eq(dailyThoughts.userId, userId),
            isNotNull(dailyThoughts.savedAt)
          )
        );
      if ((res?.total ?? 0) >= 1) await tryAward('first_thought_saved');
    }

    // Завершённые сады
    const completedPlants = await db
      .select({ programSlug: userPlants.programSlug })
      .from(userPlants)
      .where(eq(userPlants.userId, userId));
    for (const plant of completedPlants) {
      await tryAward(`garden_${plant.programSlug}`);
    }

    // Activity-based: активные дни + возвращение после паузы
    const activeDays = await getDistinctActiveDaysCount(userId);
    if (activeDays >= 7) await tryAward('first_week');
    if (activeDays >= 30) await tryAward('thirty_active_days');
    if (activeDays >= 100) await tryAward('hundred_active_days');

    if (!alreadyEarned.has('returned_after_pause')) {
      if (await checkReturnedAfterPause(userId)) await tryAward('returned_after_pause');
    }
  }

  if (event === 'activity_check') {
    const activeDays = await getDistinctActiveDaysCount(userId);

    if (activeDays >= 7) await tryAward('first_week');
    if (activeDays >= 30) await tryAward('thirty_active_days');
    if (activeDays >= 100) await tryAward('hundred_active_days');

    if (!alreadyEarned.has('returned_after_pause')) {
      const hasReturned = await checkReturnedAfterPause(userId);
      if (hasReturned) await tryAward('returned_after_pause');
    }
  }

  return awarded;
}

export async function getUserMilestones(userId: number) {
  return db
    .select({
      badgeId: userMilestones.badgeId,
      earnedAt: userMilestones.earnedAt,
    })
    .from(userMilestones)
    .where(eq(userMilestones.userId, userId));
}

async function getEarnedBadgeIds(userId: number): Promise<Set<string>> {
  const rows = await db
    .select({ badgeId: userMilestones.badgeId })
    .from(userMilestones)
    .where(eq(userMilestones.userId, userId));
  return new Set(rows.map((r) => r.badgeId));
}

async function getDistinctActiveDaysCount(userId: number): Promise<number> {
  const [res] = await db
    .select({
      total: sql<number>`count(distinct ${userStreakEvents.eventDate})`,
    })
    .from(userStreakEvents)
    .where(eq(userStreakEvents.userId, userId));
  return Number(res?.total ?? 0);
}

async function checkReturnedAfterPause(userId: number): Promise<boolean> {
  const events = await db
    .select({ eventDate: userStreakEvents.eventDate })
    .from(userStreakEvents)
    .where(eq(userStreakEvents.userId, userId))
    .orderBy(userStreakEvents.eventDate);

  for (let i = 1; i < events.length; i++) {
    const prev = new Date(events[i - 1]!.eventDate);
    const curr = new Date(events[i]!.eventDate);
    const gapDays = Math.round(
      (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (gapDays >= PAUSE_THRESHOLD_DAYS) return true;
  }
  return false;
}
