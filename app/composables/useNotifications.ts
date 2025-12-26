import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';

export function useNotifications() {
  let channelPrepared = false;
  const isAvailable = computed(() => {
    const platform = Capacitor.getPlatform();
    return platform === 'ios' || platform === 'android';
  });

  /**
   * Планирует локальное уведомление
   */
  async function scheduleLocalNotification(options: {
    title: string;
    body: string;
    id?: number;
    schedule?: { at: Date };
  }) {
    if (!isAvailable.value) {
      console.warn('Notifications are not available on this platform');
      return false;
    }

    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display !== 'granted') {
        const requestResult = await LocalNotifications.requestPermissions();
        if (requestResult.display !== 'granted') {
          console.warn('Notification permission denied');
          return false;
        }
      }

      // Генерируем валидный для Android int идентификатор (Java int: -2_147_483_648..2_147_483_647)
      // Date.now() слишком велик, поэтому берём по модулю MAX_INT
      const MAX_INT = 2147483647;
      const safeId =
        typeof options.id === 'number'
          ? options.id
          : Math.floor(Date.now() % MAX_INT);

      // Готовим high-priority канал для heads-up уведомлений на Android
      if (!channelPrepared) {
        try {
          await LocalNotifications.createChannel?.({
            id: 'mentai_high',
            name: 'Mentala High Priority',
            description: 'Важные уведомления Mentala',
            importance: 5, // IMPORTANCE_HIGH
            visibility: 1, // VISIBILITY_PUBLIC
            sound: 'default',
            lights: true,
            vibration: true,
          } as any);
        } catch {}
        channelPrepared = true;
      }

      await LocalNotifications.schedule({
        notifications: [
          {
            title: options.title,
            body: options.body,
            id: safeId,
            schedule: options.schedule,
            sound: 'default',
            channelId: 'mentai_high',
            attachments: undefined,
            actionTypeId: '',
            extra: undefined,
          },
        ],
      });

      return true;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return false;
    }
  }

  /**
   * Отправляет уведомление сразу
   */
  async function sendNotification(title: string, body: string) {
    return await scheduleLocalNotification({
      title,
      body,
    });
  }

  /**
   * Получает токен для push уведомлений
   */
  async function getPushToken(): Promise<string | null> {
    if (!isAvailable.value) return null;

    try {
      // Проверяем сохраненный токен
      if (typeof window !== 'undefined') {
        const savedToken = window.localStorage.getItem('pushToken');
        if (savedToken) return savedToken;
      }

      // Если токена нет, регистрируемся заново
      await PushNotifications.register();
      // Токен придет через событие 'registration'
      return null;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  }

  /**
   * Проверяет статус разрешений
   */
  async function checkPermissions() {
    if (!isAvailable.value) {
      return {
        push: 'denied' as const,
        local: 'denied' as const,
      };
    }

    try {
      const pushPerm = await PushNotifications.checkPermissions();
      const localPerm = await LocalNotifications.checkPermissions();

      return {
        push: pushPerm.receive,
        local: localPerm.display,
      };
    } catch (error) {
      console.error('Error checking permissions:', error);
      return {
        push: 'denied' as const,
        local: 'denied' as const,
      };
    }
  }

  /**
   * Отменяет запланированные уведомления
   */
  async function cancelNotification(id: number) {
    if (!isAvailable.value) return;

    try {
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  /**
   * Отменяет все уведомления
   */
  async function cancelAll() {
    if (!isAvailable.value) return;

    try {
      await LocalNotifications.cancel({ notifications: [] });
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  return {
    isAvailable,
    scheduleLocalNotification,
    sendNotification,
    getPushToken,
    checkPermissions,
    cancelNotification,
    cancelAll,
  };
}
