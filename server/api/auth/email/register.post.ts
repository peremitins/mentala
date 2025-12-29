import { setResponseHeader } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';
import { getClientIp } from '@/server/utils/ip';
import {
  AUTH_CODE_TTL_SECONDS,
  getEmailPasswordKey,
  getEmailVerificationKey,
  normalizeEmail,
  storeTempPasswordHash,
} from '@/server/application/auth/verification';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { AuthRegisterDto } from '@/shared/dto/auth';
import { issueVerificationCode } from '@/server/application/auth/email-verification.service';

export default defineEventHandler(async (event) => {
  const body = AuthRegisterDto.parse(await readBody(event as any));
  const email = normalizeEmail(body.email);
  const ip = getClientIp(event) || 'unknown';

  const rateLimits = await Promise.all([
    checkRateLimit(`auth:rate_limit:email_verification:ip:${ip}`, 5, 3600),
    checkRateLimit(
      `auth:rate_limit:email_verification:email:${email}`,
      3,
      3600
    ),
    checkRateLimit(
      `auth:rate_limit:email_verification:ip_email:${ip}:${email}`,
      5,
      3600
    ),
  ]);
  const blocked = rateLimits.find((limit) => !limit.allowed);
  if (blocked?.retryAfter) {
    setResponseHeader(event, 'Retry-After', String(blocked.retryAfter));
  }

  if (blocked && !blocked.allowed) {
    return {
      message:
        'Если аккаунт существует, мы отправили письмо с кодом подтверждения',
      retryAfter: blocked.retryAfter,
    };
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length) {
    if (!existing[0].emailVerifiedAt) {
      const passwordHash = await argon2.hash(body.password, {
        type: argon2.argon2id,
      });
      await storeTempPasswordHash(
        getEmailPasswordKey(email),
        passwordHash,
        AUTH_CODE_TTL_SECONDS
      );

      if (!existing[0].name && body.name) {
        await db
          .update(users)
          .set({ name: body.name, updatedAt: new Date() })
          .where(eq(users.id, existing[0].id));
      }

      await issueVerificationCode(getEmailVerificationKey(email), email);
    }

    return {
      message:
        'Если аккаунт существует, мы отправили письмо с кодом подтверждения',
    };
  }

  const timezone = getTimezoneFromRequest(event);

  await db.insert(users).values({
    name: body.name ?? null,
    email,
    emailVerifiedAt: null,
    passwordHash: null,
    locale: body.locale ?? null,
    timezone: timezone || 'Europe/Moscow',
  });

  const passwordHash = await argon2.hash(body.password, {
    type: argon2.argon2id,
  });
  await storeTempPasswordHash(
    getEmailPasswordKey(email),
    passwordHash,
    AUTH_CODE_TTL_SECONDS
  );

  await issueVerificationCode(getEmailVerificationKey(email), email);

  return {
    message:
      'Если аккаунт существует, мы отправили письмо с кодом подтверждения',
  };
});
