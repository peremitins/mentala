import { afterEach, describe, expect, it, vi } from 'vitest';

const howlerMocks = vi.hoisted(() => {
  class FakeHowl {
    static instances: FakeHowl[] = [];

    private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    private activeIds = new Set<number>();
    private knownIds = new Set<number>();
    private nextId = 0;
    private currentVolume = 1;
    private currentState: 'loaded' | 'loading' | 'unloaded' = 'loaded';
    // Количество Sound'ов, созданных этим Howl'ом. Растёт только при
    // вызове play() без id — именно этот путь в Howler проходит через
    // _inactiveSound и может утечь html5 Audio-ноду через drain. Тесты
    // используют это поле как прокси "утечки пула".
    soundsCreated = 0;
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

    play(id?: number) {
      if (typeof id === 'number') {
        // Переиспользование существующего Sound через _soundById.
        // Если id неизвестен — считаем это ошибкой (имитируем поведение
        // реального Howler, где _soundById вернёт null).
        if (!this.knownIds.has(id)) {
          throw new Error(`FakeHowl.play: unknown sound id ${id}`);
        }
        this.activeIds.add(id);
        return id;
      }

      const newId = ++this.nextId;
      this.knownIds.add(newId);
      this.activeIds.add(newId);
      this.soundsCreated += 1;
      return newId;
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
      this.knownIds.clear();
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

  it('playCue переиспользует один Sound на Howl и не создаёт новые на повторных вызовах', async () => {
    // Регрессионный тест на баг: после нескольких переключений фаз cue-треки
    // молча переставали звучать. Причина — Howler создавал новый Sound при
    // каждом sound.play() без id (_inactiveSound → drain), и каждый drain
    // в html5-режиме навсегда утекал HTMLAudioElement из глобального пула.
    // Фикс: все повторные вызовы идут через sound.play(persistentId).
    stubBrowserGlobals();

    const { useBreathPracticeAudio } = await import(
      '../app/composables/useBreathPracticeAudio'
    );

    const audio = useBreathPracticeAudio();
    await audio.prepare();

    // Прогоняем длинную серию фаз — если бы код шёл через play() без id,
    // soundsCreated рос бы до 20 для каждого Howl.
    for (let i = 0; i < 5; i++) {
      await audio.playCue('inhale', 0.5);
      await audio.playCue('hold', 0.5);
      await audio.playCue('exhale', 0.5);
      await audio.playCue('pause', 0.5);
    }

    // Ровно 4 Howl-а — по одному на cue-тип.
    expect(howlerMocks.FakeHowl.instances).toHaveLength(4);
    // Каждый Howl создал ровно ОДИН Sound и дальше переиспользовал его.
    for (const instance of howlerMocks.FakeHowl.instances) {
      expect(instance.soundsCreated).toBe(1);
    }
  });

  it('voice.play переиспользует один Sound на Howl между повторными проигрываниями', async () => {
    stubBrowserGlobals();

    const { useBreathPracticeVoice } = await import(
      '../app/composables/useBreathPracticeVoice'
    );

    const voice = useBreathPracticeVoice();
    await voice.prepare('formal');

    // Несколько циклов по всем фазам — проверяем, что повторные play()
    // не плодят новые Sound'ы.
    for (let i = 0; i < 3; i++) {
      await voice.play('inhale', 'formal');
      await voice.play('hold', 'formal');
      await voice.play('exhale', 'formal');
      await voice.play('pause', 'formal');
      await voice.play('intro', 'formal');
    }

    for (const instance of howlerMocks.FakeHowl.instances) {
      expect(instance.soundsCreated).toBe(1);
    }
  });
});
