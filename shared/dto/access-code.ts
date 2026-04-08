import { z } from 'zod';
import {
  PromoCodePreviewResponseDto,
  PromoCodeRedeemResponseDto,
} from './promo-code';
import {
  ReferralPreviewResponseDto,
  ReferralRedeemResponseDto,
} from './referral';

/**
 * Унифицированный DTO для пользовательского ввода кода доступа.
 * Один резолвер на бэке детерминированно определяет тип (promo | referral)
 * благодаря глобальной уникальности кодов в `assertAccessCodeAvailable()`.
 */
export const AccessCodeKindDto = z.enum(['promo', 'referral']);

export const AccessCodePreviewRequestDto = z.object({
  code: z.string().trim().min(3).max(64),
});

export const AccessCodeRedeemRequestDto = AccessCodePreviewRequestDto;

const PromoPreviewVariant = PromoCodePreviewResponseDto.omit({
  ok: true,
}).extend({
  kind: z.literal('promo'),
});

const ReferralPreviewVariant = ReferralPreviewResponseDto.omit({
  ok: true,
}).extend({
  kind: z.literal('referral'),
});

export const AccessCodePreviewResponseDto = z.discriminatedUnion('kind', [
  PromoPreviewVariant,
  ReferralPreviewVariant,
]);

const PromoRedeemVariant = PromoCodeRedeemResponseDto.omit({
  ok: true,
}).extend({
  kind: z.literal('promo'),
});

const ReferralRedeemVariant = ReferralRedeemResponseDto.omit({
  ok: true,
}).extend({
  kind: z.literal('referral'),
});

export const AccessCodeRedeemResponseDto = z.discriminatedUnion('kind', [
  PromoRedeemVariant,
  ReferralRedeemVariant,
]);

export type AccessCodeKind = z.infer<typeof AccessCodeKindDto>;
export type AccessCodePreviewRequest = z.infer<
  typeof AccessCodePreviewRequestDto
>;
export type AccessCodePreviewResponse = z.infer<
  typeof AccessCodePreviewResponseDto
>;
export type AccessCodeRedeemRequest = z.infer<
  typeof AccessCodeRedeemRequestDto
>;
export type AccessCodeRedeemResponse = z.infer<
  typeof AccessCodeRedeemResponseDto
>;
