import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notifyPlantWater: vi.fn(),
  useAPI: vi.fn(),
  useToast: vi.fn(),
}));

vi.mock('../app/composables/useAPI', () => ({
  useAPI: mocks.useAPI,
}));

vi.mock('../app/composables/useToast', () => ({
  useToast: mocks.useToast,
}));

vi.mock('../app/composables/usePlantWaterFeedback', () => ({
  notifyPlantWater: mocks.notifyPlantWater,
}));

function freePracticeResponse(overrides?: {
  rewardGranted?: boolean;
  freePracticeDropsToday?: number;
  freePracticeDailyLimit?: number;
}) {
  return {
    rewardGranted: overrides?.rewardGranted ?? true,
    awardedAmount: overrides?.rewardGranted === false ? 0 : 1,
    freePracticeDropsToday: overrides?.freePracticeDropsToday ?? 1,
    freePracticeDailyLimit: overrides?.freePracticeDailyLimit ?? 3,
    energyToday: 4,
    energyWeekly: 12,
  };
}

describe('useFreePracticeEnergy feedback', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.notifyPlantWater.mockReset();
    mocks.useAPI.mockReset();
    mocks.useToast.mockReset();
  });

  it('при начисленной свободной капле запускает water-feedback вместо toast', async () => {
    const response = freePracticeResponse();
    mocks.useAPI.mockResolvedValue(response);

    const { useFreePracticeEnergy } = await import(
      '../app/composables/useFreePracticeEnergy'
    );
    const { award } = useFreePracticeEnergy();

    await expect(
      award('thought_dump_saved', 'thoughtdump:2026-06-05')
    ).resolves.toBe(response);

    expect(mocks.notifyPlantWater).toHaveBeenCalledWith({
      intensity: 'small',
      source: 'free_practice',
      energyToday: response.energyToday,
      energyWeekly: response.energyWeekly,
    });
    expect(mocks.useToast).not.toHaveBeenCalled();
  });

  it('при исчерпанном дневном лимите не показывает отдельный toast', async () => {
    const response = freePracticeResponse({
      rewardGranted: false,
      freePracticeDropsToday: 3,
      freePracticeDailyLimit: 3,
    });
    mocks.useAPI.mockResolvedValue(response);

    const { useFreePracticeEnergy } = await import(
      '../app/composables/useFreePracticeEnergy'
    );
    const { award } = useFreePracticeEnergy();

    await expect(award('gratitude_entry_saved', 'gratitude:42')).resolves.toBe(
      response
    );

    expect(mocks.notifyPlantWater).not.toHaveBeenCalled();
    expect(mocks.useToast).not.toHaveBeenCalled();
  });
});
