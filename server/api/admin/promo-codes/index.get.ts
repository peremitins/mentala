import { desc } from 'drizzle-orm';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import {
  promoCampaigns,
  promoCodeRedemptions,
} from '@/server/infrastructure/db/schema';
import { isMissingPromoInfrastructureError } from '@/server/application/promo-codes/promo-infrastructure-compat.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  try {
    const campaigns = await db
      .select()
      .from(promoCampaigns)
      .orderBy(desc(promoCampaigns.createdAt));

    const redemptions = await db.select().from(promoCodeRedemptions);
    const redemptionMap = new Map(
      redemptions.map((item) => [item.campaignId, item] as const)
    );

    return {
      available: true,
      campaigns: campaigns.map((campaign) => {
        const redemption = redemptionMap.get(campaign.id);
        return {
          ...campaign,
          startsAt: campaign.startsAt?.toISOString() || null,
          endsAt: campaign.endsAt?.toISOString() || null,
          createdAt: campaign.createdAt.toISOString(),
          updatedAt: campaign.updatedAt.toISOString(),
          consumedByUserId: redemption?.userId ?? null,
          consumedAt: redemption?.redeemedAt?.toISOString() || null,
        };
      }),
    };
  } catch (error) {
    if (!isMissingPromoInfrastructureError(error)) {
      throw error;
    }

    return {
      available: false,
      campaigns: [],
    };
  }
});
