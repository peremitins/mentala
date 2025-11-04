import type { SpeechEngine, SpeechEngineOptions } from './types';
import { Capacitor } from '@capacitor/core';
import { useSpeechStore } from '@/app/stores/speech';

export function createNativeEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let partialCb: ((t: string) => void) | null = null;
  let silenceTimer: any = null;
  let silenceMs = 7000;
  let language = 'ru-RU';
  let SpeechRecognition: any;
  let lastPartialText = ''; // Сохраняем последний partial для передачи в finalCb

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

    // Используем новые методы checkPermissions/requestPermissions вместо устаревших
    const perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') {
      const reqResult = await SpeechRecognition.requestPermissions();
      if (reqResult.speechRecognition !== 'granted') {
        throw new Error('Microphone permission denied');
      }
    }

    // Чистим старые слушатели перед добавлением новых
    try {
      await SpeechRecognition.removeAllListeners();
    } catch {}

    speechStore.isListening = true;
    await SpeechRecognition.start({
      language,
      popup: false,
      partialResults: true,
    });
    resetSilence();

    SpeechRecognition.addListener('partialResults', (e: any) => {
      const text = e.matches?.[0] || '';
      // Сохраняем только если не пустой, чтобы не потерять последний текст
      if (text) lastPartialText = text;
      partialCb?.(text);
      resetSilence();
    });
    SpeechRecognition.addListener('result', (e: any) => {
      const text = e.matches?.[0] || '';
      finalCb?.(text);
      // НЕ вызываем stop() автоматически - пусть микрофон продолжает слушать
      resetSilence();
    });

    // Если плагин сам остановился - перезапускаем
    SpeechRecognition.addListener('listeningState', (data: any) => {
      const status = data?.status || '';
      if (status === 'stopped' && speechStore.isListening) {
        console.log(
          '[NativeEngine] Plugin auto-stopped, lastPartialText:',
          lastPartialText
        );
        // Перезапускаем распознавание
        setTimeout(() => {
          if (speechStore.isListening) {
            // Сохраняем последний partial как final перед перезапуском
            if (lastPartialText) {
              console.log(
                '[NativeEngine] Calling finalCb with:',
                lastPartialText
              );
              finalCb?.(lastPartialText);
              lastPartialText = '';
            }
            startInternal();
          }
        }, 300);
      }
    });

    SpeechRecognition.addListener('end', () => {
      if (speechStore.isListening) {
        console.log(
          '[NativeEngine] Plugin ended, lastPartialText:',
          lastPartialText
        );
        setTimeout(() => {
          if (speechStore.isListening) {
            // Сохраняем последний partial как final перед перезапуском
            if (lastPartialText) {
              console.log(
                '[NativeEngine] Calling finalCb with:',
                lastPartialText
              );
              finalCb?.(lastPartialText);
              lastPartialText = '';
            }
            startInternal();
          }
        }, 300);
      }
    });
  }

  // Внутренняя функция для автоперезапуска
  async function startInternal() {
    if (!SpeechRecognition || !speechStore.isListening) return;

    try {
      await SpeechRecognition.start({
        language,
        popup: false,
        partialResults: true,
      });
      resetSilence();
    } catch (error) {
      console.error('[NativeEngine] Auto-restart failed:', error);
    }
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
