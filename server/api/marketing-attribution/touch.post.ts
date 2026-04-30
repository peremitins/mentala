import { createError } from 'h3';
import { z } from 'zod';
import { getSessionUser } from '@/server/application/auth/session';
import { MarketingAttributionDto } from '@/shared/dto/marketing-attribution';
import { recordUserMarketingAttributionSafe } from '@/server/application/marketing-attribution/marketing-attribution.service';

const MarketingAttributionTouchDto = z.object({
  marketingAttribution: MarketingAttributionDto,
});

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event);
  if (!session?.user?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const body = MarketingAttributionTouchDto.parse(await readBody(event as any));

  await recordUserMarketingAttributionSafe({
    userId: session.user.id,
    touchpoint: 'authenticated_touch',
    authProvider: 'session',
    marketingAttribution: body.marketingAttribution,
  });

  return { ok: true };
});
