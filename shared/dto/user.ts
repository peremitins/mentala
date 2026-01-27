import { z } from 'zod';

export const UserMeDto = z.object({
  user: z
    .object({
      id: z.number(),
      email: z.string().email(),
      name: z.string().nullable(),
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
    })
    .nullable(),
});

export const UserMePatchDto = z.object({
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
