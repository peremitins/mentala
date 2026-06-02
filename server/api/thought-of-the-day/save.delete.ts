import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getLocalDateKey,
  getUserTimezone,
  unsaveThoughtOfTheDay,
} from '@/server/application/programs/retention-program.service';
import {
  ThoughtOfTheDaySaveRequestDto,
  ThoughtOfTheDaySaveResponseDto,
} from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const parsed = ThoughtOfTheDaySaveRequestDto.safeParse(
    (await readBody(event)) ?? {}
  );
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation error',
      data: { issues: parsed.error.issues },
    });
  }

  try {
    const userId = Number(sessionUser.id);
    const timezone = await getUserTimezone(userId);
    const entryDate = getLocalDateKey(new Date(), timezone);

    return ThoughtOfTheDaySaveResponseDto.parse(
      await unsaveThoughtOfTheDay({
        userId,
        entryDate,
        thoughtId: parsed.data.id,
      })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Thought of the day not found';
    throw createError({ statusCode: 404, statusMessage: message });
  }
});
