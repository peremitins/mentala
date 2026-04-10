import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingCreditEntries,
  referralRedemptions,
  userReferralProfiles,
  users,
} from '@/server/infrastructure/db/schema';
import { roundCurrencyAmount } from './billing-credit.utils';

export type BillingCreditEntryType =
  | 'referral_referrer_reward'
  | 'payment_apply'
  | 'payment_restore'
  | 'subscription_credit_grant'
  | 'subscription_credit_restore'
  | 'manual_adjustment';

export type BillingCreditEntryStatus =
  | 'pending'
  | 'posted'
  | 'reversed'
  | 'revoked';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

function formatCurrencyAmount(value: number): string {
  return roundCurrencyAmount(value).toFixed(2);
}

function parsePositiveAmount(value: number): number {
  return Math.max(0, roundCurrencyAmount(value));
}

export async function releaseDueBillingCredits(params: {
  userId?: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  // UPDATE...RETURNING вместо SELECT→UPDATE: обе операции атомарны в рамках
  // одного SQL-выражения. Два конкурентных вызова не смогут оба "захватить"
  // одну и ту же строку — побеждает первый UPDATE, второй получает пустой
  // RETURNING и не увеличивает billingCredit дважды.
  const releasedRows = await client
    .update(billingCreditEntries)
    .set({
      status: 'posted',
      postedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(billingCreditEntries.status, 'pending'),
        lte(billingCreditEntries.availableAt, now),
        params.userId
          ? eq(billingCreditEntries.userId, params.userId)
          : sql`true`
      )
    )
    .returning({
      id: billingCreditEntries.id,
      userId: billingCreditEntries.userId,
      amount: billingCreditEntries.amount,
      entryType: billingCreditEntries.entryType,
    });

  if (!releasedRows.length) {
    return [];
  }

  const groupedByUser = new Map<
    number,
    {
      totalAmount: number;
      releasedReferralRewards: number;
    }
  >();

  for (const row of releasedRows) {
    const current = groupedByUser.get(row.userId) ?? {
      totalAmount: 0,
      releasedReferralRewards: 0,
    };
    current.totalAmount += Number(row.amount || 0);
    if (row.entryType === 'referral_referrer_reward') {
      current.releasedReferralRewards += 1;
    }
    groupedByUser.set(row.userId, current);
  }

  for (const [userId, item] of groupedByUser.entries()) {
    const amount = parsePositiveAmount(item.totalAmount);
    if (amount > 0) {
      await client
        .update(users)
        .set({
          billingCredit: sql`${users.billingCredit} + ${formatCurrencyAmount(amount)}`,
          updatedAt: now,
        })
        .where(eq(users.id, userId));
    }

    if (item.releasedReferralRewards > 0) {
      await client
        .update(userReferralProfiles)
        .set({
          pendingRewardsCount: sql`greatest(${userReferralProfiles.pendingRewardsCount} - ${item.releasedReferralRewards}, 0)`,
          updatedAt: now,
        })
        .where(eq(userReferralProfiles.userId, userId));
    }
  }

  return releasedRows;
}

export async function listPendingReferralCreditEntriesForUser(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  await releaseDueBillingCredits({
    userId: params.userId,
    now,
    tx: client,
  });

  return await client
    .select()
    .from(billingCreditEntries)
    .where(
      and(
        eq(billingCreditEntries.userId, params.userId),
        eq(billingCreditEntries.entryType, 'referral_referrer_reward'),
        eq(billingCreditEntries.status, 'pending')
      )
    )
    .orderBy(billingCreditEntries.availableAt);
}

export async function createPendingBillingCreditEntry(params: {
  userId: number;
  amount: number;
  availableAt: Date;
  entryType: BillingCreditEntryType;
  sourceReferralRedemptionId?: number | null;
  sourceSubscriptionId?: number | null;
  sourcePaymentId?: string | null;
  metadata?: Record<string, unknown>;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const amount = parsePositiveAmount(params.amount);

  if (amount <= 0) {
    return null;
  }

  const [created] = await client
    .insert(billingCreditEntries)
    .values({
      userId: params.userId,
      entryType: params.entryType,
      status: 'pending',
      amount: formatCurrencyAmount(amount),
      availableAt: params.availableAt,
      postedAt: null,
      reversedAt: null,
      sourceReferralRedemptionId: params.sourceReferralRedemptionId ?? null,
      sourceSubscriptionId: params.sourceSubscriptionId ?? null,
      sourcePaymentId: params.sourcePaymentId ?? null,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function createPostedBillingCreditEntry(params: {
  userId: number;
  amount: number;
  entryType: BillingCreditEntryType;
  sourceReferralRedemptionId?: number | null;
  sourceSubscriptionId?: number | null;
  sourcePaymentId?: string | null;
  metadata?: Record<string, unknown>;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const amount = roundCurrencyAmount(params.amount);

  if (amount === 0) {
    return null;
  }

  const [created] = await client
    .insert(billingCreditEntries)
    .values({
      userId: params.userId,
      entryType: params.entryType,
      status: 'posted',
      amount: amount.toFixed(2),
      availableAt: amount > 0 ? now : null,
      postedAt: now,
      reversedAt: null,
      sourceReferralRedemptionId: params.sourceReferralRedemptionId ?? null,
      sourceSubscriptionId: params.sourceSubscriptionId ?? null,
      sourcePaymentId: params.sourcePaymentId ?? null,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export async function applyAvailableBillingCredit(params: {
  userId: number;
  amount: number;
  sourceSubscriptionId?: number | null;
  metadata?: Record<string, unknown>;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const requestedAmount = parsePositiveAmount(params.amount);

  if (requestedAmount <= 0) {
    return {
      appliedAmount: 0,
      finalAmount: 0,
      entryId: null as number | null,
    };
  }

  await releaseDueBillingCredits({
    userId: params.userId,
    now,
    tx: client,
  });

  const [userRow] = await client
    .select({
      billingCredit: users.billingCredit,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const availableAmount = parsePositiveAmount(
    Number(userRow?.billingCredit || 0)
  );
  const appliedAmount = Math.min(availableAmount, requestedAmount);
  if (appliedAmount <= 0) {
    return {
      appliedAmount: 0,
      finalAmount: requestedAmount,
      entryId: null as number | null,
    };
  }

  await client
    .update(users)
    .set({
      billingCredit: sql`${users.billingCredit} - ${formatCurrencyAmount(appliedAmount)}`,
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));

  const entry = await createPostedBillingCreditEntry({
    userId: params.userId,
    amount: -appliedAmount,
    entryType: 'payment_apply',
    sourceSubscriptionId: params.sourceSubscriptionId ?? null,
    metadata: params.metadata ?? {},
    now,
    tx: client,
  });

  return {
    appliedAmount,
    finalAmount: roundCurrencyAmount(requestedAmount - appliedAmount),
    entryId: entry?.id ?? null,
  };
}

export async function restoreAppliedBillingCredit(params: {
  userId: number;
  amount: number;
  sourceSubscriptionId?: number | null;
  sourcePaymentId?: string | null;
  entryType?: BillingCreditEntryType;
  metadata?: Record<string, unknown>;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const amount = parsePositiveAmount(params.amount);

  if (amount <= 0) {
    return null;
  }

  await client
    .update(users)
    .set({
      billingCredit: sql`${users.billingCredit} + ${formatCurrencyAmount(amount)}`,
      updatedAt: now,
    })
    .where(eq(users.id, params.userId));

  return await createPostedBillingCreditEntry({
    userId: params.userId,
    amount,
    entryType: params.entryType ?? 'payment_restore',
    sourceSubscriptionId: params.sourceSubscriptionId ?? null,
    sourcePaymentId: params.sourcePaymentId ?? null,
    metadata: params.metadata ?? {},
    now,
    tx: client,
  });
}

export async function revokeReferralBillingCreditEntry(params: {
  redemptionId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const [entry] = await client
    .select()
    .from(billingCreditEntries)
    .where(
      and(
        eq(
          billingCreditEntries.sourceReferralRedemptionId,
          params.redemptionId
        ),
        inArray(billingCreditEntries.status, ['pending', 'posted'])
      )
    )
    .limit(1);

  if (!entry) {
    return null;
  }

  // Запоминаем, был ли entry в pending до revoke: только pending-entry всё ещё
  // учитывается в userReferralProfiles.pendingRewardsCount. Если он уже posted,
  // то счётчик был декрементирован в releaseDueBillingCredits в момент релиза,
  // и повторный декремент исказит статистику (клэмп greatest защищает от ухода
  // в минус, но не от "тихого" рассинхрона с реальным количеством pending наград).
  const wasPending = entry.status === 'pending';

  if (wasPending) {
    await client
      .update(billingCreditEntries)
      .set({
        status: 'revoked',
        reversedAt: now,
        updatedAt: now,
      })
      .where(eq(billingCreditEntries.id, entry.id));
  } else {
    const amount = parsePositiveAmount(Number(entry.amount || 0));
    if (amount > 0) {
      await client
        .update(users)
        .set({
          billingCredit: sql`greatest(${users.billingCredit} - ${formatCurrencyAmount(amount)}, 0)`,
          updatedAt: now,
        })
        .where(eq(users.id, entry.userId));
    }

    await client
      .update(billingCreditEntries)
      .set({
        status: 'reversed',
        reversedAt: now,
        updatedAt: now,
      })
      .where(eq(billingCreditEntries.id, entry.id));
  }

  if (wasPending) {
    await client
      .update(userReferralProfiles)
      .set({
        pendingRewardsCount: sql`greatest(${userReferralProfiles.pendingRewardsCount} - 1, 0)`,
        updatedAt: now,
      })
      .where(eq(userReferralProfiles.userId, entry.userId));
  }

  await client
    .update(referralRedemptions)
    .set({
      updatedAt: now,
    })
    .where(eq(referralRedemptions.id, params.redemptionId));

  return entry;
}
