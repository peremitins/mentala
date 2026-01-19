/**
 * Универсальное хранилище для постоянных данных
 * Работает на всех платформах: Web (localStorage), Android/iOS (Capacitor Preferences)
 */
import { Capacitor } from '@capacitor/core';

const STORAGE_PREFIX = 'persistent_';

/**
 * Получить значение из постоянного хранилища
 */
export async function getPersistentItem(key: string): Promise<string | null> {
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
      console.error('[PersistentStorage] Error getting from Preferences:', error);
      return null;
    }
  }

  // На веб-платформе используем localStorage
  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.error('[PersistentStorage] Error getting from localStorage:', error);
    return null;
  }
}

/**
 * Установить значение в постоянное хранилище
 */
export async function setPersistentItem(
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
      console.error('[PersistentStorage] Error setting to Preferences:', error);
      return;
    }
  }

  // На веб-платформе используем localStorage
  try {
    localStorage.setItem(storageKey, value);
  } catch (error) {
    console.error('[PersistentStorage] Error setting to localStorage:', error);
  }
}

/**
 * Удалить значение из постоянного хранилища
 */
export async function removePersistentItem(key: string): Promise<void> {
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
      console.error('[PersistentStorage] Error removing from Preferences:', error);
      return;
    }
  }

  // На веб-платформе используем localStorage
  try {
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error('[PersistentStorage] Error removing from localStorage:', error);
  }
}
