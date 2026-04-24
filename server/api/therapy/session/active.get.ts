import { createError } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getRestorableTextSessionForUser } from '@/server/application/chat/restorableTextSession.service';
import { GetRestorableTherapySessionResponseDto } from '@/shared/dto/therapySessionRestore';

/**
 * GET /api/therapy/session/active
 * Возвращает текущую незавершённую текстовую сессию с transcript,
 * если она ещё находится в restore-window и может быть безопасно продолжена.
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const session = await getRestorableTextSessionForUser(Number(sessionUser.id));

  return GetRestorableTherapySessionResponseDto.parse({
    session,
  });
});
