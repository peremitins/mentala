/**
 * Универсальное хранилище для сессионных данных
 * Работает на всех платформах: Web (sessionStorage), Android/iOS (Capacitor Preferences)
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_PREFIX = 'session_';

/**
 * Получить значение из сессионного хранилища
 */
export async function getSessionItem(key: string): Promise<string | null> {
  if (process.server) return null;

  const platform = Capacitor.getPlatform();
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // На мобильных платформах используем Capacitor Preferences
  if (platform === 'ios' || platform === 'android') {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      const result = await Preferences.get({ key: storageKey });
      return result.value;
    } catch (error) {
      console.error('[SessionStorage] Error getting from Preferences:', error);
      return null;
    }
  }

  // На веб-платформе используем sessionStorage
  try {
    return sessionStorage.getItem(storageKey);
  } catch (error) {
    console.error('[SessionStorage] Error getting from sessionStorage:', error);
    return null;
  }
}

/**
 * Установить значение в сессионное хранилище
 */
export async function setSessionItem(
  key: string,
  value: string
): Promise<void> {
  if (process.server) return;

  const platform = Capacitor.getPlatform();
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // На мобильных платформах используем Capacitor Preferences
  if (platform === 'ios' || platform === 'android') {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key: storageKey, value });
      return;
    } catch (error) {
      console.error('[SessionStorage] Error setting to Preferences:', error);
      return;
    }
  }

  // На веб-платформе используем sessionStorage
  try {
    sessionStorage.setItem(storageKey, value);
  } catch (error) {
    console.error('[SessionStorage] Error setting to sessionStorage:', error);
  }
}

/**
 * Удалить значение из сессионного хранилища
 */
export async function removeSessionItem(key: string): Promise<void> {
  if (process.server) return;

  const platform = Capacitor.getPlatform();
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // На мобильных платформах используем Capacitor Preferences
  if (platform === 'ios' || platform === 'android') {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: storageKey });
      return;
    } catch (error) {
      console.error('[SessionStorage] Error removing from Preferences:', error);
      return;
    }
  }

  // На веб-платформе используем sessionStorage
  try {
    sessionStorage.removeItem(storageKey);
  } catch (error) {
    console.error(
      '[SessionStorage] Error removing from sessionStorage:',
      error
    );
  }
}

/**
 * Синхронная версия для получения значения (только для веб-платформы)
 * Используется в обработчиках событий, которые не могут быть async (например, beforeunload)
 */
export function getSessionItemSync(key: string): string | null {
  if (process.server) return null;

  const platform = Capacitor.getPlatform();
  const storageKey = `${STORAGE_PREFIX}${key}`;

  // На мобильных платформах синхронный доступ невозможен, возвращаем null
  // В этом случае лучше использовать асинхронную версию
  if (platform === 'ios' || platform === 'android') {
    return null;
  }

  // На веб-платформе используем sessionStorage синхронно
  try {
    return sessionStorage.getItem(storageKey);
  } catch (error) {
    console.error('[SessionStorage] Error getting from sessionStorage:', error);
    return null;
  }
}
