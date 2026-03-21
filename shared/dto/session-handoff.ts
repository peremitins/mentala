import { z } from 'zod';
import { RealtimeVoiceSessionEndReasonEnum } from './realtime';

export const ChatModeHandoffModeEnum = z.enum(['text', 'realtime_voice']);

export const ChatModeHandoffRequestDto = z
  .object({
    sourceMode: ChatModeHandoffModeEnum,
    targetMode: ChatModeHandoffModeEnum,
    sourceTherapySessionId: z.number().int().positive().optional(),
    sourceRealtimeSessionId: z.string().trim().min(1).max(64).optional(),
    sourceRealtimeEndReason: RealtimeVoiceSessionEndReasonEnum.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceMode === value.targetMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetMode'],
        message: 'targetMode must differ from sourceMode',
      });
    }

    if (
      value.sourceMode === 'text' &&
      typeof value.sourceTherapySessionId !== 'number'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceTherapySessionId'],
        message: 'sourceTherapySessionId is required for text source mode',
      });
    }

    if (
      value.sourceMode === 'realtime_voice' &&
      typeof value.sourceRealtimeSessionId !== 'string'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceRealtimeSessionId'],
        message:
          'sourceRealtimeSessionId is required for realtime_voice source mode',
      });
    }
  });

export const ChatModeHandoffResponseDto = z.object({
  ok: z.literal(true),
  sourceMode: ChatModeHandoffModeEnum,
  targetMode: ChatModeHandoffModeEnum,
  sourceClosed: z.boolean(),
  summaryCreated: z.boolean(),
  sourceTherapySessionId: z.number().int().positive().nullable(),
});

export type ChatModeHandoffMode = z.infer<typeof ChatModeHandoffModeEnum>;
export type ChatModeHandoffRequest = z.infer<typeof ChatModeHandoffRequestDto>;
export type ChatModeHandoffResponse = z.infer<
  typeof ChatModeHandoffResponseDto
>;
