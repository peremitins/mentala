import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const webCueAudioMocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => undefined),
  playCue: vi.fn(async () => undefined),
  stopAll: vi.fn(() => undefined),
  setVolume: vi.fn(() => undefined),
  release: vi.fn(() => undefined),
}));

const webVoiceAudioMocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => undefined),
  play: vi.fn(async () => undefined),
  stop: vi.fn(() => undefined),
  release: vi.fn(() => undefined),
}));

const continuousAudioMocks = vi.hoisted(() => {
  const state = {
    active: false,
  };

  return {
    state,
    startLoop: vi.fn(async () => {
      state.active = true;
      return 12_345;
    }),
    pauseSession: vi.fn(async () => undefined),
    resumeSession: vi.fn(async () => undefined),
    stopAll: vi.fn(() => {
      state.active = false;
    }),
    setVolume: vi.fn(() => undefined),
    release: vi.fn(() => {
      state.active = false;
    }),
    isActive: vi.fn(() => state.active),
  };
});

beforeEach(() => {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({
    Capacitor: {
      isNativePlatform: () => false,
      isPluginAvailable: () => false,
    },
  }));
  vi.doMock('#imports', () => ({
    useRuntimeConfig: () => ({
      public: {
        featureNativeMeditationAudioEnabled: true,
      },
    }),
  }));
  vi.doMock('@/app/composables/useBreathPracticeAudio', () => ({
    useBreathPracticeAudio: () => webCueAudioMocks,
  }));
  vi.doMock('@/app/composables/useBreathPracticeVoice', () => ({
    useBreathPracticeVoice: () => webVoiceAudioMocks,
  }));
  vi.doMock('@/app/composables/useBreathPracticeContinuousAudio', () => ({
    useBreathPracticeContinuousAudio: () => continuousAudioMocks,
  }));
  vi.doMock('@/app/utils/document', () => ({
    isDocumentAvailable: () => true,
  }));

  continuousAudioMocks.state.active = false;
  for (const mock of [
    ...Object.values(webCueAudioMocks),
    ...Object.values(webVoiceAudioMocks),
    continuousAudioMocks.startLoop,
    continuousAudioMocks.pauseSession,
    continuousAudioMocks.resumeSession,
    continuousAudioMocks.stopAll,
    continuousAudioMocks.setVolume,
    continuousAudioMocks.release,
    continuousAudioMocks.isActive,
  ]) {
    if (typeof mock === 'function' && 'mockClear' in mock) {
      mock.mockClear();
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('@capacitor/core');
  vi.doUnmock('#imports');
  vi.doUnmock('@/app/composables/useBreathPracticeAudio');
  vi.doUnmock('@/app/composables/useBreathPracticeVoice');
  vi.doUnmock('@/app/composables/useBreathPracticeContinuousAudio');
  vi.doUnmock('@/app/utils/document');
});

describe('useBreathPracticePhaseAudio web background playback', () => {
  it('на web запускает continuous media loop и не зависит от phase JS playback', async () => {
    const { useBreathPracticePhaseAudio } = await import(
      '../app/composables/useBreathPracticePhaseAudio'
    );

    const audio = useBreathPracticePhaseAudio();
    const startedAtMs = await audio.startSession({
      phases: [
        {
          type: 'inhale',
          label: 'Вдох',
          seconds: 4,
          cue: 'inhale',
        },
        {
          type: 'exhale',
          label: 'Выдох',
          seconds: 6,
          cue: 'exhale',
        },
      ],
      addressing: 'formal',
      soundEnabled: true,
      voiceEnabled: true,
      volume: 0.7,
      sessionEndsAtMs: 60_000,
    });

    expect(startedAtMs).toBe(12_345);
    expect(continuousAudioMocks.startLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        addressing: 'formal',
        soundEnabled: true,
        voiceEnabled: true,
        volume: 0.7,
      })
    );
    expect(webCueAudioMocks.stopAll).toHaveBeenCalledWith(0);
    expect(webVoiceAudioMocks.stop).toHaveBeenCalledTimes(1);

    await audio.playPhase({
      cue: 'inhale',
      voice: 'inhale',
      addressing: 'formal',
      phaseDurationMs: 4_000,
      soundEnabled: true,
      voiceEnabled: true,
      volume: 0.7,
    });

    expect(webCueAudioMocks.playCue).not.toHaveBeenCalled();
    expect(webVoiceAudioMocks.play).not.toHaveBeenCalled();

    await audio.pauseSession();
    await audio.resumeSession();
    audio.stopAll(0);

    expect(continuousAudioMocks.pauseSession).toHaveBeenCalledTimes(1);
    expect(continuousAudioMocks.resumeSession).toHaveBeenCalledTimes(1);
    expect(continuousAudioMocks.stopAll).toHaveBeenCalledTimes(1);
  });
});
