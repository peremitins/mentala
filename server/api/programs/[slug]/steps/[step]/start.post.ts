import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { startProgramStep } from '@/server/application/programs/retention-program.service';
import {
  ProgramStepStartRequestDto,
  ProgramStepStartResponseDto,
} from '@/shared/dto/retention';
import { assertFeatureAccess } from '@/server/application/subscriptions/feature-access-guard';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const slug = String(event.context.params?.slug || '').trim();
  const step = Number(event.context.params?.step);
  if (!slug || !Number.isInteger(step) || step < 1) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid step route' });
  }

  const body = (await readBody(event)) ?? {};
  const parsed = ProgramStepStartRequestDto.safeParse(body);
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
    return ProgramStepStartResponseDto.parse(
      await startProgramStep({
        userId: Number(sessionUser.id),
        slug,
        step,
        replay: parsed.data.replay,
      })
    );
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'E_DAILY_LIMIT') {
      throw createError({
        statusCode: 409,
        statusMessage: 'E_DAILY_LIMIT',
        data: {
          error: {
            code: 'E_DAILY_LIMIT',
            message: 'Сегодня ты уже прошёл свою норму. Возвращайся завтра.',
            details: (error as Error & { data?: unknown }).data,
          },
        },
      });
    }
    throw createError({
      statusCode:
        error instanceof Error &&
        error.message === 'Program step is not available yet'
          ? 409
          : 404,
      statusMessage:
        error instanceof Error ? error.message : 'Program step not found',
    });
  }
});
