import { createError } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  FreeAccessDaysBenefitPayloadDto,
  NextPaymentPercentDiscountBenefitPayloadDto,
} from '@/shared/dto/promo-code';
import {
  promoCampaigns,
  promoCodeRedemptions,
  users,
} from '@/server/infrastructure/db/schema';
import { getCurrentActiveSubscription } from '@/server/application/subscriptions/current-subscription.service';
import {
  isTrialActiveAt,
  normalizeBillingCollectionStatus,
  resolveCurrentEntitlementsPlan,
} from '@/server/application/subscriptions/trial-billing.service';
import {
  describePlanLabel,
  isLowerPlan,
  isPaidPlanId,
  normalizePromoCode,
  type MentalaPaidPlanId,
  type MentalaPlanId,
} from './promo.shared';
import { resolveEffectiveEntitlementsPlanWithAccessGrant } from './promo-access-grants.service';

type ActiveSubscriptionRow = Awaited<
  ReturnType<typeof getCurrentActiveSubscription>
>;

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

function buildPromoValidationError(statusCode: number, statusMessage: string) {
  return createError({
    statusCode,
    statusMessage,
  });
}

export type ValidatedPromoCampaignContext = {
  user: {
    id: number;
    email: string;
    billingPlanId: string | null;
    billingCollectionStatus: string | null;
    graceEndsAt: Date | null;
    trialEndedAt: Date | null;
  };
  campaign: typeof promoCampaigns.$inferSelect;
  activePaidSubscription: ActiveSubscriptionRow;
  currentEffectivePlanId: MentalaPlanId;
  currentBasePlanId: MentalaPlanId;
  freeAccessPayload: {
    durationDays: number;
    targetPlanId: MentalaPaidPlanId;
    planMode: 'auto' | 'explicit';
  } | null;
  discountPayload: {
    percent: number;
    targetPlanScope: 'any_paid' | 'pro' | 'premium';
    targetPeriodScope: 'any' | 'month' | 'year';
    expiresInDays: number;
  } | null;
};

async function loadPromoCampaignByCode(params: { code: string; tx?: any }) {
  const client = resolveDbClient(params.tx);
  const normalizedCode = normalizePromoCode(params.code);

  const rows = await client
    .select()
    .from(promoCampaigns)
    .where(eq(promoCampaigns.code, normalizedCode))
    .limit(1);

  return rows[0] ?? null;
}

async function assertPromoCampaignAvailable(params: {
  campaignId: number;
  tx?: any;
}) {
  const client = resolveDbClient(params.tx);
  const rows = await client
    .select({
      id: promoCodeRedemptions.id,
    })
    .from(promoCodeRedemptions)
    .where(eq(promoCodeRedemptions.campaignId, params.campaignId))
    .limit(1);

  if (rows[0]) {
    throw buildPromoValidationError(409, 'Промокод уже использован');
  }
}

export async function loadValidatedPromoCampaignContext(params: {
  userId: number;
  code: string;
  now?: Date;
  tx?: any;
}): Promise<ValidatedPromoCampaignContext> {
  const now = params.now ?? new Date();
  const client = resolveDbClient(params.tx);

  const [user] = await client
    .select({
      id: users.id,
      email: users.email,
      billingPlanId: users.billingPlanId,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  if (!user) {
    throw buildPromoValidationError(404, 'Пользователь не найден');
  }

  const campaign = await loadPromoCampaignByCode({
    code: params.code,
    tx: client,
  });

  if (!campaign) {
    throw buildPromoValidationError(404, 'Промокод не найден');
  }

  if (campaign.status !== 'active') {
    if (campaign.status === 'consumed') {
      throw buildPromoValidationError(409, 'Промокод уже использован');
    }

    if (campaign.status === 'expired') {
      throw buildPromoValidationError(409, 'Срок действия промокода истёк');
    }

    throw buildPromoValidationError(409, 'Промокод сейчас недоступен');
  }

  if (campaign.startsAt && campaign.startsAt.getTime() > now.getTime()) {
    throw buildPromoValidationError(409, 'Промокод ещё не активен');
  }

  if (campaign.endsAt && campaign.endsAt.getTime() <= now.getTime()) {
    throw buildPromoValidationError(409, 'Срок действия промокода истёк');
  }

  // Защита от legacy-кампаний с bindingMode != 'none', но пустым target*.
  // Раньше их можно было создать через Create DTO (валидация была только в Update),
  // и такой "персональный" промокод мог активировать кто угодно, потому что
  // проверка пропускалась, если targetUserId/targetEmail был null.
  if (campaign.bindingMode === 'user_id') {
    if (!campaign.targetUserId) {
      throw buildPromoValidationError(
        409,
        'Промокод настроен некорректно: отсутствует привязка к пользователю'
      );
    }
    if (campaign.targetUserId !== params.userId) {
      throw buildPromoValidationError(
        403,
        'Этот промокод привязан к другому пользователю'
      );
    }
  }

  if (campaign.bindingMode === 'email') {
    if (!campaign.targetEmail) {
      throw buildPromoValidationError(
        409,
        'Промокод настроен некорректно: отсутствует привязка к email'
      );
    }
    if (
      user.email.trim().toLowerCase() !==
      campaign.targetEmail.trim().toLowerCase()
    ) {
      throw buildPromoValidationError(
        403,
        'Этот промокод привязан к другому email'
      );
    }
  }

  await assertPromoCampaignAvailable({
    campaignId: campaign.id,
    tx: client,
  });

  const activePaidSubscription = await getCurrentActiveSubscription({
    userId: params.userId,
    now,
    tx: client,
  });

  const trialActive = isTrialActiveAt(user.trialEndedAt, now);
  const currentBasePlanId = resolveCurrentEntitlementsPlan({
    now,
    trialActive,
    billingPlanId: user.billingPlanId,
    billingCollectionStatus: normalizeBillingCollectionStatus(
      user.billingCollectionStatus
    ),
    graceEndsAt: user.graceEndsAt,
    activePaidPlanId: activePaidSubscription?.planId ?? null,
  });

  const effectivePlan = await resolveEffectiveEntitlementsPlanWithAccessGrant({
    userId: params.userId,
    basePlanId: currentBasePlanId,
    now,
    tx: client,
  });

  if (campaign.campaignType === 'free_access_days') {
    const payload = FreeAccessDaysBenefitPayloadDto.parse({
      campaignType: 'free_access_days',
      ...(campaign.benefitPayload as Record<string, unknown>),
    });

    let targetPlanId: MentalaPaidPlanId | null = null;
    if (payload.planMode === 'auto') {
      if (
        !activePaidSubscription ||
        !isPaidPlanId(activePaidSubscription.planId)
      ) {
        throw buildPromoValidationError(
          409,
          'Авто-режим доступен только для активной платной подписки'
        );
      }

      targetPlanId = activePaidSubscription.planId;
    } else {
      targetPlanId = payload.explicitPlanId as MentalaPaidPlanId;
    }

    if (!targetPlanId) {
      throw buildPromoValidationError(
        409,
        'Не удалось определить целевой тариф'
      );
    }

    if (isLowerPlan(targetPlanId, effectivePlan.planId)) {
      throw buildPromoValidationError(
        409,
        'Промокод не может понизить текущий уровень доступа'
      );
    }

    return {
      user,
      campaign,
      activePaidSubscription,
      currentBasePlanId,
      currentEffectivePlanId: effectivePlan.planId,
      freeAccessPayload: {
        durationDays: payload.durationDays,
        targetPlanId,
        planMode: payload.planMode,
      },
      discountPayload: null,
    };
  }

  if (campaign.campaignType === 'next_payment_percent_discount') {
    const payload = NextPaymentPercentDiscountBenefitPayloadDto.parse({
      campaignType: 'next_payment_percent_discount',
      ...(campaign.benefitPayload as Record<string, unknown>),
    });

    return {
      user,
      campaign,
      activePaidSubscription,
      currentBasePlanId,
      currentEffectivePlanId: effectivePlan.planId,
      freeAccessPayload: null,
      discountPayload: {
        percent: payload.percent,
        targetPlanScope: payload.targetPlanScope,
        targetPeriodScope: payload.targetPeriodScope,
        expiresInDays: payload.expiresInDays,
      },
    };
  }

  throw buildPromoValidationError(409, 'Неподдерживаемый тип промокода');
}

export function buildPromoCodePreviewFromContext(
  context: ValidatedPromoCampaignContext
) {
  if (context.freeAccessPayload) {
    return {
      ok: true as const,
      campaignId: context.campaign.id,
      code: context.campaign.code,
      campaignType: context.campaign.campaignType as 'free_access_days',
      title: `Бесплатный доступ к ${describePlanLabel(context.freeAccessPayload.targetPlanId)}`,
      description:
        context.freeAccessPayload.planMode === 'auto'
          ? `Код продлит текущий платный доступ на ${context.freeAccessPayload.durationDays} дн.`
          : `Код откроет ${describePlanLabel(context.freeAccessPayload.targetPlanId)} на ${context.freeAccessPayload.durationDays} дн.`,
      warning: 'Код одноразовый.',
      effect: {
        accessPlanId: context.freeAccessPayload.targetPlanId,
        durationDays: context.freeAccessPayload.durationDays,
        percent: null,
        targetPlanScope: null,
        targetPeriodScope: null,
      },
    };
  }

  if (context.discountPayload) {
    return {
      ok: true as const,
      campaignId: context.campaign.id,
      code: context.campaign.code,
      campaignType: context.campaign
        .campaignType as 'next_payment_percent_discount',
      title: `Скидка ${context.discountPayload.percent}% на ближайший платёж`,
      description:
        context.discountPayload.targetPlanScope === 'any_paid'
          ? 'Скидка применится к ближайшему qualifying-платежу.'
          : `Скидка применится к ближайшему платежу за ${describePlanLabel(context.discountPayload.targetPlanScope)}.`,
      warning: 'Код одноразовый.',
      effect: {
        accessPlanId: null,
        durationDays: null,
        percent: context.discountPayload.percent,
        targetPlanScope: context.discountPayload.targetPlanScope,
        targetPeriodScope: context.discountPayload.targetPeriodScope,
      },
    };
  }

  throw buildPromoValidationError(
    500,
    'Не удалось подготовить preview промокода'
  );
}

export async function previewPromoCode(params: {
  userId: number;
  code: string;
  now?: Date;
  tx?: any;
}) {
  const context = await loadValidatedPromoCampaignContext(params);
  return buildPromoCodePreviewFromContext(context);
}
