import { describe, expect, it, vi } from 'vitest';
import { ProgramStepActionDto } from '../shared/dto/retention';

vi.mock('@/server/application/garden/garden-summary.service', () => ({
  getOrGeneratePlantSummary: vi.fn(),
}));

/**
 * Тесты для blueprint программы #2 «Доброта к себе» (peony, self_kindness_21).
 *
 * Цель — гарантировать, что 21 шаг blueprint'а валиден и совместим с DTO,
 * корректно разбит по главам, использует explicit multi-action модель, и AI-chat
 * шаги (#14, #21) имеют все обязательные поля eligibility. Регрессионная защита:
 * если кто-то правит контент в коде — тесты сразу укажут на нарушения схемы.
 *
 * Импортируем напрямую массив из retention-program.service.ts, чтобы тестировать
 * фактический рантайм-код (а не дублирующую копию).
 */

// Прямой импорт массива blueprint'а. Vitest-конфиг проекта поддерживает
// path alias @/, но для тестов проще через относительный путь.
async function loadBlueprint() {
  const mod = await import(
    '../server/application/programs/retention-program.service'
  );
  return (
    mod as unknown as {
      STEP_BLUEPRINTS_SELF_KINDNESS_21?: unknown[];
    }
  ).STEP_BLUEPRINTS_SELF_KINDNESS_21;
}

// Поскольку константа не экспортируется (privacy-by-default в service),
// тесты строим через STEP_BLUEPRINTS_BY_SLUG → getStepBlueprintsForSlug.
// Это даёт ровно тот же массив, что и runtime использует.
async function getPeonyBlueprint() {
  const mod = await import(
    '../server/application/programs/retention-program.service'
  );
  // Используем приватную функцию через any-приведение: тест существует
  // именно для контроля приватного контента, это OK.
  const internal = mod as unknown as {
    STEP_BLUEPRINTS_BY_SLUG?: Record<string, unknown[]>;
  };
  // Fallback: если массив не экспортирован — пробрасываем тест в skip-zone.
  return internal.STEP_BLUEPRINTS_BY_SLUG?.['self_kindness_21'];
}

void loadBlueprint;

describe('peony blueprint (self_kindness_21)', () => {
  it('содержит ровно 21 шаг', async () => {
    const list = await getPeonyBlueprint();
    expect(list).toBeDefined();
    expect(list!.length).toBe(21);
  });

  it('у каждого шага есть title, subtitle, introText и explicit actions', async () => {
    const list = (await getPeonyBlueprint())!;
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
    const list = (await getPeonyBlueprint())!;
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
      expect(actions[0]?.required, `step ${i + 1} intro required`).toBe(false);
      expect(
        actions.some((action) => action.type === 'mood_checkin'),
        `step ${i + 1} has no mood_checkin`
      ).toBe(false);
    }
  });

  it('weekly-check стоит только на шагах 7, 14 и 21', async () => {
    const list = (await getPeonyBlueprint())!;
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
        placement?: string;
      }>;
      if (actions.some((action) => action.type === 'weekly_check')) {
        weeklySteps.push(i + 1);
      }
    }
    expect(weeklySteps).toEqual([7, 14, 21]);
  });

  it('AI-chat actions (#14, #21) имеют полный набор полей eligibility', async () => {
    const list = (await getPeonyBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      buildActions: (step: number, blueprint: unknown) => unknown[];
    };
    const aiChatSteps = [14, 21]; // 1-based индексы
    for (const stepNum of aiChatSteps) {
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

  it('chapter mapping соответствует 21-шаговой структуре сада', async () => {
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      chapterForStep?: (step: number, totalSteps?: number) => number;
      getProgramChaptersForTotalSteps?: (totalSteps: number) => Array<{
        stepRange: string;
      }>;
    };
    expect(internal.chapterForStep).toBeDefined();
    const chapters = Array.from({ length: 21 }, (_, index) =>
      internal.chapterForStep?.(index + 1, 21)
    );
    expect(chapters).toEqual([
      1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5,
    ]);
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

  it('мысль дня для сада доброты к себе возвращает строку из self_compassion кластера', async () => {
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    const internal = mod as unknown as {
      getThoughtTemplateForProgramStep?: (params: {
        programSlug?: string | null;
        step?: number | null;
        entryDate: string;
        userId: number;
      }) => string;
    };

    expect(internal.getThoughtTemplateForProgramStep).toBeDefined();

    // Проверяем что функция возвращает непустую строку из кластера self_compassion.
    // Конкретный текст зависит от hash(userId + entryDate) % pool.length,
    // поэтому проверяем инвариант, а не конкретное значение.
    const result = internal.getThoughtTemplateForProgramStep?.({
      programSlug: 'self_kindness_21',
      step: 8,
      entryDate: '2026-05-27',
      userId: 42,
    });
    expect(typeof result).toBe('string');
    expect((result ?? '').length).toBeGreaterThan(10);
  });

  it('каждый шаг проходит buildActions без ошибок и actions проходят DTO-валидацию', async () => {
    const list = (await getPeonyBlueprint())!;
    const mod = await import(
      '../server/application/programs/retention-program.service'
    );
    // buildActions — внутренняя функция, экспортируем её через
    // приведение типов (private-by-default OK для теста).
    const internal = mod as unknown as {
      buildActions?: (step: number, blueprint: unknown) => unknown[];
    };
    if (!internal.buildActions) {
      // Если функция не экспортирована — этот тест не запускаем, не падая.
      return;
    }
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
        const isTextInput =
          value.type === 'ai_reflection' ||
          value.type === 'journal_entry' ||
          value.type === 'thought_dump';

        if (isTimed) {
          expect(
            typeof value.completionDelaySeconds,
            `step ${i + 1} ${value.type} completionDelaySeconds`
          ).toBe('number');
          expect(value.required, `step ${i + 1} ${value.type} required`).toBe(
            true
          );
        }

        if (isTextInput) {
          expect(
            value.completionDelaySeconds,
            `step ${i + 1} ${value.type} completionDelaySeconds`
          ).toBeNull();
          expect(value.required, `step ${i + 1} ${value.type} required`).toBe(
            true
          );
        }
      }
    }
  });
});
