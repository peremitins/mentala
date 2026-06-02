import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getUserMilestones } from '@/server/application/milestones/milestone.service';
import { MilestonesResponseDto } from '@/shared/dto/milestones';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const milestones = await getUserMilestones(Number(sessionUser.id));

  return MilestonesResponseDto.parse({
    earned: milestones.map((m) => ({
      badgeId: m.badgeId,
      earnedAt: m.earnedAt.toISOString(),
    })),
  });
});
