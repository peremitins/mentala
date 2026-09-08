import { createError, getHeader } from 'h3';
import argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users, securityEvents } from '@/server/infrastructure/db/schema';
import { PasswordResetDto } from '@/shared/dto/auth';
import {
  normalizeEmail,
  getAuthSecrets,
  hashPasswordResetToken,
  getPasswordResetRecord,
  deleteRedisKey,
  getPasswordResetKey,
} from '@/server/application/auth/verification';
import {
  createSession,
  revokeAllUserSessions,
} from '@/server/application/auth/session';
import { getClientIp } from '@/server/utils/ip';
import { scheduleNotificationSlotsAfterLogin } from '@/server/application/notifications/login-slots.service';
import { toIsoString } from '@/server/utils/serialize';

export default defineEventHandler(async (event) => {
  const body = PasswordResetDto.parse(await readBody(event as any));

  // Валидация паролей
  if (body.password !== body.confirmPassword) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Пароли не совпадают',
    });
  }

  if (body.password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Пароль должен быть не менее 8 символов',
    });
  }

  // Вычисляем хэш входящего токена
  const secrets = getAuthSecrets();
  let tokenHash: string | null = null;
  let record: any = null;

  // Пробуем все секреты (на случай ротации)
  for (const secret of secrets) {
    const hash = hashPasswordResetToken(body.token, secret);
    const found = await getPasswordResetRecord(hash);
    if (found) {
      tokenHash = hash;
      record = found;
      break;
    }
  }

  // Если токен не найден или истёк
  if (!record) {
    await logSecurityEvent(event, 'password_reset_token_invalid', {
      reason: 'invalid',
    });
    throw createError({
      statusCode: 400,
      statusMessage: 'Ссылка недействительна или истекла',
    });
  }

  // Нормализуем email из токена
  const email = normalizeEmail(record.email);

  // Находим пользователя
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!existing.length) {
    await logSecurityEvent(event, 'password_reset_token_invalid', {
      reason: 'invalid',
    });
    throw createError({
      statusCode: 400,
      statusMessage: 'Ссылка недействительна или истекла',
    });
  }

  const user = existing[0];

  if (!user.passwordHash) {
    await logSecurityEvent(event, 'password_reset_token_invalid', {
      reason: 'invalid',
    });
    throw createError({
      statusCode: 400,
      statusMessage: 'Ссылка недействительна или истекла',
    });
  }

  // Хешируем новый пароль
  const newHash = await argon2.hash(body.password, {
    type: argon2.argon2id,
  });

  // Обновляем пароль в БД
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  // Удаляем токен из Redis (одноразовый)
  if (tokenHash) {
    await deleteRedisKey(getPasswordResetKey(tokenHash));
  }

  // Инвалидируем все сессии пользователя
  await revokeAllUserSessions(user.id);

  // Создаём новую сессию
  const sessionId = await createSession(event, user.id, user.locale ?? undefined);
  // Проверяем слоты уведомлений в фоне после создания сессии
  scheduleNotificationSlotsAfterLogin(user.id);

  // Логируем security event
  await logSecurityEvent(event, 'password_reset_success', {
    userId: user.id,
  });

  // Определяем платформу для возврата sessionToken
  const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
  const isNative = platform === 'ios' || platform === 'android';

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      role: user.roleId || 'user',
      isBlocked: user.isBlocked || false,
      emailVerifiedAt: toIsoString(user.emailVerifiedAt),
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
      userId: (metadata.userId as number) || null,
      eventType,
      ipAddress: ip,
      userAgent,
      metadata: Object.fromEntries(
        Object.entries(metadata).filter(([key]) => key !== 'userId')
      ),
    });
  } catch (error) {
    console.error('[Auth] Failed to log security event:', error);
  }
}
