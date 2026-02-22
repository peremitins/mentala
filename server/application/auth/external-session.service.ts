import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  externalAuthTokens,
  securityEvents,
} from '@/server/infrastructure/db/schema';

const MIN_EXTERNAL_SESSION_TTL_SECONDS = 60;
const MAX_EXTERNAL_SESSION_TTL_SECONDS = 120;
const DEFAULT_EXTERNAL_SESSION_TTL_SECONDS = 90;

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

function clampTtlSeconds(value?: number): number {
  if (!Number.isFinite(value)) return DEFAULT_EXTERNAL_SESSION_TTL_SECONDS;
  const rounded = Math.round(Number(value));
  if (rounded < MIN_EXTERNAL_SESSION_TTL_SECONDS) {
    return MIN_EXTERNAL_SESSION_TTL_SECONDS;
  }
  if (rounded > MAX_EXTERNAL_SESSION_TTL_SECONDS) {
    return MAX_EXTERNAL_SESSION_TTL_SECONDS;
  }
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
}) {
  const ttlSeconds = clampTtlSeconds(params.ttlSeconds);
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
}): Promise<{ userId: number }> {
  const tokenHash = hashToken(params.token);
  const now = new Date();

  const consumeResult = await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: externalAuthTokens.id,
        userId: externalAuthTokens.userId,
        expiresAt: externalAuthTokens.expiresAt,
        consumedAt: externalAuthTokens.consumedAt,
        createdIp: externalAuthTokens.createdIp,
        createdUserAgent: externalAuthTokens.createdUserAgent,
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
