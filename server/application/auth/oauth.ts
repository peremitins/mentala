import { randomBytes } from 'node:crypto';
import { setCookie, getCookie, deleteCookie, createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { users, oauthAccounts } from '@/server/infrastructure/db/schema';
import { eq, and } from 'drizzle-orm';
import { createSession } from './session';
import { activateTrialForUser } from '@/server/application/subscriptions/trial.service';
import {
  generateLinkingToken,
  storeLinkingData,
} from '@/server/application/auth/oauth-linking';
import { normalizeEmail } from '@/server/application/auth/verification';
import {
  OAUTH_STATE_COOKIE_NAME,
  OAUTH_REDIRECT_COOKIE_NAME,
  LANG_COOKIE_NAME,
  getCookieName,
} from './cookie-names';

const isProd = process.env.NODE_ENV === 'production';

export type Provider = 'google' | 'vk';
export type OAuthResult =
  | { status: 'linked'; userId: number; isNewUser: boolean }
  | { status: 'linking_required'; linkingToken: string; email: string };

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
            emailVerifiedAt: profile.emailVerified ? new Date() : null,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            locale: profile.locale ?? null,
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
      const subscription = await activateTrialForUser(userId!);
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
        emailVerifiedAt: profile.emailVerified ? new Date() : null,
        name: profile.name ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        locale: profile.locale ?? null,
      })
      .returning();
    userId = createdUser.id;
    isNewUser = true;

    try {
      const subscription = await activateTrialForUser(userId);
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
