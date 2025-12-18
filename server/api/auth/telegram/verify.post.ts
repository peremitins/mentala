import { createError, getCookie } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { telegramAccounts, users } from '@/server/infrastructure/db/schema';
import { eq } from 'drizzle-orm';
import { createSession } from '@/server/application/auth/session';
import crypto from 'node:crypto';
import { activateTrialForUser } from '@/server/application/subscriptions/trial.service';
import {
  LANG_COOKIE_NAME,
  getCookieName,
} from '@/server/application/auth/cookie-names';

function verifyTelegram(initData: Record<string, string>, botToken: string) {
  const { hash, ...data } = initData;
  const pairs = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('\n');
  const secret = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const h = crypto.createHmac('sha256', secret).update(pairs).digest('hex');
  return h === hash;
}

export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const botToken =
    cfg.TELEGRAM_BOT_TOKEN || process.env.NUXT_TELEGRAM_BOT_TOKEN;
  if (!botToken)
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing TELEGRAM_BOT_TOKEN',
    });
  const body = await readBody<{ initData: Record<string, string> }>(
    event as any
  );
  const data = body?.initData;
  if (!data)
    throw createError({ statusCode: 400, statusMessage: 'Missing initData' });
  if (!verifyTelegram(data, String(botToken)))
    throw createError({ statusCode: 401, statusMessage: 'TELEGRAM_INVALID' });

  const telegramId = Number(data.id);
  const username = data.username || null;
  const firstName = data.first_name || null;
  const lastName = data.last_name || null;
  const photoUrl = data.photo_url || null;
  const isProd = process.env.NODE_ENV === 'production';
  const langCookieName = getCookieName(LANG_COOKIE_NAME, isProd);
  const locale = getCookie(event, langCookieName) || undefined;

  const existing = await db
    .select()
    .from(telegramAccounts)
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);
  let userId: number;
  if (existing.length) {
    userId = existing[0].userId;
  } else {
    const [u] = await db
      .insert(users)
      .values({
        name: [firstName, lastName].filter(Boolean).join(' ') || null,
        avatarUrl: photoUrl,
        locale: locale ?? null,
      })
      .returning();
    userId = u.id;
    await db
      .insert(telegramAccounts)
      .values({ userId, telegramId, username, firstName, lastName, photoUrl });

    // Активируем Trial для нового пользователя (или создаем Basic без Trial)
    // ВАЖНО: Всегда создаем подписку Basic при регистрации
    try {
      const subscription = await activateTrialForUser(userId);
      if (subscription) {
        console.log(
          `[Telegram] ✅ Subscription created for user ${userId}: planId=${subscription.planId}, paymentStatus=${subscription.paymentStatus}`
        );
      } else {
        console.warn(
          `[Telegram] ⚠️ activateTrialForUser returned null for user ${userId}`
        );
      }
    } catch (error: any) {
      console.error(
        `[Telegram] ❌ Failed to activate trial/subscription for user ${userId}:`,
        error
      );
      console.error(`[Telegram] Error details:`, error?.message, error?.stack);
      // Не блокируем регистрацию, если подписка не активировалась, но логируем ошибку
    }
  }

  await createSession(event, userId, locale);
  return { user: { id: userId, username, firstName, lastName } };
});
