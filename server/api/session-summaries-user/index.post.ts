import { setResponseStatus } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  CreateSessionSummaryUserRequestDto,
  CreateSessionSummaryUserResponseDto,
} from '@/shared/dto/sessionSummaryUser';
import { createSessionSummaryUser } from '@/server/application/sessionSummaryUser.service';

type ErrorCode = 'E_VALIDATION' | 'E_AUTH' | 'E_UNKNOWN';

function errorResponse(
  event: Parameters<typeof setResponseStatus>[0],
  statusCode: number,
  code: ErrorCode,
  message: string,
  details?: unknown
) {
  setResponseStatus(event, statusCode);
  return {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  } as const;
}

/**
 * POST /api/session-summaries-user
 * Создаёт пользовательский итог сессии (ТЗ редизайн главной, п.10.3).
 *
 * Принимает therapySessionId или clientSessionId + trigger.
 * Возвращает { ok, id, status, eligible, reason? }.
 *
 * Сервер сам проверяет eligibility из БД (не доверяет клиенту).
 */
export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const parsedBody = CreateSessionSummaryUserRequestDto.safeParse(
      await readBody(event)
    );
    if (!parsedBody.success) {
      return errorResponse(
        event,
        400,
        'E_VALIDATION',
        'Invalid payload',
        parsedBody.error.issues
      );
    }

    const body = parsedBody.data;
    const userId = Number(sessionUser.id);

    const result = await createSessionSummaryUser({
      userId,
      therapySessionId: body.therapySessionId,
      clientSessionId: body.clientSessionId,
      trigger: body.trigger,
      // Клиентские метрики — fallback для eligibility когда transcript в БД
      // пустой (voice-режим с отключённой памятью, гонка записи и т.п.).
      clientMetrics:
        typeof body.userMessagesCount === 'number'
          ? {
              userMessagesCount: body.userMessagesCount,
              qualifyingUserMessagesCount:
                body.qualifyingUserMessagesCount ?? 0,
              durationSeconds: body.durationSeconds ?? 0,
            }
          : undefined,
      // Сообщения из клиентского стора — fallback для LLM.
      clientMessages: body.clientMessages,
    });

    return CreateSessionSummaryUserResponseDto.parse({
      ok: true,
      id: result.id,
      status: result.status,
      eligible: result.eligible,
      ...(result.eligible === false ? { reason: result.reason } : {}),
    });
  } catch (error) {
    console.error('[SessionSummaryUser POST] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to create summary');
  }
});
