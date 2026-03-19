import { z } from 'zod';
import { isAssistantVoiceSelectable } from '../constants/assistantVoiceCatalog';
import { AssistantVoiceGenderEnum } from './assistant-settings';

export const AssistantVoiceIdDto = z
  .string()
  .trim()
  .min(1)
  .refine((value) => isAssistantVoiceSelectable(value), {
    message: 'Unsupported assistant voice',
  });

export const ChatSettingsStateDto = z.object({
  voice: z.boolean(),
  assistantVoice: AssistantVoiceIdDto,
  avatar: z.boolean(),
  enablePreviousResponseId: z.boolean(),
  enableSummary: z.boolean(),
  isFirstSession: z.boolean(),
});

export const ChatSettingsVoiceMetaDto = z.object({
  label: z.string().min(1),
  gender: AssistantVoiceGenderEnum,
});

export const ChatSettingsResponseDto = z.object({
  settings: ChatSettingsStateDto,
  assistantVoiceMeta: ChatSettingsVoiceMetaDto.optional(),
});

export const ChatSettingsPatchDto = z.object({
  voice: z.boolean().optional(),
  assistantVoice: AssistantVoiceIdDto.optional(),
  avatar: z.boolean().optional(),
  enablePreviousResponseId: z.boolean().optional(),
  enableSummary: z.boolean().optional(),
});

export type AssistantVoiceIdDto = z.infer<typeof AssistantVoiceIdDto>;
export type ChatSettingsStateDto = z.infer<typeof ChatSettingsStateDto>;
export type ChatSettingsVoiceMetaDto = z.infer<typeof ChatSettingsVoiceMetaDto>;
export type ChatSettingsResponseDto = z.infer<typeof ChatSettingsResponseDto>;
export type ChatSettingsPatchDto = z.infer<typeof ChatSettingsPatchDto>;
