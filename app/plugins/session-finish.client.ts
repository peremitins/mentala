import { Capacitor } from '@capacitor/core';
import { defineNuxtPlugin } from 'nuxt/app';
import { useChatStore } from '@/app/stores/chat';

/**
 * Глобальный lifecycle text-чата.
 *
 * Цели:
 *  - при уходе со страницы/в фон всегда попытаться остановить therapy session;
 *  - при неудаче не терять запрос end, а добивать его через persistent queue
 *    после следующего старта приложения / возврата сети / возврата в foreground.
 */
export default defineNuxtPlugin(async () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }

  const endTherapySession = () => {
    const chat = useChatStore();
    void chat.endTherapySession();
  };

  const flushPendingTherapySessionEnds = () => {
    const chat = useChatStore();
    void chat.flushPendingTherapySessionEnds();
  };

  // При каждом старте клиента сначала пробуем добить старые pending-end.
  flushPendingTherapySessionEnds();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      endTherapySession();
      return;
    }

    flushPendingTherapySessionEnds();
  });

  window.addEventListener('pagehide', endTherapySession);
  window.addEventListener('beforeunload', endTherapySession);
  window.addEventListener('online', flushPendingTherapySessionEnds);
  window.addEventListener('focus', flushPendingTherapySessionEnds);

  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        flushPendingTherapySessionEnds();
        return;
      }

      endTherapySession();
    });
  } catch (error) {
    console.error(
      '[session-finish.client] Failed to register Capacitor App lifecycle listeners:',
      error
    );
  }
});
