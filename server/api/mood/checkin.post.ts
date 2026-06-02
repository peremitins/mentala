import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  createMoodCheckin,
  getUserTimezone,
} from '@/server/application/programs/retention-program.service';
import {
  MoodCheckinRequestDto,
  MoodCheckinResponseDto,
} from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const parsed = MoodCheckinRequestDto.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation error',
      data: { issues: parsed.error.issues },
    });
  }

  const userId = Number(sessionUser.id);
  const timezone = await getUserTimezone(userId);
  const response = await createMoodCheckin({
    userId,
    mood: parsed.data.mood,
    source: parsed.data.source,
    note: parsed.data.note ?? null,
    timezone,
  });

  return MoodCheckinResponseDto.parse(response);
});
