/**
 * Composable для recovery push-уведомлений.
 *
 * Определяет состояние: "пользователю нужны push, но разрешение не выдано"
 * и показывает recovery UI (dialog + banner).
 *
 * Два механизма подавления диалога:
 * - deferToNextLaunch() — пропуск в онбординге: диалог не показывается в текущей сессии,
 *   но появится при следующем холодном запуске приложения.
 * - dismissRecovery() — явное "Позже" в recovery-диалоге: cooldown 3 дня.
 *
 * Banner показывается всегда, пока проблема не решена.
 */
import { ref, computed, triggerRef } from 'vue';
import { usePushSettings } from '@/app/composables/usePushSettings';
import { usePushPermissionGate } from '@/app/composables/usePushPermissionGate';
import { useAuthStore } from '@/app/stores/auth';
import { useNotificationsStore } from '@/app/stores/notifications';

const DISMISSED_AT_KEY = 'mentai.push.recovery.dismissedAt';
const DEFER_NEXT_LAUNCH_KEY = 'mentai.push.recovery.deferNextLaunch';
const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 дня

// Синглтон-состояние, чтобы не дублировать между layout и страницами
const needsRecovery = ref(false);
const checked = ref(false);

export function usePushRecovery() {
  const pushSettings = usePushSettings();
  const permissionGate = usePushPermissionGate();
  const auth = useAuthStore();
  const notificationsStore = useNotificationsStore();

  const showRecoveryDialog = computed(() => {
    if (!needsRecovery.value) return false;
    return !isCooldownActive();
  });

  const showRecoveryBanner = computed(() => needsRecovery.value);

  function isCooldownActive(): boolean {
    if (typeof window === 'undefined') return false;
    const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    const dismissed = Number(raw);
    if (Number.isNaN(dismissed)) return false;
    return Date.now() - dismissed < COOLDOWN_MS;
  }

  function dismissRecovery() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    }
    // Триггерим реактивное обновление, чтобы showRecoveryDialog пересчитался
    triggerRef(needsRecovery);
  }

  /**
   * Откладывает показ диалога до следующего холодного запуска.
   * Используется когда пользователь явно пропускает уведомления в онбординге —
   * не хотим показывать диалог сразу, но покажем при следующем открытии приложения.
   */
  function deferToNextLaunch() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEFER_NEXT_LAUNCH_KEY, '1');
    }
  }

  async function attemptRecovery(): Promise<void> {
    if (!pushSettings.isNative.value) return;

    await pushSettings.refreshPermissionStatus();

    if (pushSettings.pushPermissionStatus.value === 'denied') {
      // OS разрешение уже отклонено — ведём в системные настройки
      await permissionGate.openSystemSettings();
    } else {
      // prompt или null — запрашиваем через стандартный flow
      const enabled = await pushSettings.enablePushInApp();
      if (enabled) {
        needsRecovery.value = false;
        clearCooldown();
      }
    }

    // Перепроверяем после возврата из настроек
    await pushSettings.refreshPermissionStatus();
    if (pushSettings.pushPermissionStatus.value === 'granted') {
      needsRecovery.value = false;
      clearCooldown();
    }
  }

  function clearCooldown() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DISMISSED_AT_KEY);
    }
  }

  async function checkRecoveryStatus(): Promise<void> {
    if (checked.value) return;
    if (!pushSettings.isNative.value) return;

    if (!auth.isLoggedIn || !auth.user) return;
    if (auth.user.onboarding?.welcome !== true) return;

    // Пользователь пропустил уведомления в онбординге — откладываем до следующего холодного запуска.
    // Флаг потребляется и удаляется здесь, чтобы при следующем запуске диалог уже показался.
    if (typeof window !== 'undefined' && window.localStorage.getItem(DEFER_NEXT_LAUNCH_KEY)) {
      window.localStorage.removeItem(DEFER_NEXT_LAUNCH_KEY);
      checked.value = true;
      return;
    }

    await pushSettings.refreshPermissionStatus();

    if (pushSettings.pushPermissionStatus.value === 'granted') {
      needsRecovery.value = false;
      checked.value = true;
      return;
    }

    // Загружаем preferences, если ещё не загружены
    if (notificationsStore.preferences.length === 0) {
      try {
        await notificationsStore.fetchAll();
      } catch {
        // Если не удалось загрузить — не показываем recovery
        checked.value = true;
        return;
      }
    }

    // Ключевой маркер: у пользователя есть хотя бы одна настройка уведомлений.
    // Это отличает returning user от нового (у нового preferences пусто).
    const hasAnyPreferences = notificationsStore.preferences.length > 0;

    needsRecovery.value = hasAnyPreferences;
    checked.value = true;
  }

  /** Сброс состояния (при logout) */
  function reset() {
    needsRecovery.value = false;
    checked.value = false;
  }

  return {
    needsRecovery,
    showRecoveryDialog,
    showRecoveryBanner,
    dismissRecovery,
    deferToNextLaunch,
    attemptRecovery,
    checkRecoveryStatus,
    reset,
  };
}
