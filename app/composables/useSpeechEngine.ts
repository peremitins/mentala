import { Capacitor } from '@capacitor/core';
import type { SpeechEngine, SpeechEngineId } from './speech/types';
import { useSpeechStore } from '@/app/stores/speech';

// Singleton state shared across all composable instances
let engineSingleton: SpeechEngine | null = null;
const partialListeners: Array<(t: string) => void> = [];
const finalListeners: Array<(t: string) => void> = [];

export function useSpeechEngine() {
  const speech = useSpeechStore();
  const settings = computed(() => ({
    engine: speech.engine,
    autoSend: speech.autoSend,
    language: speech.language,
    silenceMs: speech.silenceMs,
  }));

  let engine: SpeechEngine | null = engineSingleton;
  const currentEngineId = ref<SpeechEngineId | null>(null);
  const isActive = ref(false);

  async function pickEngine(id: SpeechEngineId): Promise<SpeechEngine> {
    if (id === 'whisper') {
      const { createWhisperEngine } = await import(
        '@/app/composables/speech/engine.whisper'
      );
      return createWhisperEngine();
    }
    if (id === 'native') {
      const { createNativeEngine } = await import(
        '@/app/composables/speech/engine.native'
      );
      return createNativeEngine();
    }
    if (id === 'webspeech') {
      const { createWebSpeechEngine } = await import(
        '@/app/composables/speech/engine.webspeech'
      );
      return createWebSpeechEngine();
    }
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') {
      const { createNativeEngine } = await import(
        '@/app/composables/speech/engine.native'
      );
      const e = createNativeEngine();
      return e.isAvailable()
        ? e
        : (
            await import('@/app/composables/speech/engine.whisper')
          ).createWhisperEngine();
    } else {
      const { createWebSpeechEngine } = await import(
        '@/app/composables/speech/engine.webspeech'
      );
      const e = createWebSpeechEngine();
      return e.isAvailable()
        ? e
        : (
            await import('@/app/composables/speech/engine.whisper')
          ).createWhisperEngine();
    }
  }

  async function createAndBindEngine(id: SpeechEngineId) {
    const e = await pickEngine(id);
    for (const cb of partialListeners) e.onPartial(cb);
    for (const cb of finalListeners) e.onFinal(cb);
    engineSingleton = e;
    engine = e;
    currentEngineId.value = id;
    return e;
  }

  async function ensureEngine() {
    if (!engine || currentEngineId.value !== settings.value.engine) {
      if (engine) await engine.stop().catch(() => {});
      await createAndBindEngine(settings.value.engine);
    }
  }

  async function start() {
    await ensureEngine();
    try {
      await engine!.start({
        language: settings.value.language,
        silenceMs: settings.value.silenceMs,
      });
      isActive.value = true;
    } catch {
      const { createWhisperEngine } = await import(
        '@/app/composables/speech/engine.whisper'
      );
      engine = createWhisperEngine();
      for (const cb of partialListeners) engine.onPartial(cb);
      for (const cb of finalListeners) engine.onFinal(cb);
      await engine!.start({
        language: settings.value.language,
        silenceMs: settings.value.silenceMs,
      });
      speech.setEngine('whisper');
      currentEngineId.value = 'whisper';
      engineSingleton = engine;
      isActive.value = true;
    }
  }

  async function stop() {
    if (!engine) return;
    try {
      await engine.stop();
      isActive.value = false;
    } catch (error) {
      console.error('[useSpeechEngine] Error stopping engine:', error);
      isActive.value = false;
    }
  }

  function onPartial(cb: (t: string) => void) {
    partialListeners.push(cb);
    engine?.onPartial(cb);
  }
  function onFinal(cb: (t: string) => void) {
    finalListeners.push(cb);
    engine?.onFinal(cb);
  }

  async function setEngine(id: SpeechEngineId) {
    if (speech.engine === id && engine) return;
    speech.setEngine(id);
    const wasActive = isActive.value;
    if (engine) await engine.stop().catch(() => {});
    await createAndBindEngine(id);
    if (wasActive) {
      await engine!.start({
        language: settings.value.language,
        silenceMs: settings.value.silenceMs,
      });
      isActive.value = true;
    }
  }
  function setAutoSend(v: boolean) {
    speech.setAutoSend(v);
  }

  // Реакция на внешние изменения store.engine (v-model селекта)
  watch(
    () => speech.engine,
    async (next) => {
      if (next && next !== currentEngineId.value) {
        await setEngine(next);
      }
    }
  );

  return { settings, start, stop, onPartial, onFinal, setEngine, setAutoSend };
}
