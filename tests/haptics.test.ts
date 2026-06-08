import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  impact: vi.fn(),
  notification: vi.fn(),
  vibrate: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: mocks.isNativePlatform,
    getPlatform: mocks.getPlatform,
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: mocks.impact,
    notification: mocks.notification,
    vibrate: mocks.vibrate,
  },
  ImpactStyle: {
    Light: 'Light',
    Medium: 'Medium',
    Heavy: 'Heavy',
  },
  NotificationType: {
    Success: 'Success',
    Warning: 'Warning',
    Error: 'Error',
  },
}));

async function loadUseHaptics() {
  vi.resetModules();
  return await import('../app/composables/useHaptics');
}

describe('useHaptics', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    mocks.isNativePlatform.mockReset();
    mocks.getPlatform.mockReset();
    mocks.impact.mockReset();
    mocks.notification.mockReset();
    mocks.vibrate.mockReset();
    mocks.getPlatform.mockReturnValue('ios');
    mocks.isNativePlatform.mockReturnValue(true);
  });

  it('мапит light, medium и success на нативный Capacitor Haptics', async () => {
    const { useHaptics } = await loadUseHaptics();
    const { triggerLight, triggerMedium, triggerSuccess } = useHaptics();

    await triggerLight();
    await triggerMedium();
    await triggerSuccess();

    expect(mocks.impact).toHaveBeenCalledWith({ style: 'Light' });
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'Medium' });
    expect(mocks.notification).toHaveBeenCalledWith({ type: 'Success' });
  });

  it('на web использует navigator.vibrate с разными паттернами', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.getPlatform.mockReturnValue('web');
    const vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });

    const { useHaptics } = await loadUseHaptics();
    const { triggerLight, triggerMedium, triggerSuccess, triggerCelebration } =
      useHaptics();

    await triggerLight();
    await triggerMedium();
    await triggerSuccess();
    await triggerCelebration();

    expect(vibrate).toHaveBeenNthCalledWith(1, 20);
    expect(vibrate).toHaveBeenNthCalledWith(2, 40);
    expect(vibrate).toHaveBeenNthCalledWith(3, [20, 60, 40]);
    expect(vibrate).toHaveBeenNthCalledWith(
      4,
      [28, 35, 18, 40, 120, 45, 42, 40, 18]
    );
  });

  it('celebration запускает success, длинный акцент и короткую последовательность impact-откликов', async () => {
    vi.useFakeTimers();
    const { useHaptics } = await loadUseHaptics();
    const { triggerCelebration } = useHaptics();

    await triggerCelebration();

    expect(mocks.notification).toHaveBeenCalledWith({ type: 'Success' });
    expect(mocks.impact).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(110);
    expect(mocks.impact).toHaveBeenNthCalledWith(1, { style: 'Light' });

    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.vibrate).toHaveBeenCalledWith({ duration: 120 });
    expect(mocks.impact).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(130);
    expect(mocks.impact).toHaveBeenNthCalledWith(2, { style: 'Medium' });

    await vi.advanceTimersByTimeAsync(150);
    expect(mocks.impact).toHaveBeenNthCalledWith(3, { style: 'Light' });
  });
});
