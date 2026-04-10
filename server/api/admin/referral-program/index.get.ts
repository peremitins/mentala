import { requireRole } from '@/server/utils/require-role';
import { isMissingReferralInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';
import {
  buildDefaultReferralProgramSettings,
  getReferralProgramSettings,
} from '@/server/application/referral/referral-rewards.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  try {
    return {
      available: true,
      ...(await getReferralProgramSettings()),
    };
  } catch (error) {
    if (!isMissingReferralInfrastructureError(error)) {
      throw error;
    }

    return {
      available: false,
      ...buildDefaultReferralProgramSettings({
        enabled: false,
      }),
    };
  }
});
