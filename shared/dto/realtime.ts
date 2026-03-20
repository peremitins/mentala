import { z } from 'zod';

export const RealtimeVoiceClientPlatformEnum = z.enum([
  'web',
  'ios',
  'android',
]);

export const RealtimeVoiceSessionStatusEnum = z.enum([
  'created',
  'active',
  'completed',
  'failed',
]);

export const RealtimeVoiceSessionEndReasonEnum = z.enum([
  'user_stop',
  'timeout',
  'page_leave',
  'network_error',
  'provider_error',
  'replaced_by_new_session',
]);

export const RealtimeVoiceSessionStartRequestDto = z.object({
  // entryContext уже валидируется на уровне вызывающего экрана.
  // Здесь избегаем циклической зависимости shared/dto/index -> realtime -> index.
  entryContext: z.unknown().nullable().optional(),
  chatSessionId: z.string().trim().min(1).max(120).optional(),
  clientPlatformHint: RealtimeVoiceClientPlatformEnum.optional(),
});

export const RealtimeVoiceQuotaDto = z.object({
  limitSeconds: z.number().int().nonnegative(),
  usedSeconds: z.number().int().nonnegative(),
  remainingSeconds: z.number().int().nonnegative(),
  resetsAt: z.string(),
});

export const RealtimeVoiceWeeklyQuotaDto = z.object({
  weeklyLimitMinutes: z.number().int().nonnegative(),
  usedMinutes: z.number().int().nonnegative(),
  availableMinutes: z.number().int().nonnegative(),
  nextResetAt: z.string().nullable(),
});

export const RealtimeVoiceSessionStartResponseDto = z.object({
  session: z.object({
    id: z.string().min(1).max(64),
    therapySessionId: z.number().int().positive(),
    status: RealtimeVoiceSessionStatusEnum,
    model: z.string().min(1),
    voice: z.string().min(1),
    maxDurationSeconds: z.number().int().positive(),
    idleTimeoutSeconds: z.number().int().positive(),
    clientPlatform: RealtimeVoiceClientPlatformEnum,
  }),
  openai: z.object({
    clientSecret: z.string().min(1).nullable().optional(),
    expiresAt: z.string(),
    webrtcUrl: z.string().url(),
  }),
  quota: RealtimeVoiceQuotaDto,
  weeklyAi: RealtimeVoiceWeeklyQuotaDto,
});

export const RealtimeVoiceSessionEventTypeEnum = z.enum([
  'started',
  'user_turn_completed',
  'interrupted',
  'response_started',
  'response_completed',
  'failed',
]);

export const RealtimeVoiceSessionEventMetricsDto = z
  .object({
    inputAudioSecondsDelta: z.number().int().nonnegative().optional(),
    outputAudioSecondsDelta: z.number().int().nonnegative().optional(),
    inputAudioTokensDelta: z.number().int().nonnegative().optional(),
    outputAudioTokensDelta: z.number().int().nonnegative().optional(),
  })
  .partial()
  .optional();

export const RealtimeVoiceSessionEventRequestDto = z.object({
  sessionId: z.string().trim().min(1).max(64),
  eventId: z.string().trim().min(1).max(120),
  type: RealtimeVoiceSessionEventTypeEnum,
  at: z.string().datetime(),
  metrics: RealtimeVoiceSessionEventMetricsDto,
  error: z
    .object({
      code: z.string().trim().min(1).max(80).optional(),
      message: z.string().trim().min(1).max(2000).optional(),
    })
    .partial()
    .nullable()
    .optional(),
  meta: z.record(z.any()).optional(),
});

export const RealtimeVoiceSessionEventResponseDto = z.object({
  ok: z.literal(true),
  deduplicated: z.boolean(),
});

export const RealtimeVoiceSessionEndRequestDto = z.object({
  sessionId: z.string().trim().min(1).max(64),
  reason: RealtimeVoiceSessionEndReasonEnum,
});

export const RealtimeVoiceSessionEndResponseDto = z.object({
  session: z.object({
    id: z.string().min(1).max(64),
    status: RealtimeVoiceSessionStatusEnum,
    durationSeconds: z.number().int().nonnegative(),
    interruptCount: z.number().int().nonnegative(),
    inputAudioSeconds: z.number().int().nonnegative(),
    outputAudioSeconds: z.number().int().nonnegative(),
  }),
  quota: RealtimeVoiceQuotaDto,
  weeklyAi: RealtimeVoiceWeeklyQuotaDto,
});

export type RealtimeVoiceClientPlatform = z.infer<
  typeof RealtimeVoiceClientPlatformEnum
>;
export type RealtimeVoiceSessionStatus = z.infer<
  typeof RealtimeVoiceSessionStatusEnum
>;
export type RealtimeVoiceSessionEndReason = z.infer<
  typeof RealtimeVoiceSessionEndReasonEnum
>;
export type RealtimeVoiceSessionStartRequest = z.infer<
  typeof RealtimeVoiceSessionStartRequestDto
>;
export type RealtimeVoiceSessionStartResponse = z.infer<
  typeof RealtimeVoiceSessionStartResponseDto
>;
export type RealtimeVoiceSessionEventType = z.infer<
  typeof RealtimeVoiceSessionEventTypeEnum
>;
export type RealtimeVoiceSessionEventRequest = z.infer<
  typeof RealtimeVoiceSessionEventRequestDto
>;
export type RealtimeVoiceSessionEventResponse = z.infer<
  typeof RealtimeVoiceSessionEventResponseDto
>;
export type RealtimeVoiceSessionEndRequest = z.infer<
  typeof RealtimeVoiceSessionEndRequestDto
>;
export type RealtimeVoiceSessionEndResponse = z.infer<
  typeof RealtimeVoiceSessionEndResponseDto
>;
