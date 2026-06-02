import { z } from 'zod';

/**
 * Пользовательские саммари сессий (ТЗ редизайн главной, п.5, п.13).
 *
 * Отдельная сущность от `sessionSummaries` (handoff для LLM) — здесь
 * человекочитаемый итог сессии для пользователя.
 */

// Тело саммари (шифруется AES-GCM на сервере; на клиент отдаётся расшифрованным).
export const SessionSummaryUserContentDto = z.object({
  shortSummary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).default([]),
  // nextSteps объединяет бывшие `recommendations` + `nextStep`:
  // мягкие предложения и конкретные шаги в одном списке (2–4 пункта).
  nextSteps: z.array(z.string().min(1)).default([]),
});

export type SessionSummaryUserContentDtoType = z.infer<
  typeof SessionSummaryUserContentDto
>;

export const SessionSummaryUserStatusEnum = z.enum([
  'pending',
  'completed',
  'failed',
]);
export type SessionSummaryUserStatus = z.infer<
  typeof SessionSummaryUserStatusEnum
>;

export const SessionSummaryUserTriggerEnum = z.enum([
  'manual',
  'roadmap_next',
  'logout',
  'app-hidden',
  'cron-nightly',
]);
export type SessionSummaryUserTrigger = z.infer<
  typeof SessionSummaryUserTriggerEnum
>;

// Запрос на создание пользовательского саммари с клиента.
// Сервер сам извлекает stored transcript по therapySessionId.
export const CreateSessionSummaryUserRequestDto = z.object({
  therapySessionId: z.number().int().positive().optional(),
  clientSessionId: z.string().trim().min(1).max(120).optional(),
  trigger: SessionSummaryUserTriggerEnum.default('manual'),
  // Метаданные eligibility с клиента (fallback когда transcript в БД пустой).
  userMessagesCount: z.number().int().nonnegative().optional(),
  qualifyingUserMessagesCount: z.number().int().nonnegative().optional(),
  sessionStartedAt: z.string().datetime().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  // Сообщения с клиента — fallback для LLM когда transcript в БД пустой.
  // Актуально для realtime voice (transient messages) и memory-off кейса.
  clientMessages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(8000),
      })
    )
    .max(200)
    .optional(),
});

export type CreateSessionSummaryUserRequestDtoType = z.infer<
  typeof CreateSessionSummaryUserRequestDto
>;

// Ответ при создании саммари.
export const CreateSessionSummaryUserResponseDto = z.object({
  ok: z.literal(true),
  id: z.number().int().positive().nullable(),
  status: SessionSummaryUserStatusEnum,
  eligible: z.boolean(),
  reason: z.string().optional(),
});

export type CreateSessionSummaryUserResponseDtoType = z.infer<
  typeof CreateSessionSummaryUserResponseDto
>;

// Элемент списка пользовательских саммари.
export const SessionSummaryUserItemDto = z.object({
  id: z.number().int().positive(),
  status: SessionSummaryUserStatusEnum,
  sessionStartedAt: z.string().datetime().nullable(),
  sessionEndedAt: z.string().datetime().nullable(),
  durationSeconds: z.number().int().nonnegative(),
  messagesCount: z.number().int().nonnegative(),
  qualifyingUserMessagesCount: z.number().int().nonnegative(),
  viewedAt: z.string().datetime().nullable(),
  trigger: SessionSummaryUserTriggerEnum.nullable(),
  summary: SessionSummaryUserContentDto,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type SessionSummaryUserItemDtoType = z.infer<
  typeof SessionSummaryUserItemDto
>;

// Список.
export const ListSessionSummariesUserResponseDto = z.object({
  items: z.array(SessionSummaryUserItemDto),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export type ListSessionSummariesUserResponseDtoType = z.infer<
  typeof ListSessionSummariesUserResponseDto
>;

// Query params списка.
export const ListSessionSummariesUserQueryDto = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListSessionSummariesUserQueryDtoType = z.infer<
  typeof ListSessionSummariesUserQueryDto
>;

// Ответ единичного саммари.
export const GetSessionSummaryUserResponseDto = z.object({
  item: SessionSummaryUserItemDto,
});

export type GetSessionSummaryUserResponseDtoType = z.infer<
  typeof GetSessionSummaryUserResponseDto
>;

// Ответ unseen (первый непросмотренный саммари или null).
export const UnseenSessionSummaryUserResponseDto = z.object({
  item: SessionSummaryUserItemDto.nullable(),
});

export type UnseenSessionSummaryUserResponseDtoType = z.infer<
  typeof UnseenSessionSummaryUserResponseDto
>;

// Ответ на mark viewed.
export const MarkSessionSummaryUserViewedResponseDto = z.object({
  ok: z.literal(true),
  viewedAt: z.string().datetime(),
});

export type MarkSessionSummaryUserViewedResponseDtoType = z.infer<
  typeof MarkSessionSummaryUserViewedResponseDto
>;
