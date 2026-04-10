import { createError } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  billingAccessGrants,
  promoCampaigns,
  promoCodeRedemptions,
} from '@/server/infrastructure/db/schema';
import {
  createDiscountGrant,
  buildDiscountGrantExpiryDate,
} from './promo-discount-grants.service';
import { applyBillingScheduleAdjustment } from './billing-schedule-adjustments.service';
import {
  buildPromoCodePreviewFromContext,
  loadValidatedPromoCampaignContext,
} from './promo-code-preview.service';
import { addDays } from './promo.shared';
import { resolveEffectiveEntitlementsPlanWithAccessGrant } from './promo-access-grants.service';

function buildRedeemError(statusCode: number, statusMessage: string) {
  return createError({
    statusCode,
    statusMessage,
  });
}

// Postgres error code для нарушения unique constraint.
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string' && code === PG_UNIQUE_VIOLATION) {
    return true;
  }

  // Drizzle может заворачивать в .cause при postgres.js.
  const cause = (error as { cause?: unknown })?.cause;
  if (cause && cause !== error) {
    return isUniqueViolation(cause);
  }

  return false;
}

export async function redeemPromoCode(params: {
  userId: number;
  code: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();

  try {
    return await db.transaction(async (tx) => {
      // Контекст загружается ОДИН раз. previewPromoCode внутри транзакции
      // раньше делал второй полный SELECT за кампанию/redemption — убираем
      // лишнюю нагрузку и потенциальный рассинхрон.
      const context = await loadValidatedPromoCampaignContext({
        userId: params.userId,
        code: params.code,
        now,
        tx,
      });
      const preview = buildPromoCodePreviewFromContext(context);

      const [redemption] = await tx
        .insert(promoCodeRedemptions)
        .values({
          campaignId: context.campaign.id,
          userId: params.userId,
          status: 'succeeded',
          redeemedAt: now,
          campaignSnapshot: {
            campaignType: context.campaign.campaignType,
            bindingMode: context.campaign.bindingMode,
            benefitPayload: context.campaign.benefitPayload,
            startsAt: context.campaign.startsAt?.toISOString() || null,
            endsAt: context.campaign.endsAt?.toISOString() || null,
          },
        })
        .returning();

      if (!redemption) {
        throw buildRedeemError(500, 'Не удалось сохранить redeem промокода');
      }

      await tx
        .update(promoCampaigns)
        .set({
          status: 'consumed',
          updatedAt: now,
        })
        .where(eq(promoCampaigns.id, context.campaign.id));

      if (context.freeAccessPayload) {
        const endsAt = addDays(now, context.freeAccessPayload.durationDays);
        const [accessGrant] = await tx
          .insert(billingAccessGrants)
          .values({
            userId: params.userId,
            sourceCampaignId: context.campaign.id,
            sourceRedemptionId: redemption.id,
            planId: context.freeAccessPayload.targetPlanId,
            startsAt: now,
            endsAt,
            status: 'active',
            metadata: {
              sourceLabel: preview.title,
              durationDays: context.freeAccessPayload.durationDays,
              planMode: context.freeAccessPayload.planMode,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!accessGrant) {
          throw buildRedeemError(500, 'Не удалось выдать временный доступ');
        }

        const billingShiftResult = await applyBillingScheduleAdjustment({
          userId: params.userId,
          days: context.freeAccessPayload.durationDays,
          reason: 'promo_free_access_days',
          sourceCampaignId: context.campaign.id,
          sourceRedemptionId: redemption.id,
          sourceAccessGrantId: accessGrant.id,
          now,
          tx,
        });

        await tx
          .update(promoCodeRedemptions)
          .set({
            resultPayload: {
              accessGrantId: accessGrant.id,
              planId: accessGrant.planId,
              startsAt: accessGrant.startsAt.toISOString(),
              endsAt: accessGrant.endsAt.toISOString(),
              billingShiftDays: billingShiftResult.shiftApplied
                ? context.freeAccessPayload.durationDays
                : 0,
              nextChargeAt:
                billingShiftResult.nextChargeAt?.toISOString() || null,
            },
            updatedAt: now,
          })
          .where(eq(promoCodeRedemptions.id, redemption.id));

        const effectivePlan =
          await resolveEffectiveEntitlementsPlanWithAccessGrant({
            userId: params.userId,
            basePlanId: context.currentBasePlanId,
            now,
            tx,
          });

        return {
          ok: true as const,
          code: context.campaign.code,
          campaignType: 'free_access_days' as const,
          message: `Доступ к ${preview.effect.accessPlanId === 'premium' ? 'Premium' : 'PRO'} активирован.`,
          activeAccessGrant: {
            id: accessGrant.id,
            planId: accessGrant.planId as 'pro' | 'premium',
            startsAt: accessGrant.startsAt.toISOString(),
            endsAt: accessGrant.endsAt.toISOString(),
            sourceLabel: preview.title,
          },
          pendingDiscount: null,
          effectiveBillingShiftDays: billingShiftResult.shiftApplied
            ? context.freeAccessPayload.durationDays
            : 0,
          nextChargeAt: billingShiftResult.nextChargeAt?.toISOString() || null,
          currentEntitlementsPlan: effectivePlan.planId,
        };
      }

      if (context.discountPayload) {
        const expiresAt = buildDiscountGrantExpiryDate({
          expiresInDays: context.discountPayload.expiresInDays,
          now,
        });

        const grant = await createDiscountGrant({
          userId: params.userId,
          grantKind: 'admin_promo',
          sourceCampaignId: context.campaign.id,
          sourceRedemptionId: redemption.id,
          bindingMode: context.campaign.bindingMode as
            | 'none'
            | 'user_id'
            | 'email',
          percent: context.discountPayload.percent,
          targetPlanScope: context.discountPayload.targetPlanScope,
          targetPeriodScope: context.discountPayload.targetPeriodScope,
          expiresAt,
          metadata: {
            sourceLabel: preview.title,
            code: context.campaign.code,
          },
          now,
          tx,
        });

        if (!grant) {
          throw buildRedeemError(
            500,
            'Не удалось выдать скидку на следующий платёж'
          );
        }

        await tx
          .update(promoCodeRedemptions)
          .set({
            resultPayload: {
              discountGrantId: grant.id,
              percent: grant.percent,
              expiresAt: expiresAt.toISOString(),
            },
            updatedAt: now,
          })
          .where(eq(promoCodeRedemptions.id, redemption.id));

        return {
          ok: true as const,
          code: context.campaign.code,
          campaignType: 'next_payment_percent_discount' as const,
          message: `Скидка ${grant.percent}% активирована и применится к ближайшему платежу.`,
          activeAccessGrant: null,
          pendingDiscount: {
            id: grant.id,
            kind: grant.grantKind as 'admin_promo' | 'invitee_referral',
            percent: Number(grant.percent),
            status: grant.status as
              | 'active'
              | 'reserved'
              | 'applied'
              | 'expired'
              | 'revoked',
            expiresAt: grant.expiresAt?.toISOString() || null,
            sourceLabel: preview.title,
            targetPlanScope: grant.targetPlanScope as
              | 'any_paid'
              | 'pro'
              | 'premium',
            targetPeriodScope: grant.targetPeriodScope as
              | 'any'
              | 'month'
              | 'year',
          },
          effectiveBillingShiftDays: 0,
          nextChargeAt: null,
          currentEntitlementsPlan: context.currentEffectivePlanId,
        };
      }

      throw createError({
        statusCode: 500,
        statusMessage: 'Неподдерживаемый тип промокода',
      });
    });
  } catch (error) {
    // Гонка redeem: проверки делаются на уровне `read committed`, и два
    // параллельных запроса могут пройти `assertPromoCampaignAvailable`
    // одновременно. Спасает unique constraint `uk_promo_code_redemptions_campaign`
    // — но без маппинга клиент получает 500 вместо понятного 409.
    if (isUniqueViolation(error)) {
      throw buildRedeemError(409, 'Промокод уже использован');
    }
    throw error;
  }
}
