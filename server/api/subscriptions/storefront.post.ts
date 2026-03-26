import { createError } from 'h3';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getSessionUser } from '@/server/application/auth/session';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { normalizeStorefrontCountryCode } from '@/shared/utils/storefront';

const storefrontSyncBodySchema = z.object({
  storefrontCountryCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
});

type StorefrontSyncResponse = {
  storefrontCountryCode: string | null;
  billingProviderHint: 'yookassa' | 'apple_iap';
};

/**
 * POST /api/subscriptions/storefront
 * Синхронизирует storefrontCountryCode (регион App Store аккаунта) в профиль пользователя.
 *
 * Это используется для разведения сценариев оплаты на iOS:
 * RU -> внешняя оплата (YooKassa), остальные -> Apple IAP.
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
  const parsedBody = storefrontSyncBodySchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid body for storefront sync',
    });
  }

  const now = new Date();
  const rawStorefrontCountryCode =
    parsedBody.data.storefrontCountryCode ?? null;
  const storefrontCountryCode = normalizeStorefrontCountryCode(
    rawStorefrontCountryCode
  );

  // Если пришёл неизвестный код (не конвертируется в alpha-2), сохраняем null.
  // Это безопаснее чем 400: клиент может прислать новый alpha-3 код, которого нет в маппинге.

  await db
    .update(users)
    .set({
      billingRegionSource: storefrontCountryCode ? 'storefront' : null,
      billingStorefrontCountry: storefrontCountryCode,
      billingStorefrontUpdatedAt: storefrontCountryCode ? now : null,
      updatedAt: now,
    })
    .where(eq(users.id, sessionResult.user.id));

  const response: StorefrontSyncResponse = {
    storefrontCountryCode,
    billingProviderHint:
      storefrontCountryCode === 'RU' ? 'yookassa' : 'apple_iap',
  };

  return response;
});
