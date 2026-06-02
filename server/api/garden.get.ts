import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getGardenForUser } from '@/server/application/garden/garden.service';
import { GardenResponseDto } from '@/shared/dto/garden';

/**
 * GET /api/garden — состояние Оранжереи: активная программа, коллекция, доступные, силуэты.
 * См. retention/retention_long_term_strategy.md и §8.2.
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const snapshot = await getGardenForUser(userId);

  return GardenResponseDto.parse(snapshot);
});
