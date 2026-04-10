import { and, asc, eq, gt, lte } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { billingAccessGrants } from '@/server/infrastructure/db/schema';
import {
  type MentalaPaidPlanId,
  type MentalaPlanId,
  PLAN_RANK,
} from './promo.shared';
import { handleMissingPromoInfrastructureError } from './promo-infrastructure-compat.service';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

export async function getActiveAccessGrantForUser(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  let rows: Awaited<ReturnType<typeof client.select>>;
  try {
    rows = await client
      .select()
      .from(billingAccessGrants)
      .where(
        and(
          eq(billingAccessGrants.userId, params.userId),
          eq(billingAccessGrants.status, 'active'),
          lte(billingAccessGrants.startsAt, now),
          gt(billingAccessGrants.endsAt, now)
        )
      )
      .orderBy(asc(billingAccessGrants.startsAt));
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-access-grants:get-active'
      )
    ) {
      return null;
    }

    throw error;
  }

  const ranked = rows
    .filter((row) => row.planId === 'pro' || row.planId === 'premium')
    .sort((left, right) => {
      const rankDiff =
        PLAN_RANK[right.planId as MentalaPlanId] -
        PLAN_RANK[left.planId as MentalaPlanId];
      if (rankDiff !== 0) return rankDiff;
      return right.endsAt.getTime() - left.endsAt.getTime();
    });

  return ranked[0] ?? null;
}

export async function listActiveAccessGrantsForUser(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  try {
    return await client
      .select()
      .from(billingAccessGrants)
      .where(
        and(
          eq(billingAccessGrants.userId, params.userId),
          eq(billingAccessGrants.status, 'active'),
          lte(billingAccessGrants.startsAt, now),
          gt(billingAccessGrants.endsAt, now)
        )
      )
      .orderBy(asc(billingAccessGrants.endsAt));
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-access-grants:list-active'
      )
    ) {
      return [];
    }

    throw error;
  }
}

export async function resolveEffectiveEntitlementsPlanWithAccessGrant(params: {
  userId: number;
  basePlanId: MentalaPlanId;
  now?: Date;
  tx?: any;
}): Promise<{
  planId: MentalaPlanId;
  activeAccessGrant: {
    id: number;
    planId: MentalaPaidPlanId;
    startsAt: Date;
    endsAt: Date;
    metadata: unknown;
  } | null;
}> {
  const activeAccessGrant = await getActiveAccessGrantForUser({
    userId: params.userId,
    now: params.now,
    tx: params.tx,
  });

  if (!activeAccessGrant) {
    return {
      planId: params.basePlanId,
      activeAccessGrant: null,
    };
  }

  const overlayPlanId = activeAccessGrant.planId as MentalaPaidPlanId;

  if (PLAN_RANK[overlayPlanId] < PLAN_RANK[params.basePlanId]) {
    return {
      planId: params.basePlanId,
      activeAccessGrant: null,
    };
  }

  return {
    planId: overlayPlanId,
    activeAccessGrant: {
      id: activeAccessGrant.id,
      planId: overlayPlanId,
      startsAt: activeAccessGrant.startsAt,
      endsAt: activeAccessGrant.endsAt,
      metadata: activeAccessGrant.metadata,
    },
  };
}
