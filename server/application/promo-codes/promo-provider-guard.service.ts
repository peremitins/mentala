import { createError, getHeader } from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';

type SourcePlatform = 'web' | 'ios' | 'android';

function resolveSourcePlatform(event: any): SourcePlatform {
  const platformHeader = String(getHeader(event, 'x-platform') || '')
    .trim()
    .toLowerCase();
  if (platformHeader === 'ios') return 'ios';
  if (platformHeader === 'android') return 'android';
  return 'web';
}

function normalizeStorefrontCountry(value: unknown): string | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

export async function assertInternalPromoAvailable(params: {
  event: any;
  userId: number;
}) {
  const sourcePlatform = resolveSourcePlatform(params.event);
  if (sourcePlatform !== 'ios') {
    return;
  }

  const [user] = await db
    .select({
      billingStorefrontCountry: users.billingStorefrontCountry,
    })
    .from(users)
    .where(eq(users.id, params.userId))
    .limit(1);

  const storefrontCountry = normalizeStorefrontCountry(
    user?.billingStorefrontCountry
  );

  if (storefrontCountry !== 'RU') {
    throw createError({
      statusCode: 409,
      statusMessage:
        'В текущем iOS billing-flow используются только native App Store offer codes',
    });
  }
}
