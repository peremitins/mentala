import { randomBytes } from 'node:crypto';
import { setCookie, getCookie, deleteCookie, createError, getHeader } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users, oauthAccounts } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession } from './session';
import { activateTrialForUser } from '@/server/application/subscriptions/trial.service';
import {
  LEGAL_PRIVACY_VERSION,
  LEGAL_TERMS_VERSION,
} from '@/shared/constants/legal';
import {
  generateLinkingToken,
  storeLinkingData,
} from '@/server/application/auth/oauth-linking';
import { normalizeEmail } from '@/server/application/auth/verification';
import { getClientIp } from '@/server/utils/ip';
import { getDefaultUserSceneSettings } from '@/server/utils/sceneSettings';
import {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_REDIRECT_COOKIE_NAME,
  LANG_COOKIE_NAME,
  getCookieName,
} from './cookie-names';
import { dispatchUserRegisteredEvent } from '@/server/application/events/app-events.dispatchers';
import { redisConnection } from '@/server/infrastructure/redis/bullmqClient';
import type { MarketingAttributionDto } from '@/shared/dto/marketing-attribution';
import { recordUserMarketingAttributionSafe } from '@/server/application/marketing-attribution/marketing-attribution.service';

const isProd = process.env.NODE_ENV === 'production';
const GOOGLE_OAUTH_REPLAY_TTL_SECONDS = 5 * 60;
const googleOAuthReplayMemory = new Map<
  string,
  { redirectUrl: string; expiresAt: number }
>();

function detectAcceptanceSource(event: any): 'web' | 'ios' | 'android' {
  const userAgent = getHeader(event, 'user-agent') || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
}

function buildLegalConsent(event: any) {
  const now = new Date();
  const userAgent = getHeader(event, 'user-agent') || null;
  const acceptanceSource = detectAcceptanceSource(event);
  return {
    // Фиксируем согласие с документами при создании учетной записи через OAuth
    termsAcceptedAt: now,
    privacyAcceptedAt: now,
    termsVersion: LEGAL_TERMS_VERSION,
    privacyVersion: LEGAL_PRIVACY_VERSION,
    acceptanceSource: acceptanceSource,
    acceptanceIp: getClientIp(event) || null,
    acceptanceUserAgent: userAgent,
    marketingConsentAt: null,
    marketingConsentSource: null,
  };
}

export type Provider = 'google' | 'vk' | 'apple';
export type OAuthResult =
  | { status: 'linked'; userId: number; isNewUser: boolean }
  | { status: 'linking_required'; linkingToken: string; email: string };

function getGoogleOAuthReplayKey(state: string): string {
  return `auth:google:callback-replay:${state}`;
}

function getRedisClient() {
  return typeof (redisConnection as any)?.get === 'function'
    ? (redisConnection as any)
    : null;
}

function readGoogleOAuthReplayFromMemory(state: string): string | null {
  const record = googleOAuthReplayMemory.get(state);
  if (!record) return null;

  if (record.expiresAt <= Date.now()) {
    googleOAuthReplayMemory.delete(state);
    return null;
  }

  return record.redirectUrl;
}

export async function getGoogleOAuthReplayRedirect(
  state: string
): Promise<string | null> {
  if (!state) return null;

  const memoryRedirect = readGoogleOAuthReplayFromMemory(state);
  if (memoryRedirect) return memoryRedirect;

  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const raw = await redis.get(getGoogleOAuthReplayKey(state));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { redirectUrl?: string };
    return typeof parsed.redirectUrl === 'string' && parsed.redirectUrl
      ? parsed.redirectUrl
      : null;
  } catch (error) {
    console.warn('[OAuth] Не удалось прочитать replay Google callback:', error);
    return null;
  }
}

export async function storeGoogleOAuthReplayRedirect(
  state: string,
  redirectUrl: string
): Promise<void> {
  if (!state || !redirectUrl) return;

  googleOAuthReplayMemory.set(state, {
    redirectUrl,
    expiresAt: Date.now() + GOOGLE_OAUTH_REPLAY_TTL_SECONDS * 1000,
  });

  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.set(
      getGoogleOAuthReplayKey(state),
      JSON.stringify({ redirectUrl }),
      'EX',
      GOOGLE_OAUTH_REPLAY_TTL_SECONDS
    );
  } catch (error) {
    console.warn('[OAuth] Не удалось сохранить replay Google callback:', error);
  }
}

export async function waitForGoogleOAuthReplayRedirect(
  state: string,
  options?: { timeoutMs?: number; intervalMs?: number }
): Promise<string | null> {
  if (!state) return null;

  const timeoutMs = options?.timeoutMs ?? 1500;
  const intervalMs = options?.intervalMs ?? 150;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const redirectUrl = await getGoogleOAuthReplayRedirect(state);
    if (redirectUrl) return redirectUrl;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

export function makeState() {
  return randomBytes(16).toString('hex');
}

export function setOAuthCookies(
  event: any,
  state: string,
  redirectUri?: string,
  locale?: string
) {
  const stateCookieName = getCookieName(OAUTH_STATE_COOKIE_NAME, isProd);
  const redirectCookieName = getCookieName(OAUTH_REDIRECT_COOKIE_NAME, isProd);
  const langCookieName = getCookieName(LANG_COOKIE_NAME, isProd);

  // OAuth cookies всегда используют sameSite: 'lax' (даже в production)
  setCookie(event, stateCookieName, state, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  if (redirectUri) {
    setCookie(event, redirectCookieName, redirectUri, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    });
  }
  if (locale) {
    setCookie(event, langCookieName, locale, {
      httpOnly: false,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 3600,
    });
  }
}

// export function consumeOAuthCookies(event: any) {
//   const state = getCookie(event, STATE_COOKIE);
//   const redirect = getCookie(event, REDIR_COOKIE) || '/';
//   const locale = getCookie(event, LOCALE_COOKIE) || undefined;
//   deleteCookie(event, STATE_COOKIE, { path: '/' });
//   deleteCookie(event, REDIR_COOKIE, { path: '/' });
//   return { state, redirect, locale };
// }
export function consumeOAuthCookies(event: any) {
  const stateCookieName = getCookieName(OAUTH_STATE_COOKIE_NAME, isProd);
  const redirectCookieName = getCookieName(OAUTH_REDIRECT_COOKIE_NAME, isProd);
  const langCookieName = getCookieName(LANG_COOKIE_NAME, isProd);

  const state = getCookie(event, stateCookieName);
  const raw = getCookie(event, redirectCookieName);
  const redirect = raw ? decodeURIComponent(raw) : '/';
  const locale = getCookie(event, langCookieName) || undefined;

  deleteCookie(event, stateCookieName, { path: '/' });
  deleteCookie(event, redirectCookieName, { path: '/' });
  return { state, redirect, locale };
}

export async function upsertUserWithOAuth(
  event: any,
  provider: Provider,
  profile: {
    providerUserId: string;
    email?: string | null;
    emailVerified?: boolean;
    name?: string | null;
    avatarUrl?: string | null;
    locale?: string | null;
    marketingAttribution?: MarketingAttributionDto | null;
  }
): Promise<OAuthResult> {
  const acc = await db
    .select()
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, provider),
        eq(oauthAccounts.providerUserId, profile.providerUserId)
      )
    )
    .limit(1);

  let userId: number | null = null;
  let isNewUser = false;
  const normalizedEmail = profile.email ? normalizeEmail(profile.email) : null;
  const originalEmail = profile.email ? profile.email.trim().toLowerCase() : null;
  const emailOriginalIfDiffers = originalEmail && normalizedEmail && originalEmail !== normalizedEmail ? originalEmail : null;

  if (acc.length) {
    userId = acc[0].userId as number;
    await db
      .update(oauthAccounts)
      .set({
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      })
      .where(eq(oauthAccounts.id, acc[0].id));

    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (existingUser.length && existingUser[0].deletedAt) {
      await db
        .update(users)
        .set({ deletedAt: null, deletionRequestedAt: null })
        .where(eq(users.id, userId));
    }

    if (!existingUser.length) {
      if (!normalizedEmail) {
        throw createError({
          statusCode: 400,
          statusMessage: 'OAuth не вернул email',
        });
      }

      const userByEmail = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (userByEmail.length) {
        if (userByEmail[0].deletedAt) {
          await db
            .update(users)
            .set({ deletedAt: null, deletionRequestedAt: null })
            .where(eq(users.id, userByEmail[0].id));
        }
        userId = userByEmail[0].id;
      } else {
        const [createdUser] = await db
          .insert(users)
          .values({
            email: normalizedEmail,
            emailOriginal: emailOriginalIfDiffers,
            emailVerifiedAt: profile.emailVerified ? new Date() : null,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            locale: profile.locale ?? null,
            ...buildLegalConsent(event),
          })
          .returning();
        userId = createdUser.id;
        isNewUser = true;
      }

      await db
        .update(oauthAccounts)
        .set({ userId: userId! })
        .where(eq(oauthAccounts.id, acc[0].id));
    }

    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (currentUser.length) {
      const current = currentUser[0];
      const updates: Partial<typeof users.$inferInsert> = {};
      if (!current.name && profile.name) updates.name = profile.name;
      if (!current.avatarUrl && profile.avatarUrl)
        updates.avatarUrl = profile.avatarUrl;
      if (!current.emailVerifiedAt && profile.emailVerified) {
        updates.emailVerifiedAt = new Date();
      }
      if (Object.keys(updates).length) {
        await db.update(users).set(updates).where(eq(users.id, userId!));
      }
    }

    try {
      const subscription = await activateTrialForUser(
        userId!,
        undefined,
        normalizedEmail
      );
      if (subscription) {
        console.log(
          `[OAuth] ✅ Ensured subscription exists for user ${userId}: planId=${subscription.planId}, paymentStatus=${subscription.paymentStatus}`
        );
      } else {
        console.warn(
          `[OAuth] ⚠️ activateTrialForUser returned null for user ${userId}`
        );
      }
    } catch (error: any) {
      console.error(
        `[OAuth] ❌ Failed to ensure subscription for user ${userId}:`,
        error
      );
      console.error(`[OAuth] Error details:`, error?.message, error?.stack);
    }
  } else {
    if (!normalizedEmail) {
      throw createError({
        statusCode: 400,
        statusMessage: 'OAuth не вернул email',
      });
    }

    const u = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (u.length) {
      const linkingToken = generateLinkingToken();
      await storeLinkingData(linkingToken, {
        provider,
        providerUserId: profile.providerUserId,
        email: normalizedEmail,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        locale: profile.locale ?? null,
        marketingAttribution: profile.marketingAttribution ?? null,
      });
      return {
        status: 'linking_required',
        linkingToken,
        email: normalizedEmail,
      };
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        emailOriginal: emailOriginalIfDiffers,
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        locale: profile.locale ?? null,
        sceneSettings: getDefaultUserSceneSettings(),
        ...buildLegalConsent(event),
      })
      .returning();
    userId = createdUser.id;
    isNewUser = true;

    try {
      const subscription = await activateTrialForUser(
        userId,
        undefined,
        normalizedEmail
      );
      if (subscription) {
        console.log(
          `[OAuth] ✅ Subscription created for new user ${userId}: planId=${subscription.planId}, paymentStatus=${subscription.paymentStatus}`
        );
      } else {
        console.warn(
          `[OAuth] ⚠️ activateTrialForUser returned null for new user ${userId}`
        );
      }
    } catch (error: any) {
      console.error(
        `[OAuth] ❌ Failed to activate trial/subscription for new user ${userId}:`,
        error
      );
      console.error(`[OAuth] Error details:`, error?.message, error?.stack);
    }

    await db.insert(oauthAccounts).values({
      userId: userId!,
      provider,
      providerUserId: profile.providerUserId,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  }

  await createSession(event, userId!, profile.locale ?? undefined);

  await recordUserMarketingAttributionSafe({
    userId: userId!,
    touchpoint: isNewUser ? 'oauth_signup' : 'oauth_login',
    authProvider: provider,
    marketingAttribution: profile.marketingAttribution,
  });

  if (isNewUser) {
    dispatchUserRegisteredEvent({
      userId: userId!,
      method: provider,
    });
  }

  return { status: 'linked', userId: userId!, isNewUser };
}

export async function postForm<T = any>(
  url: string,
  data: Record<string, string>
) {
  return await $fetch<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data).toString(),
  });
}

export function need(value?: any, code = 400, message = 'Bad request') {
  if (!value) throw createError({ statusCode: code, statusMessage: message });
  return value;
}
