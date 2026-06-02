import { describe, expect, it, vi } from 'vitest';
import { resolveProgramBreathPractice } from '../app/lib/programBreathPracticeResolver';
import { ProgramStepActionDto } from '../shared/dto/retention';

vi.mock('@/server/application/garden/garden-summary.service', () => ({
  getOrGeneratePlantSummary: vi.fn(),
}));

async function loadRuntimeProgramActions() {
  const mod = await import(
    '../server/application/programs/retention-program.service'
  );
  const internal = mod as unknown as {
    STEP_BLUEPRINTS_BY_SLUG: Record<string, unknown[]>;
    buildActions: (step: number, blueprint: unknown) => unknown[];
  };

  return Object.entries(internal.STEP_BLUEPRINTS_BY_SLUG).flatMap(
    ([programSlug, blueprints]) =>
      blueprints.flatMap((blueprint, index) =>
        internal.buildActions(index + 1, blueprint).map((action) => ({
          programSlug,
          step: index + 1,
          action: ProgramStepActionDto.parse(action),
        }))
      )
  );
}

describe('program breath practice resolver', () => {
  it('резолвит все breathing actions из runtime blueprint в каталог практик', async () => {
    const actions = await loadRuntimeProgramActions();
    const breathingActions = actions.filter(
      (item) => item.action.type === 'breathing'
    );

    expect(breathingActions.length).toBeGreaterThan(0);

    const unresolved = breathingActions
      .filter((item) => !resolveProgramBreathPractice(item.action.template))
      .map(
        (item) =>
          `${item.programSlug} step ${item.step} template ${item.action.template}`
      );

    expect(unresolved).toEqual([]);
  });
});
