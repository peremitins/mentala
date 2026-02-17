import { setHeader } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { landingConfig } from '@/server/infrastructure/db/schema';
import type { LandingConfigDto } from '@/shared/dto/landing';

const DEFAULT_CTA_URL = 'https://my.mentala.app/auth';

export default defineEventHandler(async (event): Promise<LandingConfigDto> => {
  // Единая кэш-политика release-флага для SSR+SWR.
  setHeader(
    event,
    'Cache-Control',
    'public, max-age=60, stale-while-revalidate=120'
  );

  let rows = await db
    .select()
    .from(landingConfig)
    .where(eq(landingConfig.id, 1))
    .limit(1);

  if (!rows.length) {
    await db
      .insert(landingConfig)
      .values({
        id: 1,
        isReleased: false,
        ctaUrl: DEFAULT_CTA_URL,
      })
      .onConflictDoNothing();

    rows = await db
      .select()
      .from(landingConfig)
      .where(eq(landingConfig.id, 1))
      .limit(1);
  }

  const row = rows[0];

  return {
    isReleased: row?.isReleased ?? false,
    ctaUrl: row?.ctaUrl || DEFAULT_CTA_URL,
    updatedAt: row?.updatedAt?.toISOString() || new Date().toISOString(),
  };
});
