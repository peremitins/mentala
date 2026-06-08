import { createError, defineEventHandler, readBody } from 'h3';
import { z } from 'zod';
import { getSessionUser } from '@/server/application/auth/session';
import {
  markTrialUpsellMilestoneShown,
  TRIAL_UPSELL_MILESTONES,
} from '@/server/application/subscriptions/trial-upsell.service';

const bodySchema = z.object({
  milestone: z
    .number()
    .int()
    .refine(
      (value) => (TRIAL_UPSELL_MILESTONES as readonly number[]).includes(value),
      { message: 'Unsupported trial upsell milestone' }
    ),
});

/**
 * POST /api/subscriptions/trial-upsell/mark-shown
 * Отмечает контрольную точку промо-paywall как показанную, чтобы не показывать
 * её повторно. Вызывается клиентом в момент фактического показа модалки.
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  const body = await readBody(event);
  const { milestone } = bodySchema.parse(body);

  await markTrialUpsellMilestoneShown({
    userId: sessionResult.user.id,
    milestone,
  });

  return { success: true };
});
