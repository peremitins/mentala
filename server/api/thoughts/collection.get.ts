import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getSavedThoughtsCollection } from '@/server/application/programs/retention-program.service';
import { ThoughtCollectionResponseDto } from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  return ThoughtCollectionResponseDto.parse(
    await getSavedThoughtsCollection({
      userId: Number(sessionUser.id),
    })
  );
});
