<template>
  <Teleport to="body">
    <Transition name="app-lock-fade">
      <div
        v-if="shouldShow"
        class="fixed inset-0 z-[10000] flex min-h-dvh items-start justify-center bg-background/35 px-4 text-foreground backdrop-blur-xl items-center"
        role="dialog"
        aria-modal="true"
      >
        <section
          class="glass-deep relative w-full max-w-[22rem] m-auto rounded-2xl border border-white/12 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
        >
          <div v-if="showPreparingState" class="space-y-4 py-2 text-center">
            <div
              class="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-primary"
            />
            <div class="space-y-1">
              <h2 class="text-base font-semibold">Проверяем защиту входа</h2>
              <p class="text-xs text-muted-foreground">
                Это займёт несколько секунд.
              </p>
            </div>
          </div>

          <div v-else-if="isSetupFlow" class="space-y-5">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"
              >
                <IconShieldCheck class="h-5 w-5 text-primary" />
              </div>
              <div class="min-w-0 space-y-1">
                <h2 class="text-lg font-semibold leading-6">
                  {{ setupTitle }}
                </h2>
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-center text-sm font-medium">
                {{
                  setupStep === 'enter' ? 'Введите PIN-код' : 'Повторите код'
                }}
              </p>
              <AppLockPinInput
                ref="setupPinInput"
                v-model="setupPinModel"
                @complete="handleSetupComplete"
              />
              <p v-if="setupError" class="text-sm text-destructive">
                {{ setupError }}
              </p>
              <p
                v-else-if="appLock.errorMessage"
                class="text-sm text-destructive"
              >
                {{ appLock.errorMessage }}
              </p>
            </div>

            <div v-if="canCancelChange" class="flex justify-end">
              <Button variant="outline" type="button" @click="cancelChange">
                Отмена
              </Button>
            </div>
          </div>

          <!--
            Единый экран разблокировки: PIN-поля + кнопка «Биометрия устройства».
            Системный BiometricPrompt запускается автоматически поверх этого
            экрана (см. attemptBiometricAndFallback). Отдельного промежуточного
            биометрического экрана нет — при отмене/ошибке остаётся этот PIN-экран.
          -->
          <div v-else class="space-y-5">
              <div class="flex items-center gap-3">
                <div
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10"
                >
                  <IconLockKeyhole class="h-5 w-5 text-primary" />
                </div>
                <div class="min-w-0 space-y-1">
                  <h2 class="text-lg font-semibold leading-6">
                    Введите PIN-код
                  </h2>
                </div>
              </div>

              <div class="space-y-3">
                <AppLockPinInput
                  ref="unlockPinInput"
                  v-model="unlockPin"
                  :disabled="remainingCooldownSeconds > 0"
                  @complete="handleUnlockComplete"
                />
                <p
                  v-if="remainingCooldownSeconds > 0"
                  class="text-sm text-muted-foreground"
                >
                  Повторите попытку через {{ remainingCooldownSeconds }} сек.
                </p>
                <p
                  v-else-if="appLock.errorMessage"
                  class="text-sm text-destructive"
                >
                  {{ appLock.errorMessage }}
                </p>
              </div>

              <div class="space-y-2">
                <Button
                  v-if="appLock.biometric.available"
                  type="button"
                  variant="outline"
                  class="w-full"
                  :disabled="appLock.biometricPromptInFlight"
                  @click="appLock.attemptBiometricUnlock({ force: true })"
                >
                  <component :is="biometricIcon" class="h-4 w-4" />
                  {{ appLock.biometric.label }}
                </Button>

                <Button
                  v-if="appLock.shouldOfferLogout && !confirmLogoutReset"
                  type="button"
                  variant="secondary"
                  class="w-full"
                  @click="confirmLogoutReset = true"
                >
                  Выйти из аккаунта
                </Button>

                <button
                  v-if="!confirmLogoutReset"
                  type="button"
                  class="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                  @click="confirmLogoutReset = true"
                >
                  Забыли код?
                </button>

                <div v-else class="space-y-3 rounded-lg border border-border p-3">
                  <p class="text-sm text-muted-foreground">
                    Для сброса кода нужно выйти из аккаунта. При следующем
                    входе Mentala запросит новый код.
                  </p>
                  <div class="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      @click="confirmLogoutReset = false"
                    >
                      Отмена
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      :disabled="logoutLoading"
                      @click="logoutAndReset"
                    >
                      Выйти
                    </Button>
                  </div>
                </div>
              </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useAppLockStore } from '@/app/stores/appLock';
import { useAuthStore } from '@/app/stores/auth';
import { isAppLockSuppressedRoute } from '@/app/utils/appLockRoutes';
import { normalizePin } from '@/app/utils/appLockCrypto';
import { getRemainingCooldownSeconds } from '@/app/utils/appLockPolicy';
import AppLockPinInput from '@/app/components/app-lock/AppLockPinInput.vue';
import { Button } from '@/app/components/ui/button';
import IconFingerprint from '~icons/lucide/fingerprint';
import IconScanFace from '~icons/lucide/scan-face';
import IconLockKeyhole from '~icons/lucide/lock-keyhole';
import IconShieldCheck from '~icons/lucide/shield-check';

type SetupStep = 'enter' | 'confirm';

// Пауза перед автозапуском биометрии после resume, чтобы Activity успела
// дорезюмиться и системный BiometricPrompt гарантированно открылся.
const BIOMETRIC_RESUME_DELAY_MS = 280;

const appLock = useAppLockStore();
const auth = useAuthStore();
const route = useRoute();

const setupStep = ref<SetupStep>('enter');
const setupPin = ref('');
const setupConfirmPin = ref('');
const setupError = ref('');
const unlockPin = ref('');
const confirmLogoutReset = ref(false);
const logoutLoading = ref(false);
const now = ref(Date.now());
const setupPinInput = ref<InstanceType<typeof AppLockPinInput> | null>(null);
const unlockPinInput = ref<InstanceType<typeof AppLockPinInput> | null>(null);

let timer: number | null = null;

const isInitializing = computed(() => {
  if (auth._isLogoutQuietPeriod() || isAppLockSuppressedRoute(route.path)) {
    return false;
  }
  const userId = auth.user?.id;
  return Boolean(
    userId && (!appLock.initialized || appLock.activeUserId !== userId)
  );
});
const shouldShow = computed(() =>
  Boolean(
    !auth.isLoggingOut &&
      !auth._isLogoutQuietPeriod() &&
      !isAppLockSuppressedRoute(route.path) &&
      auth.user?.id &&
      (isInitializing.value || appLock.shouldShowGate)
  )
);
// Пока доступность биометрии не определена (async-проверка с таймаутом 1.5s),
// держим нейтральный спиннер: если биометрия доступна, системный prompt
// откроется сам, и PIN-экран не должен мелькать перед ним.
const showPreparingState = computed(
  () =>
    isInitializing.value ||
    (appLock.isLocked && !isSetupFlow.value && !appLock.biometricChecked)
);
const isSetupFlow = computed(() =>
  Boolean(appLock.setupMode || appLock.setupRequired)
);
const setupTitle = computed(() =>
  appLock.setupMode === 'change' ? 'Измените код входа' : 'Защитите вход'
);
const canCancelChange = computed(
  () => appLock.setupMode === 'change' && !appLock.setupRequired
);
const remainingCooldownSeconds = computed(() =>
  getRemainingCooldownSeconds(appLock.lockedUntil, now.value)
);

const biometricIcon = computed(() => {
  if (appLock.biometric.type === 'face') return IconScanFace;
  return IconFingerprint;
});

const setupPinModel = computed({
  get: () =>
    setupStep.value === 'enter' ? setupPin.value : setupConfirmPin.value,
  set: (value: string) => {
    const normalized = normalizePin(value);
    if (setupStep.value === 'enter') {
      setupPin.value = normalized;
      return;
    }
    setupConfirmPin.value = normalized;
  },
});

watch(
  () => appLock.setupMode,
  () => resetSetup()
);

watch(
  () => appLock.isLocked,
  (isLocked) => {
    if (isLocked) {
      unlockPin.value = '';
      confirmLogoutReset.value = false;
      void attemptBiometricAndFallback();
    }
  }
);

// Биометрия может разрешиться позже первой блокировки (async check)
watch(
  () => appLock.biometric.available,
  (available) => {
    if (available && appLock.isLocked) {
      void attemptBiometricAndFallback();
    }
  }
);

// Проверка доступности завершилась, биометрии нет → показываем PIN и фокусируем.
watch(
  () => appLock.biometricChecked,
  (checked) => {
    if (checked && appLock.isLocked && !appLock.biometric.available) {
      void focusUnlockInput();
    }
  }
);

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  // Компонент мог смонтироваться уже в заблокированном состоянии
  if (appLock.isLocked) {
    void attemptBiometricAndFallback();
  }
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});

async function handleSetupComplete(value: string) {
  const normalized = normalizePin(value);
  setupError.value = '';

  if (setupStep.value === 'enter') {
    setupPin.value = normalized;
    await waitForPinInputPaint();
    setupConfirmPin.value = '';
    setupStep.value = 'confirm';
    await focusSetupInput();
    return;
  }

  setupConfirmPin.value = normalized;
  if (setupConfirmPin.value !== setupPin.value) {
    setupError.value = 'Коды не совпадают. Введите код заново.';
    setupStep.value = 'enter';
    setupPin.value = '';
    setupConfirmPin.value = '';
    await focusSetupInput();
    return;
  }

  await waitForPinInputPaint();
  const saved = await appLock.createOrReplacePin(setupPin.value);
  if (saved) resetSetup();
}

async function handleUnlockComplete(value: string) {
  // Откладываем тяжёлый PBKDF2 за пределы input-handler, чтобы виртуальная
  // клавиатура успела обработать tail keyup-события и не подвисала.
  const pin = normalizePin(value);
  await waitForPinInputPaint();
  const unlocked = await appLock.unlockWithPin(pin);
  unlockPin.value = '';
  if (unlocked) confirmLogoutReset.value = false;
  if (!unlocked) await focusUnlockInput();
}

function cancelChange() {
  resetSetup();
  appLock.cancelChangeCode();
}

function resetSetup() {
  setupStep.value = 'enter';
  setupPin.value = '';
  setupConfirmPin.value = '';
  setupError.value = '';
  void focusSetupInput();
}

async function focusSetupInput() {
  await nextTick();
  await setupPinInput.value?.focus();
}

async function focusUnlockInput() {
  await nextTick();
  await unlockPinInput.value?.focus();
}

async function waitForPinInputPaint() {
  await nextTick();
  await new Promise<void>((resolve) => {
    if (typeof window === 'undefined') {
      setTimeout(resolve, 80);
      return;
    }

    if (typeof window.requestAnimationFrame !== 'function') {
      // Без RAF полагаемся на таймер: даём ~5 кадров @60fps.
      setTimeout(resolve, 80);
      return;
    }

    // Двойной RAF: первый отдаёт под flush DOM-обновлений Vue, второй
    // гарантирует, что браузер успел показать paint с последней цифрой.
    // Дополнительный setTimeout(50) даёт виртуальной клавиатуре mobile WebView
    // обработать tail keyup и снять фокус с нажатой клавиши до того, как
    // основной поток будет занят тяжёлым PBKDF2 (210k итераций).
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setTimeout(resolve, 50);
      });
    });
  });
}

/**
 * Ждём, пока Activity действительно дорезюмится после возврата из фона или
 * разблокировки телефона. Если дёрнуть NativeBiometric.verifyIdentity слишком
 * рано (прямо в обработчике resume), системный BiometricPrompt не открывается
 * или мгновенно отменяется фокус-гонкой. На холодном старте эта задержка и так
 * присутствует за счёт async-проверки доступности биометрии.
 */
async function waitForAppResumed() {
  if (typeof window === 'undefined') return;
  await new Promise<void>((resolve) => {
    const settle = () => setTimeout(resolve, BIOMETRIC_RESUME_DELAY_MS);
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(settle)
      );
    } else {
      settle();
    }
  });
}

/**
 * Автозапуск системного отпечатка/лица при блокировке. Отдельного
 * промежуточного биометрического экрана нет: при недоступности биометрии,
 * отмене или ошибке остаётся PIN-экран (он всегда отрисован и содержит
 * кнопку «Биометрия устройства» для ручного повтора).
 */
async function attemptBiometricAndFallback() {
  if (appLock.biometricPromptedForCurrentLock) return;

  if (!appLock.biometric.available) {
    // Доступность ещё не определена — gate показывает спиннер, PIN-экран не
    // смонтирован. Дождёмся результата проверки (watcher по biometricChecked /
    // biometric.available перезапустит флоу), иначе клавиатура мелькнёт
    // перед системным биометрическим prompt'ом.
    if (!appLock.biometricChecked) return;
    void focusUnlockInput();
    return;
  }

  await waitForAppResumed();
  // Состояние могло измениться за время ожидания (разблокировали / ушли в фон /
  // другой обработчик уже запустил prompt).
  if (!appLock.isLocked || appLock.biometricPromptedForCurrentLock) return;

  await appLock.attemptBiometricUnlock();
  // При отмене/ошибке prompt'а пользователь остаётся на PIN-экране.
  if (appLock.isLocked) void focusUnlockInput();
}

async function logoutAndReset() {
  if (logoutLoading.value) return;
  logoutLoading.value = true;

  try {
    await auth.logout({ resetLocalAppLockRecord: true });
  } finally {
    logoutLoading.value = false;
  }
}
</script>

<style scoped>
.app-lock-fade-enter-active,
.app-lock-fade-leave-active {
  transition: opacity 160ms ease;
}

.app-lock-fade-enter-from,
.app-lock-fade-leave-to {
  opacity: 0;
}
</style>
