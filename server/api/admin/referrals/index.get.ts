import { desc } from 'drizzle-orm';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import {
  billingCreditEntries,
  referralRedemptions,
} from '@/server/infrastructure/db/schema';
import { isMissingReferralInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';
import {
  buildDefaultReferralProgramSettings,
  getReferralProgramSettings,
} from '@/server/application/referral/referral-rewards.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  try {
    const [program, redemptions, creditEntries] = await Promise.all([
      getReferralProgramSettings(),
      db
        .select()
        .from(referralRedemptions)
        .orderBy(desc(referralRedemptions.redeemedAt)),
      db.select().from(billingCreditEntries),
    ]);
    const creditEntryMap = new Map(
      creditEntries
        .filter((entry) => entry.sourceReferralRedemptionId)
        .map((entry) => [entry.sourceReferralRedemptionId, entry] as const)
    );

    return {
      available: true,
      program,
      redemptions: redemptions.map((item) => ({
        ...item,
        redeemedAt: item.redeemedAt.toISOString(),
        convertedAt: item.convertedAt?.toISOString() || null,
        createdAt: item.createdAt.toISOString(),
        referrerCreditAmount: creditEntryMap.get(item.id)
          ? Number(creditEntryMap.get(item.id)?.amount || 0)
          : null,
        referrerCreditStatus: creditEntryMap.get(item.id)?.status || null,
        referrerCreditAvailableAt:
          creditEntryMap.get(item.id)?.availableAt?.toISOString() || null,
      })),
    };
  } catch (error) {
    if (!isMissingReferralInfrastructureError(error)) {
      throw error;
    }

    return {
      available: false,
      program: buildDefaultReferralProgramSettings({
        enabled: false,
      }),
      redemptions: [],
    };
  }
});
