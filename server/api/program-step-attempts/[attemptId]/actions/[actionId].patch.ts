import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { updateProgramStepAction } from '@/server/application/programs/retention-program.service';
import {
  ProgramStepActionPatchDto,
  ProgramStepActionPatchResponseDto,
} from '@/shared/dto/retention';
import { assertFeatureAccess } from '@/server/application/subscriptions/feature-access-guard';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const attemptId = Number(event.context.params?.attemptId);
  const actionId = String(event.context.params?.actionId || '').trim();
  if (!Number.isInteger(attemptId) || attemptId < 1 || !actionId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid attempt action route',
    });
  }

  const parsed = ProgramStepActionPatchDto.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation error',
      data: { issues: parsed.error.issues },
    });
  }

  await assertFeatureAccess({
    userId: Number(sessionUser.id),
    userRole: (sessionUser as any).role ?? (sessionUser as any).roleId ?? null,
    featureKey: 'programs.roadmap.full',
  });

  try {
    return ProgramStepActionPatchResponseDto.parse(
      await updateProgramStepAction({
        userId: Number(sessionUser.id),
        attemptId,
        actionId,
        status: parsed.data.status,
        output: parsed.data.output,
      })
    );
  } catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage:
        error instanceof Error
          ? error.message
          : 'Program step attempt not found',
    });
  }
});
