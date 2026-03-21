import { afterEach, describe, expect, it, vi } from 'vitest';

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).window;
});

describe('realtime voice foreground bridge', () => {
  it('на Android пытается вызвать локальный foreground plugin напрямую', async () => {
    const startMock = vi.fn().mockResolvedValue(undefined);
    const stopMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      },
      registerPlugin: () => ({
        start: startMock,
        stop: stopMock,
      }),
    }));

    setWindow({});

    const {
      startRealtimeVoiceForegroundService,
      stopRealtimeVoiceForegroundService,
    } = await import('../app/services/realtime/realtimeVoiceForegroundBridge');

    await expect(
      startRealtimeVoiceForegroundService({
        title: 'Ментала',
        subtitle: 'Идёт голосовой разговор',
      })
    ).resolves.toBe(true);
    await expect(stopRealtimeVoiceForegroundService()).resolves.toBeUndefined();

    expect(startMock).toHaveBeenCalledWith({
      title: 'Ментала',
      subtitle: 'Идёт голосовой разговор',
    });
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it('не пытается запускать foreground plugin вне Android native runtime', async () => {
    const startMock = vi.fn();

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => 'web',
      },
      registerPlugin: () => ({
        start: startMock,
        stop: vi.fn(),
      }),
    }));

    setWindow({});

    const { startRealtimeVoiceForegroundService } = await import(
      '../app/services/realtime/realtimeVoiceForegroundBridge'
    );

    await expect(startRealtimeVoiceForegroundService()).resolves.toBe(false);
    expect(startMock).not.toHaveBeenCalled();
  });
});
