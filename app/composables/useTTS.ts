import { ref, computed } from 'vue';

/**
 * Composable для управления TTS озвучкой
 * Гарантирует, что в любой момент времени играет только одна озвучка
 * Поддерживает отмену активных запросов через AbortController
 */
// Глобальное состояние для TTS (singleton pattern)
// Это гарантирует, что все экземпляры composable используют одно и то же состояние
const globalTTSState = {
  currentAudio: null as HTMLAudioElement | null,
  currentAbortController: null as AbortController | null,
  currentBlobURL: null as string | null,
};

export function useTTS() {
  // Используем глобальное состояние вместо ref, чтобы все экземпляры composable
  // использовали одно и то же состояние

  /**
   * Останавливает текущую TTS озвучку и отменяет активный запрос
   */
  function stop() {
    // Останавливаем текущий Audio элемент
    if (globalTTSState.currentAudio) {
      try {
        globalTTSState.currentAudio.pause();
        globalTTSState.currentAudio.currentTime = 0;
        // Удаляем обработчики событий
        globalTTSState.currentAudio.onended = null;
        globalTTSState.currentAudio.onerror = null;
      } catch (err) {
        console.error('[TTS] Error stopping audio:', err);
      }
      globalTTSState.currentAudio = null;
    }

    // Освобождаем blob URL
    if (globalTTSState.currentBlobURL) {
      try {
        URL.revokeObjectURL(globalTTSState.currentBlobURL);
      } catch (err) {
        console.error('[TTS] Error revoking blob URL:', err);
      }
      globalTTSState.currentBlobURL = null;
    }

    // Отменяем активный HTTP-запрос
    if (globalTTSState.currentAbortController) {
      try {
        globalTTSState.currentAbortController.abort();
        console.log('[TTS] Aborted active request');
      } catch (err) {
        console.error('[TTS] Error aborting request:', err);
      }
      globalTTSState.currentAbortController = null;
    }
  }

  /**
   * Воспроизводит текст через TTS API
   * Автоматически останавливает предыдущую озвучку перед запуском новой
   */
  async function speak(text: string): Promise<void> {
    if (!text?.trim()) return;

    // Останавливаем предыдущую озвучку перед запуском новой
    stop();

    // Создаем новый AbortController для этого запроса
    // ВАЖНО: всегда создаем новый, так как после abort() старый нельзя использовать повторно
    const abortController = new AbortController();
    globalTTSState.currentAbortController = abortController;
    console.log('[TTS] Created new AbortController for request');

    try {
      // Используем нативный fetch вместо $api для гарантированной поддержки AbortController
      const config = useRuntimeConfig();
      const baseURL = (config.public as any).apiBase || '';
      const url = `${baseURL}/api/tts/openai`;

      // Получаем токен сессии для заголовка
      const SESSION_TOKEN_KEY = 'mentai.session.token';
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem(SESSION_TOKEN_KEY)
          : null;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['X-Session-Token'] = token;
      }

      // Выполняем запрос к TTS API с поддержкой отмены через нативный fetch
      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ text, voice: 'sage', format: 'mp3' }),
        signal: abortController.signal, // Передаем signal для отмены запроса
      });

      // Проверяем, не был ли запрос отменен
      if (abortController.signal.aborted) {
        return;
      }

      // Проверяем статус ответа
      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.statusText}`);
      }

      // Получаем ArrayBuffer из ответа
      const buf = await response.arrayBuffer();

      // Проверяем еще раз, не был ли запрос отменен во время загрузки
      if (abortController.signal.aborted) {
        return;
      }

      // Создаем blob и audio элемент
      const blob = new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' });
      const blobUrl = URL.createObjectURL(blob);
      globalTTSState.currentBlobURL = blobUrl;

      const audio = new Audio(blobUrl);
      globalTTSState.currentAudio = audio;

      // Обработчик завершения воспроизведения
      audio.onended = () => {
        URL.revokeObjectURL(blobUrl);
        if (globalTTSState.currentAudio === audio) {
          globalTTSState.currentAudio = null;
        }
        if (globalTTSState.currentBlobURL === blobUrl) {
          globalTTSState.currentBlobURL = null;
        }
        if (globalTTSState.currentAbortController === abortController) {
          globalTTSState.currentAbortController = null;
        }
      };

      // Обработчик ошибок воспроизведения
      audio.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        if (globalTTSState.currentAudio === audio) {
          globalTTSState.currentAudio = null;
        }
        if (globalTTSState.currentBlobURL === blobUrl) {
          globalTTSState.currentBlobURL = null;
        }
        if (globalTTSState.currentAbortController === abortController) {
          globalTTSState.currentAbortController = null;
        }
      };

      // Запускаем воспроизведение
      try {
        await audio.play();
      } catch (err: any) {
        // Игнорируем ошибки автоплея (пользователь может запретить)
        if (err?.name !== 'NotAllowedError') {
          console.error('[TTS] Error playing audio:', err);
        }
        // Очищаем при ошибке
        if (globalTTSState.currentBlobURL) {
          URL.revokeObjectURL(globalTTSState.currentBlobURL);
        }
        globalTTSState.currentAudio = null;
        globalTTSState.currentBlobURL = null;
        globalTTSState.currentAbortController = null;
      }
    } catch (err: any) {
      // Игнорируем ошибки отмены запроса (AbortError)
      if (err?.name === 'AbortError') {
        return;
      }
      console.error('[TTS] Error:', err);
      // Очищаем состояние при ошибке
      globalTTSState.currentAudio = null;
      globalTTSState.currentBlobURL = null;
      globalTTSState.currentAbortController = null;
    }
  }

  return {
    speak,
    stop,
    isPlaying: computed(() => globalTTSState.currentAudio !== null),
  };
}
