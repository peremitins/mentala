import { z } from 'zod';
import { MarketingAttributionDto } from './marketing-attribution';

function optionalTrimmedString(maxLength: number) {
  return z
    .preprocess((value) => {
      if (typeof value !== 'string') {
        return undefined;
      }

      const trimmed = value.trim();
      if (!trimmed || trimmed.length > maxLength) {
        return undefined;
      }

      return trimmed;
    }, z.string().optional())
    .optional();
}

export const LandingGoalKeyEnum = z.enum([
  'reduce_anxiety',
  'sleep_better',
  'reduce_stress',
  'quit_smoking',
  'reduce_alcohol',
  'reduce_caffeine',
  'build_habits',
  'try_ai_support',
  'other',
]);

export const LandingConfigDto = z.object({
  isReleased: z.boolean(),
  ctaUrl: z.string().url(),
  updatedAt: z.string().datetime(),
});

export const LandingLeadRequestDto = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  /** Мультивыбор целей; сохраняется в БД как JSON в goal_key */
  goalKeys: z.array(LandingGoalKeyEnum).optional(),
  utmSource: optionalTrimmedString(120),
  utmMedium: optionalTrimmedString(120),
  utmCampaign: optionalTrimmedString(120),
  utmContent: optionalTrimmedString(120),
  utmTerm: optionalTrimmedString(120),
  gclid: optionalTrimmedString(255),
  yclid: optionalTrimmedString(255),
  fbclid: optionalTrimmedString(255),
  ttclid: optionalTrimmedString(255),
  marketingAttribution: MarketingAttributionDto.optional(),
  honeypot: z.string().trim().max(120).optional(),
});

export const LandingLeadResponseDto = z.object({
  ok: z.literal(true),
  status: z.enum(['created', 'duplicate']),
});

export type LandingGoalKey = z.infer<typeof LandingGoalKeyEnum>;
export type LandingConfigDto = z.infer<typeof LandingConfigDto>;
export type LandingLeadRequestDto = z.infer<typeof LandingLeadRequestDto>;
export type LandingLeadResponseDto = z.infer<typeof LandingLeadResponseDto>;
