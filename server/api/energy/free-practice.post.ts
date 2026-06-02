import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { tryAwardFreePracticeEnergy } from '@/server/application/energy/free-practice-energy.service';
import {
  getLocalDateKey,
  getTodayEnergy,
  getUserTimezone,
  getWeeklyEnergy,
} from '@/server/application/programs/retention-program.service';
import {
  AwardFreePracticeEnergyRequestDto,
  AwardFreePracticeEnergyResponseDto,
} from '@/shared/dto/retention';
import { recordStreakActivityForDate } from '@/server/application/streak/streak.service';

/**
 * POST /api/energy/free-practice — начисление 1 капли за свободную практику.
 *
 * Принимает source/sourceId (см. FreePracticeSourceEnum в shared/dto).
 * Внутри — rate-limit 3 капли/день из свободных + идемпотентность по sourceId.
 * Frontend вызывает после успешного завершения breath / meditation / gratitude / thought-dump.
 *
 * Backward compat: старые клиенты этот endpoint не используют. Если новый клиент
 * получает 404 (endpoint не задеплоен) — UI просто не показывает «+1 капля».
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const userId = Number(sessionUser.id);

  const body = await readBody(event);
  const parsed = AwardFreePracticeEnergyRequestDto.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'E_VALIDATION',
      data: {
        error: { code: 'E_VALIDATION', details: parsed.error.flatten() },
      },
    });
  }

  const timezone = await getUserTimezone(userId);
  const entryDate = getLocalDateKey(new Date(), timezone);

  const award = await tryAwardFreePracticeEnergy({
    userId,
    source: parsed.data.source,
    sourceId: parsed.data.sourceId,
    entryDate,
  });

  if (award.rewardGranted) {
    try {
      await recordStreakActivityForDate({
        userId,
        entryDate,
        source: 'free_practice',
        sourceId: parsed.data.sourceId,
        metadata: { freePracticeSource: parsed.data.source },
      });
    } catch (error) {
      console.error('[free-practice] streak update failed:', error);
    }
  }

  const [energyToday, energyWeekly] = await Promise.all([
    getTodayEnergy(userId, entryDate),
    getWeeklyEnergy(userId, entryDate),
  ]);

  return AwardFreePracticeEnergyResponseDto.parse({
    rewardGranted: award.rewardGranted,
    awardedAmount: award.awardedAmount,
    freePracticeDropsToday: award.freePracticeDropsToday,
    freePracticeDailyLimit: award.freePracticeDailyLimit,
    energyToday,
    energyWeekly,
  });
});
