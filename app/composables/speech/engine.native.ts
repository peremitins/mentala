import type { SpeechEngine, SpeechEngineOptions } from './types';
import { Capacitor } from '@capacitor/core';
import { useSpeechStore } from '@/app/stores/speech';

export function createNativeEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let partialCb: ((t: string) => void) | null = null;
  let silenceTimer: any = null;
  let silenceMs = 10000;
  let language = 'ru-RU';
  let SpeechRecognition: any;

  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, silenceMs);
  };

  async function start(opts?: SpeechEngineOptions) {
    if (speechStore.isListening) return;
    language = opts?.language || language;
    silenceMs = opts?.silenceMs ?? silenceMs;

    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android')
      throw new Error('Native SR only on mobile');

    const mod = await import('@capacitor-community/speech-recognition');
    SpeechRecognition = mod.SpeechRecognition;

    const perm = await SpeechRecognition.checkPermission();
    if (perm.permission !== 'granted')
      await SpeechRecognition.requestPermission();

    speechStore.isListening = true;
    await SpeechRecognition.start({
      language,
      popup: false,
      partialResults: true,
    });
    resetSilence();

    SpeechRecognition.addListener('partialResults', (e: any) => {
      const text = e.matches?.[0] || '';
      partialCb?.(text);
      resetSilence();
    });
    SpeechRecognition.addListener('result', (e: any) => {
      const text = e.matches?.[0] || '';
      finalCb?.(text);
      stop();
    });
  }

  async function stop() {
    if (!speechStore.isListening) return;
    speechStore.isListening = false;
    clearTimeout(silenceTimer);
    try {
      await SpeechRecognition?.stop();
    } catch {}
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
    isAvailable() {
      const p = Capacitor.getPlatform();
      return p === 'ios' || p === 'android';
    },
  };
}
