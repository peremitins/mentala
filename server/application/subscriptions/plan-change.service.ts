/**
 * Сервис для пересчета при смене плана
 */

import { db } from '@/server/infrastructure/db/client';
import {
  userSubscriptions,
  subscriptionPlans,
} from '@/server/infrastructure/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { calculatePlanPrice, type BillingPeriod } from './price-calculator';

export interface PlanChangeCalculation {
  difference: number; // положительное = доплата, отрицательное = переплата (кредит)
  toPay: number; // сколько нужно доплатить (если difference > 0)
  credit: number; // сколько зачислить как кредит (если difference < 0)
  oldPlanUsedAmount: number; // сколько использовано из старого плана
  oldPlanRemainingAmount: number; // сколько осталось от старого плана
  newPlanRemainingCost: number; // стоимость оставшихся дней нового плана
}

/**
 * Рассчитать пересчет при смене плана
 */
export async function calculatePlanChange(
  userId: number,
  newPlanId: string,
  billingPeriod: BillingPeriod
): Promise<PlanChangeCalculation> {
  // Получаем текущую активную подписку (не истекшую)
  const now = new Date();
  const currentSubscription = await db
    .select({
      subscription: userSubscriptions,
      plan: subscriptionPlans,
    })
    .from(userSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(userSubscriptions.planId, subscriptionPlans.id)
    )
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .orderBy(userSubscriptions.createdAt)
    .limit(1);

  if (!currentSubscription.length) {
    // Если нет активной подписки - просто возвращаем стоимость нового плана
    const newPlan = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, newPlanId))
      .limit(1);

    if (!newPlan.length) {
      throw new Error(`Plan ${newPlanId} not found`);
    }

    const totalPrice = calculatePlanPrice({
      baseMonthlyPrice: Number(newPlan[0].basePrice),
      billingPeriod,
    });

    return {
      difference: totalPrice,
      toPay: totalPrice,
      credit: 0,
      oldPlanUsedAmount: 0,
      oldPlanRemainingAmount: 0,
      newPlanRemainingCost: totalPrice,
    };
  }

  const { subscription: oldSub, plan: oldPlan } = currentSubscription[0];

  // Получаем новый план
  const newPlan = await db
    .select()
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.id, newPlanId))
    .limit(1);

  if (!newPlan.length) {
    throw new Error(`Plan ${newPlanId} not found`);
  }

  // Используем now объявленный выше
  const oldStartDate = oldSub.startDate;
  const oldEndDate = oldSub.endDate;

  // Вычисляем оставшиеся дни
  const totalDays = Math.floor(
    (oldEndDate.getTime() - oldStartDate.getTime()) / (24 * 60 * 60 * 1000)
  );
  const remainingDays = Math.floor(
    (oldEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  const usedDays = totalDays - remainingDays;

  if (remainingDays <= 0) {
    // Подписка уже истекла - просто возвращаем стоимость нового плана
    const totalPrice = calculatePlanPrice({
      baseMonthlyPrice: Number(newPlan[0].basePrice),
      billingPeriod,
    });

    return {
      difference: totalPrice,
      toPay: totalPrice,
      credit: 0,
      oldPlanUsedAmount: 0,
      oldPlanRemainingAmount: 0,
      newPlanRemainingCost: totalPrice,
    };
  }

  // Вычисляем стоимость использованных дней старого плана
  const oldBillingPeriod = oldSub.billingPeriod as BillingPeriod;
  const oldPlanTotalPrice = calculatePlanPrice({
    baseMonthlyPrice: Number(oldPlan.basePrice),
    billingPeriod: oldBillingPeriod,
  });
  const oldPlanDailyPrice = oldPlanTotalPrice / totalDays;
  const usedAmount = oldPlanDailyPrice * usedDays;

  // Вычисляем стоимость оставшихся дней нового плана на основе basePrice
  const newPlanTotalPrice = calculatePlanPrice({
    baseMonthlyPrice: Number(newPlan[0].basePrice),
    billingPeriod,
  });
  const daysInNewPeriod = billingPeriod === 'year' ? 365 : 30;
  const newPlanDailyPrice = newPlanTotalPrice / daysInNewPeriod;
  const remainingCost = newPlanDailyPrice * remainingDays;

  // Вычисляем разницу
  const difference = remainingCost - (oldPlanTotalPrice - usedAmount);

  return {
    difference,
    toPay: difference > 0 ? Math.round(difference) : 0,
    credit: difference < 0 ? Math.round(Math.abs(difference)) : 0,
    oldPlanUsedAmount: Math.round(usedAmount),
    oldPlanRemainingAmount: Math.round(oldPlanTotalPrice - usedAmount),
    newPlanRemainingCost: Math.round(remainingCost),
  };
}

/**
 * Применить смену плана (создать новую подписку, обновить старую)
 */
export async function applyPlanChange(
  userId: number,
  newPlanId: string,
  billingPeriod: BillingPeriod,
  calculation: PlanChangeCalculation,
  sourcePlatform: 'web' | 'ios' | 'android' = 'web',
  checkout?: {
    checkoutAmount: number;
    checkoutCurrency: string;
    billingCreditApplied: number;
    billingCreditGranted: number;
  },
  tx?: any
) {
  const client = tx ?? db;
  // Получаем текущую активную подписку (не истекшую)
  const now = new Date();
  const currentSubscription = await client
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .limit(1);

  // Используем now объявленный выше
  let newEndDate: Date;

  if (currentSubscription.length) {
    const oldSub = currentSubscription[0];
    const oldEndDate = oldSub.endDate;
    const remainingDays = Math.floor(
      (oldEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Если доплата за полный период - продлеваем на полный период
    const daysInNewPeriod = billingPeriod === 'year' ? 365 : 30;
    if (
      calculation.toPay > 0 &&
      calculation.toPay >= calculation.newPlanRemainingCost * 0.5
    ) {
      // Доплата значительная - продлеваем на полный период
      newEndDate = new Date(
        now.getTime() + daysInNewPeriod * 24 * 60 * 60 * 1000
      );
    } else {
      // Используем оставшиеся дни
      newEndDate = new Date(
        now.getTime() + remainingDays * 24 * 60 * 60 * 1000
      );
    }

    // ВАЖНО: Старую подписку НЕ трогаем здесь!
    // Она останется active до успешной оплаты новой подписки.
    // В webhook payment.succeeded старая подписка будет переведена в expired,
    // а новая активирована. При payment.canceled - pending отменяется, старая остается active.
  } else {
    // Нет активной подписки - создаем на полный период
    const daysInPeriod = billingPeriod === 'year' ? 365 : 30;
    newEndDate = new Date(now.getTime() + daysInPeriod * 24 * 60 * 60 * 1000);
  }

  // Создаем новую подписку
  const [newSubscription] = await client
    .insert(userSubscriptions)
    .values({
      userId,
      planId: newPlanId,
      billingPeriod: billingPeriod as BillingPeriod,
      checkoutAmount: String(
        checkout?.checkoutAmount ?? calculation.toPay ?? 0
      ),
      checkoutCurrency: checkout?.checkoutCurrency ?? 'RUB',
      billingCreditApplied: String(checkout?.billingCreditApplied ?? 0),
      billingCreditGranted: String(checkout?.billingCreditGranted ?? 0),
      startDate: now,
      endDate: newEndDate,
      paymentStatus: 'pending', // будет обновлено после оплаты
      autoRenew: true,
      sourcePlatform,
    })
    .returning();

  return newSubscription;
}
