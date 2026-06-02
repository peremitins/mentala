import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getOrCreateProgramOverview } from '@/server/application/programs/retention-program.service';
import { ProgramOverviewDto } from '@/shared/dto/retention';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const slug = String(event.context.params?.slug || '').trim();
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Program slug missing',
    });
  }

  try {
    return ProgramOverviewDto.parse(
      await getOrCreateProgramOverview(Number(sessionUser.id), slug)
    );
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage:
        error instanceof Error ? error.message : 'Program not found',
    });
  }
});
