import { z } from 'zod';

export const AssistantVoiceGenderEnum = z.enum(['female', 'male']);

export const AssistantSettingsDto = z.object({
  voice: z.string().min(1),
  voiceLabel: z.string().min(1),
  voiceGender: AssistantVoiceGenderEnum,
});

export type AssistantVoiceGender = z.infer<typeof AssistantVoiceGenderEnum>;
export type AssistantSettingsDto = z.infer<typeof AssistantSettingsDto>;
