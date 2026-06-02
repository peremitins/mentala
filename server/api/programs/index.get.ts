import { asc, eq } from 'drizzle-orm';
import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import {
  programs,
  userPlants,
  type ProgramUnlockRule,
} from '@/server/infrastructure/db/schema';
import { ProgramListResponseDto } from '@/shared/dto/garden';
import { toIsoString } from '@/server/utils/serialize';

/**
 * GET /api/programs — список всех Садов с пометкой `unlocked` и `completedAt` для текущего юзера.
 * Используется на экране Оранжереи и для admin/диагностики.
 */
function isUnlocked(rule: ProgramUnlockRule, completedCount: number) {
  if (rule.kind === 'always') return true;
  return completedCount >= rule.n;
}

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }
  const userId = Number(sessionUser.id);

  const [allPrograms, plants] = await Promise.all([
    db.select().from(programs).orderBy(asc(programs.id)),
    db
      .select({
        programId: userPlants.programId,
        completedAt: userPlants.completedAt,
      })
      .from(userPlants)
      .where(eq(userPlants.userId, userId)),
  ]);

  const completedById = new Map<number, Date>();
  for (const row of plants) {
    completedById.set(row.programId, row.completedAt);
  }
  const completedCount = plants.length;

  const items = allPrograms.map((program) => {
    const completedAt = completedById.get(program.id) ?? null;
    return {
      programSlug: program.slug,
      plantSetSlug: program.plantSetSlug,
      title: program.title,
      subtitle: program.subtitle,
      totalSteps: program.totalSteps,
      difficulty: program.difficulty,
      summaryText: program.summaryText,
      unlocked: isUnlocked(program.unlockRule, completedCount),
      completedAt: toIsoString(completedAt),
    };
  });

  return ProgramListResponseDto.parse({ items });
});
