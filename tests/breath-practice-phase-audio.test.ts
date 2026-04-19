import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeAudioMocks = vi.hoisted(() => {
  class NativeAudioServiceMock {
    static instances: NativeAudioServiceMock[] = [];

    playCalls: Array<{
      track: Record<string, unknown>;
      options: Record<string, unknown>;
    }> = [];
    stopCalls = 0;
    destroyCalls = 0;

    constructor() {
      NativeAudioServiceMock.instances.push(this);
    }

    async init() {
      return undefined;
    }

    async play(
      track: Record<string, unknown>,
      options: Record<string, unknown> = {}
    ) {
      this.playCalls.push({ track, options });
    }

    async stop() {
      this.stopCalls += 1;
    }

    async destroy() {
      this.destroyCalls += 1;
    }
  }

  class NativeBreathSessionServiceMock {
    static instances: NativeBreathSessionServiceMock[] = [];

    startSessionCalls: Array<Record<string, unknown>> = [];
    updateSessionConfigCalls: Array<Record<string, unknown>> = [];
    pauseCalls = 0;
    resumeCalls = 0;
    stopCalls = 0;
    destroyCalls = 0;
    active = false;
    paused = false;

    constructor() {
      NativeBreathSessionServiceMock.instances.push(this);
    }

    async init() {
      return undefined;
    }

    isSupported() {
      return true;
    }

    isActive() {
      return this.active;
    }

    isPaused() {
      return this.paused;
    }

    async startSession(config: Record<string, unknown>) {
      this.startSessionCalls.push(config);
      this.active = true;
      this.paused = false;
    }

    async updateSessionConfig(config: Record<string, unknown>) {
      this.updateSessionConfigCalls.push(config);
    }

    async pauseSession() {
      this.pauseCalls += 1;
      this.paused = true;
    }

    async resumeSession() {
      this.resumeCalls += 1;
      this.paused = false;
    }

    async stopSession() {
      this.stopCalls += 1;
      this.active = false;
      this.paused = false;
    }

    async destroy() {
      this.destroyCalls += 1;
    }
  }

  return {
    NativeAudioServiceMock,
    NativeBreathSessionServiceMock,
  };
});

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

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => name === 'AudioPlayer',
  },
}));

vi.mock('#imports', () => ({
  useRuntimeConfig: () => ({
    public: {
      featureNativeMeditationAudioEnabled: true,
      apiBase: 'https://my.mentala.test',
      appUrl: 'https://my.mentala.test',
      isDev: false,
    },
  }),
}));

vi.mock('@/app/services/audio/nativeAudio.service', () => ({
  NativeAudioService: nativeAudioMocks.NativeAudioServiceMock,
}));

vi.mock('@/app/services/audio/nativeBreathSession.service', () => ({
  NativeBreathSessionService: nativeAudioMocks.NativeBreathSessionServiceMock,
}));

vi.mock('@/app/composables/useBreathPracticeAudio', () => ({
  useBreathPracticeAudio: () => webCueAudioMocks,
}));

vi.mock('@/app/composables/useBreathPracticeVoice', () => ({
  useBreathPracticeVoice: () => webVoiceAudioMocks,
}));

vi.mock('@/app/lib/breathPracticeAudio', () => ({
  BREATH_PRACTICE_SOUNDS: {
    inhale: '/breath/sounds/inhale.m4a',
    exhale: '/breath/sounds/exhale.m4a',
    hold: '/breath/sounds/wait.m4a',
    pause: '/breath/sounds/pause.m4a',
  },
}));

vi.mock('@/app/lib/breathPracticeVoiceAudio', () => ({
  BREATH_PRACTICE_VOICE_AUDIO: {
    informal: {
      intro: '/breath/voice/informal/intro.mp3',
      inhale: '/breath/voice/informal/inhale.mp3',
      hold: '/breath/voice/informal/hold.mp3',
      exhale: '/breath/voice/informal/exhale.mp3',
      pause: '/breath/voice/informal/hold.mp3',
    },
    formal: {
      intro: '/breath/voice/formal/intro.mp3',
      inhale: '/breath/voice/formal/inhale.mp3',
      hold: '/breath/voice/formal/hold.mp3',
      exhale: '/breath/voice/formal/exhale.mp3',
      pause: '/breath/voice/formal/hold.mp3',
    },
  },
}));

vi.mock('@/app/utils/document', () => ({
  isDocumentAvailable: () => true,
}));

function stubWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      location: {
        origin: 'https://app.mentala.test',
      },
    },
  });
}

beforeEach(() => {
  vi.resetModules();
  stubWindow();
  nativeAudioMocks.NativeAudioServiceMock.instances = [];
  nativeAudioMocks.NativeBreathSessionServiceMock.instances = [];
  Object.values(webCueAudioMocks).forEach((mock) => {
    if ('mockClear' in mock) {
      (mock as { mockClear: () => void }).mockClear();
    }
  });
  Object.values(webVoiceAudioMocks).forEach((mock) => {
    if ('mockClear' in mock) {
      (mock as { mockClear: () => void }).mockClear();
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).window;
});

describe('useBreathPracticePhaseAudio native session orchestration', () => {
  it('стартует native session с полным набором фаз и раздельными source', async () => {
    const { useBreathPracticePhaseAudio } = await import(
      '../app/composables/useBreathPracticePhaseAudio'
    );

    const audio = useBreathPracticePhaseAudio();
    await audio.startSession({
      phases: [
        {
          type: 'inhale',
          label: 'Вдох',
          seconds: 4,
          cue: 'inhale',
        },
        {
          type: 'hold',
          label: 'Задержка',
          seconds: 4,
          cue: 'hold',
        },
      ],
      addressing: 'formal',
      soundEnabled: true,
      voiceEnabled: true,
      volume: 0.5,
      sessionEndsAtMs: 10_000,
    });

    const [session] = nativeAudioMocks.NativeBreathSessionServiceMock.instances;
    expect(session?.startSessionCalls).toHaveLength(1);
    expect(session?.startSessionCalls[0]).toEqual(
      expect.objectContaining({
        soundEnabled: true,
        voiceEnabled: true,
        cueVolume: 0.675,
        sessionEndsAtMs: 10_000,
      })
    );
    expect(session?.startSessionCalls[0]?.phases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'inhale',
          cue: 'inhale',
          cueAudioSource: 'https://my.mentala.test/breath/sounds/inhale.m4a',
          voiceAudioSource:
            'https://my.mentala.test/breath/voice/formal/inhale.mp3',
        }),
        expect.objectContaining({
          type: 'hold',
          cue: 'hold',
          cueAudioSource: 'https://my.mentala.test/breath/sounds/wait.m4a',
          voiceAudioSource:
            'https://my.mentala.test/breath/voice/formal/hold.mp3',
        }),
      ])
    );
  });

  it('обновляет config активной native session без перезапуска фаз', async () => {
    const { useBreathPracticePhaseAudio } = await import(
      '../app/composables/useBreathPracticePhaseAudio'
    );

    const audio = useBreathPracticePhaseAudio();
    await audio.startSession({
      phases: [
        {
          type: 'exhale',
          label: 'Выдох',
          seconds: 6,
          cue: 'exhale',
        },
      ],
      addressing: 'informal',
      soundEnabled: true,
      voiceEnabled: true,
      volume: 0.4,
      sessionEndsAtMs: 5_000,
    });

    await audio.updateSessionConfig({
      soundEnabled: false,
      volume: 0.8,
      sessionEndsAtMs: 8_000,
    });

    const [session] = nativeAudioMocks.NativeBreathSessionServiceMock.instances;
    expect(session?.startSessionCalls).toHaveLength(1);
    expect(session?.updateSessionConfigCalls).toEqual([
      {
        soundEnabled: false,
        voiceEnabled: undefined,
        cueVolume: 1,
        sessionEndsAtMs: 8_000,
      },
    ]);
  });

  it('умеет pause/resume и не использует web fallback на native route', async () => {
    const { useBreathPracticePhaseAudio } = await import(
      '../app/composables/useBreathPracticePhaseAudio'
    );

    const audio = useBreathPracticePhaseAudio();
    await audio.startSession({
      phases: [
        {
          type: 'pause',
          label: 'Пауза',
          seconds: 4,
          cue: 'pause',
        },
      ],
      addressing: 'formal',
      soundEnabled: true,
      voiceEnabled: false,
      volume: 0.6,
      sessionEndsAtMs: null,
    });

    await audio.pauseSession();
    await audio.resumeSession();

    const [session] = nativeAudioMocks.NativeBreathSessionServiceMock.instances;
    expect(session?.pauseCalls).toBe(1);
    expect(session?.resumeCalls).toBe(1);
    expect(webCueAudioMocks.playCue).not.toHaveBeenCalled();
    expect(webVoiceAudioMocks.play).not.toHaveBeenCalled();
  });

  it('до старта main session проигрывает intro через отдельный native service', async () => {
    const { useBreathPracticePhaseAudio } = await import(
      '../app/composables/useBreathPracticePhaseAudio'
    );

    const audio = useBreathPracticePhaseAudio();
    await audio.playIntro('formal');

    const [introService] = nativeAudioMocks.NativeAudioServiceMock.instances;
    expect(introService?.playCalls).toHaveLength(1);
    expect(introService?.playCalls[0]?.track).toEqual(
      expect.objectContaining({
        id: 'breath-voice-formal-intro',
        useForNotification: true,
      })
    );
  });
});
