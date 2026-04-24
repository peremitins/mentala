import { z } from 'zod';

export const RestorableTherapySessionMessageDto = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const RestorableTherapySessionDto = z.object({
  therapySessionId: z.number().int().positive(),
  clientSessionId: z.string().trim().min(1).max(120).nullable(),
  sessionStartedAt: z.string().datetime(),
  lastActivityAt: z.string().datetime().nullable(),
  messages: z.array(RestorableTherapySessionMessageDto),
  // true — сессия уже завершена (таймер остановлен), при restore therapySessionId
  // в клиентском сторе будет сброшен: новые сообщения создадут новую сессию.
  isEnded: z.boolean().default(false),
});

export const GetRestorableTherapySessionResponseDto = z.object({
  session: RestorableTherapySessionDto.nullable(),
});

export type RestorableTherapySessionDtoType = z.infer<
  typeof RestorableTherapySessionDto
>;
