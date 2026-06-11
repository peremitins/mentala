import { describe, expect, it, vi } from 'vitest';
import { ProgramStepActionDto } from '../shared/dto/retention';

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
  };
  return {
    blueprint: internal.STEP_BLUEPRINTS_BY_SLUG['burnout_21'],
    buildActions: internal.buildActions,
  };
}

describe('burnout_21 blueprint', () => {
  it('использует CBI-оценку выгорания как стартовую и финальную точку сада', async () => {
    const { blueprint, buildActions } = await loadRuntimeBlueprint();
    expect(blueprint).toHaveLength(21);

    const baselineActions = buildActions(1, blueprint[0]).map((action) =>
      ProgramStepActionDto.parse(action)
    ) as Array<{
      formKind?: string;
      targetId?: string;
      template?: string;
      required?: boolean;
    }>;
    const finalActions = buildActions(21, blueprint[20]).map((action) =>
      ProgramStepActionDto.parse(action)
    ) as Array<{
      formKind?: string;
      targetId?: string;
      template?: string;
      required?: boolean;
    }>;

    expect(
      baselineActions.find((action) => action.formKind === 'assessment_prompt')
    ).toMatchObject({
      targetId: 'burnout_cbi_v1',
      template: 'program_baseline',
      required: false,
    });
    expect(
      finalActions.find((action) => action.formKind === 'assessment_prompt')
    ).toMatchObject({
      targetId: 'burnout_cbi_v1',
      template: 'program_final',
      required: false,
    });
  });
});
