import { setResponseHeader } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { EmailRequestVerificationDto } from '@/shared/dto/auth';
import {
  normalizeEmail,
  getEmailVerificationKey,
} from '@/server/application/auth/verification';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { issueVerificationCode } from '@/server/application/auth/email-verification.service';
import { getClientIp } from '@/server/utils/ip';

export default defineEventHandler(async (event) => {
  const body = EmailRequestVerificationDto.parse(await readBody(event as any));
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
  if (typeof blocked?.retryAfter === 'number') {
    setResponseHeader(event, 'Retry-After', blocked.retryAfter);
  }

  if (blocked && !blocked.allowed) {
    return {
      message:
        'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Ментала ранее, вы сможете войти или восстановить доступ',
      retryAfter: blocked.retryAfter,
    };
  }

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length && !existing[0].emailVerifiedAt) {
    await issueVerificationCode(getEmailVerificationKey(email), email);
  }

  return {
    message:
      'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Ментала ранее, вы сможете войти или восстановить доступ',
  };
});
