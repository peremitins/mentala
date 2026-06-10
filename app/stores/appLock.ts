import { defineStore } from 'pinia';
import {
  APP_LOCK_AFTER_OPTIONS,
  createAppLockRecord,
  normalizeAppLockAfterSeconds,
  verifyAppLockPin,
} from '../utils/appLockCrypto';
import type {
  AppLockAfterSeconds,
  AppLockRecord,
} from '../utils/appLockCrypto';
import {
  getFailedAttemptState,
  getRemainingCooldownSeconds,
  shouldLockAfterBackground,
} from '../utils/appLockPolicy';
import {
  loadAppLockRecord,
  removeAppLockRecord,
  saveAppLockRecord,
} from '../utils/appLockStorage';

type AppLockSetupMode = 'create' | 'change' | null;

type AppLockBiometryType =
  | 'face'
  | 'fingerprint'
  | 'iris'
  | 'multiple'
  | 'unknown';

type AppLockBiometryState = {
  available: boolean;
  type: AppLockBiometryType;
  label: string;
};

const DEFAULT_BIOMETRY_STATE: AppLockBiometryState = {
  available: false,
  type: 'unknown',
  label: 'Недоступна',
};

const BIOMETRIC_AVAILABILITY_TIMEOUT_MS = 1_500;
const BIOMETRIC_VERIFY_TIMEOUT_MS = 20_000;

export const useAppLockStore = defineStore('appLock', {
  state: () => ({
    initialized: false,
    activeUserId: null as number | null,
    record: null as AppLockRecord | null,
    setupRequired: false,
    setupMode: null as AppLockSetupMode,
    isLocked: false,
    lockAfterSeconds: 60 as AppLockAfterSeconds,
    failedAttempts: 0,
    lockedUntil: null as number | null,
    shouldOfferLogout: false,
    errorMessage: '',
    backgroundedAt: null as number | null,
    isPrivacyOverlayVisible: false,
    biometric: { ...DEFAULT_BIOMETRY_STATE } as AppLockBiometryState,
    // Становится true после первого resolve проверки доступности биометрии.
    // Пока false — gate показывает нейтральный спиннер вместо PIN-экрана,
    // чтобы PIN не мелькал перед автозапуском системного отпечатка.
    biometricChecked: false,
    biometricPromptInFlight: false,
    biometricPromptedForCurrentLock: false,
    initializationRunId: 0,
    // userId, для которого инициализация сейчас в полёте. Защищает от
    // повторного clearRuntime/init-цикла (и визуального мерцания gate),
    // когда watcher срабатывает несколько раз за время async-загрузки record.
    initializationInFlightUserId: null as number | null,
  }),
  getters: {
    shouldShowGate: (state) =>
      Boolean(
        state.activeUserId &&
          (!state.initialized ||
            state.setupRequired ||
            state.setupMode ||
            state.isLocked ||
            state.isPrivacyOverlayVisible)
      ),
    canShowPrivateContent: (state) =>
      Boolean(
        state.activeUserId &&
          state.initialized &&
          !state.setupRequired &&
          !state.setupMode &&
          !state.isLocked &&
          !state.isPrivacyOverlayVisible
      ),
    remainingCooldownSeconds: (state) =>
      getRemainingCooldownSeconds(state.lockedUntil, Date.now()),
    lockAfterOptions: () => APP_LOCK_AFTER_OPTIONS,
  },
  actions: {
    async initializeForUser(userId: number | null) {
      if (!userId) {
        this.clearRuntime();
        return;
      }

      if (this.initialized && this.activeUserId === userId) return;
      // Инициализация для этого пользователя уже идёт — не перезапускаем её,
      // иначе каждый повторный вызов (route-watcher на старте срабатывает
      // несколько раз) делает clearRuntime → gate мерцает.
      if (this.initializationInFlightUserId === userId) return;

      this.clearRuntime();
      const runId = this.initializationRunId + 1;
      this.initializationRunId = runId;
      this.activeUserId = userId;
      this.initializationInFlightUserId = userId;

      let record: AppLockRecord | null = null;
      try {
        record = await loadAppLockRecord(userId);
      } catch (error) {
        console.warn(
          '[AppLock] Не удалось загрузить локальный lock-record:',
          error
        );
      }

      if (!this.isCurrentInitialization(runId, userId)) return;
      this.initializationInFlightUserId = null;

      if (!record) {
        this.initialized = true;
        this.setupRequired = true;
        this.setupMode = 'create';
        this.isLocked = false;
        void this.refreshBiometricAvailability();
        return;
      }

      this.record = record;
      this.lockAfterSeconds = normalizeAppLockAfterSeconds(
        record.lockAfterSeconds
      );
      this.initialized = true;
      this.setupRequired = false;
      this.setupMode = null;
      this.lockNow();
      void this.refreshBiometricAvailability();
    },

    isCurrentInitialization(runId: number, userId: number) {
      return this.initializationRunId === runId && this.activeUserId === userId;
    },

    startSetup(mode: Exclude<AppLockSetupMode, null>) {
      if (!this.activeUserId) return;
      this.setupMode = mode;
      this.setupRequired = mode === 'create';
      this.errorMessage = '';
    },

    cancelChangeCode() {
      if (this.setupMode !== 'change') return;
      this.setupMode = null;
      this.errorMessage = '';
    },

    async createOrReplacePin(pin: string) {
      if (!this.activeUserId) return false;

      try {
        const now = Date.now();
        const existingCreatedAt = this.record?.createdAt ?? now;
        const record = await createAppLockRecord(this.activeUserId, pin, {
          now,
          lockAfterSeconds: this.lockAfterSeconds,
        });
        record.createdAt = existingCreatedAt;
        await saveAppLockRecord(record);

        this.record = record;
        this.initialized = true;
        this.setupRequired = false;
        this.setupMode = null;
        this.isLocked = false;
        this.resetFailedAttempts();
        void this.refreshBiometricAvailability();
        return true;
      } catch (error) {
        console.error('[AppLock] Не удалось сохранить локальный код:', error);
        this.errorMessage = 'Не удалось сохранить код. Попробуйте ещё раз.';
        return false;
      }
    },

    async unlockWithPin(pin: string) {
      if (!this.record) return false;

      const now = Date.now();
      const cooldownSeconds = getRemainingCooldownSeconds(
        this.lockedUntil,
        now
      );
      if (cooldownSeconds > 0) {
        this.errorMessage = `Повторите попытку через ${cooldownSeconds} сек.`;
        return false;
      }

      const isValid = await verifyAppLockPin(this.record, pin);
      if (isValid) {
        this.unlock();
        return true;
      }

      const failedState = getFailedAttemptState(this.failedAttempts, now);
      this.failedAttempts = failedState.failedAttempts;
      this.lockedUntil = failedState.lockedUntil;
      this.shouldOfferLogout = failedState.shouldOfferLogout;
      this.errorMessage = failedState.lockedUntil
        ? 'Слишком много попыток. Код можно ввести снова через 30 секунд.'
        : 'Неверный код.';
      return false;
    },

    lockNow() {
      if (!this.record || this.setupRequired) return;
      this.isLocked = true;
      this.biometricPromptedForCurrentLock = false;
      this.errorMessage = '';
    },

    unlock() {
      this.isLocked = false;
      this.isPrivacyOverlayVisible = false;
      this.backgroundedAt = null;
      this.biometricPromptedForCurrentLock = false;
      this.resetFailedAttempts();
      // После анлока (особенно через BiometricPrompt, который не вызывает
      // onResume) геометрия вьюпорта могла «протухнуть» — просим native
      // safe-area плагин пересчитать инсеты и перелейаутить WebView.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('mentala:safe-area-refresh'));
      }
    },

    handleAppHidden() {
      if (!this.activeUserId) return;
      // Системный BiometricPrompt — отдельное окно: пока он показан, Activity
      // уходит в pause и appStateChange сообщает «hidden». Это НЕ уход в фон:
      // если отреагировать (privacy overlay + мгновенный lock при lockAfter=0),
      // получаем мерцание gate и цикл повторных биометрических промптов.
      if (this.biometricPromptInFlight) return;
      this.backgroundedAt = Date.now();
      this.isPrivacyOverlayVisible = true;
      if (this.record && this.lockAfterSeconds === 0) {
        this.lockNow();
      }
    },

    handleAppVisible() {
      // Возврат фокуса после закрытия BiometricPrompt — не возврат из фона.
      if (this.biometricPromptInFlight) return;
      const now = Date.now();
      const mustLock = shouldLockAfterBackground(
        this.backgroundedAt,
        now,
        this.lockAfterSeconds
      );

      this.isPrivacyOverlayVisible = false;
      if (this.record && mustLock) {
        this.lockNow();
      }

      this.backgroundedAt = null;
    },

    async setLockAfterSeconds(value: AppLockAfterSeconds) {
      const normalized = normalizeAppLockAfterSeconds(value);
      this.lockAfterSeconds = normalized;

      if (!this.record) return;

      const updatedRecord: AppLockRecord = {
        ...this.record,
        lockAfterSeconds: normalized,
        updatedAt: Date.now(),
      };
      await saveAppLockRecord(updatedRecord);
      this.record = updatedRecord;
    },

    async refreshBiometricAvailability() {
      try {
        this.biometric = await resolveBiometricAvailability();
      } catch (error) {
        console.warn('[AppLock] Не удалось проверить биометрию:', error);
        this.biometric = { ...DEFAULT_BIOMETRY_STATE };
      } finally {
        this.biometricChecked = true;
      }
    },

    async attemptBiometricUnlock(options: { force?: boolean } = {}) {
      if (
        !this.record ||
        !this.isLocked ||
        !this.biometric.available ||
        this.biometricPromptInFlight ||
        (this.biometricPromptedForCurrentLock && !options.force)
      ) {
        return false;
      }

      this.biometricPromptInFlight = true;
      this.biometricPromptedForCurrentLock = true;
      try {
        const { NativeBiometric } = await import(
          '@capgo/capacitor-native-biometric'
        );
        const verified = await withTimeout(
          NativeBiometric.verifyIdentity({
            title: 'Вход в Mentala',
            subtitle: 'Подтвердите личность',
            description: 'Это обязательная защита личных данных на устройстве.',
            negativeButtonText: 'Ввести код',
            useFallback: false,
            fallbackTitle: 'Ввести код',
            maxAttempts: 1,
          }).then(() => true),
          BIOMETRIC_VERIFY_TIMEOUT_MS,
          false
        );

        if (!verified) return false;

        this.unlock();
        return true;
      } catch {
        this.errorMessage = '';
        return false;
      } finally {
        this.biometricPromptInFlight = false;
      }
    },

    async removeLocalRecord(userId?: number | null) {
      // Удаление persisted record вызывается только из явного reset/deletion flow.
      const userIdToReset = userId ?? this.activeUserId;
      if (userIdToReset) {
        await removeAppLockRecord(userIdToReset);
      }
      this.clearRuntime();
    },

    clearRuntime() {
      this.initializationRunId += 1;
      this.initialized = false;
      this.activeUserId = null;
      this.record = null;
      this.setupRequired = false;
      this.setupMode = null;
      this.isLocked = false;
      this.lockAfterSeconds = 60;
      this.failedAttempts = 0;
      this.lockedUntil = null;
      this.shouldOfferLogout = false;
      this.errorMessage = '';
      this.backgroundedAt = null;
      this.isPrivacyOverlayVisible = false;
      this.biometric = { ...DEFAULT_BIOMETRY_STATE };
      this.biometricChecked = false;
      this.biometricPromptInFlight = false;
      this.biometricPromptedForCurrentLock = false;
      this.initializationInFlightUserId = null;
    },

    resetFailedAttempts() {
      this.failedAttempts = 0;
      this.lockedUntil = null;
      this.shouldOfferLogout = false;
      this.errorMessage = '';
    },
  },
});

async function resolveBiometricAvailability(): Promise<AppLockBiometryState> {
  if (typeof window === 'undefined') return { ...DEFAULT_BIOMETRY_STATE };

  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return { ...DEFAULT_BIOMETRY_STATE };
    if (!Capacitor.isPluginAvailable('NativeBiometric')) {
      return { ...DEFAULT_BIOMETRY_STATE };
    }

    const { NativeBiometric } = await import(
      '@capgo/capacitor-native-biometric'
    );
    const result = await withTimeout(
      NativeBiometric.isAvailable({ useFallback: false }),
      BIOMETRIC_AVAILABILITY_TIMEOUT_MS,
      null
    );
    if (!result) return { ...DEFAULT_BIOMETRY_STATE };
    if (!result.isAvailable) return { ...DEFAULT_BIOMETRY_STATE };

    const type = mapBiometryType(result.biometryType);
    return {
      available: true,
      type,
      label: getBiometryLabel(type),
    };
  } catch {
    return { ...DEFAULT_BIOMETRY_STATE };
  }
}

function withTimeout<T, TTimeout>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutValue: TTimeout
): Promise<T | TTimeout> {
  return new Promise<T | TTimeout>((resolve, reject) => {
    const timeoutId = globalThis.setTimeout(() => {
      resolve(timeoutValue);
    }, timeoutMs);

    promise.then(
      (value) => {
        globalThis.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        globalThis.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

function mapBiometryType(value: number): AppLockBiometryType {
  if (value === 2 || value === 4) return 'face';
  if (value === 1 || value === 3) return 'fingerprint';
  if (value === 5) return 'iris';
  if (value === 6) return 'multiple';
  return 'unknown';
}

function getBiometryLabel(type: AppLockBiometryType): string {
  if (type === 'face') return 'Face ID / распознавание лица';
  if (type === 'fingerprint') return 'Touch ID / отпечаток';
  if (type === 'iris') return 'Сканер радужки';
  if (type === 'multiple') return 'Биометрия устройства';
  return 'Биометрия доступна';
}
