import { afterEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  getPersistentItemMock: vi.fn(),
  setPersistentItemMock: vi.fn(),
}));

vi.mock('@/app/utils/persistentStorage', () => ({
  getPersistentItem: (...args: unknown[]) =>
    storageMocks.getPersistentItemMock(...args),
  setPersistentItem: (...args: unknown[]) =>
    storageMocks.setPersistentItemMock(...args),
}));

afterEach(() => {
  storageMocks.getPersistentItemMock.mockReset();
  storageMocks.setPersistentItemMock.mockReset();
  vi.resetModules();
});

describe('breath practice settings', () => {
  it('включает голос по умолчанию', async () => {
    storageMocks.getPersistentItemMock.mockResolvedValue(null);

    const { loadBreathPracticeSettings } = await import(
      '../app/utils/breathPracticeSettings'
    );

    await expect(loadBreathPracticeSettings()).resolves.toMatchObject({
      voiceEnabled: true,
      soundEnabled: true,
      volume: 100,
    });
  });

  it('сохраняет partial-обновление поверх текущих настроек', async () => {
    storageMocks.getPersistentItemMock.mockResolvedValue(
      JSON.stringify({
        sessionMinutes: 10,
        soundEnabled: true,
        voiceEnabled: true,
        volume: 80,
        hapticsEnabled: true,
        cueMode: 'cue',
      })
    );
    storageMocks.setPersistentItemMock.mockResolvedValue(undefined);

    const { saveBreathPracticeSettings } = await import(
      '../app/utils/breathPracticeSettings'
    );

    await saveBreathPracticeSettings({
      voiceEnabled: false,
    });

    expect(storageMocks.setPersistentItemMock).toHaveBeenCalledWith(
      'breath_practices_settings',
      JSON.stringify({
        sessionMinutes: 10,
        soundEnabled: true,
        voiceEnabled: false,
        volume: 80,
        hapticsEnabled: true,
        cueMode: 'cue',
      })
    );
  });
});
