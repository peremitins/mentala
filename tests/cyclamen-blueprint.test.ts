import { describe, expect, it, vi } from 'vitest';
import { ProgramStepActionDto } from '../shared/dto/retention';

vi.mock('@/server/application/garden/garden-summary.service', () => ({
  getOrGeneratePlantSummary: vi.fn(),
}));

/**
 * Тесты для blueprint программы #3 «Отношения» (cyclamen, relationships_21).
 *
 * Цель — гарантировать, что 21 шаг blueprint'а валиден и совместим с DTO,
 * корректно разбит по главам (1-4 / 5-9 / 10-15 / 16-19 / 20-21), использует
 * explicit multi-action модель, и AI-chat шаги (#12, #21) имеют все
 * обязательные поля eligibility. Регрессионная защита контента в коде.
 */

async function getCyclamenBlueprint() {
  const mod = await import(
    '../server/application/programs/retention-program.service'
  );
  const internal = mod as unknown as {
    STEP_BLUEPRINTS_BY_SLUG?: Record<string, unknown[]>;
  };
  return internal.STEP_BLUEPRINTS_BY_SLUG?.['relationships_21'];
}

describe('cyclamen blueprint (relationships_21)', () => {
  it('содержит ровно 21 шаг', async () => {
    const list = await getCyclamenBlueprint();
    expect(list).toBeDefined();
    expect(list!.length).toBe(21);
  });

  it('у каждого шага есть title, subtitle, introText и explicit actions', async () => {
    const list = (await getCyclamenBlueprint())!;
    for (let i = 0; i < list.length; i++) {
      const step = list[i] as Record<string, unknown>;
      expect(typeof step.title, `step ${i + 1} title`).toBe('string');
      expect(
        (step.title as string).length,
        `step ${i + 1} title length`
      ).toBeGreaterThan(0);
      expect(typeof step.subtitle, `step ${i + 1} subtitle`).toBe('string');
      expect(typeof step.introText, `step ${i + 1} introText`).toBe('string');
      expect(Array.isArray(step.actions), `step ${i + 1} actions`).toBe(true);
      expect(
        (step.actions as unknown[]).length,
        `step ${i + 1} actions`
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('buildActions добавляет intro первым action и не добавляет mood_checkin', async () => {
    const list = (await getCyclamenBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions: (step: number, blueprint: unknown) => unknown[];
    };

    for (let i = 0; i < list.length; i++) {
      const actions = internal.buildActions(i + 1, list[i]) as Array<{
        type?: string;
        formKind?: string;
        required?: boolean;
      }>;
      expect(actions[0]?.type, `step ${i + 1} first action`).toBe(
        'guided_steps'
      );
      expect(actions[0]?.formKind, `step ${i + 1} intro formKind`).toBe(
        'step_intro'
      );
      expect(
        actions.some((action) => action.type === 'mood_checkin'),
        `step ${i + 1} has no mood_checkin`
      ).toBe(false);
    }
  });

  it('weekly-check стоит только на шагах 7, 14 и 21', async () => {
    const list = (await getCyclamenBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions: (step: number, blueprint: unknown) => unknown[];
    };
    const weeklySteps: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const actions = internal.buildActions(i + 1, list[i]) as Array<{
        type?: string;
      }>;
      if (actions.some((action) => action.type === 'weekly_check')) {
        weeklySteps.push(i + 1);
      }
    }
    expect(weeklySteps).toEqual([7, 14, 21]);
  });

  it('использует оценку границ и общения как стартовую и финальную точку сада', async () => {
    const list = (await getCyclamenBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions: (step: number, blueprint: unknown) => unknown[];
    };

    const baselineActions = internal.buildActions(1, list[0]) as Array<{
      formKind?: string;
      targetId?: string;
      template?: string;
      required?: boolean;
    }>;
    const finalActions = internal.buildActions(21, list[20]) as Array<{
      formKind?: string;
      targetId?: string;
      template?: string;
      required?: boolean;
    }>;

    expect(
      baselineActions.find((action) => action.formKind === 'assessment_prompt')
    ).toMatchObject({
      targetId: 'relationships_boundaries_v1',
      template: 'program_baseline',
      required: false,
    });
    expect(
      finalActions.find((action) => action.formKind === 'assessment_prompt')
    ).toMatchObject({
      targetId: 'relationships_boundaries_v1',
      template: 'program_final',
      required: false,
    });
  });

  it('AI-chat actions стоят на шагах 3, 12, 21; глубокие (#12, #21) — с полным eligibility', async () => {
    const list = (await getCyclamenBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions: (step: number, blueprint: unknown) => unknown[];
    };

    const chatSteps: number[] = [];
    for (let i = 0; i < list.length; i++) {
      const actions = internal.buildActions(i + 1, list[i]) as Array<{
        type?: string;
      }>;
      if (actions.some((action) => action.type === 'ai_chat_session')) {
        chatSteps.push(i + 1);
      }
    }
    expect(chatSteps).toEqual([3, 12, 21]);

    for (const stepNum of [12, 21]) {
      const actions = internal.buildActions(
        stepNum,
        list[stepNum - 1]
      ) as Array<{
        type?: string;
        topicPrompt?: string;
        goalHint?: string;
        minQualifyingMessages?: number;
        minDurationSec?: number;
      }>;
      const action = actions.find((item) => item.type === 'ai_chat_session');
      expect(action, `step ${stepNum} ai_chat action`).toBeDefined();
      expect(typeof action?.topicPrompt, `step ${stepNum} topicPrompt`).toBe(
        'string'
      );
      expect(action?.topicPrompt?.length ?? 0).toBeGreaterThan(20);
      expect(typeof action?.goalHint, `step ${stepNum} goalHint`).toBe(
        'string'
      );
      expect(action?.minQualifyingMessages).toBeGreaterThanOrEqual(3);
      expect(action?.minDurationSec).toBeGreaterThanOrEqual(180);
    }
  });

  it('chapter mapping соответствует структуре сада (1-4 / 5-9 / 10-15 / 16-19 / 20-21)', async () => {
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      chapterForStep?: (
        step: number,
        totalSteps?: number,
        slug?: string | null
      ) => number;
      getProgramChaptersForTotalSteps?: (
        totalSteps: number,
        slug?: string | null
      ) => Array<{ stepRange: string }>;
    };
    expect(internal.chapterForStep).toBeDefined();
    const chapters = Array.from({ length: 21 }, (_, index) =>
      internal.chapterForStep?.(index + 1, 21, 'relationships_21')
    );
    expect(chapters).toEqual([
      1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
    ]);
    expect(
      internal
        .getProgramChaptersForTotalSteps?.(21, 'relationships_21')
        .map((item) => item.stepRange)
    ).toEqual([
      'Шаги 1-4',
      'Шаги 5-9',
      'Шаги 10-15',
      'Шаги 16-19',
      'Шаги 20-21',
    ]);
    // Регресс: без slug деление по totalSteps=21 остаётся peony-структурой.
    expect(
      internal
        .getProgramChaptersForTotalSteps?.(21)
        .map((item) => item.stepRange)
    ).toEqual([
      'Шаги 1-3',
      'Шаги 4-7',
      'Шаги 8-14',
      'Шаги 15-19',
      'Шаги 20-21',
    ]);
  });

  it('каждый шаг проходит buildActions без ошибок и actions проходят DTO-валидацию', async () => {
    const list = (await getCyclamenBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions?: (step: number, blueprint: unknown) => unknown[];
    };
    if (!internal.buildActions) return;

    for (let i = 0; i < list.length; i++) {
      const actions = internal.buildActions(i + 1, list[i]);
      expect(Array.isArray(actions), `step ${i + 1} actions array`).toBe(true);
      for (const action of actions) {
        const parsed = ProgramStepActionDto.safeParse(action);
        expect(
          parsed.success,
          `step ${i + 1} action ${JSON.stringify(action)} parse error`
        ).toBe(true);
        if (!parsed.success) continue;

        const value = parsed.data;
        const isTimed =
          value.type === 'breathing' ||
          value.type === 'quick_help_breathing' ||
          value.type === 'quick_help_tension' ||
          value.type === 'meditation';

        if (isTimed) {
          expect(
            typeof value.completionDelaySeconds,
            `step ${i + 1} ${value.type} completionDelaySeconds`
          ).toBe('number');
          expect(value.required, `step ${i + 1} ${value.type} required`).toBe(
            true
          );
        }

        // Текстовые inputs: required может быть true или false (опциональные
        // journal'ы допустимы), но completionDelaySeconds всегда null.
        const isTextInput =
          value.type === 'ai_reflection' ||
          value.type === 'journal_entry' ||
          value.type === 'thought_dump';
        if (isTextInput) {
          expect(
            value.completionDelaySeconds,
            `step ${i + 1} ${value.type} completionDelaySeconds`
          ).toBeNull();
        }
      }
    }
  });

  it('в соседних шагах не повторяется один и тот же breathing template', async () => {
    const list = (await getCyclamenBlueprint())!;
    const templates: Array<string | null> = list.map((step) => {
      const actions = (step as { actions?: Array<Record<string, unknown>> })
        .actions;
      const breathing = actions?.find((a) => a.type === 'breathing');
      return (breathing?.template as string | undefined) ?? null;
    });
    for (let i = 1; i < templates.length; i++) {
      if (templates[i] && templates[i - 1]) {
        expect(
          templates[i],
          `steps ${i} and ${i + 1} share breathing template`
        ).not.toBe(templates[i - 1]);
      }
    }
  });
});
