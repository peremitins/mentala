import type { SpeechEngine, SpeechEngineOptions } from './types';
import { useSpeechStore } from '@/app/stores/speech';
import { Capacitor } from '@capacitor/core';
import { getCsrfTokenForHeader } from '@/app/utils/csrf';
import { useRuntimeConfig } from '#imports';

export function createWhisperEngine(): SpeechEngine {
  const speechStore = useSpeechStore();
  let finalCb: ((t: string) => void) | null = null;
  let mediaStream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let silenceTimer: any = null;
  let silenceMs = 10000;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let audioSource: MediaStreamAudioSourceNode | null = null;
  let volumeCheckInterval: any = null;
  const SILENCE_THRESHOLD = 5; // Порог громкости для определения тишины (0-100, RMS)
  const VOLUME_CHECK_INTERVAL = 200; // Проверяем уровень звука каждые 200ms

  // Сбрасываем таймер тишины при обнаружении звука
  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  };

  // Запускаем таймер тишины (когда звук отсутствует)
  const startSilenceTimer = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      console.log('[Whisper] Silence detected, stopping recording');
      stop();
    }, silenceMs);
  };

  // Проверяем уровень звука и управляем таймером тишины
  const checkVolume = () => {
    if (!analyser || !speechStore.isListening) {
      return;
    }

    // Используем time domain data для более точного определения уровня звука
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(dataArray);

    // Вычисляем RMS (Root Mean Square) для определения уровня громкости
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128; // Нормализуем от -1 до 1
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const volume = Math.round(rms * 100); // Преобразуем в 0-100

    if (volume > SILENCE_THRESHOLD) {
      // Есть звук - сбрасываем таймер тишины
      resetSilence();
    } else {
      // Тишина - запускаем таймер тишины (если еще не запущен)
      if (!silenceTimer) {
        startSilenceTimer();
      }
    }
  };

  async function start(opts?: SpeechEngineOptions) {
    if (speechStore.isListening) return;
    silenceMs = opts?.silenceMs ?? silenceMs;

    // Проверяем доступность API
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error('MediaDevices API not available');
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm' });
    chunks = [];
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = onStop;
    mediaRecorder.start();

    // Настраиваем анализ уровня звука для определения тишины
    try {
      audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      audioSource = audioContext.createMediaStreamSource(mediaStream);
      audioSource.connect(analyser);

      // Начинаем периодическую проверку уровня звука
      volumeCheckInterval = setInterval(checkVolume, VOLUME_CHECK_INTERVAL);
    } catch (error) {
      console.warn(
        '[Whisper] Failed to setup audio analysis, using fallback timer:',
        error
      );
      // Fallback: если анализ звука недоступен, используем простой таймер
      // Но это не идеально, так как не учитывает реальную тишину
      startSilenceTimer();
    }

    speechStore.isListening = true;
  }

  async function onStop() {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    chunks = [];
    const fd = new FormData();
    fd.append('file', blob, 'audio.webm');
    try {
      const config = useRuntimeConfig();
      const baseURL = (config.public as any).apiBase || '';
      const url = `${baseURL}/api/stt/whisper`;

      const headers: HeadersInit = {};
      const isCapacitor = Capacitor.isNativePlatform();
      if (isCapacitor) {
        const token = localStorage.getItem('mentai.session.token');
        if (token) headers['X-Session-Token'] = token;
      } else {
        const csrf = getCsrfTokenForHeader();
        if (csrf) headers['X-CSRF-Token'] = csrf;
      }

      const resp = await fetch(url, {
        method: 'POST',
        body: fd,
        headers,
        credentials: 'include',
      });

      if (!resp.ok) {
        console.error('[Whisper] API error:', resp.status, resp.statusText);
        finalCb?.('');
        return;
      }

      const res = (await resp.json()) as { text?: string; usage?: any };
      const text = res?.text?.trim() || '';

      console.log('[Whisper] Response:', res, 'Extracted text:', text);

      if (text) {
        finalCb?.(text);
      } else {
        console.warn('[Whisper] No text in response:', res);
        finalCb?.('');
      }
    } catch (error) {
      console.error('[Whisper] Error:', error);
      finalCb?.('');
    }
  }

  async function stop() {
    clearTimeout(silenceTimer);
    silenceTimer = null;

    if (volumeCheckInterval) {
      clearInterval(volumeCheckInterval);
      volumeCheckInterval = null;
    }

    if (audioSource) {
      try {
        audioSource.disconnect();
      } catch {
        // Нода могла уже быть отсоединена браузером.
      }
      audioSource = null;
    }

    if (analyser) {
      try {
        analyser.disconnect();
      } catch {
        // Анализатор мог уже быть очищен вместе с контекстом.
      }
      analyser = null;
    }

    if (audioContext) {
      try {
        await audioContext.close();
      } catch {
        // Контекст мог уже перейти в closed.
      }
      audioContext = null;
    }

    if (!speechStore.isListening) return;
    speechStore.isListening = false;

    if (mediaRecorder && mediaRecorder.state !== 'inactive')
      mediaRecorder.stop();
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
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
      return !!(
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getUserMedia
      );
    },
  };
}
