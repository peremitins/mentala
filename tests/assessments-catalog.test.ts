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
    expect(items.filter((item) => item.status === 'active')).toHaveLength(2);
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

    expect(practicesPage).toContain('to="/practices/assessments"');
    expect(practicesPage).toContain('Оценка состояния');
    expect(practicesPage).not.toMatch(
      /to="\/practices\/assessments"[\s\S]{0,260}@click="openPaywall/
    );
  });
});
