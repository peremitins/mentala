import { and, eq } from 'drizzle-orm';
import { getHeader, setHeader, setResponseStatus } from 'h3';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { db } from '@/server/infrastructure/db/client';
import {
  chatResponseFeedback,
  therapySessions,
} from '@/server/infrastructure/db/schema';
import {
  ChatFeedbackUpsertRequestDto,
  ChatFeedbackUpsertResponseDto,
} from '@/shared/dto';
import { getSessionUserWithRole } from '@/server/utils/require-role';

type FeedbackErrorCode =
  | 'E_VALIDATION'
  | 'E_AUTH'
  | 'E_NOT_FOUND'
  | 'E_RATE'
  | 'E_UNKNOWN';

function toOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function resolvePlatform(event: Parameters<typeof getHeader>[0]) {
  const rawPlatform = String(getHeader(event, 'x-platform') || '')
    .trim()
    .toLowerCase();

  if (
    rawPlatform === 'ios' ||
    rawPlatform === 'android' ||
    rawPlatform === 'web'
  ) {
    return rawPlatform;
  }

  return 'web';
}

function resolveLocale(
  event: Parameters<typeof getHeader>[0],
  userLocale?: unknown
) {
  const localeFromUser = toOptionalString(userLocale, 8);
  if (localeFromUser) {
    return localeFromUser.toLowerCase();
  }

  const acceptLanguage = toOptionalString(
    getHeader(event, 'accept-language'),
    64
  );
  if (!acceptLanguage) return null;

  const firstToken = acceptLanguage.split(',')[0]?.trim();
  if (!firstToken) return null;

  return firstToken.toLowerCase().slice(0, 8);
}

function errorResponse(
  event: Parameters<typeof setResponseStatus>[0],
  statusCode: number,
  code: FeedbackErrorCode,
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

async function checkRateLimitSafe(
  key: string,
  limit: number,
  windowSeconds: number
) {
  try {
    return await checkRateLimit(key, limit, windowSeconds);
  } catch (error) {
    console.error('[ChatFeedback API] Rate limit check failed:', error);
    return {
      allowed: true,
      remaining: limit,
    };
  }
}

export default defineEventHandler(async (event) => {
  try {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      return errorResponse(event, 401, 'E_AUTH', 'Unauthorized');
    }

    const parsedBody = ChatFeedbackUpsertRequestDto.safeParse(
      await readBody(event)
    );
    if (!parsedBody.success) {
      return errorResponse(
        event,
        400,
        'E_VALIDATION',
        'Invalid feedback payload',
        parsedBody.error.issues
      );
    }

    const body = parsedBody.data;
    const userId = Number(sessionUser.id);

    const therapySession = await db
      .select({ id: therapySessions.id })
      .from(therapySessions)
      .where(
        and(
          eq(therapySessions.id, body.therapySessionId),
          eq(therapySessions.userId, userId)
        )
      )
      .limit(1);

    if (!therapySession[0]) {
      return errorResponse(
        event,
        404,
        'E_NOT_FOUND',
        'Therapy session not found'
      );
    }

    const rateLimits = await Promise.all([
      checkRateLimitSafe(`chat:feedback:user:${userId}:10m`, 20, 10 * 60),
      checkRateLimitSafe(
        `chat:feedback:item:${userId}:${body.therapySessionId}:${body.assistantMessageClientId}:1m`,
        5,
        60
      ),
      checkRateLimitSafe(`chat:feedback:user:${userId}:1d`, 200, 24 * 60 * 60),
    ]);

    const blockedRateLimit = rateLimits.find((result) => !result.allowed);
    if (blockedRateLimit) {
      if (blockedRateLimit.retryAfter) {
        setHeader(event, 'Retry-After', String(blockedRateLimit.retryAfter));
      }
      return errorResponse(event, 429, 'E_RATE', 'Too many feedback requests', {
        retryAfter: blockedRateLimit.retryAfter ?? null,
      });
    }

    const now = new Date();
    const topicCode = body.rating === -1 ? (body.topicCode ?? null) : null;
    const assistantMessageText = toOptionalString(
      body.assistantMessageText,
      8000
    );
    const platform = resolvePlatform(event);
    const timezone = toOptionalString(getHeader(event, 'x-timezone'), 100);
    const requestId = toOptionalString(getHeader(event, 'x-request-id'), 255);
    const locale = resolveLocale(
      event,
      (sessionUser as { locale?: unknown }).locale
    );

    const [saved] = await db
      .insert(chatResponseFeedback)
      .values({
        userId,
        therapySessionId: body.therapySessionId,
        sessionId: body.sessionId ?? null,
        assistantMessageClientId: body.assistantMessageClientId,
        rating: body.rating,
        topicCode,
        comment: body.comment ?? null,
        assistantMessageText,
        platform,
        timezone,
        locale,
        requestId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          chatResponseFeedback.userId,
          chatResponseFeedback.therapySessionId,
          chatResponseFeedback.assistantMessageClientId,
        ],
        set: {
          sessionId: body.sessionId ?? null,
          rating: body.rating,
          topicCode,
          comment: body.comment ?? null,
          assistantMessageText,
          platform,
          timezone,
          locale,
          requestId,
          updatedAt: now,
        },
      })
      .returning({
        id: chatResponseFeedback.id,
        rating: chatResponseFeedback.rating,
        topicCode: chatResponseFeedback.topicCode,
        comment: chatResponseFeedback.comment,
        assistantMessageText: chatResponseFeedback.assistantMessageText,
        updatedAt: chatResponseFeedback.updatedAt,
      });

    if (!saved) {
      return errorResponse(
        event,
        500,
        'E_UNKNOWN',
        'Failed to persist feedback'
      );
    }

    return ChatFeedbackUpsertResponseDto.parse({
      ok: true,
      item: {
        id: saved.id,
        rating: saved.rating,
        topicCode: saved.topicCode,
        comment: saved.comment,
        assistantMessageText: saved.assistantMessageText,
        updatedAt: saved.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[ChatFeedback API] Unexpected error:', error);
    return errorResponse(event, 500, 'E_UNKNOWN', 'Failed to save feedback');
  }
});
