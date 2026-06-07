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

describe('realtime voice native audio bridge', () => {
  it('на Android пытается вызвать локальный Capacitor plugin даже без PluginHeaders', async () => {
    const activateMock = vi.fn().mockResolvedValue({
      platform: 'android',
      mode: 'media',
      volumeStream: 'music',
      route: 'system_media',
    });
    const deactivateMock = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
      },
      registerPlugin: () => ({
        activate: activateMock,
        deactivate: deactivateMock,
      }),
    }));

    setWindow({});

    const {
      activateRealtimeVoiceNativeAudioSession,
      deactivateRealtimeVoiceNativeAudioSession,
    } = await import('../app/services/realtime/realtimeVoiceNativeAudio');

    await expect(activateRealtimeVoiceNativeAudioSession()).resolves.toBe(true);
    await expect(
      deactivateRealtimeVoiceNativeAudioSession()
    ).resolves.toBeUndefined();

    expect(activateMock).toHaveBeenCalledTimes(1);
    expect(deactivateMock).toHaveBeenCalledTimes(1);
  });

  it('не пытается вызвать bridge вне Android native runtime', async () => {
    const activateMock = vi.fn();

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => 'web',
      },
      registerPlugin: () => ({
        activate: activateMock,
        deactivate: vi.fn(),
      }),
    }));

    setWindow({});

    const { activateRealtimeVoiceNativeAudioSession } = await import(
      '../app/services/realtime/realtimeVoiceNativeAudio'
    );

    await expect(activateRealtimeVoiceNativeAudioSession()).resolves.toBe(
      false
    );
    expect(activateMock).not.toHaveBeenCalled();
  });

  it('на iOS вызывает локальный bridge для AVAudioSession voiceChat', async () => {
    const activateMock = vi.fn().mockResolvedValue({
      platform: 'ios',
      category: 'AVAudioSessionCategoryPlayAndRecord',
      mode: 'AVAudioSessionModeVoiceChat',
      speakerPinned: true,
    });

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'ios',
      },
      registerPlugin: () => ({
        activate: activateMock,
        deactivate: vi.fn().mockResolvedValue(undefined),
      }),
    }));

    setWindow({});

    const { activateRealtimeVoiceNativeAudioSession } = await import(
      '../app/services/realtime/realtimeVoiceNativeAudio'
    );

    await expect(activateRealtimeVoiceNativeAudioSession()).resolves.toBe(true);
    expect(activateMock).toHaveBeenCalledTimes(1);
  });
});
