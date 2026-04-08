import crypto from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { createError } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  promoCampaigns,
  userReferralProfiles,
} from '@/server/infrastructure/db/schema';
import { normalizePromoCode } from './promo.shared';

const ACCESS_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Префикс применяется только к новым автосгенерированным кодам.
// Старые коды из БД остаются валидными и продолжают приниматься без миграции.
export const AUTO_ACCESS_CODE_PREFIX = 'MENTALA';

function resolveDbClient(tx?: any) {
  return tx ?? db;
}

function randomCodePart(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index += 1) {
    result += ACCESS_CODE_ALPHABET[bytes[index] % ACCESS_CODE_ALPHABET.length];
  }

  return result;
}

export function buildRandomAccessCode(
  prefix = AUTO_ACCESS_CODE_PREFIX
): string {
  return `${normalizePromoCode(prefix)}${randomCodePart(6)}`;
}

export async function getAccessCodeAvailability(params: {
  code: string;
  excludePromoCampaignId?: number | null;
  excludeReferralUserId?: number | null;
  tx?: any;
}) {
  const client = resolveDbClient(params.tx);
  const normalizedCode = normalizePromoCode(params.code);

  const [promoRows, referralRows] = await Promise.all([
    client
      .select({
        id: promoCampaigns.id,
      })
      .from(promoCampaigns)
      .where(
        and(
          eq(promoCampaigns.code, normalizedCode),
          params.excludePromoCampaignId
            ? ne(promoCampaigns.id, params.excludePromoCampaignId)
            : undefined
        )
      )
      .limit(1),
    client
      .select({
        userId: userReferralProfiles.userId,
      })
      .from(userReferralProfiles)
      .where(
        and(
          eq(userReferralProfiles.code, normalizedCode),
          params.excludeReferralUserId
            ? ne(userReferralProfiles.userId, params.excludeReferralUserId)
            : undefined
        )
      )
      .limit(1),
  ]);

  if (promoRows[0]) {
    return {
      available: false,
      conflictType: 'promo_campaign' as const,
    };
  }

  if (referralRows[0]) {
    return {
      available: false,
      conflictType: 'referral_profile' as const,
    };
  }

  return {
    available: true,
    conflictType: null,
  };
}

export async function assertAccessCodeAvailable(params: {
  code: string;
  excludePromoCampaignId?: number | null;
  excludeReferralUserId?: number | null;
  tx?: any;
}) {
  const availability = await getAccessCodeAvailability(params);
  if (!availability.available) {
    // Бросаем H3-ошибку напрямую: остальные application-сервисы (promo-code-preview и др.)
    // уже используют эту же конвенцию, а вызывающие admin-хендлеры могут убрать try/catch.
    throw createError({
      statusCode: 409,
      statusMessage:
        'Такой код уже существует. Выберите другой или сгенерируйте новый.',
      data: {
        code: 'code_already_exists',
        conflictType: availability.conflictType,
      },
    });
  }

  return availability;
}

export async function buildUniqueAccessCode(params?: {
  prefix?: string;
  excludePromoCampaignId?: number | null;
  excludeReferralUserId?: number | null;
  attempts?: number;
  tx?: any;
}) {
  const attempts = params?.attempts ?? 20;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const code = buildRandomAccessCode(params?.prefix);
    const availability = await getAccessCodeAvailability({
      code,
      excludePromoCampaignId: params?.excludePromoCampaignId,
      excludeReferralUserId: params?.excludeReferralUserId,
      tx: params?.tx,
    });

    if (availability.available) {
      return code;
    }
  }

  throw new Error('Не удалось сгенерировать уникальный код доступа');
}
