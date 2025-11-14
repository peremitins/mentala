import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export default defineNuxtPlugin((nuxtApp) => {
  // Работаем только на мобильных платформах
  const platform = Capacitor.getPlatform();
  if (platform === 'web') return;

  // TODO: Раскомментировать когда Firebase будет настроен
  // TEMPORARY: Полностью отключаем push уведомления до настройки Firebase
  // console.warn('[PushPlugin] Push notifications temporarily disabled - Firebase not configured');
  // return;

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

  // ==========================================
  // Обработчики Push уведомлений
  // ==========================================

  try {
    // Успешная регистрация токена
    PushNotifications.addListener('registration', async (token) => {
      console.log('[PushPlugin] Registration success, token:', token.value);

      // Сохраняем локально
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pushToken', token.value);
      }

      // Регистрируем на сервере
      try {
        await $fetch('/api/notifications/register-token', {
          method: 'POST',
          body: {
            token: token.value,
            platform: platform === 'ios' ? 'ios' : 'android',
          },
        });
        console.log('[PushPlugin] Token registered on server');
      } catch (error) {
        console.error(
          '[PushPlugin] Failed to register token on server:',
          error
        );
      }
    });

    // Ошибка регистрации
    PushNotifications.addListener('registrationError', (err) => {
      console.error('[PushPlugin] Registration error:', err.error);
    });

    // Push получен (приложение на переднем плане)
    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification) => {
        console.log('[PushPlugin] Notification received:', notification);
        // Здесь можно показать локальное уведомление или обновить UI
      }
    );

    // Клик по уведомлению или нажатие на action
    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (action) => {
        console.log(
          '[PushPlugin] Action performed:',
          action.actionId,
          action.notification
        );

        const { notification } = action;
        const data = notification.data;

        // Трекинг взаимодействия
        if (data?.slotId) {
          let actionType: 'yes' | 'no' | 'later' | 'dismissed' = 'dismissed';

          // Определяем тип действия
          if (action.actionId === 'yes') {
            actionType = 'yes';
          } else if (action.actionId === 'no') {
            actionType = 'no';
          } else if (
            action.actionId === 'later' ||
            action.actionId.startsWith('snooze:')
          ) {
            actionType = 'later';

            // Если это snooze — отправляем запрос на отложение
            const duration = action.actionId.replace('snooze:', '') as
              | '15m'
              | '1h'
              | '4h'
              | 'tomorrow';
            try {
              await $fetch('/api/notifications/snooze', {
                method: 'POST',
                body: {
                  kind: data.kind || 'therapy',
                  duration,
                  habitId: data.habitId || null,
                },
              });
              console.log('[PushPlugin] Notification snoozed:', duration);
            } catch (error) {
              console.error('[PushPlugin] Failed to snooze:', error);
            }
          }

          // Отправляем трекинг взаимодействия
          try {
            await $fetch('/api/notifications/interaction', {
              method: 'POST',
              body: {
                slotId: data.slotId,
                action: actionType,
                at: new Date().toISOString(),
                meta: {
                  platform,
                  actionId: action.actionId,
                },
              },
            });
            console.log('[PushPlugin] Interaction tracked:', actionType);
          } catch (error) {
            console.error('[PushPlugin] Failed to track interaction:', error);
          }
        }

        // Deep link навигация
        if (data?.deepLink) {
          try {
            await navigateTo(data.deepLink);
          } catch (error) {
            console.error('[PushPlugin] Failed to navigate:', error);
          }
        }
      }
    );
  } catch (error) {
    console.error('[PushPlugin] Failed to add push listeners:', error);
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

  // ==========================================
  // Fallback режим: polling для тестирования без Firebase
  // Используется только в development, когда Firebase не настроен
  // ==========================================

  const startDevPolling = () => {
    console.log('[PushPlugin] Starting fallback polling for notifications');
    console.log(
      '[PushPlugin] (Firebase не настроен - используется LocalNotifications)'
    );

    const checkPending = async () => {
      try {
        const pending = await $fetch<any[]>('/api/notifications/pending');

        if (pending && pending.length > 0) {
          console.log(
            `[PushPlugin] Found ${pending.length} pending notifications`
          );

          for (const slot of pending) {
            const payload = slot.payload;

            // Показываем через LocalNotifications
            try {
              await LocalNotifications.schedule({
                notifications: [
                  {
                    id: Math.floor(Math.random() * 2147483647),
                    title: payload.title || 'MentAI',
                    body: payload.body || 'Новое уведомление',
                    sound: 'default',
                    channelId: 'mentai_high',
                  },
                ],
              });

              console.log(
                `[PushPlugin] Notification shown: ${payload.body?.substring(0, 50)}...`
              );

              // Помечаем как доставленное
              await $fetch('/api/notifications/mark-delivered', {
                method: 'POST',
                body: { slotId: slot.id },
              });
            } catch (error) {
              console.error('[PushPlugin] Failed to show notification:', error);
            }
          }
        }
      } catch (error) {
        // Игнорируем ошибки (например, если не авторизован)
      }
    };

    // Проверяем каждые 15 секунд
    setInterval(checkPending, 15000);

    // Первая проверка через 5 секунд
    setTimeout(checkPending, 5000);
  };

  // Используем Nuxt хук для отложенной инициализации после полной загрузки
  nuxtApp.hook('app:mounted', () => {
    console.log('[PushPlugin] App mounted, scheduling notification init in 3s');
    setTimeout(initNotifications, 3000);

    // Fallback polling отключен - используем только реальные FCM push-уведомления
    // Раскомментируй строку ниже если Firebase не работает и нужен fallback:
    // startDevPolling();

    console.log(
      '[PushPlugin] Using FCM push notifications (fallback polling disabled)'
    );
  });
});
