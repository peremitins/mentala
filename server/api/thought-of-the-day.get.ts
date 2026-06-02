import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getCurrentProgramSlugForUser,
  getLocalDateKey,
  getOrCreateProgramOverview,
  getOrCreateThoughtOfTheDay,
  getUserTimezone,
} from '@/server/application/programs/retention-program.service';
import { ThoughtOfTheDayDto } from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const timezone = await getUserTimezone(userId);
  const entryDate = getLocalDateKey(new Date(), timezone);
  // Мысль дня должна жить в текущем саду, а не всегда в первом Orchid.
  const currentSlug = await getCurrentProgramSlugForUser(userId);
  const program = await getOrCreateProgramOverview(userId, currentSlug);

  return ThoughtOfTheDayDto.parse(
    await getOrCreateThoughtOfTheDay({
      userId,
      entryDate,
      programSlug: program.slug,
      step: program.currentStep,
    })
  );
});
