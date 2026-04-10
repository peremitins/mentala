import { getRouterParam } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { revokeReferralRewardsByRedemptionId } from '@/server/application/referral/referral-rewards.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');
  const id = Number(getRouterParam(event, 'id'));
  const redemption = await revokeReferralRewardsByRedemptionId({
    redemptionId: id,
  });

  return {
    redemption,
  };
});
