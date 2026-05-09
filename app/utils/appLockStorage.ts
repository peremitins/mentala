import type { SecureStoragePlugin } from '@aparajita/capacitor-secure-storage';
import type { AppLockRecord } from './appLockCrypto';
import { isValidAppLockRecord } from './appLockCrypto';

const APP_LOCK_STORAGE_PREFIX = 'mentala.app_lock.v1';
const NATIVE_STORAGE_TIMEOUT_MS = 1500;

type NativeSecureStorageRef = {
  plugin: SecureStoragePlugin;
};

export function getAppLockStorageKey(userId: number): string {
  return `${APP_LOCK_STORAGE_PREFIX}.user.${userId}`;
}

export async function loadAppLockRecord(
  userId: number
): Promise<AppLockRecord | null> {
  const rawValue = await readAppLockStorageValue(getAppLockStorageKey(userId));
  if (!rawValue) return null;

  try {
    const record = JSON.parse(rawValue);
    return isValidAppLockRecord(record) && record.userId === userId
      ? record
      : null;
  } catch {
    return null;
  }
}

export async function saveAppLockRecord(record: AppLockRecord): Promise<void> {
  await writeAppLockStorageValue(
    getAppLockStorageKey(record.userId),
    JSON.stringify(record)
  );
}

export async function removeAppLockRecord(userId: number): Promise<void> {
  await removeAppLockStorageValue(getAppLockStorageKey(userId));
}

async function readAppLockStorageValue(key: string): Promise<string | null> {
  const nativeStorage = await resolveNativeSecureStorage();
  if (nativeStorage) {
    try {
      return await withNativeStorageTimeout(nativeStorage.plugin.getItem(key));
    } catch (error) {
      console.warn('[AppLock] SecureStorage read fallback:', error);
    }
  }

  return getWebStorage()?.getItem(key) ?? null;
}

async function writeAppLockStorageValue(
  key: string,
  value: string
): Promise<void> {
  const nativeStorage = await resolveNativeSecureStorage();
  if (nativeStorage) {
    try {
      await withNativeStorageTimeout(nativeStorage.plugin.setItem(key, value));
      return;
    } catch (error) {
      console.warn('[AppLock] SecureStorage write fallback:', error);
    }
  }

  const storage = getWebStorage();
  if (!storage) {
    throw new Error('Локальное хранилище недоступно');
  }

  storage.setItem(key, value);
}

async function removeAppLockStorageValue(key: string): Promise<void> {
  const nativeStorage = await resolveNativeSecureStorage();
  if (nativeStorage) {
    try {
      await withNativeStorageTimeout(nativeStorage.plugin.removeItem(key));
      return;
    } catch (error) {
      console.warn('[AppLock] SecureStorage remove fallback:', error);
    }
  }

  getWebStorage()?.removeItem(key);
}

async function resolveNativeSecureStorage(): Promise<NativeSecureStorageRef | null> {
  if (typeof window === 'undefined') return null;

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    if (!Capacitor.isPluginAvailable('SecureStorage')) return null;

    const { SecureStorage } = await import(
      '@aparajita/capacitor-secure-storage'
    );
    // Capacitor plugin proxy нельзя возвращать напрямую из async-функции:
    // Promise resolution попытается прочитать `.then` и вызовет plugin method `then`.
    return { plugin: SecureStorage };
  } catch (error) {
    console.warn('[AppLock] SecureStorage unavailable:', error);
    return null;
  }
}

async function withNativeStorageTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('SecureStorage timeout'));
        }, NATIVE_STORAGE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getWebStorage(): Storage | null {
  if (typeof window === 'undefined') return null;

  try {
    const probeKey = `${APP_LOCK_STORAGE_PREFIX}.probe`;
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    return null;
  }
}
