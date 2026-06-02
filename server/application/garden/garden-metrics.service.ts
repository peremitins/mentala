import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { userProgramStepAttempts } from '@/server/infrastructure/db/schema';

/**
 * Lightweight метрики путешествия по программе для UI отчёта.
 *
 * Отделено от `garden-summary.service.ts` (тяжёлая LLM-генерация), потому что
 * на polling-endpoint `/api/garden/plants/:id/summary-status` нам нужны
 * только цифры — без расшифровки ai_chat саммари, без подтягивания всех
 * journal-снippets, без mood-чекинов.
 *
 * Используется в:
 *   - GET /api/garden/plants/:id/summary-status (polling каждые 2 сек на фронте) —
 *     отдаёт метрики мгновенно, даже пока LLM ещё не закончил.
 *   - getOrGeneratePlantSummary внутри garden-summary.service.ts — для KPI
 *     в ответе на refresh-summary endpoint.
 */
export type ProgramMetricsLightweight = {
  durationDays: number;
  completedSteps: number;
  journalEntriesCount: number;
  aiChatSessionsCount: number;
  reflectionsCount: number;
};

export async function collectProgramMetricsLightweight(params: {
  userId: number;
  userProgramId: number;
  programStartedAt: Date;
  programCompletedAt: Date | null;
}): Promise<ProgramMetricsLightweight> {
  const endDate = params.programCompletedAt ?? new Date();
  const durationDays = Math.max(
    1,
    Math.round(
      (endDate.getTime() - params.programStartedAt.getTime()) /
        (24 * 60 * 60 * 1000)
    )
  );

  const attempts = await db
    .select({
      step: userProgramStepAttempts.step,
      actions: userProgramStepAttempts.actions,
    })
    .from(userProgramStepAttempts)
    .where(
      and(
        eq(userProgramStepAttempts.userId, params.userId),
        eq(userProgramStepAttempts.userProgramId, params.userProgramId),
        eq(userProgramStepAttempts.status, 'completed')
      )
    )
    .orderBy(
      asc(userProgramStepAttempts.step),
      asc(userProgramStepAttempts.createdAt)
    );

  // Дедуп по шагу: пользователь может перепроходить один и тот же шаг, и тогда
  // в БД лежит несколько завершённых attempt'ов на один step. Раньше метрики
  // считались по всем attempt'ам (`attempts.length`), из-за чего шаги и
  // действия задваивались (например, 46 «шагов» в 21-шаговом саду). Берём по
  // одному (последнему) завершённому attempt'у на каждый шаг.
  const latestActionsByStep = new Map<number, unknown>();
  for (const row of attempts) {
    latestActionsByStep.set(row.step, row.actions);
  }

  let journalEntriesCount = 0;
  let aiChatSessionsCount = 0;
  let reflectionsCount = 0;
  for (const actionsRaw of latestActionsByStep.values()) {
    const actions = Array.isArray(actionsRaw)
      ? (actionsRaw as Array<{ type?: string; status?: string }>)
      : [];
    for (const a of actions) {
      if (a?.status !== 'completed') continue;
      if (a.type === 'journal_entry' || a.type === 'thought_dump') {
        journalEntriesCount += 1;
      } else if (a.type === 'ai_chat_session') {
        aiChatSessionsCount += 1;
      } else if (a.type === 'ai_reflection') {
        reflectionsCount += 1;
      }
    }
  }

  return {
    durationDays,
    completedSteps: latestActionsByStep.size,
    journalEntriesCount,
    aiChatSessionsCount,
    reflectionsCount,
  };
}
