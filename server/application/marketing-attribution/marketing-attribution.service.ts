import { db } from '@/server/infrastructure/db/client';
import { userMarketingAttributions } from '@/server/infrastructure/db/schema';
import { normalizeMarketingAttribution } from '@/shared/utils/marketingAttribution';
import type { MarketingAttributionDto } from '@/shared/dto/marketing-attribution';
import { sql } from 'drizzle-orm';

export type MarketingAttributionTouchpoint =
  | 'email_register_started'
  | 'email_login'
  | 'oauth_signup'
  | 'oauth_login'
  | 'oauth_link'
  | 'authenticated_touch';

export type MarketingAttributionAuthProvider =
  | 'email'
  | 'google'
  | 'apple'
  | 'vk'
  | 'session';

type RecordMarketingAttributionParams = {
  userId: number;
  touchpoint: MarketingAttributionTouchpoint;
  authProvider?: MarketingAttributionAuthProvider | null;
  marketingAttribution?: MarketingAttributionDto | null;
};

function parseCapturedAt(value?: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function hasRecentSameAttribution(
  userId: number,
  attribution: MarketingAttributionDto
): Promise<boolean> {
  const result = await db.execute(sql`
    select id
    from user_marketing_attributions
    where user_id = ${userId}
      and created_at >= now() - interval '30 minutes'
      and coalesce(utm_source, '') = ${attribution.utmSource ?? ''}
      and coalesce(utm_medium, '') = ${attribution.utmMedium ?? ''}
      and coalesce(utm_campaign, '') = ${attribution.utmCampaign ?? ''}
      and coalesce(utm_content, '') = ${attribution.utmContent ?? ''}
      and coalesce(utm_term, '') = ${attribution.utmTerm ?? ''}
      and coalesce(gclid, '') = ${attribution.gclid ?? ''}
      and coalesce(yclid, '') = ${attribution.yclid ?? ''}
      and coalesce(fbclid, '') = ${attribution.fbclid ?? ''}
      and coalesce(ttclid, '') = ${attribution.ttclid ?? ''}
      and coalesce(landing_url, '') = ${attribution.landingUrl ?? ''}
    limit 1
  `);

  return result.rows.length > 0;
}

export async function recordUserMarketingAttributionSafe({
  userId,
  touchpoint,
  authProvider,
  marketingAttribution,
}: RecordMarketingAttributionParams): Promise<void> {
  const normalized = normalizeMarketingAttribution(marketingAttribution);
  if (!normalized) {
    return;
  }

  try {
    if (
      touchpoint === 'authenticated_touch' &&
      (await hasRecentSameAttribution(userId, normalized))
    ) {
      return;
    }

    await db.insert(userMarketingAttributions).values({
      userId,
      touchpoint,
      authProvider: authProvider ?? null,
      utmSource: normalized.utmSource ?? null,
      utmMedium: normalized.utmMedium ?? null,
      utmCampaign: normalized.utmCampaign ?? null,
      utmContent: normalized.utmContent ?? null,
      utmTerm: normalized.utmTerm ?? null,
      gclid: normalized.gclid ?? null,
      yclid: normalized.yclid ?? null,
      fbclid: normalized.fbclid ?? null,
      ttclid: normalized.ttclid ?? null,
      landingUrl: normalized.landingUrl ?? null,
      referrer: normalized.referrer ?? null,
      rawParams: normalized.rawParams ?? {},
      capturedAt: parseCapturedAt(normalized.capturedAt),
    });
  } catch (error) {
    console.warn('[MarketingAttribution] Failed to record user touchpoint', {
      userId,
      touchpoint,
      authProvider,
      error: getSafeErrorMessage(error),
    });
  }
}
