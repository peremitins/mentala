import type { SpeechEngine, SpeechEngineOptions } from './types';
import { useSpeechStore } from '@/app/stores/speech';

export function createWebSpeechEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let partialCb: ((t: string) => void) | null = null;
  let errorCb: ((error: unknown) => void) | null = null;
  let rec: any = null;
  let silenceTimer: any = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let silenceMs = 10000;
  let language = 'ru-RU';
  let continuousMode = false;
  let stopInFlight = false;
  /**
   * Timestamp последнего partial/final event'а. Нужен для двух вещей:
   *  1. Не restart-ить recognition бесконечно, если пользователь молчит
   *     дольше silence-окна — иначе индикатор микрофона мигает каждые
   *     2-5 секунд (browser закрывает recognition при тишине).
   *  2. Корректно работает silence-таймер, который отключает диктовку
   *     после `silenceMs` тишины — он считается от реальной речи, а не
   *     от технических restart'ов.
   */
  let lastSpeechAtMs = 0;

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

  function isSupported() {
    const w: any = window;
    return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
  }

  function buildRec() {
    const w: any = window;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const srInstance = new SR();
    srInstance.lang = language;
    srInstance.interimResults = true;
    srInstance.continuous = true;

    srInstance.onresult = (e: any) => {
      // Spec-correct итерация: e.resultIndex — индекс первого изменившегося
      // result в текущем event. Всё до этого индекса уже было обработано
      // в предыдущих event'ах. Это работает одинаково на desktop (cumulative
      // results) и mobile (некоторые браузеры сбрасывают results между
      // sessions). Без resultIndex мы либо дублировали final, либо
      // пропускали его на mobile.
      let newFinal = '';
      let latestInterim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript || '';
        if (res.isFinal) {
          newFinal += text;
        } else {
          latestInterim = text;
        }
      }

      const trimmedFinal = newFinal.trim();
      const trimmedInterim = latestInterim.trim();

      if (trimmedInterim || trimmedFinal) {
        lastSpeechAtMs = Date.now();
      }

      if (trimmedInterim) {
        partialCb?.(trimmedInterim);
        resetSilence();
      }

      if (trimmedFinal) {
        finalCb?.(trimmedFinal);
        if (continuousMode) {
          // НЕ пересоздаём recognition — resultIndex-итерация уже корректно
          // отфильтрует следующий event. Если браузер сам закроет session
          // (onend) — restartFresh там создаст новый instance.
          resetSilence();
        } else {
          stop();
        }
      }
    };

    srInstance.onerror = (event: any) => {
      const errorType = event?.error;
      // На mobile webkitSpeechRecognition часто кидает `no-speech` после
      // короткой паузы. В continuous-режиме это не повод останавливать
      // диктовку — onend сам перезапустит recognition.
      if (continuousMode && errorType === 'no-speech') {
        return;
      }
      // `aborted` — нормальная остановка при `stop()` пользователем.
      if (errorType === 'aborted') {
        return;
      }
      errorCb?.(
        new Error(
          typeof errorType === 'string'
            ? `Web Speech error: ${errorType}`
            : 'Web Speech error'
        )
      );
      stop();
    };
    srInstance.onend = () => {
      // В continuous mode mobile-браузеры закрывают recognition после
      // короткой паузы (2-5 секунд без речи). Если пользователь не нажимал
      // stop вручную И речь была недавно — перезапускаем с новым instance.
      if (
        continuousMode &&
        speechStore.isListening &&
        !stopInFlight &&
        rec === srInstance
      ) {
        // Если последняя речь была давно (или её вообще не было), не
        // restart-им — иначе индикатор микрофона будет «перемигивать» в
        // бесконечном цикле. silenceTimer уже отсчитывает время от
        // последней реальной речи и сам вызовет stop().
        const sinceSpeech = lastSpeechAtMs
          ? Date.now() - lastSpeechAtMs
          : Number.POSITIVE_INFINITY;
        const restartThreshold = Math.min(silenceMs - 1000, 4000);
        if (sinceSpeech > restartThreshold) {
          stop();
          return;
        }
        restartFresh();
        return;
      }
      // Legacy / явный stop — действительно завершаем session.
      if (!stopInFlight) stop();
    };
    return srInstance;
  }

  function restartFresh() {
    clearRestartTimer();
    // Минимальная задержка — даём предыдущему instance завершить teardown,
    // но не теряем начало следующей фразы пользователя. 50ms — компромисс:
    // достаточно чтобы Chrome не бросал InvalidStateError при start(), но
    // пользователь почти не успевает «проглотить» начало слова.
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (!speechStore.isListening || stopInFlight) return;
      try {
        // Освобождаем старый instance от listeners перед drop.
        if (rec) {
          rec.onresult = null;
          rec.onerror = null;
          rec.onend = null;
          try {
            rec.abort();
          } catch {
            // ignore — instance уже завершился
          }
        }
        rec = buildRec();
        rec.start();
        // НЕ вызываем resetSilence — silenceTimer тикает от последнего
        // partial/final (см. lastSpeechAtMs), а не от технического restart.
        // Иначе таймер обнулялся бы каждые 2-5 секунд, и автоматическое
        // отключение по тишине никогда не срабатывало бы.
      } catch (e) {
        console.warn('[webspeech] restartFresh failed:', e);
        stop();
      }
    }, 50);
  }

  async function start(opts?: SpeechEngineOptions) {
    if (!isSupported()) throw new Error('Web Speech API not supported');
    if (speechStore.isListening) return;
    language = opts?.language || language;
    silenceMs = opts?.silenceMs ?? silenceMs;
    continuousMode = opts?.continuousMode ?? false;
    stopInFlight = false;
    clearRestartTimer();

    rec = buildRec();
    speechStore.isListening = true;
    rec.start();
    resetSilence();
  }

  async function stop() {
    if (!speechStore.isListening) return;
    stopInFlight = true;
    speechStore.isListening = false;
    clearTimeout(silenceTimer);
    clearRestartTimer();
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        // Игнорируем — браузер уже завершил распознавание.
      }
    }
    // stopInFlight остаётся true до следующего start — защищает onend
    // от попытки restart на пути к teardown.
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
