import { ref, readonly } from 'vue';
import { Capacitor } from '@capacitor/core';
import type { UpdatePolicyResponse } from '@/shared/dto/update-policy';

const CACHE_KEY = 'mentala.update-policy';
const CHECK_COOLDOWN_MS = 60_000;

// Глобальное состояние (singleton)
const forceUpdateRequired = ref(false);
const updateInfo = ref<UpdatePolicyResponse | null>(null);
let lastCheckTimestamp = 0;

/**
 * Composable для проверки update policy.
 * На mobile проверяет минимальную поддерживаемую версию.
 * На web — всегда ok.
 */
export function useUpdatePolicy() {
  const isNative = Capacitor.isNativePlatform();

  /**
   * Загружает кэшированный ответ из Preferences.
   * Вызывается на cold start, чтобы сразу показать blocker если он был.
   */
  async function loadCachedPolicy(): Promise<void> {
    if (!isNative) return;

    try {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key: CACHE_KEY });
      if (!value) return;

      const cached = JSON.parse(value) as UpdatePolicyResponse;
      updateInfo.value = cached;

      if (cached.status === 'required') {
        forceUpdateRequired.value = true;
      }
    } catch {
      // Preferences/JSON ошибка — не критично
    }
  }

  async function checkUpdatePolicy(): Promise<void> {
    // Web не проверяет update policy
    if (!isNative) return;

    // Debounce: не чаще 1 раза в 60 секунд
    const now = Date.now();
    if (now - lastCheckTimestamp < CHECK_COOLDOWN_MS) return;
    lastCheckTimestamp = now;

    try {
      const nuxtApp = useNuxtApp();
      const response = await nuxtApp.$api<UpdatePolicyResponse>(
        '/api/app/update-policy',
        { method: 'GET', suppressErrorToast: true } as any
      );

      updateInfo.value = response;

      // Обновляем флаг в обе стороны: и блокировка, и разблокировка (rollback)
      forceUpdateRequired.value = response.status === 'required';

      // Кэшируем успешный ответ
      try {
        const { Preferences } = await import('@capacitor/preferences');
        await Preferences.set({
          key: CACHE_KEY,
          value: JSON.stringify(response),
        });
      } catch {
        // Preferences может быть недоступен — не критично
      }
    } catch {
      // Fail-open: при ошибке сети продолжаем работу
    }
  }

  async function openStore(): Promise<void> {
    const url = updateInfo.value?.storeUrl;
    if (!url) return;

    try {
      const { InAppBrowser } = await import('@capacitor/inappbrowser');
      await InAppBrowser.openInExternalBrowser({ url });
    } catch {
      // Fallback если InAppBrowser недоступен
      try {
        window.open(url, '_blank');
      } catch {
        // Нечего делать
      }
    }
  }

  return {
    forceUpdateRequired: readonly(forceUpdateRequired),
    updateInfo: readonly(updateInfo),
    checkUpdatePolicy,
    loadCachedPolicy,
    openStore,
  };
}
