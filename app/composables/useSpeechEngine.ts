import { computed, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import type { SpeechEngine, SpeechEngineId } from './speech/types';
import { useSpeechStore } from '@/app/stores/speech';

// Singleton state shared across all composable instances.
let engineSingleton: SpeechEngine | null = null;
let currentEngineId: SpeechEngineId | null = null;
const partialListeners = new Set<(text: string) => void>();
const finalListeners = new Set<(text: string) => void>();
const errorListeners = new Set<(error: unknown) => void>();

function dispatchPartial(text: string) {
  for (const cb of [...partialListeners]) {
    cb(text);
  }
}

function dispatchFinal(text: string) {
  for (const cb of [...finalListeners]) {
    cb(text);
  }
}

function dispatchError(error: unknown) {
  for (const cb of [...errorListeners]) {
    cb(error);
  }
}

function bindEngineDispatchers(engine: SpeechEngine) {
  // Конкретные speech-движки держат один callback на тип события.
  // Поэтому движок подписывается только на общий dispatcher, а уже он
  // раздаёт события всем textarea/composer-инстансам.
  engine.onPartial(dispatchPartial);
  engine.onFinal(dispatchFinal);
  engine.onError(dispatchError);
}

export function useSpeechEngine() {
  const speech = useSpeechStore();
  const settings = computed(() => ({
    engine: speech.engine,
    autoSend: speech.autoSend,
    language: speech.language,
    silenceMs: speech.silenceMs,
  }));

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
    bindEngineDispatchers(e);
    engineSingleton = e;
    currentEngineId = id;
    return e;
  }

  async function ensureEngine() {
    const targetEngineId = resolveEngineId(settings.value.engine);
    if (!engineSingleton || currentEngineId !== targetEngineId) {
      if (engineSingleton) await engineSingleton.stop().catch(() => {});
      await createAndBindEngine(targetEngineId);
    }
  }

  async function start(opts?: { continuousMode?: boolean }) {
    await ensureEngine();
    await engineSingleton!.start({
      language: settings.value.language,
      silenceMs: settings.value.silenceMs,
      continuousMode: opts?.continuousMode,
    });
  }

  async function stop() {
    if (!engineSingleton) return;
    try {
      await engineSingleton.stop();
    } catch (error) {
      console.error('[useSpeechEngine] Error stopping engine:', error);
    }
  }

  function onPartial(cb: (t: string) => void) {
    partialListeners.add(cb);
    return () => partialListeners.delete(cb);
  }
  function onFinal(cb: (t: string) => void) {
    finalListeners.add(cb);
    return () => finalListeners.delete(cb);
  }
  function onError(cb: (error: unknown) => void) {
    errorListeners.add(cb);
    return () => errorListeners.delete(cb);
  }

  async function setEngine(id: SpeechEngineId) {
    const target = resolveEngineId(id);
    if (
      speech.engine === target &&
      engineSingleton &&
      currentEngineId === target
    )
      return;
    if (id === 'whisper') {
      // Whisper отключен — мягко возвращаем на auto.
      // TODO: вернуть через ai_relay.
      speech.setEngine('auto');
      return;
    }
    speech.setEngine(target);
    const wasActive = speech.isListening;
    if (engineSingleton) await engineSingleton.stop().catch(() => {});
    await createAndBindEngine(target);
    if (wasActive) {
      await engineSingleton!.start({
        language: settings.value.language,
        silenceMs: settings.value.silenceMs,
      });
    }
  }
  function setAutoSend(v: boolean) {
    speech.setAutoSend(v);
  }

  // Реакция на внешние изменения store.engine (v-model селекта)
  watch(
    () => speech.engine,
    async (next) => {
      if (next && next !== currentEngineId) {
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
