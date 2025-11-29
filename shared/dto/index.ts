import { z } from 'zod';

export const UserDto = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
});

export const ChatMessageDto = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
});

export const ChatRequestDto = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .min(1),
  provider: z.enum(['openai', 'deepseek', 'yandex']).optional(),
  model: z.string().optional(),
  sessionId: z.string().optional(),
  // расширенные опции
  userId: z.union([z.number(), z.string()]).optional(),
  isFirstSession: z.boolean().optional(),
  userPrompt: z.string().optional(),
  lang: z.string().optional(),
  user_locale: z.string().optional(),
  user_name: z.string().optional(),
});

export const ChatResponseDto = z.object({
  message: z.object({ role: z.enum(['assistant']), content: z.string() }),
  provider: z.enum(['openai', 'deepseek', 'yandex']),
  model: z.string().optional(),
});

export type UserDto = z.infer<typeof UserDto>;
export type ChatMessageDto = z.infer<typeof ChatMessageDto>;
export type ChatRequestDto = z.infer<typeof ChatRequestDto>;
export type ChatResponseDto = z.infer<typeof ChatResponseDto>;

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
