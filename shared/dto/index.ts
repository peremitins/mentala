import { z } from 'zod';
export * from './auth';
export * from './onboarding';
export * from './meditations';
export * from './user';
export * from './landing';

const THOUGHT_DUMP_ENTRY_CONTEXT_MAX_CHARS = 2_500;

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
  habit_intent: z.enum(['build', 'quit', 'custom']).optional(),
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

export const ThoughtDumpEntryContextDto = z.object({
  type: z.literal('thought_dump'),
  source: z.literal('quick_help_thought_dump'),
  dump_text: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return value;
    }
    // Обрезаем контекст до безопасного лимита до валидации.
    return value.slice(0, THOUGHT_DUMP_ENTRY_CONTEXT_MAX_CHARS);
  }, z.string().trim().min(1).max(THOUGHT_DUMP_ENTRY_CONTEXT_MAX_CHARS)),
  input_mode: z.enum(['text', 'voice', 'mixed']).optional(),
});

export const ChatEntryContextDto = z.discriminatedUnion('type', [
  HabitEntryContextDto,
  TherapyTopicEntryContextDto,
  SosEntryContextDto,
  ThoughtDumpEntryContextDto,
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

export const ChatFeedbackRatingEnum = z.union([z.literal(1), z.literal(-1)]);

export const ChatFeedbackTopicCodeEnum = z.enum([
  'FACTUAL_ERROR',
  'OFF_TOPIC',
  'NOT_HELPFUL',
  'TONE_ISSUE',
  'UNSAFE_ADVICE',
  'PRIVACY_CONCERN',
  'MISSED_CONTEXT',
  'OTHER',
]);

export const ChatFeedbackAssistantMessageClientIdDto = z
  .string()
  .trim()
  .min(1)
  .max(64);

const ChatFeedbackSessionIdDto = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}, z.string().max(120).optional());

const ChatFeedbackCommentDto = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}, z.string().max(1000).optional());

const ChatFeedbackAssistantMessageTextDto = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}, z.string().max(8000).optional());

export const ChatFeedbackUpsertRequestDto = z
  .object({
    therapySessionId: z.number().int().positive(),
    assistantMessageClientId: ChatFeedbackAssistantMessageClientIdDto,
    sessionId: ChatFeedbackSessionIdDto,
    rating: ChatFeedbackRatingEnum,
    topicCode: ChatFeedbackTopicCodeEnum.optional(),
    comment: ChatFeedbackCommentDto,
    assistantMessageText: ChatFeedbackAssistantMessageTextDto,
  })
  .superRefine((value, ctx) => {
    if (value.rating === 1 && value.topicCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['topicCode'],
        message: 'topicCode must be omitted when rating = 1',
      });
    }
  });

export const ChatFeedbackUpsertItemDto = z.object({
  id: z.number(),
  rating: ChatFeedbackRatingEnum,
  topicCode: ChatFeedbackTopicCodeEnum.nullable(),
  comment: z.string().max(1000).nullable(),
  assistantMessageText: z.string().max(8000).nullable(),
  updatedAt: z.string(),
});

export const ChatFeedbackUpsertResponseDto = z.object({
  ok: z.literal(true),
  item: ChatFeedbackUpsertItemDto,
});

export const ChatFeedbackListQueryDto = z.object({
  therapySessionId: z.coerce.number().int().positive(),
});

export const ChatFeedbackListItemDto = z.object({
  assistantMessageClientId: ChatFeedbackAssistantMessageClientIdDto,
  rating: ChatFeedbackRatingEnum,
  topicCode: ChatFeedbackTopicCodeEnum.nullable(),
  assistantMessageText: z.string().max(8000).nullable(),
  updatedAt: z.string(),
});

export const ChatFeedbackListResponseDto = z.object({
  items: z.array(ChatFeedbackListItemDto),
});

export type UserDto = z.infer<typeof UserDto>;
export type ChatMessageDto = z.infer<typeof ChatMessageDto>;
export type ChatRequestDto = z.infer<typeof ChatRequestDto>;
export type ChatResponseDto = z.infer<typeof ChatResponseDto>;
export type ChatFeedbackRating = z.infer<typeof ChatFeedbackRatingEnum>;
export type ChatFeedbackTopicCode = z.infer<typeof ChatFeedbackTopicCodeEnum>;
export type ChatFeedbackUpsertRequestDto = z.infer<
  typeof ChatFeedbackUpsertRequestDto
>;
export type ChatFeedbackUpsertItemDto = z.infer<
  typeof ChatFeedbackUpsertItemDto
>;
export type ChatFeedbackUpsertResponseDto = z.infer<
  typeof ChatFeedbackUpsertResponseDto
>;
export type ChatFeedbackListQueryDto = z.infer<typeof ChatFeedbackListQueryDto>;
export type ChatFeedbackListItemDto = z.infer<typeof ChatFeedbackListItemDto>;
export type ChatFeedbackListResponseDto = z.infer<
  typeof ChatFeedbackListResponseDto
>;
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

// === Gratitude Diary DTO ===
export const GratitudeDiaryMoodEnum = z.enum([
  'great',
  'good',
  'okay',
  'low',
  'sad',
]);
export const GratitudeDiaryInputMethodEnum = z.enum(['text', 'voice', 'mixed']);
export const GratitudeDiaryTagSchema = z.string().trim().min(1).max(32);

function isValidDiaryEntryDate(value: string): boolean {
  const [yearText = '', monthText = '', dayText = ''] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export const GratitudeDiaryEntryDateSchema = z
  .string()
  .trim()
  .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid entry date')
  .refine(isValidDiaryEntryDate, 'Invalid entry date');

export const GratitudeDiaryEntryCreateDto = z.object({
  text: z.string().trim().min(1).max(2000),
  mood: GratitudeDiaryMoodEnum.nullable(),
  tags: z.array(GratitudeDiaryTagSchema).max(10).default([]),
  entryDate: GratitudeDiaryEntryDateSchema,
  // Принимаем абсолютные HTTPS-URL (CDN) и legacy относительные пути для обратной совместимости.
  photoUrl: z
    .string()
    .trim()
    .refine(
      (value) =>
        /^https?:\/\/.+/i.test(value) ||
        /^\/uploads\/[a-z0-9/_\-.]+$/i.test(value),
      'Invalid photo url'
    )
    .nullable(),
  // Ключ объекта в Object Storage — хранится отдельно от URL для независимости от CDN.
  // Для legacy-записей (локальные /uploads/...) поле отсутствует или null.
  photoStorageKey: z.string().trim().min(1).max(500).nullable().optional(),
  inputMethod: GratitudeDiaryInputMethodEnum.default('text'),
  // Текст вопроса-подсказки, который был активен при записи
  promptText: z.string().trim().max(500).nullable().optional(),
});

export const GratitudeDiaryEntryUpdateDto = GratitudeDiaryEntryCreateDto;

export const GratitudeDiaryQueryDto = z.object({
  search: z.string().trim().max(120).optional(),
  promptId: z.string().trim().max(120).optional(),
});

export const GratitudeDiaryPhotoUploadDto = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  base64: z.string().trim().min(1),
});

/** DTO для удаления orphan-фото из Object Storage (загружено, но не сохранено в запись). */
export const GratitudeDiaryDeletePhotoDto = z.object({
  storageKey: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine(
      (v) => /^user-uploads\/gratitude-diary\/\d+\//.test(v),
      'Недопустимый storageKey'
    ),
});

export const GratitudeDiaryWorksheetItemDto = z.object({
  id: z.string().trim().max(60).optional(),
  emoji: z.string().trim().max(16).optional(),
  text: z.string().trim().max(180).optional(),
});

export const GratitudeDiaryWorksheetUpdateDto = z.object({
  worksheet: z.array(GratitudeDiaryWorksheetItemDto).min(1).max(5),
});

export type GratitudeDiaryMood = z.infer<typeof GratitudeDiaryMoodEnum>;
export type GratitudeDiaryInputMethod = z.infer<
  typeof GratitudeDiaryInputMethodEnum
>;
export type GratitudeDiaryEntryDate = z.infer<
  typeof GratitudeDiaryEntryDateSchema
>;
export type GratitudeDiaryEntryCreateDto = z.infer<
  typeof GratitudeDiaryEntryCreateDto
>;
export type GratitudeDiaryEntryUpdateDto = z.infer<
  typeof GratitudeDiaryEntryUpdateDto
>;
export type GratitudeDiaryQueryDto = z.infer<typeof GratitudeDiaryQueryDto>;
export type GratitudeDiaryPhotoUploadDto = z.infer<
  typeof GratitudeDiaryPhotoUploadDto
>;
export type GratitudeDiaryDeletePhotoDto = z.infer<
  typeof GratitudeDiaryDeletePhotoDto
>;
export type GratitudeDiaryWorksheetItemDto = z.infer<
  typeof GratitudeDiaryWorksheetItemDto
>;
export type GratitudeDiaryWorksheetUpdateDto = z.infer<
  typeof GratitudeDiaryWorksheetUpdateDto
>;

// === Gratitude Diary Favorites DTO ===

// DTO для создания: discriminatedUnion гарантирует что catalog и custom
// содержат только валидные поля (без лишних данных).
export const GratitudeDiaryFavoriteCreateDto = z.discriminatedUnion(
  'promptType',
  [
    z.object({
      promptType: z.literal('catalog'),
      catalogPromptId: z.string().min(1).max(64),
    }),
    z.object({
      promptType: z.literal('custom'),
      customText: z.string().min(1).max(220).trim(),
    }),
  ]
);

export const GratitudeDiaryFavoriteUpdateDto = z.object({
  customText: z.string().min(1).max(220).trim(),
});

// Батч-миграция из localStorage — принимает массивы старых данных
export const GratitudeDiaryFavoriteMigrateDto = z.object({
  catalogPromptIds: z.array(z.string().min(1).max(64)).max(200),
  customPrompts: z
    .array(z.object({ text: z.string().min(1).max(220).trim() }))
    .max(50),
});

// Представление одного элемента избранного, как он возвращается из API
export const GratitudeDiaryFavoriteItemDto = z.object({
  id: z.number(),
  promptType: z.enum(['catalog', 'custom']),
  catalogPromptId: z.string().nullable(),
  customText: z.string().nullable(),
  sortOrder: z.number(),
  createdAt: z.string(),
});

export type GratitudeDiaryFavoriteCreateDto = z.infer<
  typeof GratitudeDiaryFavoriteCreateDto
>;
export type GratitudeDiaryFavoriteUpdateDto = z.infer<
  typeof GratitudeDiaryFavoriteUpdateDto
>;
export type GratitudeDiaryFavoriteMigrateDto = z.infer<
  typeof GratitudeDiaryFavoriteMigrateDto
>;
export type GratitudeDiaryFavoriteItemDto = z.infer<
  typeof GratitudeDiaryFavoriteItemDto
>;

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
