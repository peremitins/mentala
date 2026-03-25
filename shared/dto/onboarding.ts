import { z } from 'zod';
import { AssistantToneWithUnknownEnum } from '../constants/assistantTone';

export const ONBOARDING_REASON_VALUES = [
  'stress',
  'anxiety',
  'thoughts',
  'mood',
  'habits',
  'support',
  'other',
] as const;

export const GenderEnum = z.enum(['male', 'female']);
export const AgeRangeEnum = z.enum(['under_30', '30_45', '45_plus', 'unknown']);
export const OnboardingToneEnum = AssistantToneWithUnknownEnum;
export const OnboardingReasonEnum = z.enum(ONBOARDING_REASON_VALUES);
export const OnboardingReasonsEnum = z
  .array(OnboardingReasonEnum)
  .min(1)
  .max(ONBOARDING_REASON_VALUES.length);
export const OnboardingFlowEnum = z.enum(['welcome_setup']);

export const WelcomeSetupDataDto = z
  .object({
    name: z.string().min(1).max(40),
    // Поддерживаем legacy `reason`, пока все клиенты не перейдут на `reasons`.
    reason: OnboardingReasonEnum.optional(),
    reasons: OnboardingReasonsEnum.optional(),
    gender: GenderEnum,
    ageRange: AgeRangeEnum.optional().default('unknown'),
    tone: OnboardingToneEnum.optional().default('unknown'),
  })
  .superRefine((data, ctx) => {
    if (data.reason || data.reasons?.length) {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reasons'],
      message: 'At least one onboarding reason is required',
    });
  });

export const OnboardingCompleteRequestDto = z.object({
  flow: OnboardingFlowEnum,
  data: WelcomeSetupDataDto,
});

export const OnboardingStatusDto = z.object({
  welcome: z.boolean(),
});

export function isOnboardingReason(value: unknown): value is OnboardingReason {
  return (
    typeof value === 'string' &&
    ONBOARDING_REASON_VALUES.includes(value as OnboardingReason)
  );
}

export function normalizeOnboardingReasons(value: unknown): OnboardingReason[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  const seen = new Set<OnboardingReason>();
  const normalized: OnboardingReason[] = [];

  for (const rawValue of rawValues) {
    if (!isOnboardingReason(rawValue) || seen.has(rawValue)) {
      continue;
    }

    seen.add(rawValue);
    normalized.push(rawValue);
  }

  return normalized;
}

export function resolveOnboardingReasons(input: {
  reasons?: unknown;
  reason?: unknown;
}): OnboardingReason[] {
  const normalizedReasons = normalizeOnboardingReasons(input.reasons);
  if (normalizedReasons.length > 0) {
    return normalizedReasons;
  }

  return normalizeOnboardingReasons(input.reason);
}

export function isOnboardingReasonList(
  value: unknown
): value is OnboardingReason[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    normalizeOnboardingReasons(value).length === value.length
  );
}

export function areOnboardingReasonListsEqual(
  left: unknown,
  right: unknown
): boolean {
  const normalizedLeft = normalizeOnboardingReasons(left);
  const normalizedRight = normalizeOnboardingReasons(right);

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every(
    (value, index) => value === normalizedRight[index]
  );
}

export type Gender = z.infer<typeof GenderEnum>;
export type AgeRange = z.infer<typeof AgeRangeEnum>;
export type OnboardingTone = z.infer<typeof OnboardingToneEnum>;
export type OnboardingReason = z.infer<typeof OnboardingReasonEnum>;
export type OnboardingReasons = z.infer<typeof OnboardingReasonsEnum>;
export type OnboardingFlow = z.infer<typeof OnboardingFlowEnum>;
export type WelcomeSetupDataDto = z.infer<typeof WelcomeSetupDataDto>;
export type OnboardingCompleteRequestDto = z.infer<
  typeof OnboardingCompleteRequestDto
>;
export type OnboardingStatusDto = z.infer<typeof OnboardingStatusDto>;
