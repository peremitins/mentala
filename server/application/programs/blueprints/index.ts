// Реестр blueprint'ов Садов. Один Сад = один файл рядом.
// Добавление нового Сада: новый файл + записи в map'ы ниже + PROGRAM_BOOTSTRAP
// в retention-program.service.ts.
import type { ProgramChapter, StepBlueprint } from './builders';
import {
  CALM_CHAPTERS,
  STEP_BLUEPRINTS_CALM_ANXIETY_30,
} from './calm-anxiety-30';
import {
  PEONY_CHAPTERS,
  STEP_BLUEPRINTS_SELF_KINDNESS_21,
} from './self-kindness-21';
import {
  CYCLAMEN_CHAPTERS,
  STEP_BLUEPRINTS_RELATIONSHIPS_21,
} from './relationships-21';
import {
  AZALEA_CHAPTERS,
  STEP_BLUEPRINTS_BURNOUT_21,
} from './burnout-21';

export * from './builders';
export { CALM_CHAPTERS } from './calm-anxiety-30';
export { PEONY_CHAPTERS } from './self-kindness-21';
export { CYCLAMEN_CHAPTERS } from './relationships-21';
export { AZALEA_CHAPTERS } from './burnout-21';

// Map<slug, blueprints>. Экспортируется (через ре-экспорт в сервисе) для тестов
// (tests/peony-blueprint.test.ts, tests/calm-anxiety-blueprint.test.ts).
export const STEP_BLUEPRINTS_BY_SLUG: Record<string, StepBlueprint[]> = {
  calm_anxiety_30: STEP_BLUEPRINTS_CALM_ANXIETY_30,
  self_kindness_21: STEP_BLUEPRINTS_SELF_KINDNESS_21,
  relationships_21: STEP_BLUEPRINTS_RELATIONSHIPS_21,
  burnout_21: STEP_BLUEPRINTS_BURNOUT_21,
};

// Главы каждого Сада для прогресс-карты.
export const PROGRAM_CHAPTERS_BY_SLUG: Record<
  string,
  readonly ProgramChapter[]
> = {
  calm_anxiety_30: CALM_CHAPTERS,
  self_kindness_21: PEONY_CHAPTERS,
  relationships_21: CYCLAMEN_CHAPTERS,
  burnout_21: AZALEA_CHAPTERS,
};

// Последний шаг глав 1-4 каждого Сада (глава 5 - всё остальное до totalSteps).
// Используется chapterForStep() в retention-program.service.ts.
export const CHAPTER_LAST_STEPS_BY_SLUG: Record<string, readonly number[]> = {
  calm_anxiety_30: [3, 10, 20, 28],
  self_kindness_21: [3, 7, 14, 19],
  relationships_21: [4, 9, 15, 19],
  burnout_21: [4, 9, 14, 18],
};
