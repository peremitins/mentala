import { z } from 'zod';
export * from './auth';
export * from './onboarding';
export * from './meditations';
export * from './user';
export * from './landing';

export const UserDto = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
});

export const ChatMessageDto = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
});

export const HabitEntryContextDto = z.object({
  type: z.literal('habit'),
  habit_id: z.string(),
  habit_name: z.string().optional(),
  habit_intent: z
    .enum(['build', 'quit', 'custom'])
    .optional(),
  habit_description: z.string().optional(),
});

export const TherapyTopicEntryContextDto = z.object({
  type: z.literal('therapy_topic'),
  topic_id: z.string(),
  topic_name: z.string().optional(),
  topic_description: z.string().optional(),
});

export const SosEntryContextDto = z.object({
  type: z.literal('sos'),
  sos_entry: z.enum(['panic', 'tension', 'vent']),
  after_practice: z.boolean().optional(),
});

export const ChatEntryContextDto = z.discriminatedUnion('type', [
  HabitEntryContextDto,
  TherapyTopicEntryContextDto,
  SosEntryContextDto,
]);

export const ChatRequestDto = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .min(0),
  provider: z.enum(['openai', 'deepseek', 'yandex']).optional(),
  model: z.string().optional(),
  sessionId: z.string().optional(),
  therapySessionId: z.number().optional(),
  // расширенные опции
  userId: z.union([z.number(), z.string()]).optional(),
  isFirstSession: z.boolean().optional(),
  userPrompt: z.string().optional(),
  lang: z.string().optional(),
  user_locale: z.string().optional(),
  user_name: z.string().optional(),
  user_gender: z.string().optional(),
  // допускаем null или отсутствие контекста, если он не выбран в UI
  entryContext: ChatEntryContextDto.nullish(),
});

export const SuggestedChipIntentEnum = z.enum([
  'clarify',
  'example',
  'apply_to_self',
  'action_step',
  'reflect',
  'reframe',
  'summarize',
  'support',
]);

export const SuggestedChipKindEnum = z.enum(['text', 'action']);

export const SuggestedChipActionEnum = z.enum([
  'open_meditations',
  'open_meditation_track',
  'open_meditations_collection',
  'open_sos',
]);

export const SuggestedChipActionParamsDto = z.object({
  trackId: z.string().optional(),
  collectionId: z.string().optional(),
  sosEntry: z.enum(['panic', 'tension', 'technique_picker']).optional(),
  source: z.enum(['chat']).optional(),
});

export const SuggestedChipDto = z
  .object({
    text: z.string().min(1).max(80),
    intent: SuggestedChipIntentEnum,
    kind: SuggestedChipKindEnum.optional().default('text'),
    action: SuggestedChipActionEnum.optional(),
    params: SuggestedChipActionParamsDto.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'action' && !value.action) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action is required for action chips',
      });
    }
    if (value.kind === 'text' && value.action) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'action is not allowed for text chips',
      });
    }
  });

export const SuggestedChipsPayloadDto = z.object({
  chips: z.array(SuggestedChipDto).max(5),
});

export const ChatStreamChunkDto = z.object({
  output_text_delta: z.string().optional(),
  chips: z.array(SuggestedChipDto).max(5).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export const ChatResponseDto = z.object({
  message: z.object({ role: z.enum(['assistant']), content: z.string() }),
  provider: z.enum(['openai', 'deepseek', 'yandex']),
  model: z.string().optional(),
  chips: z.array(SuggestedChipDto).max(5).optional(),
});

export type UserDto = z.infer<typeof UserDto>;
export type ChatMessageDto = z.infer<typeof ChatMessageDto>;
export type ChatRequestDto = z.infer<typeof ChatRequestDto>;
export type ChatResponseDto = z.infer<typeof ChatResponseDto>;
export type ChatEntryContext = z.infer<typeof ChatEntryContextDto>;
export type SuggestedChipIntent = z.infer<typeof SuggestedChipIntentEnum>;
export type SuggestedChipKind = z.infer<typeof SuggestedChipKindEnum>;
export type SuggestedChipAction = z.infer<typeof SuggestedChipActionEnum>;
export type SuggestedChipActionParams = z.infer<
  typeof SuggestedChipActionParamsDto
>;
export type SuggestedChip = z.infer<typeof SuggestedChipDto>;
export type SuggestedChipsPayload = z.infer<typeof SuggestedChipsPayloadDto>;
export type ChatStreamChunk = z.infer<typeof ChatStreamChunkDto>;

// === Prompts DTO ===
export const PromptTypeEnum = z.enum(['habits', 'therapy']);
export const PromptLangEnum = z.enum(['ru', 'en']);

export const PromptCreateDto = z.object({
  title: z.string().min(1).max(120),
  type: PromptTypeEnum,
  lang: PromptLangEnum.default('ru'),
  content: z.string().min(1).max(8000),
  isActive: z.boolean().optional(),
});

export const PromptUpdateDto = z.object({
  title: z.string().min(1).max(120).optional(),
  type: PromptTypeEnum.optional(),
  lang: PromptLangEnum.optional(),
  content: z.string().max(8000).optional(),
  isActive: z.boolean().optional(),
});

export const PromptQueryDto = z.object({ type: PromptTypeEnum.optional() });

export const UserPromptDto = z.object({
  id: z.number(),
  userId: z.number(), // Integer user ID
  type: PromptTypeEnum,
  title: z.string(),
  content: z.string(),
  lang: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PromptCreateDto = z.infer<typeof PromptCreateDto>;
export type PromptUpdateDto = z.infer<typeof PromptUpdateDto>;
export type PromptQueryDto = z.infer<typeof PromptQueryDto>;
export type UserPromptDto = z.infer<typeof UserPromptDto>;

// === Prompts System Types (v3.0) ===
export type TherapyApproach =
  | 'cbt'
  | 'psychoanalysis'
  | 'existential'
  | 'positive';
export type ResponseType =
  | 'exploration'
  | 'analytics'
  | 'support'
  | 'recommendation'
  | 'synthesis';

/**
 * Дополняем существующий ChatSession интерфейс
 * (для будущего расширения, если понадобится хранить в БД)
 */
export interface ChatSessionExtended {
  messagesCount: number;
  responseTypes: ResponseType[];
  preferredApproach?: TherapyApproach;
  approachHistory?: TherapyApproach[];
  approachFeedback?: Record<TherapyApproach, number>;
}

/**
 * Для хранения фраз, чтобы не повторялись в одной сессии
 */
export interface PhraseHistory {
  validation: string[];
  empathy: string[];
  normalization: string[];
  encouragement: string[];
  deepeningQuestions: string[];
}

// === Roles and Permissions Types ===
export type UserRole = 'admin' | 'user' | 'moderator' | 'support';
