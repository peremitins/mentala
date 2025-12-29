import { setResponseHeader } from 'h3';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { useRuntimeConfig } from '#imports';
import { db } from '@/server/infrastructure/db/client';
import { users, securityEvents } from '@/server/infrastructure/db/schema';
import { PasswordForgotDto } from '@/shared/dto/auth';
import {
  normalizeEmail,
  getAuthSecrets,
  hashPasswordResetToken,
  storePasswordResetToken,
  maskEmail,
  PASSWORD_RESET_TTL_SECONDS,
} from '@/server/application/auth/verification';
import { checkRateLimit } from '@/server/application/auth/rate-limit';
import { sendPasswordResetEmail } from '@/server/application/auth/email-sender';
import { getClientIp } from '@/server/utils/ip';

export default defineEventHandler(async (event) => {
  const body = PasswordForgotDto.parse(await readBody(event as any));
  const email = normalizeEmail(body.email);
  const ip = getClientIp(event) || 'unknown';

  // Rate limiting: по IP, email и комбинации IP+email
  const rateLimits = await Promise.all([
    checkRateLimit(`auth:rate_limit:password_reset:ip:${ip}`, 15, 3600),
    checkRateLimit(`auth:rate_limit:password_reset:email:${email}`, 10, 3600),
    checkRateLimit(
      `auth:rate_limit:password_reset:ip_email:${ip}:${email}`,
      15,
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
        'Если аккаунт существует, мы отправили ссылку для восстановления пароля',
      retryAfter: blocked.retryAfter,
    };
  }

  // Проверяем, существует ли пользователь с таким email и есть ли у него пароль
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const userExists = existing.length > 0 && !!existing[0].passwordHash;

  // Всегда возвращаем одинаковое сообщение (защита от enumeration)
  const maskedEmailValue = maskEmail(email);
  const responseMessage =
    'Если аккаунт существует, мы отправили ссылку для восстановления пароля';

  // Если пользователь существует и имеет пароль, отправляем email
  if (userExists) {
    // Генерируем токен
    const token = randomBytes(32).toString('hex'); // 64 символа

    // Получаем секрет для хэширования
    const secrets = getAuthSecrets();
    const secret = secrets[0]; // Используем текущий секрет

    // Вычисляем хэш токена
    const tokenHash = hashPasswordResetToken(token, secret);

    // Сохраняем в Redis (храним хэш, не сырой токен)
    await storePasswordResetToken(tokenHash, email, PASSWORD_RESET_TTL_SECONDS);

    // Получаем appUrl из конфига
    const config = useRuntimeConfig();
    const appUrl = (config.public as any).appUrl || 'http://localhost:3000';
    const resetUrl = `${appUrl}/reset-password?token=${token}`;

    // Отправляем email
    await sendPasswordResetEmail(email, resetUrl);

    // Логируем security event
    await logSecurityEvent(event, 'password_reset_requested', {});
  }

  return {
    message: responseMessage,
    maskedEmail: maskedEmailValue,
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
      userAgent,
      metadata,
    });
  } catch (error) {
    console.error('[Auth] Failed to log security event:', error);
  }
}
