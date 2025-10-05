import { z } from 'zod'

export const UserDto = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
})

export const ChatMessageDto = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
})

export const ChatRequestDto = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() }))
    .min(1),
  provider: z.enum(['openai', 'deepseek', 'yandex']).optional(),
  model: z.string().optional(),
})

export const ChatResponseDto = z.object({
  message: z.object({ role: z.enum(['assistant']), content: z.string() }),
  provider: z.enum(['openai', 'deepseek', 'yandex']),
  model: z.string().optional(),
})

export type UserDto = z.infer<typeof UserDto>
export type ChatMessageDto = z.infer<typeof ChatMessageDto>
export type ChatRequestDto = z.infer<typeof ChatRequestDto>
export type ChatResponseDto = z.infer<typeof ChatResponseDto>
