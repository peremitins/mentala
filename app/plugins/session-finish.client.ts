import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';
import { useChatStore } from '@/app/stores/chat';

export default defineNuxtPlugin(() => {
  if (process.server) return;

  const platform = Capacitor.getPlatform();
  const chat = useChatStore();
  const router = useRouter();

  // Обработчик для завершения therapy сессии
  const handleEndTherapySession = () => {
    if (chat.therapySessionId && !chat.isEndingSession) {
      void chat.endTherapySession();
    }
  };

  // Обрабатываем переходы между страницами (не блокируем навигацию)
  router.afterEach((to, from) => {
    // Если уходим со страницы чата на другую страницу - завершаем therapy сессию
    if (from.path === '/' && to.path !== '/') {
      handleEndTherapySession();

      // Инвалидируем кэш subscription store для обновления данных
      // Используем динамический импорт, чтобы не блокировать навигацию
      import('@/app/stores/subscription').then(({ useSubscriptionStore }) => {
        const subscriptionStore = useSubscriptionStore();
        subscriptionStore.invalidateCache();
      });
    }
  });

  // Обработчик для Web и мобильных платформ
  const handleUnload = () => {
    try {
      // ВСЕГДА завершаем therapy сессию при обновлении/закрытии страницы
      // Это критично для правильного подсчета времени
      handleEndTherapySession();

      // Завершаем сессию чата
      if (chat.sessionId && chat.messages && chat.messages.length > 0) {
        // Вызываем обычный метод - он использует $api с правильными заголовками
        void chat.finishAndSave();
      }
    } catch (error) {
      console.error('[Session Finish Plugin] Error:', error);
    }
  };

  // На Web используем beforeunload и visibilitychange
  if (platform === 'web') {
    window.addEventListener('beforeunload', handleUnload);

    // Обрабатываем уход в фон (спящий режим, переключение вкладок)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Страница ушла в фон - завершаем therapy сессию
        handleEndTherapySession();
      }
    });
  } else {
    // На мобильных платформах используем Capacitor App API
    // Это более надежно, чем beforeunload
    import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            // Приложение ушло в фон - завершаем сессии
            handleUnload();
          }
        });
      })
      .catch((error) => {
        console.warn(
          '[Session Finish Plugin] Failed to setup Capacitor App listeners:',
          error
        );
        // Fallback на beforeunload и visibilitychange, если Capacitor недоступен
        if (typeof window !== 'undefined') {
          window.addEventListener('beforeunload', handleUnload);
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
              handleEndTherapySession();
            }
          });
        }
      });
  }
});
