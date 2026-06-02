import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  dailyThoughts,
  programs,
  userPlants,
  userProgramStepProgress,
  userPrograms,
  type ProgramUnlockRule,
} from '@/server/infrastructure/db/schema';
import { toIsoString } from '@/server/utils/serialize';
import { getRetentionPlantStateIndex } from '@/app/utils/retentionPlant';
import { trackRetentionEvent } from '@/server/application/analytics/retention-events.service';
import { syncRetentionProgramBootstraps } from '@/server/application/programs/retention-program.service';

/**
 * Сервис Оранжереи (см. retention/retention_long_term_strategy.md).
 *
 * Ответственности:
 *  - Собрать состояние коллекции пользователя: активное растение, завершённые сады,
 *    доступные семена, силуэты будущих садов.
 *  - Проверить unlock_rule перед стартом следующей программы.
 *
 * Хук на создание `user_plants` живёт в `retention-program.service.ts` внутри
 * транзакции `completeProgramStep`, чтобы запись растения и переход программы
 * в `status='completed'` происходили атомарно.
 */

export type GardenSavedThoughtPreview = {
  id: number;
  text: string;
  savedAt: string | null;
};

export type GardenPlantItem = {
  programSlug: string;
  plantSetSlug: string;
  title: string;
  summaryText: string | null;
  completedAt: string | null;
  stateIndex: number;
  /** ID-only список — backward compat для старых клиентов. */
  savedThoughtIds: number[];
  /** Полные тексты сохранённых мыслей периода (если есть). */
  savedThoughts: GardenSavedThoughtPreview[];
};

export type GardenAvailableProgram = {
  programSlug: string;
  plantSetSlug: string | null;
  title: string;
  subtitle: string | null;
  totalSteps: number;
  difficulty: string | null;
  summaryText: string | null;
};

export type GardenLockedSilhouette = {
  programSlug: string;
  plantSetSlug: string | null;
  title: string;
  subtitle: string | null;
  unlockHint: string;
  remainingToUnlock: number;
  lockMode: 'sequential' | 'coming_soon';
};

export type GardenSnapshot = {
  active: GardenPlantItem | null;
  completed: GardenPlantItem[];
  available: GardenAvailableProgram[];
  lockedSilhouettes: GardenLockedSilhouette[];
};

function buildUnlockHint(rule: ProgramUnlockRule, completedCount: number) {
  if (rule.kind === 'always') {
    return { available: true, remaining: 0, hint: '' };
  }
  const remaining = Math.max(0, rule.n - completedCount);
  return {
    available: remaining === 0,
    remaining,
    hint:
      remaining === 0
        ? 'Сад открыт. Можно начать.'
        : remaining === 1
          ? 'Откроется, когда ты завершишь ещё один сад.'
          : `Откроется, когда ты завершишь ещё ${remaining} сада.`,
  };
}

/**
 * Возвращает полную картину Оранжереи: что выращено, что доступно, что под замком.
 *
 * - active: текущая активная (status='active') запись `user_programs`, если есть.
 *           Mapping в GardenPlantItem использует current state по completed_steps
 *           (это считает уже retention-program.service через getRetentionPlantStateIndex —
 *           Frontend подтягивает stateIndex отдельно через /api/today).
 * - completed: все записи `user_plants` в порядке убывания completed_at.
 * - available/lockedSilhouettes: разбивка programs по `unlock_rule` с учётом количества
 *   завершённых пользователем садов.
 */
export async function getGardenForUser(
  userId: number
): Promise<GardenSnapshot> {
  // syncRetentionProgramBootstraps выполняется при старте Nitro (zz-retention-bootstrap.ts).
  // На hot path — no-op (bootstrapSyncDone=true). Оставляем вызов как safety net
  // для случаев когда plugin не успел отработать до первого HTTP-запроса.
  await syncRetentionProgramBootstraps();

  // Аналитика: фиксируем визит в оранжерею. Стратегия §10 — «garden visit rate
  // среди пользователей с ≥1 завершённой программой».
  trackRetentionEvent('garden_visited', { userId });

  const [completedPlants, allPrograms, activeUserProgram] = await Promise.all([
    db
      .select()
      .from(userPlants)
      .where(eq(userPlants.userId, userId))
      .orderBy(desc(userPlants.completedAt)),
    db.select().from(programs).orderBy(asc(programs.id)),
    db
      .select({
        id: userPrograms.id,
        programId: userPrograms.programId,
      })
      .from(userPrograms)
      .where(
        and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'active'))
      )
      .limit(1),
  ]);

  // Для активного сада считаем реальное число завершённых шагов программы,
  // чтобы корректно показать текущую стадию растения в `/garden`. Один запрос,
  // только если active program вообще существует.
  let activeCompletedSteps = 0;
  if (activeUserProgram[0]) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userProgramStepProgress)
      .where(
        and(
          eq(userProgramStepProgress.userProgramId, activeUserProgram[0].id),
          eq(userProgramStepProgress.status, 'completed')
        )
      );
    activeCompletedSteps = Number(countRow?.count ?? 0);
  }

  const programsBySlug = new Map(
    allPrograms.map((program) => [program.slug, program])
  );
  const programsById = new Map(
    allPrograms.map((program) => [program.id, program])
  );
  const completedProgramSlugs = new Set(
    completedPlants.map((row) => row.programSlug)
  );

  // Bulk-fetch saved thoughts текстов для всех завершённых растений (один запрос
  // вместо N+1). Делается отдельным select'ом, потому что ids живут в jsonb
  // и join с dailyThoughts через ANY(jsonb_array_elements) был бы тяжелее
  // одного inArray на плоский список.
  const allSavedThoughtIds = Array.from(
    new Set(
      completedPlants.flatMap((row) =>
        Array.isArray(row.savedThoughts?.ids) ? row.savedThoughts.ids : []
      )
    )
  );
  const thoughtsById = new Map<number, GardenSavedThoughtPreview>();
  if (allSavedThoughtIds.length > 0) {
    const rows = await db
      .select({
        id: dailyThoughts.id,
        text: dailyThoughts.text,
        savedAt: dailyThoughts.savedAt,
      })
      .from(dailyThoughts)
      .where(
        and(
          eq(dailyThoughts.userId, userId),
          inArray(dailyThoughts.id, allSavedThoughtIds)
        )
      );
    for (const row of rows) {
      thoughtsById.set(row.id, {
        id: row.id,
        text: row.text,
        savedAt: toIsoString(row.savedAt),
      });
    }
  }

  const completed: GardenPlantItem[] = completedPlants.map((row) => {
    const program = programsBySlug.get(row.programSlug);
    const savedIds = Array.isArray(row.savedThoughts?.ids)
      ? row.savedThoughts.ids
      : [];
    const savedThoughts: GardenSavedThoughtPreview[] = savedIds
      .map((id) => thoughtsById.get(id))
      .filter((t): t is GardenSavedThoughtPreview => Boolean(t));
    return {
      programSlug: row.programSlug,
      plantSetSlug: row.plantSetSlug,
      title: program?.title ?? row.programSlug,
      // Для карточки коллекции показываем чистый subtitle программы —
      // короткое человекочитаемое описание. userSummary содержит AI-markdown
      // отчёт (с заголовками ##) и используется только в лор-шите (Отчёт).
      summaryText: program?.subtitle ?? null,
      completedAt: toIsoString(row.completedAt),
      stateIndex: row.stateIndex,
      savedThoughtIds: savedIds,
      savedThoughts,
    };
  });

  const activeProgram = activeUserProgram[0]
    ? (programsById.get(activeUserProgram[0].programId) ?? null)
    : null;
  // stateIndex для active сада считаем сразу здесь — Frontend не делает
  // дополнительный fetch /api/today для одной картинки на /garden.
  // stateIndex хранится в формате 1..N (как в user_plants), а helper использует
  // 0-based, поэтому +1.
  const activeStateIndex = activeProgram
    ? getRetentionPlantStateIndex(
        activeCompletedSteps,
        activeProgram.totalSteps
      ) + 1
    : 0;
  const active: GardenPlantItem | null = activeProgram
    ? {
        programSlug: activeProgram.slug,
        plantSetSlug: activeProgram.plantSetSlug ?? 'orchid',
        title: activeProgram.title,
        summaryText: activeProgram.summaryText,
        stateIndex: activeStateIndex,
        completedAt: null,
        savedThoughtIds: [],
        savedThoughts: [],
      }
    : null;

  const available: GardenAvailableProgram[] = [];
  const lockedSilhouettes: GardenLockedSilhouette[] = [];

  for (const program of allPrograms) {
    if (completedProgramSlugs.has(program.slug)) continue;
    if (program.slug === active?.programSlug) continue;

    // Будущие Сады (контента шагов ещё нет) показываем под замком так же, как
    // и готовые-но-ещё-не-открытые: единый тон «откроется последовательно».
    // Для юзера не должно быть ощущения «сад в разработке» — только «дойдёшь
    // по порядку». Стартовать их всё равно нельзя (assertProgramUnlocked
    // отбивает по status).
    if (program.status === 'coming_soon') {
      const unlock = buildUnlockHint(
        program.unlockRule,
        completedPlants.length
      );
      lockedSilhouettes.push({
        programSlug: program.slug,
        plantSetSlug: program.plantSetSlug,
        title: program.title,
        subtitle: program.subtitle,
        // remaining===0 — unlockRule формально выполнен, но контента ещё нет.
        // Не говорим «в разработке», держим последовательный тон.
        unlockHint:
          unlock.remaining > 0 ? unlock.hint : 'Откроется совсем скоро.',
        remainingToUnlock: unlock.remaining,
        lockMode: 'coming_soon',
      });
      continue;
    }

    const unlock = buildUnlockHint(program.unlockRule, completedPlants.length);
    if (unlock.available) {
      available.push({
        programSlug: program.slug,
        plantSetSlug: program.plantSetSlug,
        title: program.title,
        subtitle: program.subtitle,
        totalSteps: program.totalSteps,
        difficulty: program.difficulty,
        summaryText: program.summaryText,
      });
    } else {
      lockedSilhouettes.push({
        programSlug: program.slug,
        plantSetSlug: program.plantSetSlug,
        title: program.title,
        subtitle: program.subtitle,
        unlockHint: unlock.hint,
        remainingToUnlock: unlock.remaining,
        lockMode: 'sequential',
      });
    }
  }

  // Порядок «Что ждёт впереди»: сначала готовые Сады по близости к
  // разблокировке (меньше осталось — выше), затем тизеры «Скоро» (исходный
  // порядок по id сохраняется как стабильный tie-breaker).
  lockedSilhouettes.sort((a, b) => {
    if (a.lockMode !== b.lockMode) {
      return a.lockMode === 'sequential' ? -1 : 1;
    }
    return a.remainingToUnlock - b.remainingToUnlock;
  });

  return { active, completed, available, lockedSilhouettes };
}

/**
 * Проверяет, что Сад с указанным slug доступен пользователю (unlock_rule выполнено),
 * и стартует или возобновляет запись `user_programs`.
 *
 * Возвращает программу + запись `user_programs`, чтобы вызывающий мог сразу отдать overview.
 * Реальное создание `user_programs` делает `getOrCreateProgramOverview` —
 * этот сервис лишь валидирует unlock-правило.
 */
export async function assertProgramUnlocked(
  userId: number,
  programSlug: string
): Promise<{ programSlug: string }> {
  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, programSlug))
    .limit(1);

  if (!program) {
    const error = new Error('Unknown retention program');
    (error as Error & { code?: string }).code = 'E_NOT_FOUND';
    throw error;
  }

  // Тизер будущего Сада: контента шагов нет, стартовать нельзя (защита от
  // прямого вызова API в обход UI, где такой Сад показан как «Скоро»).
  if (program.status !== 'published') {
    const error = new Error('Этот сад скоро появится. Загляни немного позже.');
    (error as Error & { code?: string }).code = 'E_FORBIDDEN';
    throw error;
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userPlants)
    .where(eq(userPlants.userId, userId));
  const completedCount = Number(countRow?.count ?? 0);

  const unlock = buildUnlockHint(program.unlockRule, completedCount);
  if (!unlock.available) {
    const error = new Error(unlock.hint);
    (error as Error & { code?: string }).code = 'E_FORBIDDEN';
    throw error;
  }

  return { programSlug: program.slug };
}
