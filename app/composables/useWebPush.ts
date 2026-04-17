/**
 * useWebPush — управление Web Push уведомлениями для PWA
 *
 * Отвечает за:
 * - Определение поддержки Web Push в текущем браузере/платформе
 * - Регистрацию Service Worker
 * - Получение FCM токена через Firebase Web SDK
 * - Регистрацию/обновление токена на сервере
 * - Очистку при logout
 *
 * НЕ используется на нативных платформах (iOS/Android Capacitor) —
 * там работает отдельный plugin push-notifications.client.ts
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  type Messaging,
} from 'firebase/messaging';

const INSTALLATION_ID_KEY = 'mentala.pwa.installation_id';
const WEB_PUSH_TOKEN_KEY = 'mentala.web.push_token';
// Флаг: пользователь явно включил web push на этом устройстве.
// Нужен потому что Notification.permission остаётся 'granted' даже после деактивации токена.
const WEB_PUSH_ACTIVE_KEY = 'mentala.web.push_active';

// ==========================================
// Firebase инициализация (ленивая, однократная)
// ==========================================

let _firebaseApp: FirebaseApp | null = null;
let _messaging: Messaging | null = null;

function getFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

function isFirebaseConfigured(): boolean {
  const config = getFirebaseConfig();
  return !!(
    config.apiKey &&
    config.projectId &&
    config.messagingSenderId &&
    config.appId
  );
}

function initFirebase(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  if (_firebaseApp) return _firebaseApp;

  try {
    const existingApps = getApps();
    _firebaseApp =
      existingApps.length > 0
        ? existingApps[0]
        : initializeApp(getFirebaseConfig());
    return _firebaseApp;
  } catch (e) {
    console.error('[WebPush] Firebase init error:', e);
    return null;
  }
}

function getFirebaseMessaging(): Messaging | null {
  if (_messaging) return _messaging;
  const app = initFirebase();
  if (!app) return null;
  try {
    _messaging = getMessaging(app);
    return _messaging;
  } catch (e) {
    console.error('[WebPush] getMessaging error:', e);
    return null;
  }
}

// ==========================================
// Утилиты
// ==========================================

/**
 * Генерирует или возвращает существующий installationId из localStorage.
 * UUID стабилен между визитами, теряется только при сбросе localStorage.
 */
function getOrCreateInstallationId(): string {
  if (typeof window === 'undefined') return '';
  const existing = localStorage.getItem(INSTALLATION_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(INSTALLATION_ID_KEY, id);
  return id;
}

/**
 * Определяет platformFamily на стороне клиента.
 * Нужно для корректной маршрутизации на сервере (native > pwa).
 */
function detectPlatformFamily(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent.toLowerCase();
  const isIos =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);

  if (isIos) return 'ios';
  if (isAndroid) return 'android';
  return 'desktop';
}

/**
 * Разделяет установленный PWA и обычную браузерную вкладку.
 * Это нужно для серверного приоритета native > pwa > browser.
 */
function detectWebChannelType(): 'pwa' | 'browser' {
  if (typeof window === 'undefined') return 'browser';

  const isIosStandalone =
    typeof navigator !== 'undefined' &&
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  const isStandaloneDisplayMode =
    typeof window.matchMedia === 'function' &&
    [
      '(display-mode: standalone)',
      '(display-mode: minimal-ui)',
      '(display-mode: fullscreen)',
    ].some((query) => window.matchMedia(query).matches);

  return isIosStandalone || isStandaloneDisplayMode ? 'pwa' : 'browser';
}

// ==========================================
// Foreground listener — модульный синглтон
//
// Firebase onMessage() НЕ дедуплицирует: каждый вызов добавляет новый слушатель.
// Если setupForegroundListener() вызвать дважды (из layout + из settings),
// каждое уведомление будет показано дважды.
// Решение: храним unsubscribe на уровне модуля — гарантируем один слушатель.
// ==========================================

let _foregroundListenerUnsubscribe: (() => void) | null = null;

// ==========================================
// Composable
// ==========================================

export function useWebPush() {
  const { $api } = useNuxtApp();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY;

  /**
   * Проверяет, поддерживает ли браузер Web Push API.
   * НЕ проверяет Firebase конфиг — только возможности браузера.
   * Используется для отображения UI (строки в настройках).
   */
  function isBrowserCapable(): boolean {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator)) return false;
    if (!('Notification' in window)) return false;
    if (!('PushManager' in window)) return false;
    return true;
  }

  /**
   * Проверяет, поддерживается ли Web Push полностью (браузер + Firebase конфиг).
   * Используется перед фактической регистрацией токена.
   */
  function isSupported(): boolean {
    if (!isBrowserCapable()) return false;
    if (!isFirebaseConfigured()) {
      console.warn(
        '[WebPush] Firebase config not set — web push disabled. ' +
          'Add VITE_FIREBASE_* env vars.'
      );
      return false;
    }
    if (!vapidKey) {
      console.warn('[WebPush] VITE_FIREBASE_VAPID_PUBLIC_KEY not set');
      return false;
    }
    return true;
  }

  /**
   * Возвращает true если пользователь явно включил web push на этом устройстве.
   * НЕ то же самое что Notification.permission === 'granted':
   * - permission может оставаться 'granted' после деактивации токена
   * - этот флаг отражает намерение пользователя
   */
  function isUserActivated(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(WEB_PUSH_ACTIVE_KEY) === 'true';
  }

  function setUserActivated(active: boolean): void {
    if (typeof window === 'undefined') return;
    if (active) {
      localStorage.setItem(WEB_PUSH_ACTIVE_KEY, 'true');
    } else {
      localStorage.removeItem(WEB_PUSH_ACTIVE_KEY);
    }
  }

  /**
   * Проверяет, запущено ли приложение как нативное (Capacitor).
   * Web Push не нужен на нативных платформах.
   */
  async function isNativePlatform(): Promise<boolean> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }

  /**
   * Возвращает регистрацию Service Worker.
   *
   * Стратегия:
   * 1. Сначала проверяем уже существующую регистрацию (PWA-режим, браузер уже зарегистрировал SW)
   * 2. Если не найдена — пробуем зарегистрировать вручную через /sw.js
   *
   * В dev-режиме /sw.js не собирается и возвращает HTML → регистрация упадёт.
   * В production/PWA SW уже установлен → шаг 1 найдёт его.
   */
  async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;

    // Шаг 1: используем уже установленный SW (PWA, после первой установки)
    try {
      const existing = await navigator.serviceWorker.getRegistration('/');
      if (existing) {
        console.log(
          '[WebPush] Using existing SW registration:',
          existing.scope
        );
        return existing;
      }
    } catch {
      // Игнорируем — попробуем зарегистрировать заново
    }

    // Шаг 2: пробуем зарегистрировать /sw.js (работает в production, падает в dev)
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[WebPush] SW registered:', reg.scope);
      return reg;
    } catch (e) {
      console.error('[WebPush] SW registration failed:', e);
      return null;
    }
  }

  /**
   * Получает текущий статус разрешения на уведомления.
   */
  function getPermissionStatus(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'default';
    }
    return Notification.permission;
  }

  /**
   * Запрашивает разрешение на уведомления у пользователя.
   * Вызывать только после осознанного действия пользователя.
   */
  async function requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    const result = await Notification.requestPermission();
    console.log('[WebPush] Permission result:', result);
    return result;
  }

  /**
   * Полный цикл: запрос разрешения → регистрация SW → получение FCM токена → отправка на сервер.
   * Вызывать только после явного согласия пользователя.
   *
   * @returns true если токен успешно зарегистрирован
   */
  async function enableWebPush(): Promise<boolean> {
    if (!isSupported()) return false;
    if (await isNativePlatform()) return false;

    // 1. Запрашиваем разрешение
    const permission = await requestPermission();
    if (permission !== 'granted') {
      console.log('[WebPush] Permission denied');
      return false;
    }

    const ok = await _registerToken();
    if (ok) {
      setUserActivated(true);
      setupForegroundListener();
    }
    return ok;
  }

  /**
   * Регистрирует токен предполагая что разрешение уже получено.
   * Использовать когда requestPermission() был вызван ДО этой функции
   * (чтобы не разрывать user gesture chain в браузере).
   *
   * @returns true если токен успешно зарегистрирован
   */
  async function enableWebPushWithPermission(): Promise<boolean> {
    if (!isSupported()) return false;
    if (await isNativePlatform()) return false;
    // Разрешение уже проверено вызывающим кодом — сразу идём к регистрации
    if (getPermissionStatus() !== 'granted') return false;

    const ok = await _registerToken();
    if (ok) {
      setUserActivated(true);
      setupForegroundListener();
    }
    return ok;
  }

  /**
   * Внутренняя функция: регистрирует SW, получает FCM токен и отправляет на сервер.
   * Вызывается при login (если разрешение уже выдано) и при enableWebPush.
   */
  async function _registerToken(): Promise<boolean> {
    // Регистрируем/получаем SW
    const swReg = await registerServiceWorker();
    if (!swReg) {
      console.error('[WebPush] Cannot register without SW');
      return false;
    }

    // Получаем FCM токен
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      console.error('[WebPush] Firebase messaging not available');
      return false;
    }

    let token: string;
    try {
      token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swReg,
      });
    } catch (e) {
      console.error('[WebPush] getToken error:', e);
      return false;
    }

    if (!token) {
      console.error('[WebPush] Empty FCM token received');
      return false;
    }

    // Кешируем токен локально
    localStorage.setItem(WEB_PUSH_TOKEN_KEY, token);

    // Отправляем на сервер
    try {
      await $api('/api/notifications/register-token', {
        method: 'POST',
        body: {
          token,
          platform: 'web',
          channelType: detectWebChannelType(),
          platformFamily: detectPlatformFamily(),
          installationId: getOrCreateInstallationId(),
        },
      });
      console.log('[WebPush] Token registered on server');
      return true;
    } catch (e) {
      console.error('[WebPush] Failed to register token on server:', e);
      return false;
    }
  }

  /**
   * Подписывается на foreground-уведомления (страница открыта).
   * Firebase доставляет сообщение в onMessage, а НЕ в onBackgroundMessage SW.
   * Без этого обработчика уведомления молча дропаются при открытой вкладке.
   *
   * ВАЖНО: onMessage() НЕ дедуплицирует — каждый вызов создаёт новый слушатель.
   * Используем модульный _foregroundListenerUnsubscribe для гарантии singleton.
   * Повторные вызовы безопасны — если слушатель уже есть, функция возвращает сразу.
   */
  function setupForegroundListener(): void {
    // Слушатель уже зарегистрирован — не добавляем дубль.
    if (_foregroundListenerUnsubscribe) {
      console.log('[WebPush] Foreground listener already active, skipping');
      return;
    }

    const messaging = getFirebaseMessaging();
    if (!messaging) return;

    _foregroundListenerUnsubscribe = onMessage(messaging, (payload) => {
      console.log('[WebPush] Foreground message received:', payload.messageId);

      const title =
        payload.notification?.title || payload.data?.title || 'Ментала';
      const body = payload.notification?.body || payload.data?.body || '';
      const icon = '/web-app-manifest-192x192.png';
      // data-only push: image приходит в payload.data.imageUrl
      const image =
        payload.notification?.image || payload.data?.imageUrl || null;

      // Показываем уведомление через SW (чтобы пользователь мог кликнуть)
      navigator.serviceWorker.ready
        .then((reg) => {
          const options: NotificationOptions = {
            body,
            icon,
            badge: '/notification-badge.png',
            data: payload.data || {},
            tag: payload.data?.slotId
              ? `slot-${payload.data.slotId}`
              : undefined,
          };
          if (image) (options as Record<string, unknown>).image = image;
          return reg.showNotification(title, options);
        })
        .catch((e) => {
          console.warn('[WebPush] Foreground showNotification failed:', e);
        });
    });

    console.log('[WebPush] Foreground listener registered');
  }

  /**
   * Восстанавливает регистрацию при login, если разрешение уже выдано.
   * Не запрашивает разрешение — только переregister если permission уже granted.
   */
  async function ensureRegisteredAfterLogin(): Promise<void> {
    if (!isSupported()) return;
    if (await isNativePlatform()) return;
    if (getPermissionStatus() !== 'granted') return;
    // Регистрируем только если пользователь явно включал push на этом устройстве
    if (!isUserActivated()) return;

    await _registerToken();
    setupForegroundListener();
  }

  /**
   * Деактивирует web push токен при logout.
   * Удаляет FCM токен из Firebase и вызывает unregister на сервере.
   */
  async function deactivateOnLogout(): Promise<void> {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem(WEB_PUSH_TOKEN_KEY);
    if (!token) return;

    // Удаляем токен с сервера
    try {
      await $api('/api/notifications/unregister-token', {
        method: 'POST',
        body: { token },
      });
    } catch (e) {
      // Не блокируем logout при ошибке
      console.warn('[WebPush] Failed to unregister token on server:', e);
    }

    // Удаляем FCM токен из Firebase (опционально)
    try {
      const messaging = getFirebaseMessaging();
      if (messaging) {
        await deleteToken(messaging);
      }
    } catch (e) {
      console.warn('[WebPush] Failed to delete FCM token:', e);
    }

    localStorage.removeItem(WEB_PUSH_TOKEN_KEY);
    setUserActivated(false);

    // Отписываемся от foreground listener чтобы не получать уведомления после logout
    if (_foregroundListenerUnsubscribe) {
      _foregroundListenerUnsubscribe();
      _foregroundListenerUnsubscribe = null;
    }

    console.log('[WebPush] Token deactivated on logout');
  }

  return {
    isBrowserCapable,
    isSupported,
    isNativePlatform,
    isUserActivated,
    getPermissionStatus,
    requestPermission,
    enableWebPush,
    enableWebPushWithPermission,
    ensureRegisteredAfterLogin,
    setupForegroundListener,
    deactivateOnLogout,
  };
}
