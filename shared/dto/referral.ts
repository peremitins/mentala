import { z } from 'zod';
import {
  PendingDiscountGrantDto,
  PromoTargetPeriodScopeDto,
  PromoTargetPlanScopeDto,
} from './promo-code';

export const ReferralProgramSettingsDto = z.object({
  enabled: z.boolean(),
  inviteePercent: z.number().int().min(1).max(100),
  referrerPercent: z.number().int().min(1).max(100),
  inviteeRewardValidityDays: z.number().int().min(1).max(365),
  creditHoldDays: z.number().int().min(0).max(365),
  inviteeTargetPlanScope: PromoTargetPlanScopeDto.default('any_paid'),
  inviteeTargetPeriodScope: PromoTargetPeriodScopeDto.default('any'),
});

export const PendingReferralCreditDto = z.object({
  id: z.number().int().positive(),
  amount: z.number().nonnegative(),
  status: z.enum(['pending', 'posted', 'reversed', 'revoked']),
  availableAt: z.string().nullable(),
  sourceLabel: z.string(),
});

export const ReferralMeResponseDto = z.object({
  available: z.boolean().optional(),
  myCode: z.string(),
  successfulInvitesCount: z.number().int().min(0),
  pendingRewardsCount: z.number().int().min(0),
  availableBillingCredit: z.number().nonnegative().default(0),
  pendingCredits: z.array(PendingReferralCreditDto).default([]),
  program: ReferralProgramSettingsDto,
});

export const ReferralRedeemRequestDto = z.object({
  code: z.string().trim().min(3).max(64),
});

export const ReferralPreviewResponseDto = z.object({
  ok: z.literal(true),
  title: z.string(),
  description: z.string(),
  warning: z.string().nullable(),
  reward: z.object({
    inviteePercent: z.number().int().min(1).max(100),
    referrerPercent: z.number().int().min(1).max(100),
    inviteeRewardValidityDays: z.number().int().min(1),
    creditHoldDays: z.number().int().min(0),
  }),
});

export const ReferralRedeemResponseDto = z.object({
  ok: z.literal(true),
  message: z.string(),
  reward: PendingDiscountGrantDto,
});

export const AdminReferralProgramUpdateDto =
  ReferralProgramSettingsDto.partial();

export type ReferralProgramSettings = z.infer<
  typeof ReferralProgramSettingsDto
>;
export type PendingReferralCredit = z.infer<typeof PendingReferralCreditDto>;
export type ReferralMeResponse = z.infer<typeof ReferralMeResponseDto>;
export type ReferralPreviewResponse = z.infer<
  typeof ReferralPreviewResponseDto
>;
export type ReferralRedeemRequest = z.infer<typeof ReferralRedeemRequestDto>;
export type ReferralRedeemResponse = z.infer<typeof ReferralRedeemResponseDto>;

export const AdminReferralRedemptionListItemDto = z.object({
  id: z.number().int().positive(),
  referrerUserId: z.number().int().positive(),
  inviteeUserId: z.number().int().positive(),
  code: z.string(),
  status: z.enum(['pending_conversion', 'completed', 'revoked', 'expired']),
  inviteeRewardGrantId: z.number().int().nullable(),
  referrerCreditAmount: z.number().nullable().optional(),
  referrerCreditStatus: z
    .enum(['pending', 'posted', 'reversed', 'revoked'])
    .nullable()
    .optional(),
  referrerCreditAvailableAt: z.string().nullable().optional(),
  convertedAt: z.string().nullable(),
  redeemedAt: z.string(),
  createdAt: z.string(),
});

export const AdminReferralListResponseDto = z.object({
  available: z.boolean().optional(),
  program: ReferralProgramSettingsDto,
  redemptions: z.array(AdminReferralRedemptionListItemDto),
});
