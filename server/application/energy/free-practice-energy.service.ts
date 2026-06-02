import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { energyEvents } from '@/server/infrastructure/db/schema';
import { trackRetentionEvent } from '@/server/application/analytics/retention-events.service';

/**
 * Капли за свободные практики (retention/retention_long_term_strategy.md).
 *
 * Свободные практики (дыхание, медитация, дневник благодарности, выгрузка мыслей)
 * дают по 1 капле за выполнение. Лимит — не более 3 капель в день из свободных,
 * чтобы свободка не обесценивала структурированные шаги программы (5 капель за шаг).
 *
 * Этот сервис — единая точка начисления для всех «свободных» источников.
 */

export const FREE_PRACTICE_SOURCES = [
  'breath_practice_completed',
  'meditation_completed',
  'gratitude_entry_saved',
  'thought_dump_saved',
] as const;

export type FreePracticeSource = (typeof FREE_PRACTICE_SOURCES)[number];

export const FREE_PRACTICE_DAILY_LIMIT = 3;

export type AwardFreePracticeResult = {
  rewardGranted: boolean;
  awardedAmount: number;
  freePracticeDropsToday: number;
  freePracticeDailyLimit: number;
};

/**
 * Пытается начислить 1 каплю за свободную практику.
 *
 * Правила:
 *  - Один и тот же `sourceId` за день не начисляется дважды (идемпотентность по source/sourceId).
 *  - Если за сегодня уже было `FREE_PRACTICE_DAILY_LIMIT` капель из свободных
 *    источников, новые не начисляются (rewardGranted=false).
 *  - Возвращаем актуальный counter для UI-подсказки «Сегодня свободные капли исчерпаны».
 *
 * Идемпотентность по sourceId важна: пользователь может несколько раз тапнуть
 * «Завершить дыхание» / повторно сохранить ту же запись дневника — это не должно
 * мультиплицировать награду.
 */
export async function tryAwardFreePracticeEnergy(params: {
  userId: number;
  source: FreePracticeSource;
  sourceId: string;
  entryDate: string;
}): Promise<AwardFreePracticeResult> {
  return db.transaction(async (tx) => {
    // 1. Идемпотентность: если запись с тем же (userId, source, sourceId) уже есть,
    //    повторно не начисляем.
    const [existing] = await tx
      .select({ id: energyEvents.id })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, params.userId),
          eq(energyEvents.source, params.source),
          eq(energyEvents.sourceId, params.sourceId)
        )
      )
      .limit(1);

    const [{ count: dailyFreeCount }] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, params.userId),
          eq(energyEvents.eventDate, params.entryDate),
          inArray(
            energyEvents.source,
            FREE_PRACTICE_SOURCES as unknown as string[]
          )
        )
      );

    if (existing) {
      // Идемпотентная повторная попытка — не считается ни наградой, ни rate-limit'ом.
      return {
        rewardGranted: false,
        awardedAmount: 0,
        freePracticeDropsToday: Number(dailyFreeCount ?? 0),
        freePracticeDailyLimit: FREE_PRACTICE_DAILY_LIMIT,
      };
    }

    if (Number(dailyFreeCount ?? 0) >= FREE_PRACTICE_DAILY_LIMIT) {
      trackRetentionEvent('free_practice_drop_rate_limited', {
        userId: params.userId,
        source: params.source,
      });
      return {
        rewardGranted: false,
        awardedAmount: 0,
        freePracticeDropsToday: Number(dailyFreeCount ?? 0),
        freePracticeDailyLimit: FREE_PRACTICE_DAILY_LIMIT,
      };
    }

    await tx.insert(energyEvents).values({
      userId: params.userId,
      amount: 1,
      source: params.source,
      sourceId: params.sourceId,
      eventDate: params.entryDate,
      metadata: {},
    });

    trackRetentionEvent('free_practice_drop_awarded', {
      userId: params.userId,
      source: params.source,
    });

    return {
      rewardGranted: true,
      awardedAmount: 1,
      freePracticeDropsToday: Number(dailyFreeCount ?? 0) + 1,
      freePracticeDailyLimit: FREE_PRACTICE_DAILY_LIMIT,
    };
  });
}
