import type { SpeechEngine, SpeechEngineOptions } from './types';
import { useSpeechStore } from '@/app/stores/speech';

export function createWebSpeechEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let partialCb: ((t: string) => void) | null = null;
  let errorCb: ((error: unknown) => void) | null = null;
  let rec: any = null;
  let silenceTimer: any = null;
  let silenceMs = 10000;
  let language = 'ru-RU';

  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, silenceMs);
  };

  function isSupported() {
    const w: any = window;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  async function start(opts?: SpeechEngineOptions) {
    if (!isSupported()) throw new Error('Web Speech API not supported');
    if (speechStore.isListening) return;
    language = opts?.language || language;
    silenceMs = opts?.silenceMs ?? silenceMs;

    const w: any = window;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    rec = new SR();
    rec.lang = language;
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e: any) => {
      let interim = '';
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim) {
        partialCb?.(interim.trim());
        resetSilence();
      }
      if (final) {
        finalCb?.(final.trim());
        stop();
      }
    };
    rec.onerror = (event: any) => {
      errorCb?.(
        new Error(
          typeof event?.error === 'string'
            ? `Web Speech error: ${event.error}`
            : 'Web Speech error'
        )
      );
      stop();
    };
    rec.onend = () => {
      stop();
    };

    speechStore.isListening = true;
    rec.start();
    resetSilence();
  }

  async function stop() {
    if (!speechStore.isListening) return;
    speechStore.isListening = false;
    clearTimeout(silenceTimer);
    try {
      rec?.stop();
    } catch {
      // Игнорируем stop-ошибку, если браузер уже завершил распознавание.
    }
  }

  return {
    start,
    stop,
    onPartial(cb) {
      partialCb = cb;
    },
    onFinal(cb) {
      finalCb = cb;
    },
    onError(cb) {
      errorCb = cb;
    },
    isAvailable() {
      return isSupported();
    },
  };
}
