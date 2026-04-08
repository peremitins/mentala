import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { assertInternalPromoAvailable } from '@/server/application/promo-codes/promo-provider-guard.service';
import { isMissingReferralInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';
import {
  buildDefaultReferralProgramSettings,
  getReferralSummary,
} from '@/server/application/referral/referral-rewards.service';

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    });
  }

  await assertInternalPromoAvailable({
    event,
    userId: session.user.id,
  });

  try {
    const summary = await getReferralSummary({
      userId: session.user.id,
    });

    return {
      available: true,
      myCode: summary.profile.code,
      successfulInvitesCount: summary.successfulInvitesCount,
      pendingRewardsCount: summary.pendingRewardsCount,
      availableBillingCredit: Number(summary.availableBillingCredit || 0),
      pendingCredits: summary.pendingCreditEntries.map((entry) => ({
        id: entry.id,
        amount: Number(entry.amount || 0),
        status: entry.status,
        availableAt: entry.availableAt?.toISOString() || null,
        sourceLabel:
          (entry.metadata as Record<string, unknown>)?.sourceLabel ||
          'Реферальная награда',
      })),
      program: {
        enabled: summary.program.enabled,
        inviteePercent: Number(summary.program.inviteePercent),
        referrerPercent: Number(summary.program.referrerPercent),
        inviteeRewardValidityDays: Number(
          summary.program.inviteeRewardValidityDays
        ),
        creditHoldDays: Number(summary.program.creditHoldDays ?? 0),
        inviteeTargetPlanScope: summary.program.inviteeTargetPlanScope,
        inviteeTargetPeriodScope: summary.program.inviteeTargetPeriodScope,
      },
    };
  } catch (error) {
    if (!isMissingReferralInfrastructureError(error)) {
      throw error;
    }

    // Пока миграции не применены, не валим bootstrap и скрываем referral UI.
    return {
      available: false,
      myCode: '',
      successfulInvitesCount: 0,
      pendingRewardsCount: 0,
      availableBillingCredit: 0,
      pendingCredits: [],
      program: buildDefaultReferralProgramSettings({
        enabled: false,
      }),
    };
  }
});
