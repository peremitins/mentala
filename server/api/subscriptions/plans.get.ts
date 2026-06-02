import { db } from '@/server/infrastructure/db/client';
import { subscriptionPlans } from '@/server/infrastructure/db/schema';
import { inArray } from 'drizzle-orm';
import { PUBLIC_SUBSCRIPTION_PLAN_IDS } from '@/server/application/subscriptions/public-plans';

/**
 * GET /api/subscriptions/plans
 * Получить список доступных тарифов
 */

export default defineEventHandler(async () => {
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(inArray(subscriptionPlans.id, [...PUBLIC_SUBSCRIPTION_PLAN_IDS]))
    .orderBy(subscriptionPlans.name);

  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      basePrice: Number(plan.basePrice),
      weeklyMinutesLimit: plan.weeklyMinutesLimit,
      avatarEnabled: false,
    })),
  };
});
