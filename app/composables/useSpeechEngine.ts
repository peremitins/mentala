import { Capacitor } from '@capacitor/core';
import type { SpeechEngine, SpeechEngineId } from './speech/types';
import { useSpeechStore } from '@/app/stores/speech';

// Singleton state shared across all composable instances
let engineSingleton: SpeechEngine | null = null;
const partialListeners: Array<(t: string) => void> = [];
const finalListeners: Array<(t: string) => void> = [];
const errorListeners: Array<(error: unknown) => void> = [];

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

  const resolveEngineId = (id: SpeechEngineId): SpeechEngineId =>
    id === 'whisper' ? 'auto' : id;

  async function pickEngine(id: SpeechEngineId): Promise<SpeechEngine> {
    if (id === 'whisper') {
      // Временно отключаем Whisper, даже как fallback.
      // TODO: вернуть через ai_relay, когда появится безопасный прокси.
      // const { createWhisperEngine } = await import(
      //   '@/app/composables/speech/engine.whisper'
      // );
      // return createWhisperEngine();
      throw new Error('Whisper временно отключен');
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
      if (!e.isAvailable()) {
        // TODO: fallback на Whisper через ai_relay.
        // return (
        //   await import('@/app/composables/speech/engine.whisper')
        // ).createWhisperEngine();
        throw new Error('Native speech engine is not available');
      }
      return e;
    } else {
      const { createWebSpeechEngine } = await import(
        '@/app/composables/speech/engine.webspeech'
      );
      const e = createWebSpeechEngine();
      if (!e.isAvailable()) {
        // TODO: fallback на Whisper через ai_relay.
        // return (
        //   await import('@/app/composables/speech/engine.whisper')
        // ).createWhisperEngine();
        throw new Error('Web Speech API is not available');
      }
      return e;
    }
  }

  async function createAndBindEngine(id: SpeechEngineId) {
    const e = await pickEngine(id);
    for (const cb of partialListeners) e.onPartial(cb);
    for (const cb of finalListeners) e.onFinal(cb);
    for (const cb of errorListeners) e.onError(cb);
    engineSingleton = e;
    engine = e;
    currentEngineId.value = id;
    return e;
  }

  async function ensureEngine() {
    const targetEngineId = resolveEngineId(settings.value.engine);
    if (!engine || currentEngineId.value !== targetEngineId) {
      if (engine) await engine.stop().catch(() => {});
      await createAndBindEngine(targetEngineId);
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
    } catch (error) {
      isActive.value = false;
      // Временно не делаем fallback на Whisper.
      // TODO: вернуть fallback через ai_relay.
      // const { createWhisperEngine } = await import(
      //   '@/app/composables/speech/engine.whisper'
      // );
      // engine = createWhisperEngine();
      // for (const cb of partialListeners) engine.onPartial(cb);
      // for (const cb of finalListeners) engine.onFinal(cb);
      // await engine!.start({
      //   language: settings.value.language,
      //   silenceMs: settings.value.silenceMs,
      // });
      // speech.setEngine('whisper');
      // currentEngineId.value = 'whisper';
      // engineSingleton = engine;
      // isActive.value = true;
      throw error;
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
  function onError(cb: (error: unknown) => void) {
    errorListeners.push(cb);
    engine?.onError(cb);
  }

  async function setEngine(id: SpeechEngineId) {
    const target = resolveEngineId(id);
    if (speech.engine === target && engine) return;
    if (id === 'whisper') {
      // Whisper отключен — мягко возвращаем на auto.
      // TODO: вернуть через ai_relay.
      speech.setEngine('auto');
      return;
    }
    speech.setEngine(target);
    const wasActive = isActive.value;
    if (engine) await engine.stop().catch(() => {});
    await createAndBindEngine(target);
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

  return {
    settings,
    start,
    stop,
    onPartial,
    onFinal,
    onError,
    setEngine,
    setAutoSend,
  };
}
