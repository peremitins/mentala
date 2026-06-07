import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('realtimeVoiceUi store — громкость ассистента', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it('клампит outputVolume в диапазон 0..1 и считает проценты', async () => {
    const { useRealtimeVoiceUiStore } = await import(
      '../app/stores/realtimeVoiceUi'
    );
    const store = useRealtimeVoiceUiStore();

    store.setOutputVolume(0.3);
    expect(store.outputVolume).toBe(0.3);
    expect(store.outputVolumePercent).toBe(30);

    store.setOutputVolume(2);
    expect(store.outputVolume).toBe(1);

    store.setOutputVolume(-0.5);
    expect(store.outputVolume).toBe(0);

    store.setOutputVolume(Number.NaN);
    expect(store.outputVolume).toBe(1);
  });

  it('reset() не сбрасывает пользовательскую громкость, только статус', async () => {
    const { useRealtimeVoiceUiStore } = await import(
      '../app/stores/realtimeVoiceUi'
    );
    const store = useRealtimeVoiceUiStore();

    store.setStatus('active');
    store.setOutputVolume(0.42);
    store.reset();

    expect(store.status).toBe('idle');
    expect(store.outputVolume).toBe(0.42);
  });

  it('читает сохранённую громкость при инициализации и персистит изменения', async () => {
    const storage = new Map<string, string>([
      ['mentala.realtimeVoice.outputVolume', '0.55'],
    ]);
    setWindow({
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
      },
    });

    // Новый Pinia → новый инстанс store → state() заново читает localStorage.
    setActivePinia(createPinia());
    const { useRealtimeVoiceUiStore } = await import(
      '../app/stores/realtimeVoiceUi'
    );
    const store = useRealtimeVoiceUiStore();

    expect(store.outputVolume).toBe(0.55);

    store.setOutputVolume(0.2);
    expect(storage.get('mentala.realtimeVoice.outputVolume')).toBe('0.2');
  });
});
