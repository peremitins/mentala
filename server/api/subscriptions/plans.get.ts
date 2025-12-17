import { db } from '@/server/infrastructure/db/client';
import { subscriptionPlans } from '@/server/infrastructure/db/schema';
import { and, eq, ne } from 'drizzle-orm';

/**
 * GET /api/subscriptions/plans
 * Получить список доступных тарифов
 */

export default defineEventHandler(async (event) => {
  const plans = await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.isVisibleInUI, true),
        ne(subscriptionPlans.id, 'trial') // Явно исключаем trial (он больше не отдельный план)
      )
    )
    .orderBy(subscriptionPlans.name);

  return {
    plans: plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      basePrice: Number(plan.basePrice),
      weeklyMinutesLimit: plan.weeklyMinutesLimit,
      avatarEnabled: plan.avatarEnabled,
      pricePerMinuteGPT: Number(plan.pricePerMinuteGPT),
      pricePerMinuteAvatar: Number(plan.pricePerMinuteAvatar),
      isCustomConfigurable: plan.isCustomConfigurable,
    })),
  };
});
