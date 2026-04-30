import { createHash } from 'crypto';
import { getHeader, setResponseStatus } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { getTimezoneFromRequest } from '@/server/application/notifications/timezone.utils';
import { getClientIp } from '@/server/utils/ip';
import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
} from '@/shared/constants/legal';
import {
  AUTH_CODE_TTL_SECONDS,
  getEmailPasswordKey,
  getEmailVerificationKey,
  maskEmail,
  normalizeEmail,
  storeTempPasswordHash,
} from '@/server/application/auth/verification';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { AuthRegisterDto } from '@/shared/dto/auth';
import { issueVerificationCode } from '@/server/application/auth/email-verification.service';
import { getDefaultUserSceneSettings } from '@/server/utils/sceneSettings';
import { recordUserMarketingAttributionSafe } from '@/server/application/marketing-attribution/marketing-attribution.service';

function detectAcceptanceSource(event: any): 'web' | 'ios' | 'android' {
  const userAgent = getHeader(event, 'user-agent') || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
}

function getDeviceKey(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  // Хешируем UA, чтобы не хранить его целиком в ключах rate-limit
  return createHash('sha256').update(userAgent).digest('hex').slice(0, 16);
}

export default defineEventHandler(async (event) => {
  // Валидируем без исключения, чтобы вернуть 400 с понятным телом
  const bodyResult = AuthRegisterDto.safeParse(await readBody(event as any));
  if (!bodyResult.success) {
    setResponseStatus(event, 400, 'Bad Request');
    return {
      error: 'validation',
      issues: bodyResult.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'root',
        message: issue.message,
      })),
    };
  }

  const body = bodyResult.data;
  const email = normalizeEmail(body.email);
  const ip = getClientIp(event) || 'unknown';
  const userAgent = getHeader(event, 'user-agent') || null;
  const deviceKey = getDeviceKey(userAgent);
  const acceptanceSource = detectAcceptanceSource(event);
  const now = new Date();
  const marketingConsentAt = body.marketingConsent ? now : null;

  const rateLimits = await Promise.all([
    checkRateLimit(`auth:rate_limit:email_verification:ip:${ip}`, 15, 3600),
    checkRateLimit(
      `auth:rate_limit:email_verification:device:${deviceKey}`,
      15,
      3600
    ),
    checkRateLimit(
      `auth:rate_limit:email_verification:ip_device:${ip}:${deviceKey}`,
      15,
      3600
    ),
  ]);
  const blocked = rateLimits.find((limit) => !limit.allowed);
  if (blocked?.retryAfter) {
    event.res.headers.set('Retry-After', String(blocked.retryAfter));
  }

  if (blocked && !blocked.allowed) {
    event.res.status = 429;
    event.res.statusText = 'Too Many Requests';
    return {
      message: 'Слишком много запросов. Попробуйте позже.',
      retryAfter: blocked.retryAfter,
    };
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length) {
    let verificationEmailSent = true;

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

      // Обновляем юридические согласия для незавершенной регистрации
      await db
        .update(users)
        .set({
          termsAcceptedAt: now,
          privacyAcceptedAt: now,
          termsVersion: LEGAL_TERMS_VERSION,
          privacyVersion: LEGAL_PRIVACY_VERSION,
          acceptanceSource: acceptanceSource,
          acceptanceIp: ip,
          acceptanceUserAgent: userAgent,
          marketingConsentAt: marketingConsentAt,
          marketingConsentSource: marketingConsentAt ? acceptanceSource : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing[0].id));

      try {
        await issueVerificationCode(getEmailVerificationKey(email), email);
      } catch (error: any) {
        // Не скрываем факт сбоя полностью: клиенту нужно понимать,
        // что модалку ввода кода показывать нельзя, если письмо не ушло.
        verificationEmailSent = false;
        console.error('[Auth] Failed to send verification email:', {
          email: maskEmail(email),
          error: error?.message || String(error),
          code: error?.code,
        });
      }
    }

    await recordUserMarketingAttributionSafe({
      userId: existing[0].id,
      touchpoint: 'email_register_started',
      authProvider: 'email',
      marketingAttribution: body.marketingAttribution,
    });

    setResponseStatus(event, 201, 'Created');
    return {
      userId: existing[0].id,
      email,
      verificationEmailSent,
      verificationEmailMessage: verificationEmailSent
        ? undefined
        : 'Не удалось отправить письмо с кодом подтверждения. Попробуйте позже.',
    };
  }

  const timezone = getTimezoneFromRequest(event);

  const created = await db
    .insert(users)
    .values({
      name: body.name ?? null,
      email,
      emailVerifiedAt: null,
      passwordHash: null,
      locale: body.locale ?? null,
      timezone: timezone || 'Europe/Moscow',
      // Фиксируем согласия на документы и маркетинг
      termsAcceptedAt: now,
      privacyAcceptedAt: now,
      termsVersion: LEGAL_TERMS_VERSION,
      privacyVersion: LEGAL_PRIVACY_VERSION,
      acceptanceSource: acceptanceSource,
      acceptanceIp: ip,
      acceptanceUserAgent: userAgent,
      marketingConsentAt: marketingConsentAt,
      marketingConsentSource: marketingConsentAt ? acceptanceSource : null,
      sceneSettings: getDefaultUserSceneSettings(),
    })
    .returning({ id: users.id, email: users.email });

  const passwordHash = await argon2.hash(body.password, {
    type: argon2.argon2id,
  });
  await storeTempPasswordHash(
    getEmailPasswordKey(email),
    passwordHash,
    AUTH_CODE_TTL_SECONDS
  );

  let verificationEmailSent = true;
  try {
    await issueVerificationCode(getEmailVerificationKey(email), email);
  } catch (error: any) {
    verificationEmailSent = false;
    console.error('[Auth] Failed to send verification email:', {
      email: maskEmail(email),
      error: error?.message || String(error),
      code: error?.code,
    });
  }

  const createdUser = created[0];
  if (!createdUser) {
    throw new Error('Не удалось получить данные созданного пользователя.');
  }

  await recordUserMarketingAttributionSafe({
    userId: createdUser.id,
    touchpoint: 'email_register_started',
    authProvider: 'email',
    marketingAttribution: body.marketingAttribution,
  });

  setResponseStatus(event, 201, 'Created');
  return {
    userId: createdUser.id,
    email: createdUser.email,
    verificationEmailSent,
    verificationEmailMessage: verificationEmailSent
      ? undefined
      : 'Не удалось отправить письмо с кодом подтверждения. Попробуйте позже.',
  };
});
