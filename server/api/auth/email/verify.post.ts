import { createError, getHeader } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users, securityEvents } from '@/server/infrastructure/db/schema';
import { EmailVerifyDto } from '@/shared/dto/auth';
import {
  deleteRedisKey,
  getEmailPasswordKey,
  getEmailVerificationKey,
  getTempPasswordHash,
  normalizeEmail,
  verifyStoredCode,
} from '@/server/application/auth/verification';
import { createSession } from '@/server/application/auth/session';
import { activateTrialForUser } from '@/server/application/subscriptions/trial.service';
import { getClientIp } from '@/server/utils/ip';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';
import { scheduleNotificationSlotsAfterLogin } from '@/server/application/notifications/login-slots.service';
import { toIsoString } from '@/server/utils/serialize';
import { dispatchUserRegisteredEvent } from '@/server/application/events/app-events.dispatchers';

export default defineEventHandler(async (event) => {
  const body = EmailVerifyDto.parse(await readBody(event as any));
  const email = normalizeEmail(body.email);

  const verificationKey = getEmailVerificationKey(email);
  const result = await verifyStoredCode(verificationKey, body.code);

  if (!result.ok) {
    if (result.reason === 'attempts_exceeded') {
      await logSecurityEvent(event, 'email_verification_attempts_exceeded', {
        email,
      });
    }
    throw createError({
      statusCode: 400,
      statusMessage:
        result.reason === 'attempts_exceeded'
          ? 'Слишком много попыток'
          : 'Неверный или истекший код',
      data: { attemptsLeft: result.attemptsLeft },
    });
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!existing.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверный или истекший код',
    });
  }

  const user = existing[0];
  const passwordKey = getEmailPasswordKey(email);
  const tempPasswordHash = await getTempPasswordHash(passwordKey);

  if (!tempPasswordHash && !user.passwordHash) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Неверный или истекший код',
    });
  }

  await db
    .update(users)
    .set({
      emailVerifiedAt: new Date(),
      passwordHash: tempPasswordHash || user.passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await deleteRedisKey(verificationKey);
  if (tempPasswordHash) {
    await deleteRedisKey(passwordKey);
  }

  const timezone = getTimezoneFromRequest(event);
  try {
    await activateTrialForUser(user.id, timezone, email);
  } catch (error: any) {
    console.error(
      `[Auth] ❌ Failed to activate trial/subscription for user ${user.id}:`,
      error
    );
    console.error(`[Auth] Error details:`, error?.message, error?.stack);
  }

  const sessionId = await createSession(
    event,
    user.id,
    user.locale ?? undefined
  );
  // Проверяем слоты уведомлений в фоне после создания сессии
  scheduleNotificationSlotsAfterLogin(user.id);
  dispatchUserRegisteredEvent({
    userId: user.id,
    method: 'email',
  });
  const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
  const isNative = platform === 'ios' || platform === 'android';

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      locale: user.locale,
      role: user.roleId || 'user',
      isBlocked: user.isBlocked || false,
      emailVerifiedAt: toIsoString(new Date()),
      hasPassword: true,
    },
    ...(isNative ? { sessionToken: sessionId } : {}),
  };
});

async function logSecurityEvent(
  event: any,
  eventType: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    const ip = getClientIp(event);
    const userAgent = event.node?.req?.headers['user-agent'] || null;
    await db.insert(securityEvents).values({
      userId: null,
      eventType,
      ipAddress: ip,
      userAgent: userAgent,
      metadata,
    });
  } catch (error) {
    console.error('[Auth] Failed to log security event:', error);
  }
}
