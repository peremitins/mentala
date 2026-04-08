import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { billingDiscountGrants } from '@/server/infrastructure/db/schema';
import type { BillingPeriod } from '@/server/application/subscriptions/price-calculator';
import {
  addDays,
  calculateDiscountedAmount,
  type MentalaPaidPlanId,
  type PromoBindingMode,
  type PromoDiscountGrantKind,
  getDiscountGrantPriority,
} from './promo.shared';
import { handleMissingPromoInfrastructureError } from './promo-infrastructure-compat.service';

const STALE_RESERVATION_WINDOW_MS = 2 * 60 * 60 * 1000;
// Namespace для pg_advisory_xact_lock: разделяем разные под-системы lock'ов
// по высокому 32-битному полю ключа, чтобы не конфликтовать с другими lock'ами.
const DISCOUNT_GRANT_ADVISORY_LOCK_NAMESPACE = 0x6d656e74; // 'ment'

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

// Сериализуем параллельные reserve/cleanup на уровне одного пользователя.
// Lock держится до конца транзакции, поэтому вызывать строго внутри tx.
async function acquireDiscountGrantUserLock(params: {
  userId: number;
  tx: any;
}) {
  await params.tx.execute(
    sql`select pg_advisory_xact_lock(${DISCOUNT_GRANT_ADVISORY_LOCK_NAMESPACE}::bigint, ${params.userId}::bigint)`
  );
}

function matchesTargetScope(params: {
  targetPlanScope: string | null;
  targetPeriodScope: string | null;
  planId: MentalaPaidPlanId;
  billingPeriod: BillingPeriod;
}) {
  const planMatches =
    params.targetPlanScope === 'any_paid' ||
    params.targetPlanScope === params.planId;
  const periodMatches =
    params.targetPeriodScope === 'any' ||
    params.targetPeriodScope === params.billingPeriod;

  return planMatches && periodMatches;
}

export async function cleanupDiscountGrantState(params: {
  now?: Date;
  userId?: number;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);
  const staleReservationBefore = new Date(
    now.getTime() - STALE_RESERVATION_WINDOW_MS
  );

  const scopeCondition = params.userId
    ? eq(billingDiscountGrants.userId, params.userId)
    : sql`true`;

  try {
    await client
      .update(billingDiscountGrants)
      .set({
        status: 'expired',
        reservationKey: null,
        reservedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          scopeCondition,
          inArray(billingDiscountGrants.status, ['active', 'reserved']),
          sql`${billingDiscountGrants.expiresAt} is not null`,
          lt(billingDiscountGrants.expiresAt, now)
        )
      );

    await client
      .update(billingDiscountGrants)
      .set({
        status: 'active',
        reservationKey: null,
        reservedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          scopeCondition,
          eq(billingDiscountGrants.status, 'reserved'),
          sql`${billingDiscountGrants.reservedAt} is not null`,
          lt(billingDiscountGrants.reservedAt, staleReservationBefore)
        )
      );
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-discount-grants:cleanup'
      )
    ) {
      return;
    }

    throw error;
  }
}

export async function listPendingDiscountGrantsForUser(params: {
  userId: number;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  await cleanupDiscountGrantState({
    userId: params.userId,
    now,
    tx: client,
  });

  try {
    return await client
      .select()
      .from(billingDiscountGrants)
      .where(
        and(
          eq(billingDiscountGrants.userId, params.userId),
          inArray(billingDiscountGrants.status, ['active', 'reserved']),
          or(
            isNull(billingDiscountGrants.expiresAt),
            sql`${billingDiscountGrants.expiresAt} > ${now}`
          )
        )
      );
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-discount-grants:list-pending'
      )
    ) {
      return [];
    }

    throw error;
  }
}

export async function reserveBestDiscountGrant(params: {
  userId: number;
  planId: MentalaPaidPlanId;
  billingPeriod: BillingPeriod;
  amount: number;
  reservationKey: string;
  provider?: 'yookassa';
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();

  // Ключевое изменение для защиты от гонок: reserve всегда выполняется
  // внутри транзакции с pg_advisory_xact_lock по user_id. Lock гарантирует,
  // что параллельные checkout'ы одного юзера будут последовательно проходить
  // через выбор и резервацию гранта, а условный UPDATE ниже страхует на случай,
  // если вдруг lock не сработал (старая инфраструктура / hot fix).
  const runReserve = async (tx: any) => {
    await acquireDiscountGrantUserLock({ userId: params.userId, tx });

    await cleanupDiscountGrantState({
      userId: params.userId,
      now,
      tx,
    });

    let rows: any[] = [];
    try {
      rows = await tx
        .select()
        .from(billingDiscountGrants)
        .where(
          and(
            eq(billingDiscountGrants.userId, params.userId),
            eq(billingDiscountGrants.provider, params.provider ?? 'yookassa'),
            inArray(billingDiscountGrants.status, ['active', 'reserved']),
            or(
              isNull(billingDiscountGrants.expiresAt),
              sql`${billingDiscountGrants.expiresAt} > ${now}`
            ),
            or(
              isNull(billingDiscountGrants.reservationKey),
              eq(billingDiscountGrants.reservationKey, params.reservationKey)
            )
          )
        );
    } catch (error) {
      if (
        handleMissingPromoInfrastructureError(
          error,
          'promo-discount-grants:reserve-best'
        )
      ) {
        return {
          grant: null,
          percent: 0,
          discountAmount: 0,
          finalAmount: Math.round(params.amount),
        };
      }

      throw error;
    }

    const candidates = rows
      .filter((row) =>
        matchesTargetScope({
          targetPlanScope: row.targetPlanScope,
          targetPeriodScope: row.targetPeriodScope,
          planId: params.planId,
          billingPeriod: params.billingPeriod,
        })
      )
      .sort((left, right) => {
        const priorityDiff =
          getDiscountGrantPriority({
            grantKind: left.grantKind as PromoDiscountGrantKind,
            bindingMode: left.bindingMode as PromoBindingMode,
          }) -
          getDiscountGrantPriority({
            grantKind: right.grantKind as PromoDiscountGrantKind,
            bindingMode: right.bindingMode as PromoBindingMode,
          });

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        return left.createdAt.getTime() - right.createdAt.getTime();
      });

    // Проходим кандидатов по порядку: первый, у которого UPDATE реально
    // сработал (т.е. запись всё ещё свободна или зарезервирована нашим же ключом),
    // становится победителем. Если кто-то опередил — пропускаем и идём дальше.
    for (const candidate of candidates) {
      if (
        candidate.status === 'reserved' &&
        candidate.reservationKey === params.reservationKey
      ) {
        const pricing = calculateDiscountedAmount({
          amount: params.amount,
          percent: Number(candidate.percent),
        });

        return {
          grant: candidate,
          percent: Number(candidate.percent),
          discountAmount: pricing.discountAmount,
          finalAmount: pricing.finalAmount,
        };
      }

      const updated = await tx
        .update(billingDiscountGrants)
        .set({
          status: 'reserved',
          reservationKey: params.reservationKey,
          reservedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(billingDiscountGrants.id, candidate.id),
            // Страхуемся от гонки: берём только если ещё свободен или наш же.
            or(
              isNull(billingDiscountGrants.reservationKey),
              eq(billingDiscountGrants.reservationKey, params.reservationKey)
            ),
            inArray(billingDiscountGrants.status, ['active', 'reserved'])
          )
        )
        .returning({ id: billingDiscountGrants.id });

      if (updated.length > 0) {
        const pricing = calculateDiscountedAmount({
          amount: params.amount,
          percent: Number(candidate.percent),
        });

        return {
          grant: {
            ...candidate,
            status: 'reserved',
            reservationKey: params.reservationKey,
            reservedAt: now,
          },
          percent: Number(candidate.percent),
          discountAmount: pricing.discountAmount,
          finalAmount: pricing.finalAmount,
        };
      }
    }

    return {
      grant: null,
      percent: 0,
      discountAmount: 0,
      finalAmount: Math.round(params.amount),
    };
  };

  if (params.tx) {
    return await runReserve(params.tx);
  }

  return await db.transaction(async (tx) => await runReserve(tx));
}

export async function finalizeDiscountGrantSuccess(params: {
  reservationKey: string;
  paymentId?: string | null;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  let rows: any[] = [];
  try {
    rows = await client
      .select()
      .from(billingDiscountGrants)
      .where(
        and(
          eq(billingDiscountGrants.reservationKey, params.reservationKey),
          eq(billingDiscountGrants.status, 'reserved')
        )
      )
      .limit(1);
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-discount-grants:finalize-success'
      )
    ) {
      return null;
    }

    throw error;
  }

  const grant = rows[0] ?? null;
  if (!grant) {
    return null;
  }

  await client
    .update(billingDiscountGrants)
    .set({
      status: 'applied',
      appliedAt: now,
      appliedPaymentId: params.paymentId ?? null,
      updatedAt: now,
    })
    .where(eq(billingDiscountGrants.id, grant.id));

  return grant;
}

export async function releaseDiscountGrantReservation(params: {
  reservationKey: string;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  try {
    await client
      .update(billingDiscountGrants)
      .set({
        status: sql`case when ${billingDiscountGrants.expiresAt} is not null and ${billingDiscountGrants.expiresAt} <= ${now} then 'expired' else 'active' end`,
        reservationKey: null,
        reservedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingDiscountGrants.reservationKey, params.reservationKey),
          eq(billingDiscountGrants.status, 'reserved')
        )
      );
  } catch (error) {
    if (
      handleMissingPromoInfrastructureError(
        error,
        'promo-discount-grants:release-reservation'
      )
    ) {
      return;
    }

    throw error;
  }
}

export async function createDiscountGrant(params: {
  userId: number;
  grantKind: PromoDiscountGrantKind;
  sourceCampaignId?: number | null;
  sourceRedemptionId?: number | null;
  sourceReferralRedemptionId?: number | null;
  bindingMode?: PromoBindingMode | null;
  percent: number;
  targetPlanScope?: 'any_paid' | 'pro' | 'premium';
  targetPeriodScope?: 'any' | 'month' | 'year';
  expiresAt?: Date | null;
  provider?: 'yookassa';
  metadata?: Record<string, unknown>;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  const [created] = await client
    .insert(billingDiscountGrants)
    .values({
      userId: params.userId,
      provider: params.provider ?? 'yookassa',
      grantKind: params.grantKind,
      sourceCampaignId: params.sourceCampaignId ?? null,
      sourceRedemptionId: params.sourceRedemptionId ?? null,
      sourceReferralRedemptionId: params.sourceReferralRedemptionId ?? null,
      bindingMode: params.bindingMode ?? 'none',
      targetPlanScope: params.targetPlanScope ?? 'any_paid',
      targetPeriodScope: params.targetPeriodScope ?? 'any',
      percent: params.percent,
      status: 'active',
      expiresAt: params.expiresAt ?? null,
      metadata: params.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export function buildDiscountGrantExpiryDate(params: {
  expiresInDays: number;
  now?: Date;
}) {
  return addDays(params.now ?? new Date(), params.expiresInDays);
}
