import { getAssessmentDefinition } from './assessment-catalog';
import { scoreAssessmentAnswers } from './assessment-scoring.service';
import {
  DEFAULT_RETENTION_TIMEZONE,
  getLocalDateKey,
} from '@/server/application/programs/retention-timezone';
import type {
  AssessmentAnswerInput,
  AssessmentAttempt,
  AssessmentAttemptAnswer,
  AssessmentAttemptResultSnapshot,
  AssessmentAttemptSource,
  AssessmentChartResponse,
} from '@/shared/dto/assessments';

export type AssessmentAttemptRecord = {
  id: number;
  userId: number;
  assessmentSlug: string;
  assessmentVersion: number;
  source: AssessmentAttemptSource;
  linkedProgramSlug: string | null;
  linkedProgramAttemptId: number | null;
  totalScore: number;
  bandId: string;
  resultSnapshot: AssessmentAttemptResultSnapshot;
  answers: AssessmentAttemptAnswer[];
  userDate: string;
  timezone: string;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export interface AssessmentAttemptsRepository {
  createAttempt(
    input: Omit<AssessmentAttemptRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AssessmentAttemptRecord>;
  findAttemptById(attemptId: number): Promise<AssessmentAttemptRecord | null>;
  listAttempts(params: {
    userId: number;
    assessmentSlug: string;
  }): Promise<AssessmentAttemptRecord[]>;
}

export type AssessmentChart = AssessmentChartResponse;

export class AssessmentAttemptServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = 'AssessmentAttemptServiceError';
  }
}

function normalizeTimezone(timezone?: string | null): string {
  const candidate = timezone?.trim() || DEFAULT_RETENTION_TIMEZONE;
  try {
    // Проверяем IANA timezone до сохранения: Intl бросает RangeError на мусор.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(
      new Date()
    );
    return candidate;
  } catch {
    return DEFAULT_RETENTION_TIMEZONE;
  }
}

export function toAssessmentAttemptDto(
  attempt: AssessmentAttemptRecord
): AssessmentAttempt {
  return {
    id: attempt.id,
    userId: attempt.userId,
    assessmentSlug: attempt.assessmentSlug,
    assessmentVersion: attempt.assessmentVersion,
    source: attempt.source,
    linkedProgramSlug: attempt.linkedProgramSlug,
    linkedProgramAttemptId: attempt.linkedProgramAttemptId,
    totalScore: attempt.totalScore,
    bandId: attempt.bandId,
    resultSnapshot: attempt.resultSnapshot,
    answers: attempt.answers,
    userDate: attempt.userDate,
    timezone: attempt.timezone,
    completedAt: attempt.completedAt.toISOString(),
  };
}

export async function createAssessmentAttempt(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  source?: AssessmentAttemptSource;
  linkedProgramSlug?: string | null;
  linkedProgramAttemptId?: number | null;
  timezone?: string | null;
  completedAt?: Date;
  answers: AssessmentAnswerInput[];
}): Promise<AssessmentAttemptRecord> {
  const assessment = getAssessmentDefinition(params.assessmentSlug);
  if (!assessment) {
    throw new AssessmentAttemptServiceError(
      `Assessment ${params.assessmentSlug} not found`,
      404
    );
  }
  if (assessment.status !== 'active') {
    throw new AssessmentAttemptServiceError(
      `Assessment ${params.assessmentSlug} is not active`,
      400
    );
  }

  const completedAt = params.completedAt ?? new Date();
  const timezone = normalizeTimezone(params.timezone);
  const score = scoreAssessmentAnswers(assessment, params.answers);
  const resultSnapshot: AssessmentAttemptResultSnapshot = {
    bandId: score.band.id,
    title: score.band.title,
    shortText: score.band.shortText,
    scoreDirection: assessment.scoreDirection,
  };

  return params.repository.createAttempt({
    userId: params.userId,
    assessmentSlug: assessment.slug,
    assessmentVersion: assessment.version,
    source: params.source ?? 'practice_page',
    linkedProgramSlug: params.linkedProgramSlug ?? null,
    linkedProgramAttemptId: params.linkedProgramAttemptId ?? null,
    totalScore: score.totalScore,
    bandId: score.band.id,
    resultSnapshot,
    answers: score.answers,
    userDate: getLocalDateKey(completedAt, timezone),
    timezone,
    completedAt,
  });
}

export async function getAssessmentHistory(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  assessmentVersion?: number;
}): Promise<AssessmentAttemptRecord[]> {
  const assessment = getAssessmentDefinition(params.assessmentSlug);
  if (!assessment) {
    throw new AssessmentAttemptServiceError(
      `Assessment ${params.assessmentSlug} not found`,
      404
    );
  }
  const version = params.assessmentVersion ?? assessment?.version;
  const attempts = await params.repository.listAttempts({
    userId: params.userId,
    assessmentSlug: params.assessmentSlug,
  });

  return typeof version === 'number'
    ? attempts.filter((attempt) => attempt.assessmentVersion === version)
    : attempts;
}

export async function getAssessmentResultForUser(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  attemptId: number;
}): Promise<{
  item: AssessmentAttemptRecord;
  previous: AssessmentAttemptRecord | null;
  comparison: {
    delta: number;
    direction: 'improved' | 'worse' | 'stable';
    text: string;
  } | null;
} | null> {
  const item = await params.repository.findAttemptById(params.attemptId);
  if (
    !item ||
    item.userId !== params.userId ||
    item.assessmentSlug !== params.assessmentSlug
  ) {
    return null;
  }

  const history = await params.repository.listAttempts({
    userId: params.userId,
    assessmentSlug: params.assessmentSlug,
  });
  const previous =
    history.find(
      (attempt) =>
        attempt.id !== item.id &&
        attempt.assessmentVersion === item.assessmentVersion &&
        attempt.completedAt.getTime() < item.completedAt.getTime()
    ) ?? null;

  if (!previous) {
    return { item, previous: null, comparison: null };
  }

  const delta = item.totalScore - previous.totalScore;
  const direction: 'improved' | 'worse' | 'stable' = (() => {
    if (Math.abs(delta) < 2) return 'stable';
    if (item.resultSnapshot.scoreDirection === 'higher_is_better') {
      return delta > 0 ? 'improved' : 'worse';
    }
    return delta < 0 ? 'improved' : 'worse';
  })();
  const comparison =
    direction === 'improved'
      ? {
          delta,
          direction,
          text:
            item.resultSnapshot.scoreDirection === 'higher_is_worse'
              ? 'Немного легче, чем раньше. Продолжай.'
              : 'Немного лучше, чем раньше. Хорошее движение.',
        }
      : direction === 'worse'
        ? {
            delta,
            direction,
            text:
              item.resultSnapshot.scoreDirection === 'higher_is_worse'
                ? 'Чуть тяжелее, чем раньше. Такое бывает у всех.'
                : 'Немного хуже, чем раньше. Дай себе передышку.',
          }
        : {
            delta,
            direction,
            text: 'Примерно как раньше. Продолжай замечать своё состояние.',
          };

  return { item, previous, comparison };
}

export async function getAssessmentChart(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  assessmentVersion?: number;
}): Promise<AssessmentChart> {
  const assessment = getAssessmentDefinition(params.assessmentSlug);
  if (!assessment) {
    throw new AssessmentAttemptServiceError(
      `Assessment ${params.assessmentSlug} not found`,
      404
    );
  }
  const assessmentVersion = params.assessmentVersion ?? assessment.version;
  const attempts = await getAssessmentHistory({
    repository: params.repository,
    userId: params.userId,
    assessmentSlug: params.assessmentSlug,
    assessmentVersion,
  });

  const latestByUserDate = new Map<string, AssessmentAttemptRecord>();
  for (const attempt of attempts) {
    const existing = latestByUserDate.get(attempt.userDate);
    // listAttempts обычно приходит newest-first, но сравнение делает контракт
    // устойчивым даже для тестового или будущего repository.
    if (
      !existing ||
      attempt.completedAt.getTime() > existing.completedAt.getTime()
    ) {
      latestByUserDate.set(attempt.userDate, attempt);
    }
  }

  const points = Array.from(latestByUserDate.values())
    .sort((a, b) => a.userDate.localeCompare(b.userDate))
    .map((attempt) => ({
      attemptId: attempt.id,
      userDate: attempt.userDate,
      totalScore: attempt.totalScore,
      bandId: attempt.bandId,
      completedAt: attempt.completedAt.toISOString(),
    }));

  return {
    assessmentSlug: assessment.slug,
    assessmentVersion,
    scoreDirection: assessment.scoreDirection,
    points,
  };
}

export const DEFAULT_BASELINE_REUSE_WINDOW_DAYS = 7;

/**
 * Ищет недавний результат оценки, который сад может переиспользовать как
 * стартовую точку (ТЗ §14): последняя завершённая попытка текущей версии за
 * последние `withinDays` дней. Версия учитывается, чтобы не сравнивать ответы
 * между разными методиками.
 */
export async function getReusableProgramBaseline(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  withinDays?: number;
  now?: Date;
}): Promise<AssessmentAttemptRecord | null> {
  const latest = await getLatestAssessmentAttempt({
    repository: params.repository,
    userId: params.userId,
    assessmentSlug: params.assessmentSlug,
  });
  if (!latest) return null;
  const now = params.now ?? new Date();
  const windowMs =
    (params.withinDays ?? DEFAULT_BASELINE_REUSE_WINDOW_DAYS) *
    24 *
    60 *
    60 *
    1000;
  const ageMs = now.getTime() - latest.completedAt.getTime();
  if (ageMs < 0 || ageMs > windowMs) return null;
  return latest;
}

export async function getLatestAssessmentAttempt(params: {
  repository: AssessmentAttemptsRepository;
  userId: number;
  assessmentSlug: string;
  assessmentVersion?: number;
}): Promise<AssessmentAttemptRecord | null> {
  const attempts = await getAssessmentHistory({
    repository: params.repository,
    userId: params.userId,
    assessmentSlug: params.assessmentSlug,
    assessmentVersion: params.assessmentVersion,
  });

  return attempts[0] ?? null;
}
