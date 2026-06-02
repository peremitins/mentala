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
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let restartInFlight = false;
  let stopInFlight = false;
  let listenersBound = false;

  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, silenceMs);
  };

  const clearRestartTimer = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const scheduleRestart = () => {
    if (!speechStore.isListening || restartInFlight || stopInFlight) return;

    clearRestartTimer();
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!speechStore.isListening || restartInFlight || stopInFlight) return;

      if (lastPartialText) {
        console.log('[NativeEngine] Calling finalCb with:', lastPartialText);
        finalCb?.(lastPartialText);
        lastPartialText = '';
      }

      restartInFlight = true;
      void startInternal().finally(() => {
        restartInFlight = false;
      });
    }, 300);
  };

  const bindRecognitionListeners = () => {
    if (!SpeechRecognition || listenersBound) return;

    SpeechRecognition.addListener('partialResults', (e: any) => {
      const text = e.matches?.[0] || '';
      // Сохраняем только если не пустой, чтобы не потерять последний текст.
      if (text) lastPartialText = text;
      partialCb?.(text);
      resetSilence();
    });

    SpeechRecognition.addListener('result', (e: any) => {
      const text = e.matches?.[0] || '';
      finalCb?.(text);
      // После настоящего final partial уже сохранён. Иначе auto-restart после
      // короткой паузы повторно отправит тот же lastPartialText во второй final.
      lastPartialText = '';
      // НЕ вызываем stop() автоматически - пусть микрофон продолжает слушать.
      resetSilence();
    });

    SpeechRecognition.addListener('listeningState', (data: any) => {
      const status = data?.status || '';
      if (status === 'stopped' && speechStore.isListening && !stopInFlight) {
        console.log(
          '[NativeEngine] Plugin auto-stopped, lastPartialText:',
          lastPartialText
        );
        scheduleRestart();
      }
    });

    SpeechRecognition.addListener('end', () => {
      if (speechStore.isListening && !stopInFlight) {
        console.log(
          '[NativeEngine] Plugin ended, lastPartialText:',
          lastPartialText
        );
        scheduleRestart();
      }
    });

    listenersBound = true;
  };

  async function start(opts?: SpeechEngineOptions) {
    if (speechStore.isListening) return;
    const platform = Capacitor.getPlatform();
    if (platform !== 'ios' && platform !== 'android')
      throw new Error('Native SR only on mobile');
    const isIos = platform === 'ios';

    language = opts?.language || language;
    silenceMs = opts?.silenceMs ?? silenceMs;
    lastPartialText = '';
    if (isIos) {
      // На iOS partial callbacks приходят менее стабильно, чем на web/android,
      // поэтому слишком короткий auto-stop обрубает запись прямо во время фразы.
      silenceMs = Math.max(silenceMs, 10000);
    }

    const mod = await import('@capacitor-community/speech-recognition');
    SpeechRecognition = mod.SpeechRecognition;

    // Используем новые методы checkPermissions/requestPermissions вместо устаревших
    const perm = await SpeechRecognition.checkPermissions();
    let permissionsJustGranted = false;
    if (perm.speechRecognition !== 'granted') {
      // Если уже denied — не вызываем requestPermissions (на iOS это no-op, диалог не появится).
      // Бросаем PERMISSION_DENIED — юзеру нужно идти в настройки.
      if (perm.speechRecognition === 'denied') {
        const err = new Error('Microphone permission denied') as Error & {
          code: string;
        };
        err.code = 'PERMISSION_DENIED';
        throw err;
      }
      // Статус prompt — показываем системный диалог. Если юзер отказал первый раз,
      // бросаем PERMISSION_DENIED_FIRST: не беспокоим модалом, просто молча фейлим.
      let reqResult: { speechRecognition: string };
      try {
        reqResult = await SpeechRecognition.requestPermissions();
      } catch {
        // requestPermissions() сам бросил — расцениваем как отказ
        const err = new Error('Microphone permission denied') as Error & {
          code: string;
        };
        err.code = 'PERMISSION_DENIED_FIRST';
        throw err;
      }
      if (reqResult.speechRecognition !== 'granted') {
        const err = new Error('Microphone permission denied') as Error & {
          code: string;
        };
        err.code = 'PERMISSION_DENIED_FIRST';
        throw err;
      }
      permissionsJustGranted = true;
    }

    // После закрытия системного диалога разрешений iOS вызывает applicationDidBecomeActive,
    // который пересоздаёт аудиосессию в .playback. Даём lifecycle-хэндлерам отработать,
    // чтобы плагин мог корректно переключить на .playAndRecord.
    if (permissionsJustGranted) {
      await new Promise((r) => setTimeout(r, 600));
    }

    // Чистим старые слушатели перед добавлением новых
    try {
      await SpeechRecognition.removeAllListeners();
      listenersBound = false;
    } catch {
      // Игнорируем отсутствие старых listeners.
    }

    bindRecognitionListeners();
    speechStore.isListening = true;
    await SpeechRecognition.start({
      language,
      popup: false,
      partialResults: true,
    });
    resetSilence();
  }

  // Внутренняя функция для автоперезапуска
  async function startInternal() {
    if (!SpeechRecognition || !speechStore.isListening || stopInFlight) return;

    try {
      lastPartialText = '';
      await SpeechRecognition.start({
        language,
        popup: false,
        partialResults: true,
      });
    } catch (error) {
      console.error('[NativeEngine] Auto-restart failed:', error);
    }
  }

  async function stop() {
    if (!speechStore.isListening || stopInFlight) return;
    stopInFlight = true;
    clearTimeout(silenceTimer);
    clearRestartTimer();
    restartInFlight = false;
    try {
      await SpeechRecognition?.stop();
    } catch {
      // Игнорируем stop-ошибку при уже завершённом распознавании.
    } finally {
      speechStore.isListening = false;
      lastPartialText = '';
      stopInFlight = false;
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
      void cb;
    },
    isAvailable() {
      const p = Capacitor.getPlatform();
      return p === 'ios' || p === 'android';
    },
  };
}
