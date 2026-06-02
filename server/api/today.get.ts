import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getCurrentProgramSlugForUser,
  getLatestMoodForDate,
  getLocalDateKey,
  getOrCreateProgramOverview,
  getOrCreateThoughtOfTheDay,
  getProgramDailyLimitState,
  getTodayEnergy,
  getUserTimezone,
  getWeeklyEnergy,
  RETENTION_WEEKLY_GOAL,
} from '@/server/application/programs/retention-program.service';
import { TodayResponseDto } from '@/shared/dto/retention';
import { getStreakSummary } from '@/server/application/streak/streak.service';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  // timezone и currentSlug независимы — запрашиваем параллельно.
  const [timezone, currentSlug] = await Promise.all([
    getUserTimezone(userId),
    getCurrentProgramSlugForUser(userId),
  ]);
  const now = new Date();
  const entryDate = getLocalDateKey(now, timezone);
  // Определяем активную (или последнюю завершённую) программу пользователя —
  // НЕ hardcoded `calm_anxiety_30`. Это нужно чтобы HomeRoadmapCard на главной
  // показывал актуальный Сад: после старта Peony — Peony, а не старая Orchid.
  const program = await getOrCreateProgramOverview(userId, currentSlug);
  const [mood, streak, energyToday, energyWeekly, thought, dailyLimitState] =
    await Promise.all([
      getLatestMoodForDate(userId, entryDate),
      getStreakSummary(userId, entryDate),
      getTodayEnergy(userId, entryDate),
      getWeeklyEnergy(userId, entryDate),
      getOrCreateThoughtOfTheDay({
        userId,
        entryDate,
        programSlug: program.slug,
        step: program.currentStep,
      }),
      getProgramDailyLimitState(userId, timezone, now),
    ]);

  const programDailyLimit = {
    dailyStepLimit: dailyLimitState.dailyStepLimit,
    stepsDoneToday: dailyLimitState.stepsDoneToday,
    nextResetAt: dailyLimitState.nextResetAt?.toISOString() ?? null,
  };

  return TodayResponseDto.parse({
    timezone,
    entryDate,
    mood,
    streak,
    energy: {
      today: energyToday,
      weekly: energyWeekly,
      weeklyGoal: RETENTION_WEEKLY_GOAL,
    },
    program,
    thought,
    programDailyLimit,
  });
});
