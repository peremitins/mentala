import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingDiscountGrants,
  referralProgramSettings,
  referralRedemptions,
  userReferralProfiles,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import {
  AUTO_ACCESS_CODE_PREFIX,
  buildUniqueAccessCode,
} from '@/server/application/promo-codes/access-code.service';
import {
  createPendingBillingCreditEntry,
  listPendingReferralCreditEntriesForUser,
  revokeReferralBillingCreditEntry,
} from '@/server/application/subscriptions/billing-credit.service';
import { ensureGeneratedRecord } from './referral-profile.persistence';
import {
  addDays,
  roundCurrencyAmount,
  resolveDefaultReferralCreditHoldDays,
} from '@/server/application/subscriptions/billing-credit.utils';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

async function findReferralProfileByUserId(params: {
  userId: number;
  tx?: any;
}) {
  const client = resolveDbClient(params.tx);
  const rows = await client
    .select()
    .from(userReferralProfiles)
    .where(eq(userReferralProfiles.userId, params.userId))
    .limit(1);

  return rows[0] ?? null;
}

export function buildDefaultReferralProgramSettings(params?: {
  enabled?: boolean;
}) {
  return {
    enabled: params?.enabled ?? true,
    inviteePercent: 20,
    referrerPercent: 20,
    inviteeRewardValidityDays: 30,
    creditHoldDays: resolveDefaultReferralCreditHoldDays(),
    inviteeTargetPlanScope: 'any_paid' as const,
    inviteeTargetPeriodScope: 'any' as const,
  };
}

export async function getReferralProgramSettings(params?: { tx?: any }) {
  const client = resolveDbClient(params?.tx);

  const rows = await client
    .select()
    .from(referralProgramSettings)
    .where(eq(referralProgramSettings.id, 'default'))
    .limit(1);

  if (rows[0]) {
    return rows[0];
  }

  const defaults = buildDefaultReferralProgramSettings({
    enabled: true,
  });
  const inserted = await client
    .insert(referralProgramSettings)
    .values({
      id: 'default',
      ...defaults,
    })
    .onConflictDoNothing({
      target: referralProgramSettings.id,
    })
    .returning();

  if (inserted[0]) {
    return inserted[0];
  }

  const racedRows = await client
    .select()
    .from(referralProgramSettings)
    .where(eq(referralProgramSettings.id, 'default'))
    .limit(1);

  if (racedRows[0]) {
    return racedRows[0];
  }

  throw new Error('Не удалось загрузить настройки referral-программы');
}

export async function updateReferralProgramSettings(params: {
  values: Partial<{
    enabled: boolean;
    inviteePercent: number;
    referrerPercent: number;
    inviteeRewardValidityDays: number;
    creditHoldDays: number;
    inviteeTargetPlanScope: 'any_paid' | 'pro' | 'premium';
    inviteeTargetPeriodScope: 'any' | 'month' | 'year';
  }>;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  await getReferralProgramSettings();

  const [updated] = await db
    .update(referralProgramSettings)
    .set({
      ...params.values,
      updatedAt: now,
    })
    .where(eq(referralProgramSettings.id, 'default'))
    .returning();

  return updated;
}

export async function ensureReferralProfile(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  return await ensureGeneratedRecord({
    attempts: 10,
    exhaustedMessage: 'Не удалось сгенерировать referral code',
    findExisting: async () =>
      await findReferralProfileByUserId({
        userId: params.userId,
        tx: client,
      }),
    buildInsertValue: async () => {
      const code = await buildUniqueAccessCode({
        prefix: AUTO_ACCESS_CODE_PREFIX,
        excludeReferralUserId: params.userId,
        tx: client,
      });

      return {
        userId: params.userId,
        code,
        successfulInvitesCount: 0,
        pendingRewardsCount: 0,
        blocked: false,
        createdAt: now,
        updatedAt: now,
      };
    },
    insertValue: async (value) => {
      const inserted = await client
        .insert(userReferralProfiles)
        .values(value)
        .onConflictDoNothing()
        .returning();

      return inserted[0] ?? null;
    },
  });
}

export async function getReferralSummary(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const program = await getReferralProgramSettings({ tx: client });
  const profile = await ensureReferralProfile({
    userId: params.userId,
    now,
    tx: client,
  });
  const [pendingCreditEntries, userRows] = await Promise.all([
    listPendingReferralCreditEntriesForUser({
      userId: params.userId,
      now,
      tx: client,
    }),
    client
      .select({
        billingCredit: users.billingCredit,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1),
  ]);

  return {
    program,
    profile,
    pendingCreditEntries,
    availableBillingCredit: Number(userRows[0]?.billingCredit || 0),
    successfulInvitesCount: Number(profile.successfulInvitesCount || 0),
    pendingRewardsCount: pendingCreditEntries.length,
  };
}

export async function hasReferralEligiblePaidHistory(params: {
  userId: number;
  tx?: any;
}) {
  const client = resolveDbClient(params.tx);
  const rows = await client
    .select({
      id: userSubscriptions.id,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, params.userId),
        inArray(userSubscriptions.paymentStatus, ['active', 'expired']),
        inArray(userSubscriptions.planId, ['pro', 'premium'])
      )
    )
    .limit(1);

  return Boolean(rows[0]);
}

export async function processReferralRewardsAfterPurchase(params: {
  userId: number;
  paymentId?: string | null;
  qualifyingCapturedAmount: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const qualifyingCapturedAmount = roundCurrencyAmount(
    params.qualifyingCapturedAmount
  );

  if (qualifyingCapturedAmount <= 0) {
    return null;
  }

  return await db.transaction(async (tx) => {
    const [redemption] = await tx
      .select()
      .from(referralRedemptions)
      .where(
        and(
          eq(referralRedemptions.inviteeUserId, params.userId),
          eq(referralRedemptions.status, 'pending_conversion')
        )
      )
      .orderBy(desc(referralRedemptions.redeemedAt))
      .limit(1);

    if (!redemption) {
      return null;
    }

    const program = await getReferralProgramSettings({ tx });
    const referrerCreditAmount = roundCurrencyAmount(
      (qualifyingCapturedAmount * Number(program.referrerPercent)) / 100
    );
    const creditHoldDays = Math.max(0, Number(program.creditHoldDays ?? 0));
    const creditAvailableAt = addDays(now, creditHoldDays);

    // Важно: сначала UPDATE конверсии с возвратом affected rows.
    // Только если мы реально перевели redemption из pending_conversion
    // в completed — выпускаем pending credit entry. Иначе при параллельных
    // webhook-ретраях yookassa мы бы получили дубликат pending credit entry
    // (INSERT закоммитился бы, а UPDATE вернул null во втором вызове).
    const updatedRows = await tx
      .update(referralRedemptions)
      .set({
        status: 'completed',
        convertedAt: now,
        rewardIssuedAt: referrerCreditAmount > 0 ? now : null,
        metadata: {
          ...(redemption.metadata as Record<string, unknown>),
          paymentId: params.paymentId ?? null,
          rewardKind: 'billing_credit',
          referrerCreditAmount,
          creditAvailableAt:
            referrerCreditAmount > 0 ? creditAvailableAt.toISOString() : null,
          qualifyingCapturedAmount,
        },
        updatedAt: now,
      })
      .where(
        and(
          eq(referralRedemptions.id, redemption.id),
          eq(referralRedemptions.status, 'pending_conversion')
        )
      )
      .returning({ id: referralRedemptions.id });

    if (!updatedRows[0]) {
      return null;
    }

    const pendingCreditEntry =
      referrerCreditAmount > 0
        ? await createPendingBillingCreditEntry({
            userId: redemption.referrerUserId,
            amount: referrerCreditAmount,
            availableAt: creditAvailableAt,
            entryType: 'referral_referrer_reward',
            sourceReferralRedemptionId: redemption.id,
            metadata: {
              sourceLabel: 'Реферальная награда',
              inviteeUserId: redemption.inviteeUserId,
              qualifyingCapturedAmount,
            },
            now,
            tx,
          })
        : null;

    await tx
      .update(userReferralProfiles)
      .set({
        successfulInvitesCount: sql`${userReferralProfiles.successfulInvitesCount} + 1`,
        pendingRewardsCount: sql`${userReferralProfiles.pendingRewardsCount} + ${pendingCreditEntry ? 1 : 0}`,
        lastRewardIssuedAt: pendingCreditEntry ? now : undefined,
        updatedAt: now,
      })
      .where(eq(userReferralProfiles.userId, redemption.referrerUserId));

    return {
      redemptionId: redemption.id,
      referrerCreditEntryId: pendingCreditEntry?.id ?? null,
      rewardIssued: Boolean(pendingCreditEntry),
    };
  });
}

export async function revokeReferralRewardsByRedemptionId(params: {
  redemptionId: number;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  return await db.transaction(async (tx) => {
    const [redemption] = await tx
      .select()
      .from(referralRedemptions)
      .where(eq(referralRedemptions.id, params.redemptionId))
      .limit(1);

    if (!redemption) {
      return null;
    }

    const grantIds = [redemption.inviteeRewardGrantId].filter(
      (value): value is number => Number.isFinite(Number(value))
    );

    if (grantIds.length > 0) {
      await tx
        .update(billingDiscountGrants)
        .set({
          status: 'revoked',
          reservationKey: null,
          reservedAt: null,
          updatedAt: now,
        })
        .where(inArray(billingDiscountGrants.id, grantIds));
    }

    await revokeReferralBillingCreditEntry({
      redemptionId: redemption.id,
      now,
      tx,
    });

    const [updated] = await tx
      .update(referralRedemptions)
      .set({
        status: 'revoked',
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(referralRedemptions.id, params.redemptionId))
      .returning();

    return updated ?? null;
  });
}
