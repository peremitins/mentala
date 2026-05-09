import { z } from 'zod';

export const ActivityPingEvent = z.enum([
  'startup',
  'foreground',
  'background',
  'heartbeat',
]);

export const ActivityPingSource = z.enum(['notification_click']);

export const ActivityPingRequestDto = z.object({
  event: ActivityPingEvent,
  occurredAt: z.string().datetime().optional(),
  clientVisible: z.boolean().optional(),
  clientFocused: z.boolean().optional(),
  source: ActivityPingSource.optional(),
});

export const ActivityPingResponseDto = z.object({
  ok: z.literal(true),
  lastSeenAt: z.string().nullable(),
  lastBackgroundedAt: z.string().nullable(),
});

export type ActivityPingEventType = z.infer<typeof ActivityPingEvent>;
export type ActivityPingSourceType = z.infer<typeof ActivityPingSource>;
export type ActivityPingRequestDtoType = z.infer<typeof ActivityPingRequestDto>;
export type ActivityPingResponseDtoType = z.infer<
  typeof ActivityPingResponseDto
>;
