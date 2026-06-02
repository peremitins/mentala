import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { assertProgramUnlocked } from '@/server/application/garden/garden.service';
import { getOrCreateProgramOverview } from '@/server/application/programs/retention-program.service';
import {
  GardenStartRequestDto,
  GardenStartResponseDto,
} from '@/shared/dto/garden';

/**
 * POST /api/garden/start — пользователь выбирает следующий Сад.
 *
 * Проверяет unlock_rule (E_FORBIDDEN если не открыт), создаёт `user_programs`
 * (через getOrCreateProgramOverview) и возвращает slug стартованного Сада.
 *
 * Совместимость: текущий клиент пока всегда стартует `calm_anxiety_30` через
 * getOrCreateProgramOverview без этого endpoint'а. Этот endpoint нужен для
 * сценария «пересадки» из retention/retention_long_term_strategy.md
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const body = await readBody(event);
  const parsed = GardenStartRequestDto.safeParse(body);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'E_VALIDATION',
      data: {
        error: { code: 'E_VALIDATION', details: parsed.error.flatten() },
      },
    });
  }

  try {
    const { programSlug } = await assertProgramUnlocked(
      userId,
      parsed.data.programSlug
    );
    const overview = await getOrCreateProgramOverview(userId, programSlug);

    return GardenStartResponseDto.parse({
      ok: true,
      programSlug: overview.slug,
    });
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'E_NOT_FOUND') {
      throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
    }
    if (code === 'E_FORBIDDEN') {
      throw createError({
        statusCode: 403,
        statusMessage: 'E_FORBIDDEN',
        data: {
          error: {
            code: 'E_FORBIDDEN',
            message: (error as Error).message,
          },
        },
      });
    }
    if (code === 'E_CONTENT_PENDING') {
      throw createError({
        statusCode: 503,
        statusMessage: 'E_CONTENT_PENDING',
        data: {
          error: {
            code: 'E_CONTENT_PENDING',
            message: 'Этот сад скоро будет готов. Дождись обновления.',
          },
        },
      });
    }
    throw error;
  }
});
