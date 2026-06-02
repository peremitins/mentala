import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  completeProgramStep,
  getUserTimezone,
} from '@/server/application/programs/retention-program.service';
import { ProgramStepCompleteResponseDto } from '@/shared/dto/retention';
import { assertFeatureAccess } from '@/server/application/subscriptions/feature-access-guard';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const attemptId = Number(event.context.params?.attemptId);
  if (!Number.isInteger(attemptId) || attemptId < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid program step attempt',
    });
  }

  const userId = Number(sessionUser.id);
  await assertFeatureAccess({
    userId,
    userRole: (sessionUser as any).role ?? (sessionUser as any).roleId ?? null,
    featureKey: 'programs.roadmap.full',
  });

  try {
    const timezone = await getUserTimezone(userId);
    return ProgramStepCompleteResponseDto.parse(
      await completeProgramStep({ userId, attemptId, timezone })
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Program step attempt not found';
    throw createError({
      statusCode:
        message === 'Program step actions are not completed' ? 409 : 404,
      statusMessage: message,
    });
  }
});
