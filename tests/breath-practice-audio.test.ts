import { afterEach, describe, expect, it, vi } from 'vitest';

const howlerMocks = vi.hoisted(() => {
  class FakeHowl {
    static instances: FakeHowl[] = [];

    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    private activeIds = new Set<number>();
    private nextId = 0;
    private currentVolume = 1;
    private currentState: 'loaded' | 'loading' | 'unloaded' = 'loaded';
    unloaded = false;

    constructor(public options: Record<string, unknown>) {
      FakeHowl.instances.push(this);
    }

    state() {
      return this.currentState;
    }

    once(event: string, handler: (...args: unknown[]) => void) {
      const wrapped = (...args: unknown[]) => {
        this.listeners.get(event)?.delete(wrapped);
        handler(...args);
      };
      const bucket = this.listeners.get(event) || new Set();
      bucket.add(wrapped);
      this.listeners.set(event, bucket);
      return this;
    }

    load() {
      this.currentState = 'loaded';
      for (const listener of this.listeners.get('load') || []) {
        listener();
      }
    }

    play() {
      const id = ++this.nextId;
      this.activeIds.add(id);
      return id;
    }

    stop(id?: number) {
      if (typeof id === 'number') {
        this.activeIds.delete(id);
        return;
      }

      this.activeIds.clear();
    }

    playing(id?: number) {
      if (typeof id === 'number') {
        return this.activeIds.has(id);
      }

      return this.activeIds.size > 0;
    }

    volume(value?: number) {
      if (typeof value === 'number') {
        this.currentVolume = value;
      }

      return this.currentVolume;
    }

    fade(_from: number, to: number) {
      this.currentVolume = to;
    }

    unload() {
      this.unloaded = true;
      this.activeIds.clear();
    }
  }

  return {
    FakeHowl,
    Howler: {
      html5PoolSize: 10,
      autoUnlock: false,
    },
  };
});

vi.mock('howler', () => ({
  Howl: howlerMocks.FakeHowl,
  Howler: howlerMocks.Howler,
}));

vi.mock('@/app/utils/document', () => ({
  isDocumentAvailable: () => true,
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

vi.mock('@/app/lib/breathPracticeAudio', () => ({
  BREATH_PRACTICE_SOUNDS: {
    inhale: '/breath/sounds/inhale.m4a',
    exhale: '/breath/sounds/exhale.m4a',
    hold: '/breath/sounds/wait.m4a',
    pause: '/breath/sounds/pause.m4a',
  },
}));

vi.mock(
  '@/app/lib/breathPracticeHowler',
  async () => import('../app/lib/breathPracticeHowler')
);

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => 'android',
  },
}));

function stubBrowserGlobals() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {},
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {},
      createElement: () => ({}),
      createElementNS: () => ({}),
    },
  });
}

afterEach(() => {
  howlerMocks.FakeHowl.instances = [];
  howlerMocks.Howler.html5PoolSize = 10;
  howlerMocks.Howler.autoUnlock = false;
  vi.restoreAllMocks();
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).document;
});

describe('breath practice audio hardening', () => {
  it('увеличивает html5 pool для Android WebView', async () => {
    stubBrowserGlobals();

    const { getBreathPracticeHowlerModule } = await import(
      '../app/lib/breathPracticeHowler'
    );

    const module = await getBreathPracticeHowlerModule();

    expect(module?.Howler.autoUnlock).toBe(true);
    expect(module?.Howler.html5PoolSize).toBe(24);
  });

  it('освобождает voice Howl-инстансы через release', async () => {
    stubBrowserGlobals();

    const { useBreathPracticeVoice } = await import(
      '../app/composables/useBreathPracticeVoice'
    );

    const voice = useBreathPracticeVoice();
    await voice.prepare('formal');

    expect(howlerMocks.FakeHowl.instances).toHaveLength(5);

    voice.release();

    expect(
      howlerMocks.FakeHowl.instances.every((instance) => instance.unloaded)
    ).toBe(true);
  });

  it('освобождает cue Howl-инстансы через release', async () => {
    stubBrowserGlobals();

    const { useBreathPracticeAudio } = await import(
      '../app/composables/useBreathPracticeAudio'
    );

    const audio = useBreathPracticeAudio();
    await audio.prepare();

    expect(howlerMocks.FakeHowl.instances).toHaveLength(4);

    audio.release();

    expect(
      howlerMocks.FakeHowl.instances.every((instance) => instance.unloaded)
    ).toBe(true);
  });
});
