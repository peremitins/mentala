import { z } from 'zod';
import { AssistantSettingsDto } from '@/shared/dto/assistant-settings';

export const BillingFeaturePaywallDto = z.object({
  title: z.string(),
  description: z.string(),
  ctaText: z.string(),
  targetPlan: z.enum(['pro', 'premium']),
  lockIcon: z.enum(['pro', 'premium']),
});

export const BillingFeatureAccessDto = z.object({
  available: z.boolean(),
  requiredPlan: z.enum(['basic', 'pro', 'premium']),
  paywall: BillingFeaturePaywallDto.nullable(),
});

export const UserBillingDto = z.object({
  planId: z.enum(['basic', 'pro', 'premium']),
  trialActive: z.boolean(),
  trialEndsAt: z.string().nullable(),
  aiChatMode: z.enum(['disabled', 'limited', 'unlimited_fair_use']),
  weeklyMinutesLimit: z.number().nullable(),
  fairUseGuardMinutesPerWeek: z.number().nullable(),
  entitlementsVersion: z.string(),
  features: z.record(BillingFeatureAccessDto),
});

export const UserMeDto = z.object({
  user: z
    .object({
      id: z.number(),
      email: z.string().email(),
      name: z.string().nullable(),
      addressing: z.enum(['informal', 'formal']).optional(),
      gender: z.string().nullable().optional(),
      ageRange: z.string().nullable().optional(),
      onboarding: z
        .object({
          welcome: z.boolean(),
        })
        .optional(),
      locale: z.string().nullable().optional(),
      role: z.string().nullable().optional(),
      isBlocked: z.boolean().optional(),
      emailVerifiedAt: z.string().nullable().optional(),
      hasPassword: z.boolean().optional(),
      sceneSettings: z.record(z.any()).optional(),
      marketingConsent: z.boolean().optional(),
      pushNotificationsEnabled: z.boolean().optional(),
      assistantSettings: AssistantSettingsDto.optional(),
      billing: UserBillingDto.optional(),
    })
    .nullable(),
});

export const UserMePatchDto = z.object({
  pushNotificationsEnabled: z.boolean().optional(),
  sceneSettings: z
    .object({
      sceneId: z.string().nullable().optional(),
      volume: z.number().nullable().optional(),
      backgroundPlayMinutes: z.number().nullable().optional(),
      animateBackground: z.boolean().nullable().optional(),
    })
    .optional(),
  marketingConsent: z.boolean().optional(),
});

export type UserMeDto = z.infer<typeof UserMeDto>;
export type UserMePatchDto = z.infer<typeof UserMePatchDto>;
export type UserBilling = z.infer<typeof UserBillingDto>;
export type BillingFeatureAccess = z.infer<typeof BillingFeatureAccessDto>;
