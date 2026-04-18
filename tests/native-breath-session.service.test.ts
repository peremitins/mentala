import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BreathPluginCalls = {
  startBreathingSession: Array<Record<string, unknown>>;
  pauseBreathingSession: Array<Record<string, unknown>>;
  resumeBreathingSession: Array<Record<string, unknown>>;
  stopBreathingSession: Array<Record<string, unknown>>;
  updateBreathingSessionConfig: Array<Record<string, unknown>>;
};

function createAudioPlayerMock() {
  const calls: BreathPluginCalls = {
    startBreathingSession: [],
    pauseBreathingSession: [],
    resumeBreathingSession: [],
    stopBreathingSession: [],
    updateBreathingSessionConfig: [],
  };

  return {
    calls,
    plugin: {
      startBreathingSession: vi.fn(async (params: Record<string, unknown>) => {
        calls.startBreathingSession.push(params);
      }),
      pauseBreathingSession: vi.fn(async (params: Record<string, unknown>) => {
        calls.pauseBreathingSession.push(params);
      }),
      resumeBreathingSession: vi.fn(async (params: Record<string, unknown>) => {
        calls.resumeBreathingSession.push(params);
      }),
      stopBreathingSession: vi.fn(async (params: Record<string, unknown>) => {
        calls.stopBreathingSession.push(params);
      }),
      updateBreathingSessionConfig: vi.fn(
        async (params: Record<string, unknown>) => {
          calls.updateBreathingSessionConfig.push(params);
        }
      ),
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NativeBreathSessionService', () => {
  it('передаёт в plugin sessionId, фазы и нормализованный volume', async () => {
    const { calls, plugin } = createAudioPlayerMock();

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: (name: string) => name === 'AudioPlayer',
      },
    }));

    vi.doMock('@mediagrid/capacitor-native-audio', () => ({
      AudioPlayer: plugin,
    }));

    const { NativeBreathSessionService } = await import(
      '../app/services/audio/nativeBreathSession.service'
    );

    const service = new NativeBreathSessionService();
    await service.startSession({
      phases: [
        {
          type: 'inhale',
          cue: 'inhale',
          label: 'Вдох',
          seconds: 4,
          cueAudioSource: 'https://app.mentala.test/breath/sounds/inhale.m4a',
          voiceAudioSource:
            'https://app.mentala.test/breath/voice/formal/inhale.mp3',
        },
      ],
      soundEnabled: true,
      voiceEnabled: true,
      cueVolume: 1.4,
      sessionEndsAtMs: 25_000,
    });

    expect(calls.startBreathingSession).toEqual([
      {
        sessionId: 'breathing_main_session',
        soundEnabled: true,
        voiceEnabled: true,
        cueVolume: 1,
        sessionEndsAtMs: 25_000,
        phases: [
          {
            phaseId: 'phase_0_inhale',
            phaseType: 'inhale',
            cueType: 'inhale',
            durationMs: 4_000,
            cueAudioSource: 'https://app.mentala.test/breath/sounds/inhale.m4a',
            voiceAudioSource:
              'https://app.mentala.test/breath/voice/formal/inhale.mp3',
            friendlyTitle: 'Вдох',
          },
        ],
      },
    ]);
    expect(service.isActive()).toBe(true);
    expect(service.isPaused()).toBe(false);
  });

  it('переводит sessionEndsAt=null в zero-clear для update и корректно pause/resume', async () => {
    const { calls, plugin } = createAudioPlayerMock();

    vi.doMock('@capacitor/core', () => ({
      Capacitor: {
        isNativePlatform: () => true,
        isPluginAvailable: (name: string) => name === 'AudioPlayer',
      },
    }));

    vi.doMock('@mediagrid/capacitor-native-audio', () => ({
      AudioPlayer: plugin,
    }));

    const { NativeBreathSessionService } = await import(
      '../app/services/audio/nativeBreathSession.service'
    );

    const service = new NativeBreathSessionService();
    await service.startSession({
      phases: [
        {
          type: 'hold',
          cue: 'hold',
          label: 'Задержка',
          seconds: 7,
          cueAudioSource: 'cue://hold',
          voiceAudioSource: 'voice://hold',
        },
      ],
      soundEnabled: true,
      voiceEnabled: false,
      cueVolume: 0.5,
      sessionEndsAtMs: 15_000,
    });

    await service.pauseSession();
    await service.resumeSession();
    await service.updateSessionConfig({
      soundEnabled: false,
      sessionEndsAtMs: null,
    });
    await service.stopSession();

    expect(calls.pauseBreathingSession).toEqual([
      {
        sessionId: 'breathing_main_session',
      },
    ]);
    expect(calls.resumeBreathingSession).toEqual([
      {
        sessionId: 'breathing_main_session',
      },
    ]);
    expect(calls.updateBreathingSessionConfig).toEqual([
      {
        sessionId: 'breathing_main_session',
        soundEnabled: false,
        sessionEndsAtMs: 0,
      },
    ]);
    expect(calls.stopBreathingSession).toEqual([
      {
        sessionId: 'breathing_main_session',
      },
    ]);
    expect(service.isActive()).toBe(false);
    expect(service.isPaused()).toBe(false);
  });
});
