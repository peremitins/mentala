import { z } from 'zod';

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
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(120).optional(),
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
