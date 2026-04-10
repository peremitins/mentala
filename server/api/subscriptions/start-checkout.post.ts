import crypto from 'node:crypto';
import { createError, getHeader } from 'h3';
import { z } from 'zod';
import { and, eq, gt, ne } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import {
  payments,
  subscriptionEvents,
  subscriptionPlans,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import {
  calculatePlanChangeDecision,
  type ActiveSubscriptionSnapshot,
} from '@/server/application/subscriptions/plan-change.service';
import { type BillingPeriod } from '@/server/application/subscriptions/price-calculator';
import {
  getCurrentActiveSubscriptionWithPlan,
  expireOutdatedActiveSubscriptions,
} from '@/server/application/subscriptions/current-subscription.service';
import {
  abortIdempotentRequest,
  finishIdempotentRequest,
  startIdempotentRequest,
} from '@/server/application/idempotency/idempotency.service';
import {
  createYooKassaPayment,
  createYooKassaPaymentMethodBinding,
  extractPaymentMethodPresentation,
  buildYooKassaReceipt,
} from '@/server/application/payments/yookassa.client';
import {
  isTrialActiveAt,
  resolveCurrentEntitlementsPlan,
  isTrialBillingPlanId,
  isTrialBillingPeriod,
  normalizeBillingCollectionStatus,
} from '@/server/application/subscriptions/trial-billing.service';
import {
  activateUserPaymentMethod,
  syncPendingPaymentMethodBinding,
} from '@/server/application/subscriptions/payment-methods.service';
import { resolveExternalFlowAppUrl } from '@/server/application/auth/oauth-redirect';
import { buildExternalSessionConsumeReturnUrl } from '@/server/application/auth/external-session-return-url';
import { PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS } from '@/server/config/subscription';
import {
  dispatchBillingCheckoutErrorEvent,
  dispatchBillingPurchaseSuccessEvent,
} from '@/server/application/events/app-events.dispatchers';
import { dispatchBillingPlanChangedIfNeeded } from '@/server/application/events/billing-events.helpers';
import {
  finalizeDiscountGrantSuccess,
  releaseDiscountGrantReservation,
  reserveBestDiscountGrant,
} from '@/server/application/promo-codes/promo-discount-grants.service';
import {
  applyAvailableBillingCredit,
  restoreAppliedBillingCredit,
} from '@/server/application/subscriptions/billing-credit.service';

type SourcePlatform = 'web' | 'ios' | 'android';
type CheckoutStatus = 'pending' | 'active';
type PaymentMode = 'none' | 'widget' | 'redirect';
type CheckoutAction =
  | 'payment'
  | 'activated'
  | 'scheduled_downgrade'
  | 'noop'
  | 'bind_payment_method_required'
  | 'trial_scheduled';

interface ScheduledChangeResponse {
  planId: string;
  billingPeriod: BillingPeriod;
  effectiveAt: string;
}

interface StartCheckoutResponse {
  subscriptionId: number;
  amount: number;
  toPay: number;
  creditApplied: number;
  creditGranted: number;
  promoDiscountPercent?: number;
  promoDiscountAmount?: number;
  status: CheckoutStatus;
  paymentProvider: 'yookassa';
  paymentId: string | null;
  paymentMode: PaymentMode;
  confirmationToken: string | null;
  paymentUrl: string | null;
  checkoutAction: CheckoutAction;
  scheduledChange: ScheduledChangeResponse | null;
  trialEndsAt?: string | null;
  billingPlan?: 'pro' | 'premium' | null;
  billingPeriod?: BillingPeriod | null;
  nextChargeAt?: string | null;
  currentEntitlementsPlan?: 'basic' | 'pro' | 'premium';
  paymentMethodBound?: boolean;
  bindingSessionId?: string | null;
}

const checkoutSchema = z.object({
  planId: z.string(),
  billingPeriod: z.enum(['month', 'year']).default('month'),
  paymentMode: z.enum(['widget', 'redirect']).optional(),
  externalFlow: z.boolean().optional(),
  appUrl: z.string().trim().optional(),
});

function hashCheckoutPayload(payload: {
  planId: string;
  billingPeriod: BillingPeriod;
  paymentMode: 'widget' | 'redirect';
  externalFlow: boolean;
  appUrl?: string | null;
}): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(payload), 'utf8')
    .digest('hex');
}

function getPeriodDays(period: BillingPeriod): number {
  return period === 'year' ? 365 : 30;
}

function toCents(value: number): number {
  return Math.round(value * 100);
}

function buildScheduledChange(params: {
  planId?: string | null;
  billingPeriod?: string | null;
  effectiveAt?: Date | null;
}): ScheduledChangeResponse | null {
  const planId = String(params.planId || '').trim();
  const billingPeriodRaw = String(params.billingPeriod || '').trim();
  if (!planId) return null;
  if (billingPeriodRaw !== 'month' && billingPeriodRaw !== 'year') return null;
  if (!params.effectiveAt) return null;

  return {
    planId,
    billingPeriod: billingPeriodRaw,
    effectiveAt: params.effectiveAt.toISOString(),
  };
}

function buildBindReturnPath(params: {
  bindingSessionId: string;
  planId?: string;
  billingPeriod?: BillingPeriod;
  externalFlow?: boolean;
  sourcePlatform?: SourcePlatform;
}): string {
  const searchParams = new URLSearchParams({
    flow: 'bind',
    bindReturn: '1',
    bindingSessionId: params.bindingSessionId,
  });

  if (params.planId) {
    searchParams.set('plan', params.planId);
  }
  if (params.billingPeriod) {
    searchParams.set('billingPeriod', params.billingPeriod);
  }
  if (params.externalFlow === true) {
    searchParams.set('externalFlow', '1');
  }
  if (params.sourcePlatform === 'ios' || params.sourcePlatform === 'android') {
    searchParams.set('nativeApp', '1');
  }

  return `/payment-success?${searchParams.toString()}`;
}

function resolveSourcePlatform(event: any): SourcePlatform {
  const platformHeader = getHeader(event, 'x-platform')?.toLowerCase();
  if (platformHeader === 'ios') return 'ios';
  if (platformHeader === 'android') return 'android';
  return 'web';
}

/**
 * POST /api/subscriptions/start-checkout
 * Главная команда смены тарифа:
 * - upgrade выполняется сразу;
 * - downgrade планируется на конец периода;
 * - billingCredit применяется после процентной скидки и может покрыть 100% суммы.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const idempotencyKeyHeader = getHeader(event, 'idempotency-key');
  const idempotencyKey = idempotencyKeyHeader
    ? String(idempotencyKeyHeader).trim()
    : '';
  if (
    !idempotencyKey ||
    idempotencyKey.length < 8 ||
    idempotencyKey.length > 128
  ) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Idempotency-Key header is required (8..128 chars) for start-checkout',
    });
  }

  const body = await readBody(event);
  const validated = checkoutSchema.parse(body);
  const {
    planId,
    billingPeriod,
    paymentMode: requestedPaymentMode,
    externalFlow: requestedExternalFlow,
    appUrl: requestedAppUrl,
  } = validated;
  const billingPeriodTyped = billingPeriod as BillingPeriod;
  const externalFlow = requestedExternalFlow === true;
  const sourcePlatform = resolveSourcePlatform(event);
  // На native iOS/Android проводим checkout только через redirect-flow:
  // embedded widget в мобильных WebView нестабилен для 3DS и может закрываться.
  const paymentMode: 'widget' | 'redirect' =
    sourcePlatform === 'ios' || sourcePlatform === 'android'
      ? 'redirect'
      : requestedPaymentMode === 'redirect'
        ? 'redirect'
        : 'widget';
  const requestHash = hashCheckoutPayload({
    planId,
    billingPeriod: billingPeriodTyped,
    paymentMode,
    externalFlow,
    appUrl: requestedAppUrl || null,
  });

  const route = '/api/subscriptions/start-checkout';
  const idem = await startIdempotentRequest<StartCheckoutResponse>({
    userId: sessionResult.user.id,
    route,
    key: idempotencyKey,
    requestHash,
  });

  if (idem.kind === 'hit') {
    return idem.response;
  }
  if (idem.kind === 'conflict') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Idempotency-Key reuse with different payload is not allowed for start-checkout',
    });
  }
  if (idem.kind === 'in_progress') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Checkout already in progress for this Idempotency-Key. Retry later.',
    });
  }

  const idempotencyRecordId = idem.recordId;
  const userId = sessionResult.user.id;
  const now = new Date();
  const config = useRuntimeConfig(event);
  const appUrl = resolveExternalFlowAppUrl({
    event,
    configuredAppUrl: String(config.public.appUrl || 'http://localhost:3000'),
    requestedAppUrl,
  });

  let createdPendingSubscriptionId: number | null = null;
  let yookassaPaymentCreated = false;
  let discountReservationKey: string | null = null;
  let creditRestoreContext: {
    amount: number;
    sourceSubscriptionId?: number | null;
    metadata?: Record<string, unknown>;
  } | null = null;

  try {
    const planRows = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    const targetPlan = planRows[0];
    if (!targetPlan) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Plan not found',
      });
    }

    await expireOutdatedActiveSubscriptions({
      userId,
      now,
    });

    const currentActive = await getCurrentActiveSubscriptionWithPlan({
      userId,
      now,
    });

    // MVP: запрещаем параллельные подписки. Если активная подписка в App Store —
    // не даём запускать checkout через сайт (YooKassa), чтобы не получить double charge.
    if (
      currentActive &&
      currentActive.subscription.paymentProvider === 'apple_iap' &&
      currentActive.plan.name !== 'basic'
    ) {
      throw createError({
        statusCode: 409,
        statusMessage:
          'Active subscription is managed by App Store. Checkout via site is disabled to avoid double charge.',
      });
    }

    const currentSnapshot: ActiveSubscriptionSnapshot | null = currentActive
      ? {
          id: currentActive.subscription.id,
          planId: currentActive.subscription.planId,
          billingPeriod: currentActive.subscription
            .billingPeriod as BillingPeriod,
          startDate: currentActive.subscription.startDate,
          endDate: currentActive.subscription.endDate,
          baseMonthlyPrice: Number(currentActive.plan.basePrice),
        }
      : null;

    const decision = calculatePlanChangeDecision({
      current: currentSnapshot,
      target: {
        planId,
        billingPeriod: billingPeriodTyped,
        baseMonthlyPrice: Number(targetPlan.basePrice),
      },
      now,
    });

    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        trialEndedAt: users.trialEndedAt,
        billingPlanId: users.billingPlanId,
        billingPeriod: users.billingPeriod,
        nextChargeAt: users.nextChargeAt,
        paymentMethodBound: users.paymentMethodBound,
        paymentMethodId: users.paymentMethodId,
        paymentMethodType: users.paymentMethodType,
        paymentMethodTitle: users.paymentMethodTitle,
        paymentMethodBindingId: users.paymentMethodBindingId,
        paymentMethodBindingSessionId: users.paymentMethodBindingSessionId,
        paymentMethodBindingStatus: users.paymentMethodBindingStatus,
        billingCollectionStatus: users.billingCollectionStatus,
        graceEndsAt: users.graceEndsAt,
        scheduledPlanId: users.scheduledPlanId,
        scheduledBillingPeriod: users.scheduledBillingPeriod,
        scheduledChangeAt: users.scheduledChangeAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const userRow = userRows[0];
    if (!userRow) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      });
    }

    const trialActive = isTrialActiveAt(userRow.trialEndedAt, now);

    // Trial-scheduled режим: платные планы в trial не должны создавать немедленный платеж.
    if (
      trialActive &&
      isTrialBillingPlanId(planId) &&
      isTrialBillingPeriod(billingPeriodTyped)
    ) {
      if (!userRow.trialEndedAt) {
        throw createError({
          statusCode: 409,
          statusMessage: 'trialEndedAt is missing for active trial user',
        });
      }

      const shopId = String(config.yookassaShopId || '').trim();
      const secretKey = String(config.yookassaSecretKey || '').trim();
      let resolvedPaymentMethodId = userRow.paymentMethodId;
      let resolvedPaymentMethodType = userRow.paymentMethodType;
      let resolvedPaymentMethodTitle = userRow.paymentMethodTitle;

      let paymentMethodBound = Boolean(
        userRow.paymentMethodBound && userRow.paymentMethodId
      );

      // Если карта была привязана в отдельном шаге и пользователь вернулся на страницу,
      // синхронизируем состояние из YooKassa по pending binding id.
      if (
        !paymentMethodBound &&
        userRow.paymentMethodBindingId &&
        userRow.paymentMethodBindingStatus === 'pending' &&
        shopId &&
        secretKey
      ) {
        try {
          const syncResult = await syncPendingPaymentMethodBinding({
            userId,
            shopId,
            secretKey,
            now,
          });

          if (syncResult.paymentMethodBound) {
            const refreshedUserRows = await db
              .select({
                paymentMethodBound: users.paymentMethodBound,
                paymentMethodId: users.paymentMethodId,
                paymentMethodType: users.paymentMethodType,
                paymentMethodTitle: users.paymentMethodTitle,
              })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1);

            const refreshedUser = refreshedUserRows[0];
            if (refreshedUser) {
              paymentMethodBound = Boolean(
                refreshedUser.paymentMethodBound &&
                  refreshedUser.paymentMethodId
              );
              resolvedPaymentMethodId = refreshedUser.paymentMethodId;
              resolvedPaymentMethodType = refreshedUser.paymentMethodType;
              resolvedPaymentMethodTitle = refreshedUser.paymentMethodTitle;
            }
          }
        } catch (error) {
          event.context.logger?.warn(
            {
              userId,
              paymentMethodBindingId: userRow.paymentMethodBindingId,
              error,
            },
            'Failed to sync payment method binding status before trial scheduling'
          );
        }
      }

      if (!paymentMethodBound) {
        if (!shopId || !secretKey) {
          throw createError({
            statusCode: 500,
            statusMessage: 'YooKassa credentials not configured',
          });
        }

        const bindingSessionId = crypto.randomUUID();
        const bindReturnPath = buildBindReturnPath({
          bindingSessionId,
          planId,
          billingPeriod: billingPeriodTyped,
          externalFlow,
          sourcePlatform,
        });
        const returnUrl = await buildExternalSessionConsumeReturnUrl({
          event,
          userId,
          appUrl,
          redirectPath: bindReturnPath,
          ttlSeconds: PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS,
          purpose: 'payment_return',
        });
        const yookassaIdempotenceKey = crypto
          .createHash('sha256')
          .update(`${userId}:${bindingSessionId}:${idempotencyKey}`, 'utf8')
          .digest('hex');

        const bindingResponse = await createYooKassaPaymentMethodBinding({
          shopId,
          secretKey,
          idempotenceKey: yookassaIdempotenceKey,
          returnUrl,
        });

        const bindPaymentUrl = String(
          bindingResponse.confirmation?.confirmation_url || ''
        ).trim();

        if (!bindPaymentUrl) {
          throw createError({
            statusCode: 502,
            statusMessage: 'YooKassa binding response missing confirmation_url',
          });
        }

        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({
              // Сохраняем выбранный платный план сразу при запуске bind-flow:
              // после успешной привязки /current сможет автоматически
              // завершить trial-scheduling без повторного клика пользователя.
              billingPlanId: planId,
              billingPeriod: billingPeriodTyped,
              nextChargeAt: userRow.trialEndedAt,
              billingCollectionStatus: 'none',
              graceEndsAt: null,
              billingReminderSentAt: null,
              billingLockedAt: null,
              billingLockedBy: null,
              paymentMethodBindingId: bindingResponse.id,
              paymentMethodBindingSessionId: bindingSessionId,
              paymentMethodBindingStatus: 'pending',
              paymentMethodBindingUpdatedAt: now,
              updatedAt: now,
            })
            .where(eq(users.id, userId));

          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'payment_method_binding_started',
            planId,
            metadata: {
              bindingSessionId,
              paymentMethodBindingId: bindingResponse.id,
              billingPlanId: planId,
              billingPeriod: billingPeriodTyped,
            },
          });

          const bindRequiredResponse: StartCheckoutResponse = {
            subscriptionId: currentSnapshot?.id ?? 0,
            amount: decision.amount,
            toPay: 0,
            creditApplied: 0,
            creditGranted: 0,
            status: 'active',
            paymentProvider: 'yookassa',
            paymentId: null,
            paymentMode: 'redirect',
            confirmationToken: null,
            paymentUrl: bindPaymentUrl,
            checkoutAction: 'bind_payment_method_required',
            scheduledChange: null,
            trialEndsAt: userRow.trialEndedAt.toISOString(),
            billingPlan: null,
            billingPeriod: null,
            nextChargeAt: null,
            currentEntitlementsPlan: resolveCurrentEntitlementsPlan({
              now,
              trialActive: true,
              billingPlanId: userRow.billingPlanId,
              billingCollectionStatus: normalizeBillingCollectionStatus(
                userRow.billingCollectionStatus
              ),
              graceEndsAt: userRow.graceEndsAt,
              activePaidPlanId: currentActive?.subscription.planId ?? null,
            }),
            paymentMethodBound: false,
            bindingSessionId,
          };

          await finishIdempotentRequest({
            recordId: idempotencyRecordId,
            response: bindRequiredResponse,
            tx,
          });

          return bindRequiredResponse;
        });

        const bindResponse: StartCheckoutResponse = {
          subscriptionId: currentSnapshot?.id ?? 0,
          amount: decision.amount,
          toPay: 0,
          creditApplied: 0,
          creditGranted: 0,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentId: null,
          paymentMode: 'redirect',
          confirmationToken: null,
          paymentUrl: bindPaymentUrl,
          checkoutAction: 'bind_payment_method_required',
          scheduledChange: null,
          trialEndsAt: userRow.trialEndedAt.toISOString(),
          billingPlan: null,
          billingPeriod: null,
          nextChargeAt: null,
          currentEntitlementsPlan: resolveCurrentEntitlementsPlan({
            now,
            trialActive: true,
            billingPlanId: userRow.billingPlanId,
            billingCollectionStatus: normalizeBillingCollectionStatus(
              userRow.billingCollectionStatus
            ),
            graceEndsAt: userRow.graceEndsAt,
            activePaidPlanId: currentActive?.subscription.planId ?? null,
          }),
          paymentMethodBound: false,
          bindingSessionId,
        };

        return bindResponse;
      }

      const trialScheduledResponse = await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            billingPlanId: planId,
            billingPeriod: billingPeriodTyped,
            nextChargeAt: userRow.trialEndedAt,
            billingCollectionStatus: 'scheduled',
            graceEndsAt: null,
            billingReminderSentAt: null,
            billingLockedAt: null,
            billingLockedBy: null,
            scheduledPlanId: null,
            scheduledBillingPeriod: null,
            scheduledChangeAt: null,
            scheduledFromSubscriptionId: null,
            scheduledChangeUpdatedAt: now,
            paymentMethodBound: true,
            paymentMethodId: resolvedPaymentMethodId,
            paymentMethodType: resolvedPaymentMethodType,
            paymentMethodTitle: resolvedPaymentMethodTitle,
            updatedAt: now,
          })
          .where(eq(users.id, userId));

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'trial_billing_scheduled',
          planId,
          metadata: {
            billingPlanId: planId,
            billingPeriod: billingPeriodTyped,
            trialEndsAt: userRow.trialEndedAt.toISOString(),
            paymentMethodId: resolvedPaymentMethodId,
          },
        });

        const response: StartCheckoutResponse = {
          subscriptionId: currentSnapshot?.id ?? 0,
          amount: decision.amount,
          toPay: 0,
          creditApplied: 0,
          creditGranted: 0,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentId: null,
          paymentMode: 'none',
          confirmationToken: null,
          paymentUrl: null,
          checkoutAction: 'trial_scheduled',
          scheduledChange: null,
          trialEndsAt: userRow.trialEndedAt.toISOString(),
          billingPlan: planId,
          billingPeriod: billingPeriodTyped,
          nextChargeAt: userRow.trialEndedAt.toISOString(),
          currentEntitlementsPlan: resolveCurrentEntitlementsPlan({
            now,
            trialActive: true,
            billingPlanId: planId,
            billingCollectionStatus: 'scheduled',
            graceEndsAt: null,
            activePaidPlanId: currentActive?.subscription.planId ?? null,
          }),
          paymentMethodBound: true,
          bindingSessionId: userRow.paymentMethodBindingSessionId || null,
        };

        await finishIdempotentRequest({
          recordId: idempotencyRecordId,
          response,
          tx,
        });

        return response;
      });

      return trialScheduledResponse;
    }

    if (decision.policyAction === 'noop') {
      const response: StartCheckoutResponse = {
        subscriptionId: currentSnapshot?.id ?? 0,
        amount: decision.amount,
        toPay: 0,
        creditApplied: 0,
        creditGranted: 0,
        status: 'active',
        paymentProvider: 'yookassa',
        paymentId: null,
        paymentMode: 'none',
        confirmationToken: null,
        paymentUrl: null,
        checkoutAction: 'noop',
        scheduledChange: buildScheduledChange({
          planId: userRow?.scheduledPlanId,
          billingPeriod: userRow?.scheduledBillingPeriod,
          effectiveAt: userRow?.scheduledChangeAt,
        }),
      };

      await finishIdempotentRequest({
        recordId: idempotencyRecordId,
        response,
      });

      return response;
    }

    if (decision.policyAction === 'downgrade_later') {
      if (!currentActive) {
        throw createError({
          statusCode: 409,
          statusMessage:
            'Cannot schedule downgrade without an active subscription',
        });
      }

      const effectiveAt = currentActive.subscription.endDate;
      const scheduledChange = buildScheduledChange({
        planId,
        billingPeriod: billingPeriodTyped,
        effectiveAt,
      });

      if (!scheduledChange) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to create scheduled change',
        });
      }

      const response = await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({
            scheduledPlanId: planId,
            scheduledBillingPeriod: billingPeriodTyped,
            scheduledChangeAt: effectiveAt,
            scheduledFromSubscriptionId: currentActive.subscription.id,
            scheduledChangeUpdatedAt: now,
            updatedAt: now,
          })
          .where(eq(users.id, userId));

        await tx
          .update(userSubscriptions)
          .set({
            autoRenew: false,
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, currentActive.subscription.id));

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'subscription_change_scheduled',
          planId,
          metadata: {
            fromSubscriptionId: currentActive.subscription.id,
            fromPlanId: currentActive.subscription.planId,
            fromBillingPeriod: currentActive.subscription.billingPeriod,
            toPlanId: planId,
            toBillingPeriod: billingPeriodTyped,
            effectiveAt: effectiveAt.toISOString(),
          },
        });

        const scheduledResponse: StartCheckoutResponse = {
          subscriptionId: currentActive.subscription.id,
          amount: decision.amount,
          toPay: 0,
          creditApplied: 0,
          creditGranted: 0,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentId: null,
          paymentMode: 'none',
          confirmationToken: null,
          paymentUrl: null,
          checkoutAction: 'scheduled_downgrade',
          scheduledChange,
        };

        await finishIdempotentRequest({
          recordId: idempotencyRecordId,
          response: scheduledResponse,
          tx,
        });

        return scheduledResponse;
      });

      return response;
    }

    const hasCurrentActive = Boolean(currentActive);
    const nextEndDate =
      decision.nextEndDate ??
      new Date(
        now.getTime() + getPeriodDays(billingPeriodTyped) * 24 * 60 * 60 * 1000
      );

    if (decision.toPay === 0) {
      const response = await db.transaction(async (tx) => {
        // Для upgrade/activate очищаем запланированную смену.
        await tx
          .update(users)
          .set({
            scheduledPlanId: null,
            scheduledBillingPeriod: null,
            scheduledChangeAt: null,
            scheduledFromSubscriptionId: null,
            scheduledChangeUpdatedAt: now,
            // Любая non-trial активация должна очищать trial-scheduled "хвосты".
            billingPlanId: null,
            billingPeriod: null,
            nextChargeAt: null,
            billingCollectionStatus: 'none',
            graceEndsAt: null,
            billingReminderSentAt: null,
            billingLockedAt: null,
            billingLockedBy: null,
            updatedAt: now,
          })
          .where(eq(users.id, userId));

        const [newSubscription] = await tx
          .insert(userSubscriptions)
          .values({
            userId,
            planId,
            billingPeriod: billingPeriodTyped,
            checkoutAmount: '0',
            checkoutCurrency: 'RUB',
            billingCreditApplied: '0',
            billingCreditGranted: '0',
            startDate: now,
            endDate: nextEndDate,
            paymentStatus: 'active',
            autoRenew: true,
            sourcePlatform,
          })
          .returning();

        await tx
          .update(userSubscriptions)
          .set({ paymentStatus: 'expired', updatedAt: now })
          .where(
            and(
              eq(userSubscriptions.userId, userId),
              eq(userSubscriptions.paymentStatus, 'active'),
              gt(userSubscriptions.endDate, now),
              ne(userSubscriptions.id, newSubscription.id)
            )
          );

        if (
          planId !== 'basic' &&
          userRow?.trialEndedAt &&
          userRow.trialEndedAt > now
        ) {
          await tx
            .update(users)
            .set({
              trialEndedAt: now,
              updatedAt: now,
            })
            .where(eq(users.id, userId));
        }

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'checkout_started',
          planId,
          metadata: {
            billingPeriod: billingPeriodTyped,
            policyAction: decision.policyAction,
            targetChargeValue: decision.targetChargeValue,
            unusedCurrentValue: decision.unusedCurrentValue,
            toPay: 0,
            sourcePlatform,
            hadCurrentActive: hasCurrentActive,
          },
        });

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'purchase_success',
          planId,
          metadata: {
            subscriptionId: newSubscription.id,
            paymentId: null,
            amountPaid: 0,
            currency: 'RUB',
            method: 'policy_activation',
          },
        });

        const activatedResponse: StartCheckoutResponse = {
          subscriptionId: newSubscription.id,
          amount: decision.amount,
          toPay: 0,
          creditApplied: 0,
          creditGranted: 0,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentId: null,
          paymentMode: 'none',
          confirmationToken: null,
          paymentUrl: null,
          checkoutAction: 'activated',
          scheduledChange: null,
        };

        await finishIdempotentRequest({
          recordId: idempotencyRecordId,
          response: activatedResponse,
          tx,
        });

        return activatedResponse;
      });

      dispatchBillingPlanChangedIfNeeded({
        userId,
        source: 'subscriptions.start-checkout:policy_activation',
        previous: currentActive
          ? {
              subscriptionId: currentActive.subscription.id,
              planId: currentActive.subscription.planId,
              billingPeriod: currentActive.subscription.billingPeriod,
            }
          : null,
        next: {
          subscriptionId: response.subscriptionId,
          planId,
          billingPeriod: billingPeriodTyped,
        },
        paymentId: null,
        effectiveAt: now,
        occurredAt: now,
      });

      return response;
    }

    const shopId = String(config.yookassaShopId || '').trim();
    const secretKey = String(config.yookassaSecretKey || '').trim();
    if (!shopId || !secretKey) {
      throw createError({
        statusCode: 500,
        statusMessage: 'YooKassa credentials not configured',
      });
    }

    // Если у пользователя уже есть привязанная карта, сначала пробуем списать
    // напрямую без редиректа в YooKassa checkout.
    const savedPaymentMethodId = String(userRow?.paymentMethodId || '').trim();
    const canChargeSavedMethod = Boolean(
      userRow?.paymentMethodBound && savedPaymentMethodId
    );

    if (canChargeSavedMethod) {
      const savedMethodDiscountReservationKey = `saved-checkout:${userId}:${idempotencyKey}`;
      // Атомарно резервируем скидочный грант и списываем billing credit в одной
      // транзакции. Ранее эти шаги выполнялись последовательными отдельными
      // транзакциями, и при падении процесса между ними мы могли получить
      // расход credit без резервации гранта (или наоборот).
      const { savedMethodDiscount, savedMethodCredit } = await db.transaction(
        async (tx) => {
          const grant = await reserveBestDiscountGrant({
            userId,
            planId: planId as 'pro' | 'premium',
            billingPeriod: billingPeriodTyped,
            amount: decision.toPay,
            reservationKey: savedMethodDiscountReservationKey,
            now,
            tx,
          });
          const credit = await applyAvailableBillingCredit({
            userId,
            amount: grant.finalAmount,
            metadata: {
              source: 'saved_method_checkout',
              planId,
              billingPeriod: billingPeriodTyped,
            },
            now,
            tx,
          });

          return {
            savedMethodDiscount: grant,
            savedMethodCredit: credit,
          };
        }
      );
      const savedMethodCreditApplied = savedMethodCredit.appliedAmount;
      const savedMethodToPay = savedMethodCredit.finalAmount;
      discountReservationKey = savedMethodDiscountReservationKey;
      creditRestoreContext =
        savedMethodCreditApplied > 0
          ? {
              amount: savedMethodCreditApplied,
              metadata: {
                source: 'saved_method_checkout_restore',
                planId,
                billingPeriod: billingPeriodTyped,
              },
            }
          : null;

      if (savedMethodToPay === 0) {
        const response = await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({
              scheduledPlanId: null,
              scheduledBillingPeriod: null,
              scheduledChangeAt: null,
              scheduledFromSubscriptionId: null,
              scheduledChangeUpdatedAt: now,
              billingPlanId: null,
              billingPeriod: null,
              nextChargeAt: null,
              billingCollectionStatus: 'none',
              graceEndsAt: null,
              billingReminderSentAt: null,
              billingLockedAt: null,
              billingLockedBy: null,
              updatedAt: now,
            })
            .where(eq(users.id, userId));

          const [newSubscription] = await tx
            .insert(userSubscriptions)
            .values({
              userId,
              planId,
              billingPeriod: billingPeriodTyped,
              checkoutAmount: '0',
              checkoutCurrency: 'RUB',
              billingCreditApplied: String(savedMethodCreditApplied),
              billingCreditGranted: '0',
              startDate: now,
              endDate: nextEndDate,
              paymentStatus: 'active',
              autoRenew: true,
              sourcePlatform,
            })
            .returning();

          await tx
            .update(userSubscriptions)
            .set({ paymentStatus: 'expired', updatedAt: now })
            .where(
              and(
                eq(userSubscriptions.userId, userId),
                eq(userSubscriptions.paymentStatus, 'active'),
                gt(userSubscriptions.endDate, now),
                ne(userSubscriptions.id, newSubscription.id)
              )
            );

          if (
            planId !== 'basic' &&
            userRow?.trialEndedAt &&
            userRow.trialEndedAt > now
          ) {
            await tx
              .update(users)
              .set({
                trialEndedAt: now,
                updatedAt: now,
              })
              .where(eq(users.id, userId));
          }

          await finalizeDiscountGrantSuccess({
            reservationKey: savedMethodDiscountReservationKey,
            paymentId: null,
            now,
            tx,
          });

          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'checkout_started',
            planId,
            metadata: {
              subscriptionId: newSubscription.id,
              billingPeriod: billingPeriodTyped,
              policyAction: decision.policyAction,
              targetChargeValue: decision.targetChargeValue,
              unusedCurrentValue: decision.unusedCurrentValue,
              toPay: 0,
              sourcePlatform,
              hadCurrentActive: hasCurrentActive,
              promoDiscountPercent: savedMethodDiscount.percent,
              promoDiscountAmount: savedMethodDiscount.discountAmount,
              billingCreditApplied: savedMethodCreditApplied,
              paymentMode: 'promo_full_discount',
            },
          });

          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'purchase_success',
            planId,
            metadata: {
              subscriptionId: newSubscription.id,
              paymentId: null,
              amountPaid: 0,
              currency: 'RUB',
              method: 'promo_discount_full',
              promoDiscountPercent: savedMethodDiscount.percent,
              promoDiscountAmount: savedMethodDiscount.discountAmount,
              billingCreditApplied: savedMethodCreditApplied,
            },
          });

          const activatedResponse: StartCheckoutResponse = {
            subscriptionId: newSubscription.id,
            amount: decision.amount,
            toPay: 0,
            creditApplied: savedMethodCreditApplied,
            creditGranted: 0,
            promoDiscountPercent: savedMethodDiscount.percent,
            promoDiscountAmount: savedMethodDiscount.discountAmount,
            status: 'active',
            paymentProvider: 'yookassa',
            paymentId: null,
            paymentMode: 'none',
            confirmationToken: null,
            paymentUrl: null,
            checkoutAction: 'activated',
            scheduledChange: null,
          };

          await finishIdempotentRequest({
            recordId: idempotencyRecordId,
            response: activatedResponse,
            tx,
          });

          return activatedResponse;
        });

        // Dispatch-события нужны и для zero-amount пути (100% скидка или кредит):
        // без них referral-rewards, push-уведомления и Telegram-алерты не сработают.
        dispatchBillingPurchaseSuccessEvent({
          userId,
          subscriptionId: response.subscriptionId,
          paymentId: null,
          planId,
          billingPeriod: billingPeriodTyped,
          amount: 0,
          currency: 'RUB',
          source: 'subscriptions.start-checkout:saved_method_zero_amount',
        });

        return response;
      }

      const savedMethodIdempotenceKey = crypto
        .createHash('sha256')
        .update(
          `${userId}:${planId}:${billingPeriodTyped}:${idempotencyKey}:saved-method`,
          'utf8'
        )
        .digest('hex');

      const savedMethodDescription = `Подписка Ментала ${planId === 'premium' ? 'Premium' : 'PRO'} (${billingPeriodTyped === 'year' ? 'год' : 'месяц'})`;

      const savedMethodPayment = await createYooKassaPayment({
        shopId,
        secretKey,
        idempotenceKey: savedMethodIdempotenceKey,
        amount: savedMethodToPay,
        description: savedMethodDescription,
        metadata: {
          userId: String(userId),
          planId,
          billingPeriod: billingPeriodTyped,
          flow: 'saved_method_checkout',
          promoDiscountPercent: savedMethodDiscount.percent || null,
          promoDiscountAmount: savedMethodDiscount.discountAmount || null,
        },
        paymentMode: 'recurring',
        paymentMethodId: savedPaymentMethodId,
        receipt: userRow?.email
          ? buildYooKassaReceipt({
              email: userRow.email,
              amount: savedMethodToPay,
              description: savedMethodDescription,
            })
          : undefined,
      });

      const savedMethodPaymentId = String(savedMethodPayment.id || '').trim();
      const savedMethodStatus = String(savedMethodPayment.status || '')
        .trim()
        .toLowerCase();
      const savedMethodPaid = savedMethodPayment.paid === true;
      const savedMethodAmount = Number(savedMethodPayment.amount?.value || 0);
      const savedMethodCurrency = String(
        savedMethodPayment.amount?.currency || 'RUB'
      )
        .trim()
        .toUpperCase();

      if (!savedMethodPaymentId) {
        throw createError({
          statusCode: 502,
          statusMessage:
            'YooKassa saved-method payment response missing payment id',
        });
      }

      if (savedMethodStatus === 'succeeded' && savedMethodPaid) {
        const amountMatches =
          savedMethodCurrency === 'RUB' &&
          toCents(savedMethodAmount) === toCents(savedMethodToPay);
        if (!amountMatches) {
          if (savedMethodCreditApplied > 0) {
            await restoreAppliedBillingCredit({
              userId,
              amount: savedMethodCreditApplied,
              entryType: 'payment_restore',
              metadata: {
                source: 'saved_method_checkout_amount_mismatch',
                planId,
                billingPeriod: billingPeriodTyped,
              },
              now,
            });
            creditRestoreContext = null;
          }
          await releaseDiscountGrantReservation({
            reservationKey: savedMethodDiscountReservationKey,
            now,
          });
          throw createError({
            statusCode: 409,
            statusMessage:
              'Saved payment method charge amount/currency mismatch',
          });
        }

        const response = await db.transaction(async (tx) => {
          // Для успешного direct-charge тоже очищаем запланированную смену.
          await tx
            .update(users)
            .set({
              scheduledPlanId: null,
              scheduledBillingPeriod: null,
              scheduledChangeAt: null,
              scheduledFromSubscriptionId: null,
              scheduledChangeUpdatedAt: now,
              // Любая non-trial активация должна очищать trial-scheduled "хвосты".
              billingPlanId: null,
              billingPeriod: null,
              nextChargeAt: null,
              billingCollectionStatus: 'none',
              graceEndsAt: null,
              billingReminderSentAt: null,
              billingLockedAt: null,
              billingLockedBy: null,
              updatedAt: now,
            })
            .where(eq(users.id, userId));

          const [newSubscription] = await tx
            .insert(userSubscriptions)
            .values({
              userId,
              planId,
              billingPeriod: billingPeriodTyped,
              checkoutAmount: String(savedMethodToPay),
              checkoutCurrency: 'RUB',
              billingCreditApplied: String(savedMethodCreditApplied),
              billingCreditGranted: '0',
              yookassaPaymentId: savedMethodPaymentId,
              startDate: now,
              endDate: nextEndDate,
              paymentStatus: 'active',
              autoRenew: true,
              sourcePlatform,
            })
            .returning();

          await tx
            .update(userSubscriptions)
            .set({ paymentStatus: 'expired', updatedAt: now })
            .where(
              and(
                eq(userSubscriptions.userId, userId),
                eq(userSubscriptions.paymentStatus, 'active'),
                gt(userSubscriptions.endDate, now),
                ne(userSubscriptions.id, newSubscription.id)
              )
            );

          if (
            planId !== 'basic' &&
            userRow?.trialEndedAt &&
            userRow.trialEndedAt > now
          ) {
            await tx
              .update(users)
              .set({
                trialEndedAt: now,
                updatedAt: now,
              })
              .where(eq(users.id, userId));
          }

          await finalizeDiscountGrantSuccess({
            reservationKey: savedMethodDiscountReservationKey,
            paymentId: savedMethodPaymentId,
            now,
            tx,
          });

          await tx
            .insert(payments)
            .values({
              id: savedMethodPaymentId,
              subscriptionId: newSubscription.id,
              userId,
              amount: String(savedMethodAmount),
              currency: savedMethodCurrency,
              status: 'succeeded',
              metadata: savedMethodPayment as any,
            })
            .onConflictDoUpdate({
              target: payments.id,
              set: {
                subscriptionId: newSubscription.id,
                amount: String(savedMethodAmount),
                currency: savedMethodCurrency,
                status: 'succeeded',
                metadata: savedMethodPayment as any,
                updatedAt: now,
              },
            });

          const paymentMethodPresentation = extractPaymentMethodPresentation(
            savedMethodPayment.payment_method
          );
          const resolvedPaymentMethodId = String(
            savedMethodPayment.payment_method?.id || savedPaymentMethodId
          ).trim();
          if (resolvedPaymentMethodId) {
            await activateUserPaymentMethod({
              userId,
              paymentMethodId: resolvedPaymentMethodId,
              paymentMethodType: paymentMethodPresentation.paymentMethodType,
              paymentMethodTitle: paymentMethodPresentation.paymentMethodTitle,
              cardBrand: paymentMethodPresentation.cardBrand,
              cardLast4: paymentMethodPresentation.cardLast4,
              cardExpiryMonth: paymentMethodPresentation.cardExpiryMonth,
              cardExpiryYear: paymentMethodPresentation.cardExpiryYear,
              now,
              tx,
            });
          }

          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'checkout_started',
            planId,
            metadata: {
              subscriptionId: newSubscription.id,
              billingPeriod: billingPeriodTyped,
              policyAction: decision.policyAction,
              targetChargeValue: decision.targetChargeValue,
              unusedCurrentValue: decision.unusedCurrentValue,
              toPay: savedMethodToPay,
              sourcePlatform,
              hadCurrentActive: hasCurrentActive,
              paymentMode: 'saved_method',
              promoDiscountPercent: savedMethodDiscount.percent,
              promoDiscountAmount: savedMethodDiscount.discountAmount,
              billingCreditApplied: savedMethodCreditApplied,
            },
          });

          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'purchase_success',
            planId,
            metadata: {
              subscriptionId: newSubscription.id,
              paymentId: savedMethodPaymentId,
              amountPaid: savedMethodAmount,
              currency: savedMethodCurrency,
              method: 'saved_payment_method',
              promoDiscountPercent: savedMethodDiscount.percent,
              promoDiscountAmount: savedMethodDiscount.discountAmount,
              billingCreditApplied: savedMethodCreditApplied,
            },
          });

          const activatedResponse: StartCheckoutResponse = {
            subscriptionId: newSubscription.id,
            amount: decision.amount,
            toPay: savedMethodToPay,
            creditApplied: savedMethodCreditApplied,
            creditGranted: 0,
            promoDiscountPercent: savedMethodDiscount.percent,
            promoDiscountAmount: savedMethodDiscount.discountAmount,
            status: 'active',
            paymentProvider: 'yookassa',
            paymentId: savedMethodPaymentId,
            paymentMode: 'none',
            confirmationToken: null,
            paymentUrl: null,
            checkoutAction: 'activated',
            scheduledChange: null,
          };

          await finishIdempotentRequest({
            recordId: idempotencyRecordId,
            response: activatedResponse,
            tx,
          });

          return activatedResponse;
        });

        creditRestoreContext = null;

        dispatchBillingPurchaseSuccessEvent({
          userId,
          subscriptionId: response.subscriptionId,
          paymentId: savedMethodPaymentId,
          planId,
          billingPeriod: billingPeriodTyped,
          amount: savedMethodAmount,
          currency: savedMethodCurrency,
          source: 'subscriptions.start-checkout:saved_method',
        });

        dispatchBillingPlanChangedIfNeeded({
          userId,
          source: 'subscriptions.start-checkout:saved_method',
          previous: currentActive
            ? {
                subscriptionId: currentActive.subscription.id,
                planId: currentActive.subscription.planId,
                billingPeriod: currentActive.subscription.billingPeriod,
              }
            : null,
          next: {
            subscriptionId: response.subscriptionId,
            planId,
            billingPeriod: billingPeriodTyped,
          },
          paymentId: savedMethodPaymentId,
          effectiveAt: now,
          occurredAt: now,
        });

        return response;
      }

      if (savedMethodStatus !== 'canceled' && savedMethodStatus !== 'failed') {
        // Нетерминальный статус direct-charge небезопасно дублировать fallback checkout'ом.
        throw createError({
          statusCode: 409,
          statusMessage:
            'Saved payment charge is not finalized yet. Please retry shortly.',
        });
      }

      event.context.logger?.warn(
        {
          userId,
          planId,
          billingPeriod: billingPeriodTyped,
          paymentId: savedMethodPaymentId,
          status: savedMethodStatus,
        },
        'Saved payment method charge failed, falling back to checkout flow'
      );

      if (savedMethodCreditApplied > 0) {
        await restoreAppliedBillingCredit({
          userId,
          amount: savedMethodCreditApplied,
          entryType: 'payment_restore',
          metadata: {
            source: 'saved_method_checkout_fallback',
            planId,
            billingPeriod: billingPeriodTyped,
          },
          now,
        });
        creditRestoreContext = null;
      }

      await releaseDiscountGrantReservation({
        reservationKey: savedMethodDiscountReservationKey,
        now,
      });
    }

    // Всё состояние pending-сабскрипшна, reserve гранта и списание credit
    // коммитятся в одной транзакции, чтобы при падении процесса до создания
    // платежа в YooKassa у нас не оказалось рассинхрона (грант зарезервирован,
    // credit снят, а подписки нет — или наоборот).
    const {
      pendingSubscription,
      checkoutDiscount,
      checkoutCreditApplied,
      checkoutToPay,
    } = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(userSubscriptions)
        .values({
          userId,
          planId,
          billingPeriod: billingPeriodTyped,
          checkoutAmount: String(decision.toPay),
          checkoutCurrency: 'RUB',
          billingCreditApplied: '0',
          billingCreditGranted: '0',
          startDate: now,
          endDate: nextEndDate,
          paymentStatus: 'pending',
          autoRenew: true,
          sourcePlatform,
        })
        .returning();

      const discountReservationKey = `checkout-subscription:${created.id}`;
      const discount = await reserveBestDiscountGrant({
        userId,
        planId: planId as 'pro' | 'premium',
        billingPeriod: billingPeriodTyped,
        amount: decision.toPay,
        reservationKey: discountReservationKey,
        now,
        tx,
      });

      const credit = await applyAvailableBillingCredit({
        userId,
        amount: discount.finalAmount,
        sourceSubscriptionId: created.id,
        metadata: {
          source: 'checkout_subscription',
          planId,
          billingPeriod: billingPeriodTyped,
        },
        now,
        tx,
      });

      const creditApplied = credit.appliedAmount;
      const toPay = credit.finalAmount;

      await tx
        .update(userSubscriptions)
        .set({
          checkoutAmount: String(toPay),
          billingCreditApplied: String(creditApplied),
          updatedAt: now,
        })
        .where(eq(userSubscriptions.id, created.id));

      // Для upgrade с оплатой тоже очищаем запланированную смену.
      await tx
        .update(users)
        .set({
          scheduledPlanId: null,
          scheduledBillingPeriod: null,
          scheduledChangeAt: null,
          scheduledFromSubscriptionId: null,
          scheduledChangeUpdatedAt: now,
          // Начало non-trial checkout также очищает trial-scheduled поля,
          // чтобы UI не показывал устаревшее "Списание запланировано".
          billingPlanId: null,
          billingPeriod: null,
          nextChargeAt: null,
          billingCollectionStatus: 'none',
          graceEndsAt: null,
          billingReminderSentAt: null,
          billingLockedAt: null,
          billingLockedBy: null,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'checkout_started',
        planId,
        metadata: {
          subscriptionId: created.id,
          billingPeriod: billingPeriodTyped,
          policyAction: decision.policyAction,
          targetChargeValue: decision.targetChargeValue,
          unusedCurrentValue: decision.unusedCurrentValue,
          toPay,
          sourcePlatform,
          hadCurrentActive: hasCurrentActive,
          promoDiscountPercent: discount.percent,
          promoDiscountAmount: discount.discountAmount,
          billingCreditApplied: creditApplied,
        },
      });

      return {
        pendingSubscription: created,
        checkoutDiscount: discount,
        checkoutCreditApplied: creditApplied,
        checkoutToPay: toPay,
      };
    });

    createdPendingSubscriptionId = pendingSubscription.id;
    const checkoutDiscountReservationKey = `checkout-subscription:${pendingSubscription.id}`;
    discountReservationKey = checkoutDiscountReservationKey;
    creditRestoreContext =
      checkoutCreditApplied > 0
        ? {
            amount: checkoutCreditApplied,
            sourceSubscriptionId: pendingSubscription.id,
            metadata: {
              source: 'checkout_subscription_restore',
              planId,
              billingPeriod: billingPeriodTyped,
            },
          }
        : null;

    if (checkoutToPay === 0) {
      const response = await db.transaction(async (tx) => {
        await tx
          .update(userSubscriptions)
          .set({
            paymentStatus: 'active',
            updatedAt: now,
          })
          .where(eq(userSubscriptions.id, pendingSubscription.id));

        await tx
          .update(userSubscriptions)
          .set({ paymentStatus: 'expired', updatedAt: now })
          .where(
            and(
              eq(userSubscriptions.userId, userId),
              eq(userSubscriptions.paymentStatus, 'active'),
              gt(userSubscriptions.endDate, now),
              ne(userSubscriptions.id, pendingSubscription.id)
            )
          );

        await finalizeDiscountGrantSuccess({
          reservationKey: checkoutDiscountReservationKey,
          paymentId: null,
          now,
          tx,
        });

        await tx.insert(subscriptionEvents).values({
          userId,
          eventType: 'purchase_success',
          planId,
          metadata: {
            subscriptionId: pendingSubscription.id,
            paymentId: null,
            amountPaid: 0,
            currency: 'RUB',
            method: 'promo_discount_full',
            promoDiscountPercent: checkoutDiscount.percent,
            promoDiscountAmount: checkoutDiscount.discountAmount,
            billingCreditApplied: checkoutCreditApplied,
          },
        });

        const activatedResponse: StartCheckoutResponse = {
          subscriptionId: pendingSubscription.id,
          amount: decision.amount,
          toPay: 0,
          creditApplied: checkoutCreditApplied,
          creditGranted: 0,
          promoDiscountPercent: checkoutDiscount.percent,
          promoDiscountAmount: checkoutDiscount.discountAmount,
          status: 'active',
          paymentProvider: 'yookassa',
          paymentId: null,
          paymentMode: 'none',
          confirmationToken: null,
          paymentUrl: null,
          checkoutAction: 'activated',
          scheduledChange: null,
        };

        await finishIdempotentRequest({
          recordId: idempotencyRecordId,
          response: activatedResponse,
          tx,
        });

        return activatedResponse;
      });

      creditRestoreContext = null;

      // Dispatch-события нужны и для zero-amount пути (100% скидка):
      // без них referral-rewards, push-уведомления и Telegram-алерты не сработают.
      dispatchBillingPurchaseSuccessEvent({
        userId,
        subscriptionId: response.subscriptionId,
        paymentId: null,
        planId,
        billingPeriod: billingPeriodTyped,
        amount: 0,
        currency: 'RUB',
        source: 'subscriptions.start-checkout:checkout_zero_amount',
      });

      return response;
    }

    const yookassaIdempotenceKey = crypto
      .createHash('sha256')
      .update(`${userId}:${pendingSubscription.id}:${idempotencyKey}`, 'utf8')
      .digest('hex');
    const returnParams = new URLSearchParams({
      flow: 'payment',
      paymentReturn: '1',
      subscriptionId: String(pendingSubscription.id),
    });
    if (sourcePlatform === 'ios' || sourcePlatform === 'android') {
      returnParams.set('nativeApp', '1');
    }
    if (paymentMode === 'redirect' && externalFlow) {
      returnParams.set('externalFlow', '1');
    }
    let returnUrl: string | undefined;
    if (paymentMode === 'redirect') {
      const returnPath = `/payment-success?${returnParams.toString()}`;
      returnUrl = await buildExternalSessionConsumeReturnUrl({
        event,
        userId,
        appUrl,
        redirectPath: returnPath,
        ttlSeconds: PAYMENT_RETURN_EXTERNAL_SESSION_TTL_SECONDS,
        purpose: 'payment_return',
      });
    }

    const checkoutDescription = `Подписка Ментала ${planId === 'premium' ? 'Premium' : 'PRO'} (${billingPeriodTyped === 'year' ? 'год' : 'месяц'})`;

    const yookassaPayment = await createYooKassaPayment({
      shopId,
      secretKey,
      idempotenceKey: yookassaIdempotenceKey,
      amount: checkoutToPay,
      description: checkoutDescription,
      metadata: {
        userId: String(userId),
        subscriptionId: String(pendingSubscription.id),
        planId,
        billingPeriod: billingPeriodTyped,
        promoDiscountPercent: checkoutDiscount.percent || null,
        promoDiscountAmount: checkoutDiscount.discountAmount || null,
        billingCreditApplied: checkoutCreditApplied || null,
      },
      paymentMode,
      savePaymentMethod: true,
      merchantCustomerId: String(userId),
      returnUrl,
      receipt: userRow?.email
        ? buildYooKassaReceipt({
            email: userRow.email,
            amount: checkoutToPay,
            description: checkoutDescription,
          })
        : undefined,
    });

    const paymentId = String(yookassaPayment.id || '').trim();
    if (!paymentId) {
      throw createError({
        statusCode: 502,
        statusMessage: 'YooKassa payment response missing payment id',
      });
    }

    const confirmationToken =
      paymentMode === 'widget'
        ? String(yookassaPayment.confirmation?.confirmation_token || '').trim()
        : null;
    const paymentUrl =
      paymentMode === 'redirect'
        ? String(yookassaPayment.confirmation?.confirmation_url || '').trim()
        : null;

    if (paymentMode === 'widget' && !confirmationToken) {
      throw createError({
        statusCode: 502,
        statusMessage:
          'YooKassa payment response missing confirmation_token for widget mode',
      });
    }

    if (paymentMode === 'redirect' && !paymentUrl) {
      throw createError({
        statusCode: 502,
        statusMessage:
          'YooKassa payment response missing confirmation_url for redirect mode',
      });
    }

    yookassaPaymentCreated = true;
    creditRestoreContext = null;

    const paymentResponse: StartCheckoutResponse = {
      subscriptionId: pendingSubscription.id,
      amount: decision.amount,
      toPay: checkoutToPay,
      creditApplied: checkoutCreditApplied,
      creditGranted: 0,
      promoDiscountPercent: checkoutDiscount.percent,
      promoDiscountAmount: checkoutDiscount.discountAmount,
      status: 'pending',
      paymentProvider: 'yookassa',
      paymentId,
      paymentMode,
      confirmationToken,
      paymentUrl,
      checkoutAction: 'payment',
      scheduledChange: null,
    };

    await db.transaction(async (tx) => {
      await tx
        .update(userSubscriptions)
        .set({ yookassaPaymentId: paymentId })
        .where(
          and(
            eq(userSubscriptions.id, pendingSubscription.id),
            eq(userSubscriptions.paymentStatus, 'pending')
          )
        );

      await tx.insert(subscriptionEvents).values({
        userId,
        eventType: 'checkout_payment_created',
        planId,
        metadata: {
          subscriptionId: pendingSubscription.id,
          paymentId,
          paymentMode,
          toPay: checkoutToPay,
          promoDiscountPercent: checkoutDiscount.percent,
          promoDiscountAmount: checkoutDiscount.discountAmount,
          billingCreditApplied: checkoutCreditApplied,
        },
      });

      await finishIdempotentRequest({
        recordId: idempotencyRecordId,
        response: paymentResponse,
        tx,
      });
    });

    return paymentResponse;
  } catch (error) {
    if (discountReservationKey) {
      try {
        await releaseDiscountGrantReservation({
          reservationKey: discountReservationKey,
          now,
        });
      } catch (releaseError) {
        // Это критично: если не восстановили резерв, грант остаётся "залипшим"
        // до stale-cleanup. Логируем для ручного расследования, но не перекрываем
        // исходную ошибку checkout'а — её нужно вернуть клиенту.
        event.context.logger?.error(
          {
            userId,
            reservationKey: discountReservationKey,
            error: releaseError,
          },
          'Failed to release discount grant reservation after checkout error'
        );
      }
    }

    if (creditRestoreContext && !yookassaPaymentCreated) {
      try {
        await restoreAppliedBillingCredit({
          userId,
          amount: creditRestoreContext.amount,
          sourceSubscriptionId:
            creditRestoreContext.sourceSubscriptionId ?? null,
          entryType: 'payment_restore',
          metadata: creditRestoreContext.metadata ?? {},
          now,
        });
      } catch (restoreError) {
        // Аналогично: credit уже списан, восстановление упало — надо знать.
        event.context.logger?.error(
          {
            userId,
            amount: creditRestoreContext.amount,
            sourceSubscriptionId:
              creditRestoreContext.sourceSubscriptionId ?? null,
            error: restoreError,
          },
          'Failed to restore billing credit after checkout error'
        );
      }
      creditRestoreContext = null;
    }

    if (createdPendingSubscriptionId && !yookassaPaymentCreated) {
      await db.transaction(async (tx) => {
        const canceled = await tx
          .update(userSubscriptions)
          .set({
            paymentStatus: 'canceled',
            updatedAt: now,
          })
          .where(
            and(
              eq(userSubscriptions.id, createdPendingSubscriptionId),
              eq(userSubscriptions.paymentStatus, 'pending')
            )
          )
          .returning({
            id: userSubscriptions.id,
          });

        if (canceled.length) {
          await tx.insert(subscriptionEvents).values({
            userId,
            eventType: 'purchase_failed',
            planId,
            metadata: {
              subscriptionId: createdPendingSubscriptionId,
              reason: 'payment_create_failed',
            },
          });
        }
      });
    }

    await abortIdempotentRequest({ recordId: idempotencyRecordId });

    const statusCode =
      typeof (error as any)?.statusCode === 'number'
        ? Number((error as any).statusCode)
        : typeof (error as any)?.status === 'number'
          ? Number((error as any).status)
          : null;

    const errorMessage =
      (error as any)?.statusMessage ||
      (error as any)?.message ||
      'start_checkout_failed';

    if (!statusCode || statusCode >= 500) {
      dispatchBillingCheckoutErrorEvent({
        userId,
        planId,
        billingPeriod: billingPeriodTyped,
        statusCode,
        errorMessage,
      });
    }

    // Ошибки от YooKassa ($fetch) приходят с statusCode 4xx/5xx и пробрасываются как «unhandled».
    // H3 маскирует message в «Server Error», но сохраняет statusCode — клиент получает 403 + "Server Error".
    // Нормализуем: upstream-ошибки платёжного провайдера → 502 с понятным сообщением.
    // Наши createError: 400, 401, 404, 409, 500, 502. 403 и др. 4xx — от YooKassa.
    const our4xxCodes = [400, 401, 404, 409];
    const isUpstreamApiError =
      statusCode !== null &&
      statusCode >= 400 &&
      statusCode < 500 &&
      !our4xxCodes.includes(statusCode);

    if (isUpstreamApiError) {
      const err = error as any;
      const yookassaBody =
        err?.data ?? err?.response?._data ?? err?.response?.data ?? null;
      const yookassaCode =
        typeof yookassaBody?.code === 'string' ? yookassaBody.code : null;
      const yookassaDesc =
        typeof yookassaBody?.description === 'string'
          ? yookassaBody.description
          : null;
      const isTestKey = String(config.yookassaSecretKey || '').startsWith(
        'test_'
      );

      // Данные для обращения в поддержку ЮKassa — копируй этот блок целиком
      const supportPayload = {
        timestamp: new Date().toISOString(),
        source: 'start-checkout',
        shopId: config.yookassaShopId || '(пусто)',
        isTestKey,
        httpStatus: statusCode,
        yookassaResponse: yookassaBody ?? null,
        yookassaCode: yookassaCode ?? '(нет в ответе)',
        yookassaDescription: yookassaDesc ?? '(нет в ответе)',
        requestId: getHeader(event, 'x-request-id') || null,
      };
      console.error(
        '[YooKassa] Ошибка для поддержки ЮKassa (скопируй в тикет):\n' +
          JSON.stringify(supportPayload, null, 2)
      );

      event.context.logger?.warn(
        {
          userId,
          planId,
          upstreamStatus: statusCode,
          upstreamMessage: errorMessage,
          yookassaCode,
          yookassaDesc,
          yookassaBody: yookassaBody ?? null,
          isTestKey,
          shopIdPrefix: config.yookassaShopId
            ? String(config.yookassaShopId).slice(0, 4) + '***'
            : 'empty',
        },
        'YooKassa upstream error in start-checkout (403=недостаточно прав, проверь активацию магазина и return_url домен)'
      );
      throw createError({
        statusCode: 502,
        statusMessage: 'Payment provider temporarily unavailable',
        message: 'Платёжный провайдер временно недоступен. Попробуйте позже.',
      });
    }

    throw error;
  }
});
