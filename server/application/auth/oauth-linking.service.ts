import { createError, getHeader } from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { oauthAccounts, securityEvents, users } from '@/server/infrastructure/db/schema';
import { deleteLinkingData, getLinkCodeKey, OAuthLinkData } from './oauth-linking';
import { deleteRedisKey } from './verification';
import { createSession, getSessionUser } from './session';
import { getClientIp } from '@/server/utils/ip';
import { scheduleNotificationSlotsAfterLogin } from '@/server/application/notifications/login-slots.service';

export async function finalizeOAuthLink(
  event: any,
  linkingToken: string,
  linkingData: OAuthLinkData,
  userId: number
): Promise<void> {
  const existing = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, linkingData.provider),
        eq(oauthAccounts.providerUserId, linkingData.providerUserId)
      )
    )
    .limit(1);

  if (existing.length && existing[0].userId !== userId) {
    await logOAuthSecurityEvent(event, 'oauth_link_conflict', {
      provider: linkingData.provider,
      providerUserId: linkingData.providerUserId,
      attemptedUserId: userId,
      existingUserId: existing[0].userId,
    });
    throw createError({
      statusCode: 409,
      statusMessage: 'Конфликт привязки OAuth',
    });
  }

  if (!existing.length) {
    await db.insert(oauthAccounts).values({
      userId,
      provider: linkingData.provider,
      providerUserId: linkingData.providerUserId,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  }

  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length) {
    const updates: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (!user[0].emailVerifiedAt) {
      updates.emailVerifiedAt = new Date();
    }
    if (!user[0].name && linkingData.name) {
      updates.name = linkingData.name;
    }
    if (!user[0].avatarUrl && linkingData.avatarUrl) {
      updates.avatarUrl = linkingData.avatarUrl;
    }
    if (Object.keys(updates).length) {
      await db.update(users).set(updates).where(eq(users.id, userId));
    }
  }

  await deleteLinkingData(linkingToken);
  await deleteRedisKey(getLinkCodeKey(linkingToken));
}

export async function buildOAuthAuthResponse(event: any, userId: number) {
  const session = await getSessionUser(event);
  if (session?.user?.id && session.user.id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Доступ запрещен' });
  }

  let sessionId: string | null = null;
  if (!session?.user?.id) {
    sessionId = await createSession(event, userId);
    // Проверяем слоты уведомлений в фоне после создания сессии
    scheduleNotificationSlotsAfterLogin(userId);
  }

  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const safeUser = user[0];

  const platform = String(getHeader(event, 'x-platform') || '').toLowerCase();
  const isNative = platform === 'ios' || platform === 'android';

  return {
    user: {
      id: safeUser.id,
      email: safeUser.email,
      name: safeUser.name,
      locale: safeUser.locale,
      role: safeUser.roleId || 'user',
      isBlocked: safeUser.isBlocked || false,
      emailVerifiedAt: safeUser.emailVerifiedAt,
      hasPassword: !!safeUser.passwordHash,
    },
    ...(isNative && sessionId ? { sessionToken: sessionId } : {}),
  };
}

async function logOAuthSecurityEvent(
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
