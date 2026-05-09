/**
 * Service Worker для Mentala PWA
 *
 * Отвечает за:
 * - Кеширование статических ресурсов (иконки, шрифты)
 * - Получение фоновых FCM push-уведомлений
 * - Offline-заглушку при отсутствии интернета
 *
 * ВАЖНО: этот файл обрабатывается через @vite-pwa/nuxt (Workbox + Vite),
 * поэтому VITE_* env-переменные доступны через import.meta.env.
 *
 * Для работы Firebase Web Push необходимо добавить в .env:
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=...
 *   VITE_FIREBASE_PROJECT_ID=...
 *   VITE_FIREBASE_STORAGE_BUCKET=...
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 *   VITE_FIREBASE_VAPID_PUBLIC_KEY=... (уже есть)
 */

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare let self: ServiceWorkerGlobalScope;

// Workbox inject point — сюда подставляется список ресурсов для precache
precacheAndRoute(self.__WB_MANIFEST);

// Удаляем устаревшие кеши при обновлении SW
cleanupOutdatedCaches();

// ==========================================
// Firebase Messaging (фоновые push)
// ==========================================

const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const firebaseProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const firebaseMessagingSenderId = import.meta.env
  .VITE_FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = import.meta.env.VITE_FIREBASE_APP_ID;

// Инициализируем Firebase только если все обязательные переменные заданы
if (
  firebaseApiKey &&
  firebaseProjectId &&
  firebaseMessagingSenderId &&
  firebaseAppId
) {
  const firebaseApp = initializeApp({
    apiKey: firebaseApiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: firebaseProjectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: firebaseMessagingSenderId,
    appId: firebaseAppId,
  });

  const messaging = getMessaging(firebaseApp);

  // Обработка фоновых push-уведомлений (приложение свернуто или закрыто)
  onBackgroundMessage(messaging, (payload) => {
    console.log('[SW] Background push received:', payload.messageId);

    const notificationTitle =
      payload.notification?.title || payload.data?.title || 'Ментала';
    // Для web push используем data-only payload, поэтому картинка в payload.data.imageUrl
    const imageUrl =
      payload.notification?.image || payload.data?.imageUrl || null;
    const notificationOptions: NotificationOptions = {
      body: payload.notification?.body || payload.data?.body || '',
      icon: '/notification-icon-192.png',
      // Android маскирует badge, поэтому используем простой контрастный силуэт.
      badge: '/notification-badge-96.png',
      data: payload.data || {},
      tag: payload.data?.slotId ? `slot-${payload.data.slotId}` : undefined,
    };

    if (imageUrl) {
      // image — нестандартное расширение Chrome, нет в @types/serviceworker
      (notificationOptions as Record<string, unknown>).image = imageUrl;
    }

    return self.registration.showNotification(
      notificationTitle,
      notificationOptions
    );
  });
} else {
  console.warn(
    '[SW] Firebase config is incomplete — background push will not work. ' +
      'Add VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, ' +
      'VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID to .env'
  );
}

// ==========================================
// Обработка нажатий на уведомления
// ==========================================

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const deepLink = data.deepLink || data.navigationTarget || '/';
  const clickMessage = {
    type: 'MENTALA_NOTIFICATION_CLICK',
    slotId: typeof data.slotId === 'string' ? data.slotId : null,
    deepLink: typeof deepLink === 'string' ? deepLink : '/',
  };

  // Открываем или фокусируем окно приложения
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(async (clientList) => {
        // Если приложение уже открыто — фокусируемся на нём
        for (const client of clientList) {
          if ('focus' in client) {
            client.postMessage(clickMessage);
            await client.focus();
            if (deepLink && deepLink !== '/') {
              await (client as WindowClient).navigate(deepLink);
            }
            return;
          }
        }
        // Иначе открываем новое окно
        if (self.clients.openWindow) {
          const openedClient = await self.clients.openWindow(deepLink || '/');
          openedClient?.postMessage(clickMessage);
        }
      })
  );
});

// ==========================================
// Offline fallback
// ==========================================

self.addEventListener('fetch', (event) => {
  // Пропускаем API-запросы — не кешируем, не перехватываем
  if (event.request.url.includes('/api/')) return;

  // Для навигационных запросов — если сеть недоступна, показываем offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/offline.html').then(
          (cached) =>
            cached ||
            new Response(
              '<html><body><h1>Нет соединения</h1><p>Проверьте подключение к интернету и попробуйте снова.</p></body></html>',
              {
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
              }
            )
        );
      })
    );
  }
});
