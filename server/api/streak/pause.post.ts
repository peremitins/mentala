import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getLocalDateKey,
  getUserTimezone,
} from '@/server/application/programs/retention-program.service';
import { pauseUserStreak } from '@/server/application/streak/streak.service';
import { StreakSummaryDto } from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const timezone = await getUserTimezone(userId);
  const entryDate = getLocalDateKey(new Date(), timezone);
  return StreakSummaryDto.parse(await pauseUserStreak(userId, entryDate));
});
