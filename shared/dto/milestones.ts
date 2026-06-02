import { z } from 'zod';

export const MilestoneEventTypeSchema = z.enum([
  'step_completed',
  'thought_saved',
  'garden_completed',
  'activity_check',
  // Полная проверка всех условий: используется для бэкфилла существующих данных
  'full_check',
]);

export const MilestoneCheckRequestDto = z.object({
  event: MilestoneEventTypeSchema,
  gardenSlug: z.string().max(80).optional(),
});

export const EarnedMilestoneDto = z.object({
  badgeId: z.string(),
  earnedAt: z.string().datetime(),
});

export const MilestoneCheckResponseDto = z.object({
  newBadges: z.array(EarnedMilestoneDto),
});

export const MilestonesResponseDto = z.object({
  earned: z.array(EarnedMilestoneDto),
});

export type MilestoneEventType = z.infer<typeof MilestoneEventTypeSchema>;
export type MilestoneCheckRequestDto = z.infer<typeof MilestoneCheckRequestDto>;
export type EarnedMilestoneDto = z.infer<typeof EarnedMilestoneDto>;
export type MilestoneCheckResponseDto = z.infer<typeof MilestoneCheckResponseDto>;
export type MilestonesResponseDto = z.infer<typeof MilestonesResponseDto>;
