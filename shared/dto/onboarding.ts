import { z } from 'zod';

export const GenderEnum = z.enum(['male', 'female']);
export const AgeRangeEnum = z.enum(['under_30', '30_45', '45_plus', 'unknown']);
export const OnboardingToneEnum = z.enum([
  'delicate',
  'neutral',
  'uplifting',
  'resolute',
  'demanding',
  'unknown',
]);
export const OnboardingFlowEnum = z.enum(['welcome_setup']);

export const WelcomeSetupDataDto = z.object({
  name: z.string().min(1).max(40),
  gender: GenderEnum,
  ageRange: AgeRangeEnum.optional().default('unknown'),
  tone: OnboardingToneEnum.optional().default('unknown'),
});

export const OnboardingCompleteRequestDto = z.object({
  flow: OnboardingFlowEnum,
  data: WelcomeSetupDataDto,
});

export const OnboardingStatusDto = z.object({
  welcome: z.boolean(),
});

export type Gender = z.infer<typeof GenderEnum>;
export type AgeRange = z.infer<typeof AgeRangeEnum>;
export type OnboardingTone = z.infer<typeof OnboardingToneEnum>;
export type OnboardingFlow = z.infer<typeof OnboardingFlowEnum>;
export type WelcomeSetupDataDto = z.infer<typeof WelcomeSetupDataDto>;
export type OnboardingCompleteRequestDto = z.infer<
  typeof OnboardingCompleteRequestDto
>;
export type OnboardingStatusDto = z.infer<typeof OnboardingStatusDto>;
