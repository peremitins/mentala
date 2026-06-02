import { createError, defineEventHandler, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { checkAndAwardMilestones } from '@/server/application/milestones/milestone.service';
import {
  MilestoneCheckRequestDto,
  MilestoneCheckResponseDto,
} from '@/shared/dto/milestones';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const parsed = MilestoneCheckRequestDto.safeParse(
    (await readBody(event)) ?? {}
  );
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation error',
      data: { issues: parsed.error.issues },
    });
  }

  const userId = Number(sessionUser.id);
  const { event: milestoneEvent, gardenSlug } = parsed.data;

  const newBadges = await checkAndAwardMilestones(
    userId,
    milestoneEvent,
    gardenSlug
  );

  return MilestoneCheckResponseDto.parse({
    newBadges: newBadges.map((b) => ({
      badgeId: b.badgeId,
      earnedAt: b.earnedAt.toISOString(),
    })),
  });
});
