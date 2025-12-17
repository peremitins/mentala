import { defineNuxtPlugin, useRuntimeConfig } from 'nuxt/app';
import { Capacitor } from '@capacitor/core';
import { useChatStore } from '@/app/stores/chat';
import { useHeygenStore } from '@/app/stores/heygen';
import { getSessionItemSync } from '@/app/utils/sessionStorage';

const SESSION_TOKEN_KEY = 'mentala.session.token';

/**
 * Отправляет запрос на завершение HeyGen сессии при перезагрузке/закрытии
 * Работает на всех платформах: Web, Android, iOS
 */
function sendHeyGenStopRequest(sessionId: string) {
  const config = useRuntimeConfig();
  const baseURL = (config.public as any).apiBase || '';
  const url = `${baseURL}/api/heygen/stop`;

  // Получаем токен для авторизации
  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem(SESSION_TOKEN_KEY)
      : null;

  const body = JSON.stringify({ sessionId });

  // sendBeacon не поддерживает кастомные заголовки, поэтому всегда используем fetch с keepalive
  // Это работает на всех платформах (Web, Android, iOS) и поддерживает кастомные заголовки
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['X-Session-Token'] = token;
  }

  // Используем fetch с keepalive для надежной отправки при закрытии страницы
  // Это работает на Web, Android и iOS
  fetch(url, {
    method: 'POST',
    body,
    headers,
    keepalive: true, // Важно для запросов при закрытии страницы
    credentials: 'include', // Включаем cookies на случай, если токен не передан
  }).catch((error) => {
    // Игнорируем ошибки при закрытии страницы - это нормально
    console.warn(
      '[Session Finish Plugin] Failed to send HeyGen stop request:',
      error
    );
  });
}

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

      // Завершаем сессию HeyGen при перезагрузке/закрытии страницы
      const heygen = useHeygenStore();
      // Проверяем sessionId в store или в универсальном хранилище (на случай перезагрузки)
      // Используем синхронную версию, так как обработчики событий не могут быть async
      const heygenSessionId =
        heygen.sessionId ||
        (typeof window !== 'undefined'
          ? getSessionItemSync('heygen_session_id')
          : null);

      if (heygenSessionId) {
        sendHeyGenStopRequest(heygenSessionId);
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
