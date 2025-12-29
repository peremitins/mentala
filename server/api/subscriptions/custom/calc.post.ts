import { z } from 'zod';
import {
  calculateCustomPrice,
  type BillingPeriod,
} from '@/server/application/subscriptions/price-calculator';
import {
  CUSTOM_MIN_WEEKLY_MINUTES,
  CUSTOM_MAX_WEEKLY_MINUTES,
  CUSTOM_MINUTES_STEP,
} from '@/server/config/subscription';

const calcSchema = z.object({
  weeklyMinutes: z
    .number()
    .min(CUSTOM_MIN_WEEKLY_MINUTES)
    .max(CUSTOM_MAX_WEEKLY_MINUTES)
    .multipleOf(CUSTOM_MINUTES_STEP),
  billingPeriod: z.enum(['month', 'year']).default('month'),
});

/**
 * POST /api/subscriptions/custom/calc
 * Рассчитать стоимость Custom тарифа
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const validated = calcSchema.parse(body);

  const { weeklyMinutes, billingPeriod } = validated;

  const totalPrice = calculateCustomPrice({
    weeklyMinutes,
    billingPeriod: billingPeriod as BillingPeriod,
  });

  const WEEKS_IN_MONTH = 4;
  const totalMinutesPerMonth = weeklyMinutes * WEEKS_IN_MONTH;

  return {
    totalPrice,
    totalMinutesPerMonth,
    weeklyMinutes,
  };
});
