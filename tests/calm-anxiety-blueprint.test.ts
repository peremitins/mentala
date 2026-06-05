import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { BREATH_PRACTICES } from '../app/lib/breathPracticesCatalog';
import {
  ProgramStepActionDto,
  type ProgramStepActionType,
} from '../shared/dto/retention';

vi.mock('@/server/application/garden/garden-summary.service', () => ({
  getOrGeneratePlantSummary: vi.fn(),
}));

async function loadRuntimeBlueprint() {
  const mod = await import(
    '../server/application/programs/retention-program.service'
  );
  const internal = mod as unknown as {
    STEP_BLUEPRINTS_BY_SLUG: Record<string, unknown[]>;
    buildActions: (step: number, blueprint: unknown) => unknown[];
    estimateProgramStepDurationSeconds: (
      blueprint: unknown,
      actions: unknown[]
    ) => number;
  };
  return {
    blueprint: internal.STEP_BLUEPRINTS_BY_SLUG['calm_anxiety_30'],
    buildActions: internal.buildActions,
    estimateProgramStepDurationSeconds:
      internal.estimateProgramStepDurationSeconds,
  };
}

describe('calm_anxiety_30 blueprint v5', () => {
  it('содержит 30 explicit multi-action шагов без шаблонного mood_checkin', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    expect(blueprint).toHaveLength(30);

    for (let index = 0; index < blueprint.length; index++) {
      const actions = buildActions(index + 1, blueprint[index]);
      const parsed = actions.map((action) =>
        ProgramStepActionDto.parse(action)
      );
      expect(
        parsed.some((action) => action.type === 'mood_checkin'),
        `step ${index + 1} must not contain mood_checkin`
      ).toBe(false);

      const meaningfulRequiredCount = parsed.filter(
        (action) =>
          action.required !== false &&
          action.type !== 'mood_checkin' &&
          action.formKind !== 'step_intro'
      ).length;
      expect(
        meaningfulRequiredCount,
        `step ${index + 1} meaningful required actions`
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('сохраняет обязательную v5-сетку действий по всем 30 шагам', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const expectedTypesAfterIntro: ProgramStepActionType[][] = [
      ['guided_steps', 'micro_reflection', 'breathing', 'micro_reflection'],
      [
        'quick_help_grounding',
        'ai_reflection',
        'rating_scale',
        'micro_reflection',
        'journal_entry',
      ],
      ['breathing', 'micro_reflection', 'journal_entry'],
      ['quick_help_grounding', 'meditation', 'journal_entry'],
      ['rating_scale', 'breathing', 'rating_scale', 'micro_reflection'],
      ['meditation', 'thought_dump', 'journal_entry'],
      ['breathing', 'micro_reflection', 'weekly_check'],
      ['breathing', 'guided_steps', 'ai_chat_session', 'micro_reflection'],
      ['quick_help_grounding', 'micro_reflection', 'journal_entry'],
      ['quick_help_tension', 'micro_reflection', 'journal_entry'],
      ['breathing', 'thought_dump', 'journal_entry'],
      ['meditation', 'structured_form', 'journal_entry'],
      ['breathing', 'structured_form', 'rating_scale'],
      ['breathing', 'ai_chat_session', 'journal_entry', 'weekly_check'],
      ['quick_help_grounding', 'structured_form', 'micro_reflection'],
      ['breathing', 'guided_steps', 'micro_reflection'],
      ['meditation', 'journal_entry', 'micro_reflection'],
      [
        'quick_help_tension',
        'guided_steps',
        'micro_reflection',
        'journal_entry',
      ],
      ['breathing', 'ai_chat_session', 'journal_entry'],
      [
        'quick_help_grounding',
        'meditation',
        'micro_reflection',
        'journal_entry',
      ],
      ['breathing', 'thought_dump', 'structured_form', 'weekly_check'],
      ['quick_help_grounding', 'ai_chat_session', 'journal_entry'],
      ['breathing', 'structured_form', 'micro_reflection'],
      ['meditation', 'structured_form'],
      ['breathing', 'ai_chat_session', 'structured_form'],
      ['meditation', 'structured_form', 'micro_reflection'],
      ['breathing', 'quick_help_tension', 'journal_entry'],
      ['quick_help_grounding', 'ai_chat_session', 'structured_form'],
      ['meditation', 'structured_form'],
      [
        'meditation',
        'ai_chat_session',
        'journal_entry',
        'guided_steps',
        'weekly_check',
      ],
    ];

    for (let index = 0; index < blueprint.length; index++) {
      const parsed = buildActions(index + 1, blueprint[index]).map((action) =>
        ProgramStepActionDto.parse(action)
      );
      expect(parsed[0]?.type, `step ${index + 1} intro action type`).toBe(
        'guided_steps'
      );
      expect(parsed[0]?.formKind, `step ${index + 1} intro formKind`).toBe(
        'step_intro'
      );
      expect(parsed[0]?.required, `step ${index + 1} intro required`).toBe(
        false
      );
      expect(
        parsed.slice(1).map((action) => action.type),
        `step ${index + 1} action types`
      ).toEqual(expectedTypesAfterIntro[index]);
    }
  });

  it('начинает шаг 1 с intro-action, затем состоянием и дыханием', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const step1 = blueprint[0] as {
      introText?: string;
      miniArticle?: { title?: string; body?: string };
    };
    const actions = buildActions(1, blueprint[0]).map((action) =>
      ProgramStepActionDto.parse(action)
    );

    expect(step1.introText).toContain(
      'Добро пожаловать в программу «Спокойствие»'
    );
    expect(step1.miniArticle?.title).toBe('Что будет в этой программе');
    expect(actions[0]?.type).toBe('guided_steps');
    expect(actions[0]?.formKind).toBe('step_intro');
    expect(actions[0]?.prompt?.length).toBeLessThan(340);
    expect(actions[1]).toMatchObject({
      type: 'guided_steps',
      formKind: 'assessment_prompt',
      targetId: 'anxiety_check_v1',
      template: 'program_baseline',
      required: false,
    });
    expect(actions[2]?.type).toBe('micro_reflection');
    expect(actions[2]?.title).toBe('Отметка состояния');
    expect(actions[2]?.prompt).toContain('С чего ты сейчас начинаешь');
    expect(actions[3]?.type).toBe('breathing');
    expect(actions[3]?.title).toBe('Первое дыхание');
  });

  it('подключает intro-action для всех шагов и мини-статьи из v5 ТЗ', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const steps = blueprint as Array<{
      introText?: string;
      miniArticle?: {
        title?: string;
        body?: string;
        sourceNotes?: string[];
      } | null;
    }>;

    expect(steps.every((step) => Boolean(step.introText?.trim()))).toBe(true);
    expect(steps.filter((step) => step.miniArticle).length).toBe(24);
    for (let index = 0; index < steps.length; index++) {
      const introAction = buildActions(index + 1, blueprint[index])
        .map((action) => ProgramStepActionDto.parse(action))
        .at(0);
      expect(introAction?.type, `step ${index + 1} intro action`).toBe(
        'guided_steps'
      );
      expect(introAction?.formKind, `step ${index + 1} intro formKind`).toBe(
        'step_intro'
      );
    }
    for (const step of steps.filter((item) => item.miniArticle)) {
      expect(step.miniArticle?.body?.length).toBeGreaterThan(120);
    }
  });

  it('сохраняет целевой баланс практик из v5 ТЗ', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const actions = blueprint.flatMap((step, index) =>
      buildActions(index + 1, step).map((action) =>
        ProgramStepActionDto.parse(action)
      )
    );

    const count = (type: (typeof actions)[number]['type']) =>
      actions.filter((action) => action.type === type).length;

    expect(count('breathing')).toBe(14);
    expect(count('quick_help_grounding')).toBe(7);
    expect(count('meditation')).toBe(9);
    expect(count('quick_help_tension')).toBe(3);
    expect(count('thought_dump')).toBe(3);
    expect(count('ai_chat_session')).toBe(7);
    expect(count('structured_form')).toBe(10);
    expect(count('weekly_check')).toBe(4);
    expect(count('ai_reflection')).toBe(1);
  });

  it('описывает шаг 5 как шкалу 0-10 до и после дыхания', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const step5Actions = buildActions(5, blueprint[4]).map((action) =>
      ProgramStepActionDto.parse(action)
    );

    expect(step5Actions.map((action) => action.type)).toEqual([
      'guided_steps',
      'rating_scale',
      'breathing',
      'rating_scale',
      'micro_reflection',
    ]);

    const ratingActions = step5Actions.filter(
      (action) => action.type === 'rating_scale'
    );
    for (const action of ratingActions) {
      expect(action.scaleMin).toBe(0);
      expect(action.scaleMax).toBe(10);
      expect(action.splitAroundActionIdSuffix).toBe('breathing');
    }
  });

  it('настраивает weekly-check после 7/14/21 и перед финальным completion', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const weeklyChecks = blueprint.flatMap((step, index) =>
      buildActions(index + 1, step)
        .map((action) => ProgramStepActionDto.parse(action))
        .filter((action) => action.type === 'weekly_check')
        .map((action) => ({ step: index + 1, action }))
    );

    expect(weeklyChecks.map((item) => item.step)).toEqual([7, 14, 21, 30]);
    expect(weeklyChecks.map((item) => item.action.placement)).toEqual([
      'after_completion',
      'after_completion',
      'after_completion',
      'before_final_completion',
    ]);
    expect(weeklyChecks.every((item) => item.action.required === true)).toBe(
      true
    );
  });

  it('завершает финальный шаг через проверку перед итоговым отчётом без выбора повторного маршрута', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const step30Actions = buildActions(30, blueprint[29]).map((action) =>
      ProgramStepActionDto.parse(action)
    );
    const actionTypes = step30Actions.map((action) => action.type);
    const finalWeeklyCheck = step30Actions.find(
      (action) => action.type === 'weekly_check'
    );

    expect(actionTypes).not.toContain('next_route_choice');
    expect(step30Actions.at(-1)?.type).toBe('weekly_check');
    expect(finalWeeklyCheck?.title).toBe('Итог перед отчётом');
    expect(finalWeeklyCheck?.subtitle).toBe('Ответы попадут в финальный отчёт');
    expect(finalWeeklyCheck?.prompt).toContain('Сформируем итоговый отчёт');
    expect(finalWeeklyCheck?.placement).toBe('before_final_completion');
  });

  it('настраивает AI-чаты v5 с нужной длительностью и количеством сообщений', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const expected = new Map([
      [8, { minDurationSec: 120, minQualifyingMessages: 2 }],
      [14, { minDurationSec: 180, minQualifyingMessages: 3 }],
      [19, { minDurationSec: 180, minQualifyingMessages: 3 }],
      [22, { minDurationSec: 180, minQualifyingMessages: 3 }],
      [25, { minDurationSec: 240, minQualifyingMessages: 4 }],
      [28, { minDurationSec: 180, minQualifyingMessages: 3 }],
      [30, { minDurationSec: 240, minQualifyingMessages: 4 }],
    ]);

    for (const [step, config] of expected) {
      const chatAction = buildActions(step, blueprint[step - 1])
        .map((action) => ProgramStepActionDto.parse(action))
        .find((action) => action.type === 'ai_chat_session');

      expect(chatAction?.minDurationSec, `step ${step} minDurationSec`).toBe(
        config.minDurationSec
      );
      expect(
        chatAction?.minQualifyingMessages,
        `step ${step} minQualifyingMessages`
      ).toBe(config.minQualifyingMessages);
    }
  });

  it('в шаге 28 выбирает техники списком без лимита по количеству', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const step28 = blueprint[27] as { introText?: string };
    const form = buildActions(28, blueprint[27])
      .map((action) => ProgramStepActionDto.parse(action))
      .find((action) => action.type === 'structured_form');

    expect(step28.introText).not.toContain('«самые правильные»');
    expect(form?.formKind).toBe('calm_toolkit');
    expect(form?.prompt).not.toContain('«самые правильные»');

    const fields = form?.fields ?? [];
    const techniqueField = fields.find(
      (field) => field.id === 'helped_techniques'
    );

    expect(fields.some((field) => field.id === 'body_tool')).toBe(false);
    expect(fields.some((field) => field.id === 'attention_tool')).toBe(false);
    expect(fields.some((field) => field.id === 'thought_tool')).toBe(false);
    expect(fields.some((field) => field.id === 'when_to_use')).toBe(false);
    expect(techniqueField?.type).toBe('choice');
    expect(techniqueField?.mode).toBe('multiple');
    expect(techniqueField?.maxSelected).toBeUndefined();
    expect(techniqueField?.helperText).toBeUndefined();
    expect(form?.helpHint).toBeUndefined();
    expect(techniqueField?.exclusiveOptionIds).toContain('not_clear_yet');
    expect(techniqueField?.options?.map((option) => option.label)).toEqual(
      expect.arrayContaining([
        'Заземление 5-4-3-2-1',
        'Снятие напряжения в теле',
        'СТОП-пауза',
        'Карточка тревожной мысли',
        'Чат с ассистентом',
      ])
    );
  });

  it('поддерживает асинхронный сценарий эксперимента шагов 24-25', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const step24Form = buildActions(24, blueprint[23])
      .map((action) => ProgramStepActionDto.parse(action))
      .find((action) => action.type === 'structured_form');
    const step25Form = buildActions(25, blueprint[24])
      .map((action) => ProgramStepActionDto.parse(action))
      .find((action) => action.type === 'structured_form');

    expect(step24Form?.formKind).toBe('behavioral_experiment_plan');
    expect(step25Form?.formKind).toBe('prediction_fact_check');
    expect(
      step24Form?.fields?.some((field) => field.type === 'experiment_status')
    ).toBe(true);
    expect(
      step25Form?.fields?.some((field) => field.type === 'experiment_status')
    ).toBe(true);
  });

  it('не добавляет safe-exit опросники в ai_chat_session', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();

    for (let index = 0; index < blueprint.length; index++) {
      const actions = buildActions(index + 1, blueprint[index]).map((action) =>
        ProgramStepActionDto.parse(action)
      );

      for (const action of actions) {
        if (action.type !== 'ai_chat_session') continue;

        expect(
          action.stopCondition,
          `step ${index + 1} ai_chat_session must not render safe-exit block`
        ).toBeUndefined();
      }
    }
  });

  it('не занижает длительность длинных v5-шагов', async () => {
    const { blueprint, buildActions, estimateProgramStepDurationSeconds } =
      await loadRuntimeBlueprint();
    const step24Actions = buildActions(24, blueprint[23]).map((action) =>
      ProgramStepActionDto.parse(action)
    );
    const step30Actions = buildActions(30, blueprint[29]).map((action) =>
      ProgramStepActionDto.parse(action)
    );

    expect(
      estimateProgramStepDurationSeconds(blueprint[23], step24Actions)
    ).toBeGreaterThanOrEqual(720);
    expect(
      estimateProgramStepDurationSeconds(blueprint[29], step30Actions)
    ).toBeGreaterThanOrEqual(900);
  });

  it('не содержит user-facing формулировок про вред себе в runtime и v5 ТЗ', () => {
    const files = [
      new URL(
        '../server/application/programs/retention-program.service.ts',
        import.meta.url
      ),
      new URL(
        '../.docs/content/program_calm_anxiety_30_v5.md',
        import.meta.url
      ),
    ];
    const forbidden = /навредить себе|самоповрежд|self_harm/iu;

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(forbidden.test(source), file.pathname).toBe(false);
    }
  });

  it('использует только реальные slug дыхательных практик в calm_anxiety_30', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    const catalogSlugs = new Set(
      BREATH_PRACTICES.map((practice) => practice.slug)
    );
    const breathingActions = blueprint.flatMap((item, index) =>
      buildActions(index + 1, item)
        .map((action) => ProgramStepActionDto.parse(action))
        .filter((action) => action.type === 'breathing')
    );

    expect(breathingActions).toHaveLength(14);
    for (const action of breathingActions) {
      expect(
        catalogSlugs.has(action.template ?? ''),
        `${action.id} template=${action.template}`
      ).toBe(true);
    }
  });
});
