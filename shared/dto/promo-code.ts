import { z } from 'zod';

export const PromoCampaignStatusDto = z.enum([
  'draft',
  'active',
  'paused',
  'consumed',
  'expired',
  'revoked',
]);

export const PromoCampaignTypeDto = z.enum([
  'free_access_days',
  'next_payment_percent_discount',
]);

export const PromoBindingModeDto = z.enum(['none', 'user_id', 'email']);
export const PromoPlanModeDto = z.enum(['auto', 'explicit']);
export const PromoPlanIdDto = z.enum(['basic', 'pro', 'premium']);
export const PromoPaidPlanIdDto = z.enum(['pro', 'premium']);
export const PromoTargetPlanScopeDto = z.enum(['any_paid', 'pro', 'premium']);
export const PromoTargetPeriodScopeDto = z.enum(['any', 'month', 'year']);
export const PromoDiscountGrantKindDto = z.enum([
  'admin_promo',
  'invitee_referral',
]);
export const PromoDiscountGrantStatusDto = z.enum([
  'active',
  'reserved',
  'applied',
  'expired',
  'revoked',
]);

const FreeAccessDaysBenefitPayloadBaseDto = z.object({
  campaignType: z.literal('free_access_days'),
  durationDays: z.number().int().min(1).max(3650),
  planMode: PromoPlanModeDto,
  explicitPlanId: PromoPaidPlanIdDto.optional(),
});

// Общая логика валидации planMode/explicitPlanId — иначе пришлось бы держать
// одинаковый superRefine и в одиночной схеме, и во внешнем discriminated union
// (раньше код был дублирован, и расхождение бы тихо пропустило битые payload).
function refineFreeAccessDaysPayload(
  value: { planMode: 'auto' | 'explicit'; explicitPlanId?: string },
  ctx: z.RefinementCtx
) {
  if (value.planMode === 'explicit' && !value.explicitPlanId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['explicitPlanId'],
      message: 'explicitPlanId обязателен для explicit plan mode',
    });
  }

  if (value.planMode === 'auto' && value.explicitPlanId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['explicitPlanId'],
      message: 'explicitPlanId нельзя передавать для auto plan mode',
    });
  }
}

export const FreeAccessDaysBenefitPayloadDto =
  FreeAccessDaysBenefitPayloadBaseDto.superRefine(refineFreeAccessDaysPayload);

export const NextPaymentPercentDiscountBenefitPayloadDto = z.object({
  campaignType: z.literal('next_payment_percent_discount'),
  percent: z.number().int().min(1).max(100),
  targetPlanScope: PromoTargetPlanScopeDto.default('any_paid'),
  targetPeriodScope: PromoTargetPeriodScopeDto.default('any'),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const PromoBenefitPayloadDto = z
  .discriminatedUnion('campaignType', [
    FreeAccessDaysBenefitPayloadBaseDto,
    NextPaymentPercentDiscountBenefitPayloadDto,
  ])
  .superRefine((value, ctx) => {
    if (value.campaignType === 'free_access_days') {
      refineFreeAccessDaysPayload(value, ctx);
    }
  });

export const PromoCodePreviewRequestDto = z.object({
  code: z.string().trim().min(3).max(64),
});

export const PromoCodePreviewResponseDto = z.object({
  ok: z.literal(true),
  campaignId: z.number().int().positive(),
  code: z.string(),
  campaignType: PromoCampaignTypeDto,
  title: z.string(),
  description: z.string(),
  warning: z.string().nullable(),
  effect: z.object({
    accessPlanId: PromoPaidPlanIdDto.nullable().optional(),
    durationDays: z.number().int().nullable().optional(),
    percent: z.number().int().nullable().optional(),
    targetPlanScope: PromoTargetPlanScopeDto.nullable().optional(),
    targetPeriodScope: PromoTargetPeriodScopeDto.nullable().optional(),
  }),
});

export const PromoCodeRedeemRequestDto = PromoCodePreviewRequestDto;

export const ActiveAccessGrantDto = z.object({
  id: z.number().int().positive(),
  planId: PromoPaidPlanIdDto,
  startsAt: z.string(),
  endsAt: z.string(),
  sourceLabel: z.string(),
});

export const PendingDiscountGrantDto = z.object({
  id: z.number().int().positive(),
  kind: PromoDiscountGrantKindDto,
  percent: z.number().int().min(1).max(100),
  status: PromoDiscountGrantStatusDto,
  expiresAt: z.string().nullable(),
  sourceLabel: z.string(),
  targetPlanScope: PromoTargetPlanScopeDto,
  targetPeriodScope: PromoTargetPeriodScopeDto,
});

export const PromoCodeRedeemResponseDto = z.object({
  ok: z.literal(true),
  code: z.string(),
  campaignType: PromoCampaignTypeDto,
  message: z.string(),
  activeAccessGrant: ActiveAccessGrantDto.nullable(),
  pendingDiscount: PendingDiscountGrantDto.nullable(),
  effectiveBillingShiftDays: z.number().int().min(0).default(0),
  nextChargeAt: z.string().nullable().optional(),
  currentEntitlementsPlan: PromoPlanIdDto.optional(),
});

export const PromoCodesActiveResponseDto = z.object({
  activeAccessGrant: ActiveAccessGrantDto.nullable(),
  pendingDiscounts: z.array(PendingDiscountGrantDto).default([]),
  effectiveBillingShiftDays: z.number().int().min(0).default(0),
});

const AdminPromoCampaignBaseDto = z.object({
  code: z.string().trim().min(3).max(64),
  campaignType: PromoCampaignTypeDto,
  bindingMode: PromoBindingModeDto.default('none'),
  targetUserId: z.number().int().positive().nullable().optional(),
  targetEmail: z.string().trim().email().nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  adminComment: z.string().trim().max(500).nullable().optional(),
  benefitPayload: PromoBenefitPayloadDto,
});

// Общий refine для проверки соответствия bindingMode и target*.
// Вынесен отдельно, чтобы Create и Update DTO не расходились (раньше в Create
// этой проверки не было — это был обход персональных промокодов).
function refinePromoBinding(
  value: {
    bindingMode?: 'none' | 'user_id' | 'email';
    targetUserId?: number | null;
    targetEmail?: string | null;
  },
  ctx: z.RefinementCtx
) {
  if (value.bindingMode === 'user_id' && !value.targetUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetUserId'],
      message: 'targetUserId обязателен для bindingMode=user_id',
    });
  }

  if (value.bindingMode === 'email' && !value.targetEmail) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetEmail'],
      message: 'targetEmail обязателен для bindingMode=email',
    });
  }
}

export const AdminPromoCampaignCreateDto =
  AdminPromoCampaignBaseDto.superRefine(refinePromoBinding);

export const AdminPromoCampaignUpdateDto = AdminPromoCampaignBaseDto.partial()
  .extend({
    status: PromoCampaignStatusDto.optional(),
  })
  .superRefine(refinePromoBinding);

export const AdminPromoCampaignListItemDto = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  status: PromoCampaignStatusDto,
  campaignType: PromoCampaignTypeDto,
  bindingMode: PromoBindingModeDto,
  targetUserId: z.number().int().nullable(),
  targetEmail: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  adminComment: z.string().nullable(),
  benefitPayload: PromoBenefitPayloadDto,
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().int().nullable(),
  updatedBy: z.number().int().nullable(),
  consumedByUserId: z.number().int().nullable().optional(),
  consumedAt: z.string().nullable().optional(),
});

export const AdminPromoCampaignListResponseDto = z.object({
  available: z.boolean().optional(),
  campaigns: z.array(AdminPromoCampaignListItemDto),
});
