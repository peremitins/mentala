import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  externalAuthTokens,
  securityEvents,
} from '@/server/infrastructure/db/schema';

export type ExternalSessionPurpose = 'browser_handoff' | 'payment_return';

const BROWSER_HANDOFF_MIN_TTL_SECONDS = 60;
const BROWSER_HANDOFF_MAX_TTL_SECONDS = 120;
const BROWSER_HANDOFF_DEFAULT_TTL_SECONDS = 90;

const PAYMENT_RETURN_MIN_TTL_SECONDS = 5 * 60;
const PAYMENT_RETURN_MAX_TTL_SECONDS = 24 * 60 * 60;
const PAYMENT_RETURN_DEFAULT_TTL_SECONDS = 2 * 60 * 60;
const PAYMENT_RETURN_REUSE_WINDOW_SECONDS = 15 * 60;

type UaClass = 'ios' | 'android' | 'desktop' | 'unknown';

export type ExternalSessionConsumeErrorCode =
  | 'invalid_token'
  | 'expired_token'
  | 'reused_token'
  | 'high_risk_mismatch';

export class ExternalSessionConsumeError extends Error {
  code: ExternalSessionConsumeErrorCode;
  userId: number | null;

  constructor(
    code: ExternalSessionConsumeErrorCode,
    message: string,
    userId: number | null = null
  ) {
    super(message);
    this.code = code;
    this.userId = userId;
  }
}

function resolveTtlPolicy(purpose: ExternalSessionPurpose) {
  if (purpose === 'payment_return') {
    return {
      min: PAYMENT_RETURN_MIN_TTL_SECONDS,
      max: PAYMENT_RETURN_MAX_TTL_SECONDS,
      fallback: PAYMENT_RETURN_DEFAULT_TTL_SECONDS,
    };
  }

  return {
    min: BROWSER_HANDOFF_MIN_TTL_SECONDS,
    max: BROWSER_HANDOFF_MAX_TTL_SECONDS,
    fallback: BROWSER_HANDOFF_DEFAULT_TTL_SECONDS,
  };
}

function clampTtlSeconds(
  value: number | undefined,
  purpose: ExternalSessionPurpose
): number {
  const policy = resolveTtlPolicy(purpose);
  if (!Number.isFinite(value)) return policy.fallback;

  const rounded = Math.round(Number(value));
  if (rounded < policy.min) return policy.min;
  if (rounded > policy.max) return policy.max;
  return rounded;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function detectUaClass(userAgent: string | null): UaClass {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad|iPod|iOS/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Windows|Linux|X11/i.test(userAgent)) return 'desktop';
  return 'unknown';
}

function evaluateFingerprintRisk(params: {
  issuedIp: string | null;
  issuedUserAgent: string | null;
  currentIp: string | null;
  currentUserAgent: string | null;
}) {
  const ipMismatch = Boolean(
    params.issuedIp && params.currentIp && params.issuedIp !== params.currentIp
  );

  const issuedUaClass = detectUaClass(params.issuedUserAgent);
  const currentUaClass = detectUaClass(params.currentUserAgent);
  const uaMismatch =
    issuedUaClass !== 'unknown' &&
    currentUaClass !== 'unknown' &&
    issuedUaClass !== currentUaClass;

  // Риск-ориентированный режим: одиночный UA mismatch не блокирует flow.
  const highRiskMismatch = ipMismatch && uaMismatch;

  return {
    ipMismatch,
    uaMismatch,
    highRiskMismatch,
    issuedUaClass,
    currentUaClass,
  };
}

async function logSecurityEvent(params: {
  userId: number | null;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
  tx?: any;
}) {
  const client = params.tx ?? db;
  await client.insert(securityEvents).values({
    userId: params.userId,
    eventType: params.eventType,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    metadata: params.metadata || {},
  });
}

export async function createExternalSessionTransferToken(params: {
  userId: number;
  ipAddress: string | null;
  userAgent: string | null;
  ttlSeconds?: number;
  purpose?: ExternalSessionPurpose;
}) {
  const purpose = params.purpose || 'browser_handoff';
  const ttlSeconds = clampTtlSeconds(params.ttlSeconds, purpose);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);

  await db.insert(externalAuthTokens).values({
    userId: params.userId,
    tokenHash,
    expiresAt,
    createdIp: params.ipAddress,
    createdUserAgent: params.userAgent,
  });

  return {
    token,
    expiresAt,
    ttlSeconds,
  };
}

export async function consumeExternalSessionTransferToken(params: {
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  purpose?: ExternalSessionPurpose;
}): Promise<{ userId: number }> {
  const tokenHash = hashToken(params.token);
  const now = new Date();
  const purpose = params.purpose || 'browser_handoff';

  const consumeResult = await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: externalAuthTokens.id,
        userId: externalAuthTokens.userId,
        expiresAt: externalAuthTokens.expiresAt,
        consumedAt: externalAuthTokens.consumedAt,
        createdIp: externalAuthTokens.createdIp,
        createdUserAgent: externalAuthTokens.createdUserAgent,
        consumedIp: externalAuthTokens.consumedIp,
        consumedUserAgent: externalAuthTokens.consumedUserAgent,
      })
      .from(externalAuthTokens)
      .where(eq(externalAuthTokens.tokenHash, tokenHash))
      .limit(1);

    if (!existing.length) {
      await logSecurityEvent({
        userId: null,
        eventType: 'external_auth_invalid',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenHashPrefix: tokenHash.slice(0, 12),
        },
        tx,
      });
      return { kind: 'invalid_token' as const, userId: null };
    }

    const row = existing[0];
    if (!row) {
      return { kind: 'invalid_token' as const, userId: null };
    }

    if (row.consumedAt) {
      if (purpose === 'payment_return') {
        const replayAgeMs = now.getTime() - row.consumedAt.getTime();
        const replayAllowedByAge =
          replayAgeMs >= 0 &&
          replayAgeMs <= PAYMENT_RETURN_REUSE_WINDOW_SECONDS * 1000;
        const replayRisk = evaluateFingerprintRisk({
          issuedIp: row.consumedIp || row.createdIp,
          issuedUserAgent: row.consumedUserAgent || row.createdUserAgent,
          currentIp: params.ipAddress,
          currentUserAgent: params.userAgent,
        });

        // Для payment-return допускаем повторный consume в коротком окне:
        // это защищает от дублей GET во внешнем браузере после редиректа YooKassa.
        if (replayAllowedByAge && !replayRisk.highRiskMismatch) {
          await logSecurityEvent({
            userId: row.userId,
            eventType: 'external_auth_reused_allowed',
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
            metadata: {
              tokenId: row.id,
              purpose,
              consumedAt: row.consumedAt.toISOString(),
              replayAgeMs,
              replayIssuedUaClass: replayRisk.issuedUaClass,
              replayCurrentUaClass: replayRisk.currentUaClass,
            },
            tx,
          });

          return { kind: 'ok' as const, userId: row.userId };
        }
      }

      await logSecurityEvent({
        userId: row.userId,
        eventType: 'external_auth_reused',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenId: row.id,
          consumedAt: row.consumedAt.toISOString(),
        },
        tx,
      });
      return { kind: 'reused_token' as const, userId: row.userId };
    }

    if (row.expiresAt <= now) {
      await logSecurityEvent({
        userId: row.userId,
        eventType: 'external_auth_expired',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenId: row.id,
          expiresAt: row.expiresAt.toISOString(),
        },
        tx,
      });
      return { kind: 'expired_token' as const, userId: row.userId };
    }

    const risk = evaluateFingerprintRisk({
      issuedIp: row.createdIp,
      issuedUserAgent: row.createdUserAgent,
      currentIp: params.ipAddress,
      currentUserAgent: params.userAgent,
    });

    if (risk.highRiskMismatch) {
      if (purpose === 'payment_return') {
        await logSecurityEvent({
          userId: row.userId,
          eventType: 'external_auth_high_risk_allowed',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          metadata: {
            tokenId: row.id,
            purpose,
            issuedUaClass: risk.issuedUaClass,
            currentUaClass: risk.currentUaClass,
            ipMismatch: risk.ipMismatch,
            uaMismatch: risk.uaMismatch,
          },
          tx,
        });
      } else {
        await logSecurityEvent({
          userId: row.userId,
          eventType: 'external_auth_high_risk',
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          metadata: {
            tokenId: row.id,
            issuedUaClass: risk.issuedUaClass,
            currentUaClass: risk.currentUaClass,
            ipMismatch: risk.ipMismatch,
            uaMismatch: risk.uaMismatch,
          },
          tx,
        });
        return { kind: 'high_risk_mismatch' as const, userId: row.userId };
      }
    }

    const consumed = await tx
      .update(externalAuthTokens)
      .set({
        consumedAt: now,
        consumedIp: params.ipAddress,
        consumedUserAgent: params.userAgent,
      })
      .where(
        and(
          eq(externalAuthTokens.id, row.id),
          isNull(externalAuthTokens.consumedAt),
          gt(externalAuthTokens.expiresAt, now)
        )
      )
      .returning({
        id: externalAuthTokens.id,
        userId: externalAuthTokens.userId,
      });

    if (!consumed.length) {
      await logSecurityEvent({
        userId: row.userId,
        eventType: 'external_auth_reused',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenId: row.id,
          reason: 'race_condition_consume',
        },
        tx,
      });
      return { kind: 'reused_token' as const, userId: row.userId };
    }

    if (risk.uaMismatch) {
      await logSecurityEvent({
        userId: row.userId,
        eventType: 'external_auth_ua_mismatch',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenId: row.id,
          issuedUaClass: risk.issuedUaClass,
          currentUaClass: risk.currentUaClass,
        },
        tx,
      });
    }

    if (risk.ipMismatch) {
      await logSecurityEvent({
        userId: row.userId,
        eventType: 'external_auth_ip_mismatch',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: {
          tokenId: row.id,
          issuedIpPresent: !!row.createdIp,
          currentIpPresent: !!params.ipAddress,
        },
        tx,
      });
    }

    return { kind: 'ok' as const, userId: row.userId };
  });

  if (consumeResult.kind !== 'ok') {
    throw new ExternalSessionConsumeError(
      consumeResult.kind,
      `External session consume failed: ${consumeResult.kind}`,
      consumeResult.userId
    );
  }

  return { userId: consumeResult.userId };
}
