import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export default defineNuxtPlugin((nuxtApp) => {
  // Работаем только на мобильных платформах
  if (Capacitor.getPlatform() === 'web') return;

  // TEMPORARY: Полностью отключаем push уведомления до настройки Firebase
  // Это предотвратит крэш на устройствах где google-services.json отсутствует
  // TODO: Включить после добавления google-services.json
  console.warn(
    '[PushPlugin] Push notifications temporarily disabled - Firebase not configured'
  );
  return;

  // Создаём канал уведомлений с высоким приоритетом для Android (O+)
  const ensureHighPriorityChannel = async () => {
    try {
      await LocalNotifications.createChannel?.({
        id: 'mentai_high',
        name: 'MentAI High Priority',
        description: 'Важные уведомления MentAI',
        importance: 5, // IMPORTANCE_HIGH
        visibility: 1, // VISIBILITY_PUBLIC
        sound: 'default',
        lights: true,
        vibration: true,
      } as any);
    } catch {}
  };

  // Обработчики Push уведомлений
  try {
    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration success, token: ' + token.value);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pushToken', token.value);
      }
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Registration error: ', err.error);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('Push notification received: ', notification);
      }
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        console.log(
          'Push notification action performed',
          action.actionId,
          action.inputValue
        );
      }
    );
  } catch (error) {
    console.error('Failed to add push listeners:', error);
  }

  // Отложенная инициализация уведомлений после полной загрузки приложения
  const initNotifications = async () => {
    try {
      console.log('[PushPlugin] Starting notification initialization');
      await ensureHighPriorityChannel();

      // Проверка и запрос разрешений для локальных уведомлений
      const localPerm = await LocalNotifications.checkPermissions();
      if (localPerm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }

      // Проверка и запрос разрешений
      const permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        await PushNotifications.requestPermissions();
      }

      // Пытаемся зарегистрировать push-уведомления
      console.log('[PushPlugin] Attempting to register push notifications');
      await PushNotifications.register();
    } catch (error: any) {
      // Проверяем, что это ошибка инициализации Firebase
      const errorMessage = error?.message || '';
      const isFirebaseError =
        errorMessage.includes('Firebase') ||
        errorMessage.includes('not initialized') ||
        errorMessage.includes('IllegalStateException');

      if (isFirebaseError) {
        console.warn('Push notifications не доступны: Firebase не настроен');
      } else {
        console.error('Error initializing notifications:', error);
      }
    }
  };

  // Используем Nuxt хук для отложенной инициализации после полной загрузки
  nuxtApp.hook('app:mounted', () => {
    console.log('[PushPlugin] App mounted, scheduling notification init in 3s');
    setTimeout(initNotifications, 3000);
  });
});
