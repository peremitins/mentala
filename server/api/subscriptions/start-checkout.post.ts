import { getSessionUser } from '@/server/application/auth/session';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  userSubscriptions,
  subscriptionPlans,
  subscriptionEvents,
  users,
} from '@/server/infrastructure/db/schema';
import { eq, and, gt, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  calculatePlanChange,
  applyPlanChange,
} from '@/server/application/subscriptions/plan-change.service';
import {
  calculatePlanPrice,
  calculateCustomPrice,
  type BillingPeriod,
} from '@/server/application/subscriptions/price-calculator';
import { getHeader } from 'h3';
import {
  CUSTOM_MIN_WEEKLY_MINUTES,
  CUSTOM_MAX_WEEKLY_MINUTES,
  CUSTOM_MINUTES_STEP,
  DEFAULT_WEEKLY_MINUTES_LIMIT,
} from '@/server/config/subscription';
import {
  abortIdempotentRequest,
  finishIdempotentRequest,
  startIdempotentRequest,
} from '@/server/application/idempotency/idempotency.service';

const checkoutSchema = z.object({
  planId: z.string(),
  billingPeriod: z.enum(['month', 'year']).default('month'),
  customConfig: z
    .object({
      weeklyMinutes: z
        .number()
        .min(CUSTOM_MIN_WEEKLY_MINUTES)
        .max(CUSTOM_MAX_WEEKLY_MINUTES)
        .multipleOf(CUSTOM_MINUTES_STEP),
      avatarEnabled: z.boolean(),
    })
    .optional(),
});

/**
 * POST /api/subscriptions/start-checkout
 * Начать процесс оплаты подписки
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

  const route = '/api/subscriptions/start-checkout';
  const idem = await startIdempotentRequest<{
    paymentUrl: string | null;
    subscriptionId: number;
    amount: number;
    toPay: number;
    creditApplied: number;
    creditGranted: number;
    status: 'pending' | 'active';
  }>({
    userId: sessionResult.user.id,
    route,
    key: idempotencyKey,
  });

  if (idem.kind === 'hit') {
    return idem.response;
  }
  if (idem.kind === 'in_progress') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'Checkout already in progress for this Idempotency-Key. Retry later.',
    });
  }

  const idempotencyRecordId = idem.recordId;

  const body = await readBody(event);
  const validated = checkoutSchema.parse(body);

  const { planId, billingPeriod, customConfig } = validated;

  try {
    const config = useRuntimeConfig(event);
    const appUrl = config.public.appUrl || 'http://localhost:3000';

    // Получаем план
    const plan = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);

    if (!plan.length) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Plan not found',
      });
    }

    // Рассчитываем цену
    let totalPrice: number;
    let finalCustomConfig = null;

    if (plan[0].isCustomConfigurable) {
      if (!customConfig) {
        throw createError({
          statusCode: 400,
          statusMessage: 'customConfig required for Custom plan',
        });
      }

      totalPrice = calculateCustomPrice({
        weeklyMinutes: customConfig.weeklyMinutes,
        avatarEnabled: customConfig.avatarEnabled,
        billingPeriod: billingPeriod as BillingPeriod,
      });

      finalCustomConfig = {
        weeklyMinutes: customConfig.weeklyMinutes,
        avatarEnabled: customConfig.avatarEnabled,
        totalPrice,
      };
    } else {
      // Для обычных планов
      totalPrice = calculatePlanPrice({
        baseMonthlyPrice: Number(plan[0].basePrice),
        billingPeriod: billingPeriod as BillingPeriod,
        isCustom: false,
      });
    }

    // Проверяем, есть ли активная подписка (не истекшая, для пересчета)
    const now = new Date();
    const currentSubscription = await db
      .select()
      .from(userSubscriptions)
      .where(
        and(
          eq(userSubscriptions.userId, sessionResult.user.id),
          eq(userSubscriptions.paymentStatus, 'active'),
          gt(userSubscriptions.endDate, now) // подписка не истекла
        )
      )
      .limit(1);

    let calculation: any = null;
    let subscriptionId: number | null = null;

    if (currentSubscription.length) {
      // Есть активная подписка - рассчитываем пересчет
      // Передаем custom цену если это Custom план
      const customPriceForCalculation = finalCustomConfig?.totalPrice;
      calculation = await calculatePlanChange(
        sessionResult.user.id,
        planId,
        billingPeriod as BillingPeriod,
        customPriceForCalculation
      );

      // Проверяем блокировку даунгрейда (если новый план имеет меньший лимит минут)
      const newPlanWeeklyLimit = plan[0].weeklyMinutesLimit;
      if (finalCustomConfig) {
        // Для Custom лимит берем из конфига
        // TODO: проверить usedMinutesThisWeek и заблокировать если превышает
      } else if (newPlanWeeklyLimit < DEFAULT_WEEKLY_MINUTES_LIMIT) {
        // TODO: проверить usedMinutesThisWeek и заблокировать если превышает новый лимит
      }
    } else {
      // Нет активной подписки - базовый расчет
      calculation = {
        difference: totalPrice,
        toPay: totalPrice,
        credit: 0,
        oldPlanUsedAmount: 0,
        oldPlanRemainingAmount: 0,
        newPlanRemainingCost: totalPrice,
      };
    }

    // Получаем текущий кредит пользователя (для расчета toPay)
    const userRow = await db
      .select({
        billingCredit: users.billingCredit,
        trialEndedAt: users.trialEndedAt,
      })
      .from(users)
      .where(eq(users.id, sessionResult.user.id))
      .limit(1);

    const currentCredit = userRow[0] ? Number(userRow[0].billingCredit) : 0;

    const rawToPay = Math.max(0, Number(calculation?.toPay || 0));
    const creditGranted = Math.max(0, Number(calculation?.credit || 0));
    const creditApplied = rawToPay > 0 ? Math.min(currentCredit, rawToPay) : 0;
    const toPay = Math.max(0, rawToPay - creditApplied);

    // Определяем платформу из заголовка X-Platform (передается с клиента через Capacitor)
    const platformHeader = getHeader(event, 'x-platform')?.toLowerCase();
    const sourcePlatform = (
      platformHeader === 'ios' || platformHeader === 'android'
        ? platformHeader
        : 'web'
    ) as 'web' | 'ios' | 'android';

    // Всё, что меняет состояние, делаем атомарно
    const response = await db.transaction(async (tx) => {
      // Создаем pending подписку
      if (currentSubscription.length) {
        const newSub = await applyPlanChange(
          sessionResult.user.id,
          planId,
          billingPeriod as BillingPeriod,
          finalCustomConfig,
          calculation,
          sourcePlatform,
          {
            checkoutAmount: toPay,
            checkoutCurrency: 'RUB',
            billingCreditApplied: creditApplied,
            billingCreditGranted: creditGranted,
          },
          tx
        );
        subscriptionId = newSub.id;
      } else {
        const daysInPeriod = billingPeriod === 'year' ? 365 : 30;
        const endDate = new Date(
          now.getTime() + daysInPeriod * 24 * 60 * 60 * 1000
        );

        const [newSub] = await tx
          .insert(userSubscriptions)
          .values({
            userId: sessionResult.user.id,
            planId,
            billingPeriod: billingPeriod as BillingPeriod,
            customConfig: finalCustomConfig,
            checkoutAmount: String(toPay),
            checkoutCurrency: 'RUB',
            billingCreditApplied: String(creditApplied),
            billingCreditGranted: String(creditGranted),
            startDate: now,
            endDate,
            paymentStatus: 'pending',
            autoRenew: true,
            sourcePlatform,
          })
          .returning();
        subscriptionId = newSub.id;
      }

      if (!subscriptionId) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Failed to create subscription',
        });
      }

      // Резервируем кредит сразу, чтобы избежать двойного применения в нескольких pending checkout
      if (creditApplied > 0) {
        const newCredit = Math.max(0, currentCredit - creditApplied);
        await tx
          .update(users)
          .set({ billingCredit: String(newCredit), updatedAt: now })
          .where(eq(users.id, sessionResult.user.id));
      }

      // Логируем событие checkout_started
      await tx.insert(subscriptionEvents).values({
        userId: sessionResult.user.id,
        eventType: 'checkout_started',
        planId,
        metadata: {
          billingPeriod,
          customConfig: finalCustomConfig,
          totalPrice,
          calculation,
          creditApplied,
          creditGranted,
          toPay,
        },
      });

      // Если платить нечего — финализируем сразу (оплата внутренним кредитом/переплатой)
      if (toPay === 0) {
        // Активируем новую подписку
        await tx
          .update(userSubscriptions)
          .set({ paymentStatus: 'active', autoRenew: true })
          .where(eq(userSubscriptions.id, subscriptionId));

        // Истекаем другие активные подписки пользователя
        const activeNow = await tx
          .select()
          .from(userSubscriptions)
          .where(
            and(
              eq(userSubscriptions.userId, sessionResult.user.id),
              eq(userSubscriptions.paymentStatus, 'active'),
              gt(userSubscriptions.endDate, now),
              ne(userSubscriptions.id, subscriptionId)
            )
          );

        for (const oldSub of activeNow) {
          await tx
            .update(userSubscriptions)
            .set({ paymentStatus: 'expired' })
            .where(eq(userSubscriptions.id, oldSub.id));
        }

        // Начисляем creditGranted (если есть) — только при финализации
        if (creditGranted > 0) {
          const afterReserve = Math.max(0, currentCredit - creditApplied);
          await tx
            .update(users)
            .set({
              billingCredit: String(afterReserve + creditGranted),
              updatedAt: now,
            })
            .where(eq(users.id, sessionResult.user.id));
        }

        // Завершаем Trial немедленно только если активирован платный план (не Basic)
        if (
          planId !== 'basic' &&
          userRow[0]?.trialEndedAt &&
          userRow[0].trialEndedAt > now
        ) {
          await tx
            .update(users)
            .set({ trialEndedAt: now, updatedAt: now })
            .where(eq(users.id, sessionResult.user.id));
        }

        await tx.insert(subscriptionEvents).values({
          userId: sessionResult.user.id,
          eventType: 'purchase_success',
          planId,
          metadata: {
            subscriptionId,
            paymentId: null,
            amountPaid: 0,
            creditApplied,
            creditGranted,
            method: 'internal_credit',
          },
        });

        const finalized = {
          paymentUrl: null as string | null,
          subscriptionId: subscriptionId!,
          amount: totalPrice,
          toPay,
          creditApplied,
          creditGranted,
          status: 'active' as const,
        };

        await finishIdempotentRequest({
          recordId: idempotencyRecordId,
          response: finalized,
          tx,
        });

        return finalized;
      }

      const pending = {
        paymentUrl:
          `${appUrl}/subscription?payment_success=true&subscription_id=${subscriptionId}` as string,
        subscriptionId: subscriptionId!,
        amount: totalPrice,
        toPay,
        creditApplied,
        creditGranted,
        status: 'pending' as const,
      };

      await finishIdempotentRequest({
        recordId: idempotencyRecordId,
        response: pending,
        tx,
      });

      return pending;
    });

    // TODO: Интеграция с YooKassa (создание платежа и получение реального paymentUrl)
    // Важно: при создании платежа amount.value должен быть равен `toPay`
    // (то есть после применения `billingCreditApplied`) и совпадать с `user_subscriptions.checkout_amount`.
    return response;
  } catch (error) {
    await abortIdempotentRequest({ recordId: idempotencyRecordId });
    throw error;
  }
});
