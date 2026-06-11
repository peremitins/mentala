import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ASSESSMENTS_FEATURE_KEY,
  getAssessmentDefinition,
  getAssessmentListItems,
} from '../server/application/assessments/assessment-catalog';
import {
  resolveAssessmentBand,
  scoreAssessmentAnswers,
} from '../server/application/assessments/assessment-scoring.service';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('assessment catalog', () => {
  it('отдаёт активные опросники и будущие preview-карточки', () => {
    const items = getAssessmentListItems();
    const anxiety = items.find((item) => item.slug === 'anxiety_check_v1');
    const selfCompassion = items.find(
      (item) => item.slug === 'self_compassion_scs_sf_v1'
    );
    // Самодельный self_kindness_v1 удалён — сад «Доброта к себе» использует SCS-SF.
    const selfKindness = items.find((item) => item.slug === 'self_kindness_v1');

    expect(ASSESSMENTS_FEATURE_KEY).toBe('assessments.full');
    expect(selfKindness).toBeUndefined();
    expect(anxiety).toMatchObject({
      title: 'Оценка тревоги',
      status: 'active',
      linkedProgramSlug: 'calm_anxiety_30',
      estimatedMinutes: 2,
      questionsCount: 7,
    });
    // Валидированный SCS-SF — основной тест сада «Доброта к себе».
    expect(selfCompassion).toMatchObject({
      title: 'Оценка доброты к себе',
      status: 'active',
      linkedProgramSlug: 'self_kindness_21',
      questionsCount: 12,
    });
    const relationships = items.find(
      (item) => item.slug === 'relationships_boundaries_v1'
    );
    const burnout = items.find((item) => item.slug === 'burnout_cbi_v1');
    const oldBurnoutFuture = items.find(
      (item) => item.slug === 'stress_recovery_v1'
    );
    expect(relationships).toMatchObject({
      title: 'Оценка границ и общения',
      status: 'active',
      linkedProgramSlug: 'relationships_21',
      questionsCount: 18,
    });
    expect(burnout).toMatchObject({
      title: 'Оценка выгорания и перегрузки',
      status: 'active',
      linkedProgramSlug: 'burnout_21',
      questionsCount: 19,
    });
    expect(oldBurnoutFuture).toBeUndefined();
    expect(items.filter((item) => item.status === 'active')).toHaveLength(4);
  });

  it('использует GAD-7 для тревоги, но без диагностического позиционирования', () => {
    const anxiety = getAssessmentDefinition('anxiety_check_v1');

    // Вопросы и подсчёт — валидированная шкала GAD-7.
    expect(anxiety?.isValidatedScale).toBe(true);
    expect(anxiety?.sourceName).toBe('GAD-7');
    expect(anxiety?.questions).toHaveLength(7);
    expect(anxiety?.scoring).toMatchObject({ minScore: 0, maxScore: 21 });

    // Но пользовательские тексты не ставят диагноз и не называют расстройство.
    const userFacing = (anxiety?.resultBands ?? [])
      .flatMap((band) => [band.title, band.shortText, band.description])
      .join(' ');
    expect(userFacing).not.toMatch(/расстройств|диагностик|поставить диагноз/i);
    expect(anxiety?.description).toContain('Это не диагноз');
  });

  it('считает SCS-SF (1..5, 6 reverse-пунктов) для self_compassion_scs_sf_v1', () => {
    const assessment = getAssessmentDefinition('self_compassion_scs_sf_v1');
    expect(assessment).toBeDefined();
    if (!assessment) throw new Error('assessment missing');

    expect(assessment.questions).toHaveLength(12);
    expect(
      assessment.questions.filter((question) => question.reverseScored)
    ).toHaveLength(6);

    // Максимальное самосострадание: прямые = almost_always(5), обратные =
    // almost_never(1 → reverse 5). Итог 12 × 5 = 60.
    const maxCompassion = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'almost_never' : 'almost_always',
      }))
    );
    expect(maxCompassion.totalScore).toBe(60);
    expect(maxCompassion.band.id).toBe('high');

    // Минимум: прямые almost_never(1), обратные almost_always(5 → reverse 1).
    const minCompassion = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'almost_always' : 'almost_never',
      }))
    );
    expect(minCompassion.totalScore).toBe(12);
    expect(minCompassion.band.id).toBe('low');

    expect(resolveAssessmentBand(assessment, 29)?.id).toBe('low');
    expect(resolveAssessmentBand(assessment, 30)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 41)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 42)?.id).toBe('high');
  });

  it('считает score и band для границ anxiety_check_v1', () => {
    const assessment = getAssessmentDefinition('anxiety_check_v1');
    expect(assessment).toBeDefined();
    if (!assessment) throw new Error('assessment missing');

    const cases = [
      { values: [0, 0, 0, 0, 0, 0, 0], score: 0, band: 'low' },
      { values: [1, 1, 1, 1, 1, 0, 0], score: 5, band: 'mild' },
      { values: [2, 2, 2, 2, 1, 1, 0], score: 10, band: 'moderate' },
      { values: [3, 3, 3, 2, 2, 1, 1], score: 15, band: 'high' },
      { values: [3, 3, 3, 3, 3, 3, 3], score: 21, band: 'high' },
    ] as const;

    for (const item of cases) {
      const answers = assessment.questions.map((question, index) => ({
        questionId: question.id,
        optionId: assessment.options.find(
          (option) => option.value === item.values[index]
        )!.id,
      }));

      const result = scoreAssessmentAnswers(assessment, answers);
      expect(result.totalScore).toBe(item.score);
      expect(result.band.id).toBe(item.band);
    }

    expect(resolveAssessmentBand(assessment, 4)?.id).toBe('low');
    expect(resolveAssessmentBand(assessment, 5)?.id).toBe('mild');
    expect(resolveAssessmentBand(assessment, 9)?.id).toBe('mild');
    expect(resolveAssessmentBand(assessment, 10)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 14)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 15)?.id).toBe('high');
  });

  it('считает авторскую оценку границ и общения с reverse-пунктами', () => {
    const assessment = getAssessmentDefinition('relationships_boundaries_v1');
    expect(assessment).toBeDefined();
    if (!assessment) throw new Error('assessment missing');

    expect(assessment.isValidatedScale).toBe(false);
    expect(assessment.sourceName).toBeNull();
    expect(assessment.questions).toHaveLength(18);
    expect(
      assessment.questions.filter((question) => question.reverseScored)
    ).toHaveLength(4);
    const pressureGuiltQuestion = assessment.questions.find(
      (question) => question.id === 'rb_pressure_guilt'
    );
    expect(pressureGuiltQuestion).toMatchObject({
      text: 'Когда на меня давят чувством вины, я чаще соглашаюсь, даже если не хочу',
      reverseScored: true,
    });
    expect(pressureGuiltQuestion?.text).not.toContain('трудно не соглашаться');
    expect(assessment.scoring).toMatchObject({
      method: 'sum_with_reverse',
      minScore: 0,
      maxScore: 72,
    });

    const maxResult = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'almost_never' : 'almost_always',
      }))
    );
    expect(maxResult.totalScore).toBe(72);
    expect(maxResult.band.id).toBe('high');

    const minResult = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'almost_always' : 'almost_never',
      }))
    );
    expect(minResult.totalScore).toBe(0);
    expect(minResult.band.id).toBe('low');

    expect(resolveAssessmentBand(assessment, 23)?.id).toBe('low');
    expect(resolveAssessmentBand(assessment, 24)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 48)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 49)?.id).toBe('high');

    const userFacing = [
      assessment.description,
      ...assessment.resultBands.flatMap((band) => [
        band.title,
        band.shortText,
        band.description,
        band.recommendationText,
      ]),
    ].join(' ');
    expect(userFacing).not.toMatch(
      /авторск|Mentala|диагностик|расстройств|созависим|токсич|абьюз|здоровые ли|опросник/i
    );
    expect(assessment.description).toContain('Это не диагноз');
  });

  it('считает полный CBI burnout_cbi_v1 как среднее 0..100 с reverse-пунктом и подшкалами', () => {
    const assessment = getAssessmentDefinition('burnout_cbi_v1');
    expect(assessment).toBeDefined();
    if (!assessment) throw new Error('assessment missing');

    expect(assessment.isValidatedScale).toBe(true);
    expect(assessment.sourceName).toBe('Copenhagen Burnout Inventory, CBI');
    expect(assessment.questions).toHaveLength(19);
    expect(
      assessment.questions.filter((question) => question.reverseScored)
    ).toHaveLength(1);
    expect(assessment.scoring).toMatchObject({
      method: 'mean_with_reverse',
      minScore: 0,
      maxScore: 100,
    });

    const maxBurnout = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => ({
        questionId: question.id,
        optionId: question.reverseScored ? 'never_almost_never' : 'always',
      }))
    );
    expect(maxBurnout.totalScore).toBe(100);
    expect(maxBurnout.band.id).toBe('very_high');
    expect((maxBurnout as any).subscaleScores).toMatchObject([
      { id: 'personal_burnout', score: 100 },
      { id: 'work_burnout', score: 100 },
      { id: 'client_burnout', score: 100 },
    ]);

    const mixedResult = scoreAssessmentAnswers(
      assessment,
      assessment.questions.map((question) => {
        if (question.id.startsWith('cbi_personal_')) {
          return { questionId: question.id, optionId: 'often' };
        }
        if (question.id.startsWith('cbi_client_')) {
          return { questionId: question.id, optionId: 'rarely' };
        }
        return {
          questionId: question.id,
          optionId: question.reverseScored ? 'often' : 'rarely',
        };
      })
    );
    expect(mixedResult.totalScore).toBe(41);
    expect(mixedResult.band.id).toBe('moderate');
    expect((mixedResult as any).subscaleScores).toMatchObject([
      { id: 'personal_burnout', score: 75 },
      { id: 'work_burnout', score: 25 },
      { id: 'client_burnout', score: 25 },
    ]);

    expect(resolveAssessmentBand(assessment, 24)?.id).toBe('low');
    expect(resolveAssessmentBand(assessment, 25)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 49)?.id).toBe('moderate');
    expect(resolveAssessmentBand(assessment, 50)?.id).toBe('high');
    expect(resolveAssessmentBand(assessment, 74)?.id).toBe('high');
    expect(resolveAssessmentBand(assessment, 75)?.id).toBe('very_high');

    const userFacing = [
      assessment.description,
      ...assessment.resultBands.flatMap((band) => [
        band.title,
        band.shortText,
        band.description,
        band.recommendationText,
      ]),
    ].join(' ');
    expect(userFacing).not.toMatch(
      /диагностик|профессиональное выгорание|тебе нужно уволиться|лечение помогло/i
    );
  });

  it('заводит assessments.full в server entitlements и seed', () => {
    const entitlements = readProjectFile(
      'server/application/subscriptions/entitlements.service.ts'
    );
    const seed = readProjectFile(
      'server/infrastructure/db/seed-feature-access-policies.ts'
    );

    expect(entitlements).toContain("featureKey: 'assessments.full'");
    expect(seed).toContain("featureKey: 'assessments.full'");
    expect(entitlements).toContain(
      "paywallTitle: 'Оценка состояния доступна в PRO'"
    );
  });

  it('добавляет preview-вход на хаб практик без route-level paywall', () => {
    const practicesPage = readProjectFile('app/pages/practices/index.vue');

    expect(practicesPage).toContain("to: '/practices/assessments'");
    expect(practicesPage).toContain('Оценка состояния');
    expect(practicesPage).not.toMatch(
      /to="\/practices\/assessments"[\s\S]{0,260}@click="openPaywall/
    );
  });
});
