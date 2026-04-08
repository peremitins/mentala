import { createError } from 'h3';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  referralRedemptions,
  userReferralProfiles,
  users,
} from '@/server/infrastructure/db/schema';
import {
  buildDiscountGrantExpiryDate,
  createDiscountGrant,
} from '@/server/application/promo-codes/promo-discount-grants.service';
import {
  ensureReferralProfile,
  getReferralProgramSettings,
  hasReferralEligiblePaidHistory,
} from './referral-rewards.service';
import { normalizePromoCode } from '@/server/application/promo-codes/promo.shared';

function buildReferralError(statusCode: number, statusMessage: string) {
  return createError({
    statusCode,
    statusMessage,
  });
}

async function loadReferralRedeemContext(params: {
  userId: number;
  code: string;
  now?: Date;
  tx?: any;
}) {
  const now = params.now ?? new Date();
  const normalizedCode = normalizePromoCode(params.code);
  const tx = params.tx ?? db;

  const program = await getReferralProgramSettings({ tx });
  if (!program.enabled) {
    throw buildReferralError(409, 'Реферальная программа сейчас отключена');
  }

  const [invitee] = await tx
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!invitee) {
    throw buildReferralError(404, 'Пользователь не найден');
  }

  const inviteeProfile = await ensureReferralProfile({
    userId: params.userId,
    now,
    tx,
  });

  if (inviteeProfile.code === normalizedCode) {
    throw buildReferralError(
      409,
      'Нельзя активировать собственный referral code'
    );
  }

  const [referrerProfile] = await tx
    .select()
    .from(userReferralProfiles)
    .where(eq(userReferralProfiles.code, normalizedCode))
    .limit(1);

  if (!referrerProfile) {
    throw buildReferralError(404, 'Реферальный код не найден');
  }

  if (referrerProfile.blocked) {
    throw buildReferralError(409, 'Этот referral code временно недоступен');
  }

  if (referrerProfile.userId === params.userId) {
    throw buildReferralError(
      409,
      'Нельзя активировать собственный referral code'
    );
  }

  const existingRows = await tx
    .select({
      id: referralRedemptions.id,
    })
    .from(referralRedemptions)
    .where(eq(referralRedemptions.inviteeUserId, params.userId))
    .limit(1);

  if (existingRows[0]) {
    throw buildReferralError(
      409,
      'Реферальный код можно активировать только один раз'
    );
  }

  const hasPaidHistory = await hasReferralEligiblePaidHistory({
    userId: params.userId,
    tx,
  });
  if (hasPaidHistory) {
    throw buildReferralError(
      409,
      'Реферальная программа доступна только до первой платной подписки'
    );
  }

  return {
    normalizedCode,
    program,
    invitee,
    inviteeProfile,
    referrerProfile,
  };
}

export async function previewReferralCode(params: {
  userId: number;
  code: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const context = await loadReferralRedeemContext({
    userId: params.userId,
    code: params.code,
    now,
  });

  return {
    ok: true as const,
    title: `Скидка ${Number(context.program.inviteePercent)}% на следующий платёж`,
    description: `После активации кода вы получите скидку ${Number(context.program.inviteePercent)}% на следующий платёж, а пользователю, который поделился кодом, пополнится бонусный счёт в размере ${Number(context.program.referrerPercent)}% от вашей первой успешной оплаты через ${Number(context.program.creditHoldDays ?? 0)} дн.`,
    warning: `Код можно активировать только один раз. Ваша скидка будет действовать ${Number(context.program.inviteeRewardValidityDays)} дней после активации.`,
    reward: {
      inviteePercent: Number(context.program.inviteePercent),
      referrerPercent: Number(context.program.referrerPercent),
      inviteeRewardValidityDays: Number(
        context.program.inviteeRewardValidityDays
      ),
      creditHoldDays: Number(context.program.creditHoldDays ?? 0),
    },
  };
}

export async function redeemReferralCode(params: {
  userId: number;
  code: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  return await db.transaction(async (tx) => {
    const context = await loadReferralRedeemContext({
      userId: params.userId,
      code: params.code,
      now,
      tx,
    });

    const inviteeReward = await createDiscountGrant({
      userId: params.userId,
      grantKind: 'invitee_referral',
      percent: Number(context.program.inviteePercent),
      targetPlanScope: context.program.inviteeTargetPlanScope as
        | 'any_paid'
        | 'pro'
        | 'premium',
      targetPeriodScope: context.program.inviteeTargetPeriodScope as
        | 'any'
        | 'month'
        | 'year',
      expiresAt: buildDiscountGrantExpiryDate({
        expiresInDays: Number(context.program.inviteeRewardValidityDays),
        now,
      }),
      metadata: {
        sourceLabel: 'Реферальная награда',
        referrerUserId: context.referrerProfile.userId,
      },
      now,
      tx,
    });

    const [redemption] = await tx
      .insert(referralRedemptions)
      .values({
        referrerUserId: context.referrerProfile.userId,
        inviteeUserId: params.userId,
        referralCode: context.normalizedCode,
        status: 'pending_conversion',
        inviteeRewardGrantId: inviteeReward.id,
        redeemedAt: now,
        metadata: {
          inviteeEmail: context.invitee.email,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx
      .update(userReferralProfiles)
      .set({
        updatedAt: now,
      })
      .where(
        and(eq(userReferralProfiles.userId, context.referrerProfile.userId))
      );

    return {
      ok: true as const,
      message:
        'Реферальный код активирован. Скидка применится к вашему следующему платежу.',
      reward: {
        id: inviteeReward.id,
        kind: inviteeReward.grantKind as 'admin_promo' | 'invitee_referral',
        percent: Number(inviteeReward.percent),
        status: inviteeReward.status as
          | 'active'
          | 'reserved'
          | 'applied'
          | 'expired'
          | 'revoked',
        expiresAt: inviteeReward.expiresAt?.toISOString() || null,
        sourceLabel: 'Реферальная награда',
        targetPlanScope: inviteeReward.targetPlanScope as
          | 'any_paid'
          | 'pro'
          | 'premium',
        targetPeriodScope: inviteeReward.targetPeriodScope as
          | 'any'
          | 'month'
          | 'year',
      },
      redemptionId: redemption.id,
    };
  });
}
