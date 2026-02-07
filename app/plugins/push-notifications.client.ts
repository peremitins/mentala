import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  InteractionAction,
  NotificationNavigation,
} from '@/shared/dto/notifications';

export default defineNuxtPlugin((nuxtApp) => {
  // Работаем только на мобильных платформах
  const platform = Capacitor.getPlatform();
  if (platform === 'web') return;

  const NON_NAV_ACTIONS = new Set(['yes', 'no', 'later']);

  function isTapAction(actionId?: string | null): boolean {
    // Считаем тапом все, что не является action-кнопкой snooze/yes/no/later.
    if (!actionId) return true;
    if (NON_NAV_ACTIONS.has(actionId)) return false;
    if (actionId.startsWith('snooze:')) return false;
    return true;
  }

  function normalizeNavigation(raw: unknown): NotificationNavigation | null {
    if (!raw || typeof raw !== 'object') return null;
    const type =
      typeof (raw as { type?: unknown }).type === 'string'
        ? String((raw as { type?: unknown }).type).trim()
        : '';
    if (!type) return null;

    if (type === 'home') {
      return { type: 'home' };
    }

    if (type === 'meditation_track') {
      const trackId =
        typeof (raw as { trackId?: unknown }).trackId === 'string'
          ? String((raw as { trackId?: unknown }).trackId).trim()
          : '';
      return trackId ? { type: 'meditation_track', trackId } : null;
    }

    if (type === 'breath_practices') {
      return { type: 'breath_practices' };
    }

    if (type === 'breath_practice') {
      const slug =
        typeof (raw as { slug?: unknown }).slug === 'string'
          ? String((raw as { slug?: unknown }).slug).trim()
          : '';
      return slug ? { type: 'breath_practice', slug } : null;
    }

    return null;
  }

  function resolveNavigation(
    data?: Record<string, any>
  ): NotificationNavigation | null {
    if (!data) return null;

    if (typeof data.navigation === 'string' && data.navigation.trim()) {
      try {
        const parsed = JSON.parse(data.navigation) as unknown;
        const normalized = normalizeNavigation(parsed);
        if (normalized) return normalized;
      } catch {
        // Ошибки парсинга не блокируют fallback.
      }
    }

    if (data.navigation && typeof data.navigation === 'object') {
      const normalized = normalizeNavigation(data.navigation);
      if (normalized) return normalized;
    }

    const navType =
      typeof data.navType === 'string' ? data.navType.trim() : '';
    const navId = typeof data.navId === 'string' ? data.navId.trim() : '';
    if (!navType) return null;

    if (navType === 'home') {
      return { type: 'home' };
    }

    if (navType === 'meditation_track' && navId) {
      return { type: 'meditation_track', trackId: navId };
    }

    if (navType === 'breath_practices') {
      return { type: 'breath_practices' };
    }

    if (navType === 'breath_practice' && navId) {
      return { type: 'breath_practice', slug: navId };
    }

    return null;
  }

  function buildPathFromNavigation(
    navigation: NotificationNavigation
  ): string {
    // Приводим navigation к пути внутри приложения.
    switch (navigation.type) {
      case 'meditation_track':
        return `/meditations?trackId=${encodeURIComponent(
          navigation.trackId
        )}`;
      case 'breath_practice':
        return `/breath-practices/${encodeURIComponent(
          navigation.slug
        )}${navigation.slug === '4-7-8' ? '?group=popular' : ''}`;
      case 'breath_practices':
        return '/breath-practices';
      default:
        return '/';
    }
  }

  function normalizeTargetPath(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '/';

    let path = trimmed;
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        path = `${parsed.pathname}${parsed.search}`;
      } catch {
        path = trimmed;
      }
    }

    // Убираем лишний "/" перед "?" (например: /meditations/?trackId=...).
    path = path.replace('/?', '?');

    if (!path.startsWith('/')) {
      path = `/${path}`;
    }

    return path || '/';
  }

  async function navigateToTarget(targetPath: string) {
    try {
      const normalized = normalizeTargetPath(targetPath);
      await nuxtApp.$router.isReady();
      if (nuxtApp.$router.currentRoute.value.fullPath === normalized) {
        return;
      }
      await nuxtApp.$router.push(normalized);
    } catch (error) {
      console.error('[PushPlugin] Failed to navigate:', error);
    }
  }

  function resolveNavigationId(
    navigation: NotificationNavigation | null
  ): string | null {
    if (!navigation) return null;
    if ('trackId' in navigation) return navigation.trackId;
    if ('slug' in navigation) return navigation.slug;
    return null;
  }

  // TODO: Раскомментировать когда Firebase будет настроен
  // TEMPORARY: Полностью отключаем push уведомления до настройки Firebase
  // console.warn('[PushPlugin] Push notifications temporarily disabled - Firebase not configured');
  // return;

  // Создаём канал уведомлений с высоким приоритетом для Android (O+)
  const ensureHighPriorityChannel = async () => {
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

      // Регистрируем на сервере (только если есть сессия)
      try {
        const sessionToken =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('mentai.session.token')
            : null;
        if (!sessionToken) {
          console.log(
            '[PushPlugin] Skip token registration: no session token yet'
          );
          return;
        }

        const config = useRuntimeConfig();
        const baseURL =
          typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : (config.public as any).apiBase || '';
        const timezone =
          typeof Intl !== 'undefined' &&
          Intl.DateTimeFormat &&
          typeof Intl.DateTimeFormat === 'function'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone ||
              'Europe/Moscow'
            : 'Europe/Moscow';

        await $fetch(`${baseURL}/api/notifications/register-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Token': sessionToken,
            'X-Platform': platform === 'ios' ? 'ios' : 'android',
            'X-Timezone': timezone,
          },
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
        const data = notification.data as Record<string, any> | undefined;
        // На разных платформах данные могут оказаться в root, а не в data.
        // Собираем единый payload с приоритетом data.
        const payload = {
          ...(notification as Record<string, any>),
          ...(data ?? {}),
        } as Record<string, any>;
        const actionId = action.actionId || '';
        const isTap = isTapAction(actionId);
        const navigation = resolveNavigation(payload);

        // Трекинг взаимодействия
        if (payload?.slotId) {
          let actionType: InteractionAction = 'dismissed';

          // Определяем тип действия
          if (isTap) {
            actionType = 'open';
          } else if (actionId === 'yes') {
            actionType = 'yes';
          } else if (actionId === 'no') {
            actionType = 'no';
          } else if (
            actionId === 'later' ||
            actionId.startsWith('snooze:')
          ) {
            actionType = 'later';

            // Если это snooze — отправляем запрос на отложение
            const duration = actionId.replace('snooze:', '') as
              | '15m'
              | '1h'
              | '4h'
              | 'tomorrow';
            try {
              const nuxtApp = useNuxtApp();
              await nuxtApp.$api('/api/notifications/snooze', {
                method: 'POST',
                body: {
                  kind: payload.kind || 'therapy',
                  duration,
                  entityKey: payload.entityKey || null,
                },
              });
              console.log('[PushPlugin] Notification snoozed:', duration);
            } catch (error) {
              console.error('[PushPlugin] Failed to snooze:', error);
            }
          }

          // Отправляем трекинг взаимодействия
          try {
            const nuxtApp = useNuxtApp();
            await nuxtApp.$api('/api/notifications/interaction', {
              method: 'POST',
              body: {
                slotId: payload.slotId,
                action: actionType,
                at: new Date().toISOString(),
                meta: {
                  platform,
                  actionId,
                  navigationType: navigation?.type ?? null,
                  navigationId: resolveNavigationId(navigation),
                },
              },
            });
            console.log('[PushPlugin] Interaction tracked:', actionType);
          } catch (error) {
            console.error('[PushPlugin] Failed to track interaction:', error);
          }
        }

        // Навигация выполняется только при системном тапе.
        if (isTap) {
          const deepLink =
            typeof payload?.deepLink === 'string' && payload.deepLink.trim()
              ? payload.deepLink.trim()
              : null;
          const targetPath = navigation
            ? buildPathFromNavigation(navigation)
            : deepLink || '/';

          await navigateToTarget(targetPath);
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

  // Используем Nuxt хук для отложенной инициализации после полной загрузки
  nuxtApp.hook('app:mounted', () => {
    console.log('[PushPlugin] App mounted, scheduling notification init in 3s');
    setTimeout(initNotifications, 3000);

    // Fallback polling отключен - используем только реальные FCM push-уведомления

    console.log(
      '[PushPlugin] Using FCM push notifications (fallback polling disabled)'
    );
  });
});
