import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  AssessmentAttemptRecord,
  AssessmentAttemptsRepository,
} from '../server/application/assessments/assessment-attempts.service';
import {
  createAssessmentAttempt,
  getAssessmentChart,
  getAssessmentResultForUser,
  getReusableProgramBaseline,
} from '../server/application/assessments/assessment-attempts.service';
import { getAssessmentDefinition } from '../server/application/assessments/assessment-catalog';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

class InMemoryAssessmentAttemptsRepository
  implements AssessmentAttemptsRepository
{
  private nextId = 1;
  public attempts: AssessmentAttemptRecord[] = [];

  async createAttempt(
    input: Omit<AssessmentAttemptRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<AssessmentAttemptRecord> {
    const now = new Date(input.completedAt);
    const item: AssessmentAttemptRecord = {
      ...input,
      id: this.nextId++,
      createdAt: now,
      updatedAt: now,
    };
    this.attempts.push(item);
    return item;
  }

  async findAttemptById(
    attemptId: number
  ): Promise<AssessmentAttemptRecord | null> {
    return this.attempts.find((attempt) => attempt.id === attemptId) ?? null;
  }

  async listAttempts(params: {
    userId: number;
    assessmentSlug: string;
  }): Promise<AssessmentAttemptRecord[]> {
    return this.attempts
      .filter(
        (attempt) =>
          attempt.userId === params.userId &&
          attempt.assessmentSlug === params.assessmentSlug
      )
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }
}

describe('assessment attempts service', () => {
  it('создаёт попытку anxiety_check_v1 со score, band и timezone-aware userDate', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();

    const attempt = await createAssessmentAttempt({
      repository,
      userId: 10,
      assessmentSlug: 'anxiety_check_v1',
      source: 'practice_page',
      timezone: 'Europe/Moscow',
      completedAt: new Date('2026-06-03T21:30:00Z'),
      answers: [
        { questionId: 'gad7_nervous', optionId: 'more_than_half_days' },
        {
          questionId: 'gad7_uncontrollable_worry',
          optionId: 'more_than_half_days',
        },
        { questionId: 'gad7_excessive_worry', optionId: 'more_than_half_days' },
        {
          questionId: 'gad7_trouble_relaxing',
          optionId: 'more_than_half_days',
        },
        { questionId: 'gad7_restless', optionId: 'several_days' },
        { questionId: 'gad7_irritable', optionId: 'several_days' },
        { questionId: 'gad7_afraid', optionId: 'not_at_all' },
      ],
    });

    expect(attempt.totalScore).toBe(10);
    expect(attempt.bandId).toBe('moderate');
    expect(attempt.userDate).toBe('2026-06-04');
    expect(attempt.resultSnapshot).toMatchObject({
      bandId: 'moderate',
      title: 'Тревога сейчас заметно мешает',
      scoreDirection: 'higher_is_worse',
    });
    expect(attempt.answers).toHaveLength(7);
  });

  it('строит chart по последней попытке дня и не смешивает версии', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();

    async function pushAttempt(params: {
      score: number;
      day: string;
      completedAt: string;
      version?: number;
    }) {
      const bandId =
        params.score >= 10 ? 'moderate' : params.score >= 5 ? 'mild' : 'low';
      await repository.createAttempt({
        userId: 11,
        assessmentSlug: 'anxiety_check_v1',
        assessmentVersion: params.version ?? 1,
        source: 'practice_page',
        linkedProgramSlug: null,
        linkedProgramAttemptId: null,
        totalScore: params.score,
        bandId,
        resultSnapshot: {
          bandId,
          title: bandId,
          shortText: bandId,
          scoreDirection: 'higher_is_worse',
        },
        answers: [],
        userDate: params.day,
        timezone: 'UTC',
        completedAt: new Date(params.completedAt),
      });
    }

    await pushAttempt({
      score: 5,
      day: '2026-06-01',
      completedAt: '2026-06-01T09:00:00Z',
    });
    await pushAttempt({
      score: 7,
      day: '2026-06-01',
      completedAt: '2026-06-01T20:00:00Z',
    });
    await pushAttempt({
      score: 12,
      day: '2026-06-02',
      completedAt: '2026-06-02T12:00:00Z',
      version: 2,
    });

    const chart = await getAssessmentChart({
      repository,
      userId: 11,
      assessmentSlug: 'anxiety_check_v1',
      assessmentVersion: 1,
    });

    expect(chart.points).toEqual([
      {
        attemptId: 2,
        userDate: '2026-06-01',
        totalScore: 7,
        bandId: 'mild',
        completedAt: '2026-06-01T20:00:00.000Z',
      },
    ]);
  });

  it('не возвращает результат чужого пользователя', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();
    const attempt = await repository.createAttempt({
      userId: 12,
      assessmentSlug: 'anxiety_check_v1',
      assessmentVersion: 1,
      source: 'practice_page',
      linkedProgramSlug: null,
      linkedProgramAttemptId: null,
      totalScore: 3,
      bandId: 'low',
      resultSnapshot: {
        bandId: 'low',
        title: 'low',
        shortText: 'low',
        scoreDirection: 'higher_is_worse',
      },
      answers: [],
      userDate: '2026-06-03',
      timezone: 'UTC',
      completedAt: new Date('2026-06-03T12:00:00Z'),
    });

    await expect(
      getAssessmentResultForUser({
        repository,
        userId: 99,
        assessmentSlug: 'anxiety_check_v1',
        attemptId: attempt.id,
      })
    ).resolves.toBeNull();
  });

  it('сравнивает higher_is_better как улучшение при росте балла', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();
    const assessment = getAssessmentDefinition('self_compassion_scs_sf_v1');
    if (!assessment) throw new Error('assessment missing');

    // Базовый замер: на все 12 пунктов «иногда» (3). Для прямых и обратных
    // пунктов 3 = reverse(3), поэтому ровно середина: 12 × 3 = 36.
    const low = await createAssessmentAttempt({
      repository,
      userId: 10,
      assessmentSlug: 'self_compassion_scs_sf_v1',
      timezone: 'UTC',
      completedAt: new Date('2026-06-01T12:00:00Z'),
      answers: assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: 'sometimes',
      })),
    });
    // Финал: прямые «часто» (4), обратные «редко» (2 → reverse 4) — все по 4:
    // 12 × 4 = 48.
    const higher = await createAssessmentAttempt({
      repository,
      userId: 10,
      assessmentSlug: 'self_compassion_scs_sf_v1',
      timezone: 'UTC',
      completedAt: new Date('2026-06-03T12:00:00Z'),
      answers: assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'rarely' : 'often',
      })),
    });

    expect(low.totalScore).toBe(36);
    expect(higher.totalScore).toBe(48);

    await expect(
      getAssessmentResultForUser({
        repository,
        userId: 10,
        assessmentSlug: 'self_compassion_scs_sf_v1',
        attemptId: higher.id,
      })
    ).resolves.toMatchObject({
      comparison: {
        delta: 12,
        direction: 'improved',
      },
    });
  });

  it('сохраняет подшкалы burnout_cbi_v1 в resultSnapshot', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();
    const assessment = getAssessmentDefinition('burnout_cbi_v1');
    expect(assessment).toBeDefined();
    if (!assessment) throw new Error('assessment missing');

    const attempt = await createAssessmentAttempt({
      repository,
      userId: 33,
      assessmentSlug: 'burnout_cbi_v1',
      timezone: 'UTC',
      completedAt: new Date('2026-06-11T12:00:00Z'),
      answers: assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'often' : 'rarely',
      })),
    });

    expect(attempt.totalScore).toBe(25);
    expect(attempt.bandId).toBe('moderate');
    expect(attempt.resultSnapshot.subscaleScores).toMatchObject([
      { id: 'personal_burnout', score: 25 },
      { id: 'work_burnout', score: 25 },
      { id: 'client_burnout', score: 25 },
    ]);
  });

  it('baseline reuse находит результат за 7 дней и игнорирует старый', async () => {
    const repository = new InMemoryAssessmentAttemptsRepository();
    const now = new Date('2026-06-10T12:00:00Z');

    async function pushPractice(completedAt: string) {
      await repository.createAttempt({
        userId: 21,
        assessmentSlug: 'self_compassion_scs_sf_v1',
        assessmentVersion: 1,
        source: 'practice_page',
        linkedProgramSlug: null,
        linkedProgramAttemptId: null,
        totalScore: 36,
        bandId: 'moderate',
        resultSnapshot: {
          bandId: 'moderate',
          title: 'Доброта к себе уже иногда получается',
          shortText: 'short',
          scoreDirection: 'higher_is_better',
        },
        answers: [],
        userDate: completedAt.slice(0, 10),
        timezone: 'UTC',
        completedAt: new Date(completedAt),
      });
    }

    // Старый результат (8 дней назад) — не переиспользуем.
    await pushPractice('2026-06-02T12:00:00Z');
    const tooOld = await getReusableProgramBaseline({
      repository,
      userId: 21,
      assessmentSlug: 'self_compassion_scs_sf_v1',
      now,
    });
    expect(tooOld).toBeNull();

    // Свежий результат (4 дня назад) — переиспользуем.
    await pushPractice('2026-06-06T12:00:00Z');
    const reusable = await getReusableProgramBaseline({
      repository,
      userId: 21,
      assessmentSlug: 'self_compassion_scs_sf_v1',
      now,
    });
    expect(reusable?.completedAt.toISOString()).toBe(
      '2026-06-06T12:00:00.000Z'
    );

    // Нет данных у другого пользователя.
    const none = await getReusableProgramBaseline({
      repository,
      userId: 999,
      assessmentSlug: 'self_compassion_scs_sf_v1',
      now,
    });
    expect(none).toBeNull();
  });

  it('закрывает consuming API через assessments.full на сервере', () => {
    const guardedFiles = [
      'server/api/assessments/[slug]/attempts.post.ts',
      'server/api/assessments/[slug]/attempts/[attemptId].get.ts',
      'server/api/assessments/[slug]/history.get.ts',
      'server/api/assessments/[slug]/chart.get.ts',
    ];

    for (const file of guardedFiles) {
      const source = readProjectFile(file);
      expect(source).toContain('assertAssessmentsAccess');
      expect(source).toContain('ASSESSMENTS_FEATURE_KEY');
    }

    // baseline-endpoint тоже за paywall, но не возвращает featureKey в payload —
    // проверяем только enforcement доступа.
    expect(
      readProjectFile('server/api/programs/[slug]/assessment-baseline.get.ts')
    ).toContain('assertAssessmentsAccess');

    expect(
      readProjectFile('server/api/assessments/index.get.ts')
    ).not.toContain('assertAssessmentsAccess');
  });
});
