<template>
  <div class="w-full">
    <NeuralBg />
    <div
      class="container mx-auto px-4 py-4 flex items-center justify-center relative z-10"
    >
      <div class="w-full max-w-md">
        <div class="glass-deep p-6">
          <div
            class="flex w-[150px] h-auto items-center justify-center mb-6 mx-auto"
          >
            <component
              :is="brandLogoComponent"
              class="signin__form-brand-logo-img"
            />
          </div>
          <div class="text-center mb-6">
            <!-- <div class="text-2xl font-semibold text-foreground">Mentala</div> -->
            <div class="text-sm text-muted-foreground">
              {{ step === 'verify' ? 'подтверждение email' : '' }}
            </div>
          </div>

          <Transition name="fade" mode="out-in">
            <div v-if="step === 'verify'" key="verify" class="space-y-4">
              <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
                <div class="text-sm text-foreground">
                  <template v-if="isRateLimited">
                    Слишком много запросов. Подождите немного перед повтором.
                  </template>
                  <template v-else>
                    Мы отправили письмо с кодом подтверждения на
                    <span class="text-foreground font-medium">
                      {{ verificationEmail }} </span
                    >.

                    <div class="mt-2 text-xs text-muted-foreground">
                      Если вы уже регистрировались ранее, вы сможете
                      <button
                        type="button"
                        class="underline text-primary-ui hover:text-primary-ui/80 transition"
                        @click="switchToSignin"
                      >
                        войти
                      </button>
                      или
                      <NuxtLink
                        to="/forgot"
                        class="underline text-primary-ui hover:text-primary-ui/80 transition"
                      >
                        восстановить пароль </NuxtLink
                      >.
                    </div>
                  </template>
                </div>
              </div>

              <div>
                <label class="block text-sm mb-1 text-foreground">
                  Код подтверждения
                </label>
                <Input
                  v-model="verificationCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  :show-clear-button="false"
                  @input="onCodeInput"
                />
              </div>

              <div
                class="flex items-center justify-between text-xs text-muted-foreground"
              >
                <span v-if="attemptsLeft !== null">
                  Осталось попыток: {{ attemptsLeft }}
                </span>
                <span v-else class="flex items-center gap-2">
                  <span>Код действует 15 минут</span>
                  <span
                    v-if="codeExpiryRemaining && codeExpiryRemaining > 0"
                    class="font-medium text-foreground"
                  >
                    {{ formatTimeRemaining(codeExpiryRemaining) }}
                  </span>
                </span>
                <span v-if="resendRemaining > 0">
                  Повтор через {{ resendRemaining }}с
                </span>
              </div>

              <button
                type="button"
                :disabled="loading"
                class="relative w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                @click="confirmCode"
              >
                <ButtonLoader v-if="loading" />
                <span :class="loading ? 'invisible' : ''">Подтвердить</span>
              </button>

              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  class="py-2 rounded-xl border border-border/40 text-[12px] text-foreground hover:bg-muted/40 transition disabled:opacity-60"
                  :disabled="resendRemaining > 0 || loading"
                  @click="resendCode"
                >
                  Отправить повторно
                </button>
                <button
                  type="button"
                  class="py-2 rounded-xl border border-border/40 text-[12px] text-foreground hover:text-foreground hover:bg-muted/40 transition"
                  @click="resetVerification"
                >
                  Изменить email
                </button>
              </div>
            </div>

            <div v-else key="form">
              <Tabs
                :model-value="mode"
                @update:model-value="(v) => (mode = v as 'signin' | 'signup')"
                class="w-full mb-6"
              >
                <TabsList class="grid grid-cols-2 glass-border">
                  <TabsTrigger value="signin">Вход</TabsTrigger>
                  <TabsTrigger value="signup">Регистрация</TabsTrigger>
                </TabsList>
              </Tabs>

              <form
                class="space-y-4"
                method="post"
                autocomplete="on"
                @submit.prevent="submit"
              >
                <template v-if="mode === 'signup'">
                  <div>
                    <label
                      class="block text-sm mb-1 text-foreground"
                      for="auth-name"
                    >
                      Имя
                    </label>
                    <Input
                      id="auth-name"
                      v-model="name"
                      name="name"
                      type="text"
                      autocomplete="name"
                      :show-clear-button="false"
                    />
                  </div>
                </template>

                <div>
                  <label
                    class="block text-sm mb-1 text-foreground"
                    for="auth-email"
                  >
                    Email
                  </label>
                  <Input
                    id="auth-email"
                    v-model="email"
                    name="email"
                    type="email"
                    inputmode="email"
                    :autocomplete="mode === 'signin' ? 'username' : 'email'"
                    autocapitalize="none"
                    spellcheck="false"
                    required
                    :show-clear-button="false"
                  />
                </div>

                <div>
                  <label
                    class="block text-sm mb-1 text-foreground"
                    for="auth-password"
                  >
                    Пароль
                  </label>
                  <Input
                    id="auth-password"
                    v-model="password"
                    name="password"
                    type="password"
                    :autocomplete="
                      mode === 'signin' ? 'current-password' : 'new-password'
                    "
                    required
                    minlength="8"
                    :show-clear-button="false"
                  />
                </div>

                <div>
                  <label
                    class="block text-sm mb-1 text-foreground"
                    for="auth-access-code"
                  >
                    Промокод
                  </label>
                  <Input
                    id="auth-access-code"
                    v-model="accessCode"
                    type="text"
                    autocomplete="off"
                    maxlength="64"
                    placeholder="Промокод (необязательно)"
                    :show-clear-button="false"
                    @input="normalizeAccessCodeInput"
                  />
                </div>

                <div
                  class="flex items-center justify-end"
                  v-if="mode === 'signin'"
                >
                  <NuxtLink
                    to="/forgot"
                    class="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    Забыли пароль?
                  </NuxtLink>
                </div>

                <div v-else class="text-sm text-foreground">
                  <div class="flex items-start gap-2">
                    <Checkbox id="agree" v-model:checked="agree" required />
                    <label for="agree" class="cursor-pointer">
                      <span
                        >Я принимаю
                        <!-- Ссылки на каноничные HTML-документы из public/legal -->
                        <a
                          :href="termsOfServiceUrl"
                          class="underline text-primary-ui hover:text-primary-ui/80"
                          @click.prevent="openLegalDocument(termsOfServiceUrl)"
                        >
                          Условия использования
                        </a>
                        и
                        <a
                          :href="privacyPolicyUrl"
                          class="underline text-primary-ui hover:text-primary-ui/80"
                          @click.prevent="openLegalDocument(privacyPolicyUrl)"
                        >
                          Политику конфиденциальности
                        </a>
                      </span>
                    </label>
                  </div>
                  <div
                    class="flex items-start gap-2 mt-3 text-muted-foreground"
                  >
                    <Checkbox
                      id="marketing-consent"
                      v-model:checked="marketingConsent"
                    />
                    <label for="marketing-consent" class="cursor-pointer">
                      <span> Хочу получать новости и предложения Ментала </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  :disabled="loading || (mode === 'signup' && !agree)"
                  class="relative w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <ButtonLoader v-if="loading" />
                  <span :class="loading ? 'invisible' : ''">
                    {{ mode === 'signin' ? 'Войти' : 'Создать аккаунт' }}
                  </span>
                </button>
              </form>

              <div class="flex items-center my-6">
                <div class="flex-1 h-px bg-border"></div>
                <div
                  class="px-3 text-xs uppercase tracking-wider text-muted-foreground"
                >
                  или
                </div>
                <div class="flex-1 h-px bg-border"></div>
              </div>

              <div class="grid grid-cols-1 gap-2">
                <!-- Sign in with Apple (только iOS) -->
                <!-- Кнопка соответствует Apple HIG: solid white, Apple logo + текст, min 44px -->
                <button
                  v-if="isIos"
                  type="button"
                  :disabled="loading || oauthLoading"
                  @click="loginWithApple"
                  class="relative h-11 rounded-xl bg-white hover:brightness-95 active:brightness-90 text-black flex items-center justify-center gap-2 px-4 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  <ButtonLoader v-if="appleLoading" />
                  <template v-else>
                    <AppleIcon class="w-5 h-5 shrink-0" />
                    <span class="text-sm font-medium">Sign in with Apple</span>
                  </template>
                </button>

                <!-- Google -->
                <button
                  type="button"
                  :disabled="loading || oauthLoading"
                  @click="loginWithGoogle"
                  class="relative h-10 rounded-xl bg-white/80 hover:bg-white text-black flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <ButtonLoader v-if="oauthLoading" />
                  <GoogleIcon
                    class="w-full h-5"
                    :class="oauthLoading ? 'invisible' : ''"
                  />
                </button>

                <!-- 7️⃣ VK -->
                <!-- <button
                  @click="oauth('vk')"
                  class="h-10 rounded-xl bg-[#2787F5] hover:brightness-110 text-white flex items-center justify-center"
                >
                  <VkIcon class="w-5 h-5" />
                </button> -->

                <!-- 9️⃣ Telegram -->
                <!-- <button
                  @click="oauth('telegram')"
                  class="h-10 rounded-xl bg-[#229ED9] hover:brightness-110 text-white flex items-center justify-center"
                >
                  <TelegramIcon class="w-5 h-5" />
                </button> -->
              </div>

              <div class="mt-6 text-center text-sm text-muted-foreground">
                {{ mode === 'signin' ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
                <button
                  class="underline text-primary-ui hover:text-primary-ui/80 transition"
                  @click="mode = mode === 'signin' ? 'signup' : 'signin'"
                >
                  {{ mode === 'signin' ? 'Создать' : 'Войти' }}
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <p class="mt-4 text-center text-xs text-muted-foreground">
          <template v-if="mode === 'signin' || mode === 'signup'">
            Продолжая, вы подтверждаете согласие с
            <a
              :href="termsOfServiceUrl"
              class="underline text-primary-ui hover:text-primary-ui/80"
              @click.prevent="openLegalDocument(termsOfServiceUrl)"
            >
              Условиями использования
            </a>
            и
            <a
              :href="privacyPolicyUrl"
              class="underline text-primary-ui hover:text-primary-ui/80"
              @click.prevent="openLegalDocument(privacyPolicyUrl)"
            >
              Политикой конфиденциальности
            </a>
            .
          </template>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useCountdown } from '@vueuse/core';
import { useRuntimeConfig } from '#imports';
import { useAuthStore } from '@/app/stores/auth';
import GoogleIcon from '~icons/logos/google-icon';
import AppleIcon from '~icons/logos/apple';
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import BrandLogoEn from '@/app/assets/images/logo_en.svg';
import BrandLogoRu from '@/app/assets/images/logo_ru.svg';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/app/components/ui/shadcn/tabs';
import { useToast } from '@/app/composables/useToast';
import { getErrorDiagnosticsLog } from '@/app/utils/errorDiagnostics';
import { sanitizePublicErrorMessage } from '@/app/utils/errorMessage';
import { openExternalBrowser } from '@/app/utils/openExternalBrowser';
import {
  normalizePendingAccessCode,
  usePendingAccessCode,
} from '@/app/composables/usePendingAccessCode';
import { useMarketingAttribution } from '@/app/composables/useMarketingAttribution';

definePageMeta({
  layout: 'auth',
});

const auth = useAuthStore();
const route = useRoute();

const mode = ref<'signin' | 'signup'>('signin');
const step = ref<'form' | 'verify'>('form');
const email = ref('');
const password = ref('');
const name = ref('');
const agree = ref(false);
const marketingConsent = ref(false);
const loading = ref(false);
const oauthLoading = ref(false);
const appleLoading = ref(false);
const isIos = ref(false);
const accessCode = ref('');
const verificationEmail = ref('');
const verificationCode = ref('');
const attemptsLeft = ref<number | null>(null);
const isRateLimited = ref(false);

const { remaining: resendRemaining, start, reset } = useCountdown(0);
const {
  remaining: codeExpiryRemaining,
  start: startCodeExpiryTimer,
  reset: resetCodeExpiryTimer,
} = useCountdown(0);

const langCookie = useCookie<string | null>('mentai.lang', {
  maxAge: 365 * 24 * 3600,
  path: '/',
});
const locale = computed(() => langCookie.value || 'ru');
const runtimeConfig = useRuntimeConfig();
const legalLocale = computed(() => {
  const normalizedLocale = String(locale.value || 'ru').toLowerCase();
  return normalizedLocale.startsWith('en') ? 'en' : 'ru';
});
const publicAppUrl = computed(() =>
  String(runtimeConfig.public.appUrl || 'https://my.mentala.app').replace(
    /\/$/,
    ''
  )
);

const termsOfServiceUrl = computed(
  () => `${publicAppUrl.value}/legal/terms-of-service-${legalLocale.value}.html`
);
const privacyPolicyUrl = computed(
  () => `${publicAppUrl.value}/legal/privacy-policy-${legalLocale.value}.html`
);

const brandLogoComponent = computed(() => {
  // Логотип выбирается по текущей локали интерфейса.
  const normalizedLocale = String(locale.value || 'ru').toLowerCase();
  return normalizedLocale.startsWith('ru') ? BrandLogoRu : BrandLogoEn;
});

const { pendingAccessCode, setPendingAccessCode } = usePendingAccessCode();
const { captureFromCurrentRoute, getPendingMarketingAttribution } =
  useMarketingAttribution();

function getCurrentMarketingAttribution() {
  return captureFromCurrentRoute() ?? getPendingMarketingAttribution();
}

function normalizeAccessCodeInput() {
  accessCode.value = normalizePendingAccessCode(accessCode.value);
}

async function openLegalDocument(url: string) {
  await openExternalBrowser(url);
}

function startResendTimer(seconds = 60) {
  reset(seconds);
  start();
}

function formatTimeRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function startCodeExpiryCountdown(seconds: number) {
  if (seconds > 0) {
    resetCodeExpiryTimer(seconds);
    // Небольшая задержка перед start, чтобы reset успел примениться
    nextTick(() => {
      startCodeExpiryTimer();
    });
  }
}

function onCodeInput() {
  verificationCode.value = verificationCode.value
    .replace(/\D/g, '')
    .slice(0, 6);
}

function resetVerification() {
  step.value = 'form';
  mode.value = 'signup';
  verificationEmail.value = '';
  verificationCode.value = '';
  attemptsLeft.value = null;
  isRateLimited.value = false;
  resetCodeExpiryTimer(0);
}

function switchToSignin() {
  // Возвращаем пользователя на форму входа без утечки информации
  step.value = 'form';
  mode.value = 'signin';
  isRateLimited.value = false;
  verificationCode.value = '';
  attemptsLeft.value = null;
}

function getRetryAfterFromError(error: any): number | null {
  const headerValue =
    error?.response?.headers?.get?.('retry-after') ||
    error?.response?.headers?.['retry-after'] ||
    error?.response?.headers?.['Retry-After'];
  const headerSeconds = headerValue ? Number(headerValue) : null;
  if (headerSeconds && Number.isFinite(headerSeconds)) return headerSeconds;

  const dataRetryAfter =
    error?.data?.retryAfter || error?.response?._data?.retryAfter;
  const dataSeconds = dataRetryAfter ? Number(dataRetryAfter) : null;
  return dataSeconds && Number.isFinite(dataSeconds) ? dataSeconds : null;
}

function startVerificationFlow(options?: {
  retryAfter?: number | null;
  rateLimited?: boolean;
}) {
  verificationEmail.value = email.value;
  step.value = 'verify';
  attemptsLeft.value = null;
  verificationCode.value = '';
  // Запускаем таймер действия кода (15 минут = 900 секунд)
  startCodeExpiryCountdown(900);

  const retryAfter = options?.retryAfter ?? null;
  if (options?.rateLimited) {
    const safeRetryAfter =
      retryAfter && Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter
        : 60;
    isRateLimited.value = true;
    startResendTimer(safeRetryAfter);
    const minutes = Math.floor(safeRetryAfter / 60);
    const seconds = safeRetryAfter % 60;
    useToast(
      'Слишком много запросов',
      `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
      'warning'
    );
    return;
  }

  isRateLimited.value = false;
  startResendTimer(60);
  useToast(
    'Проверьте почту',
    'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Ментала ранее, вы сможете войти или восстановить доступ',
    'info'
  );
}

async function submit() {
  if (step.value === 'verify') {
    await confirmCode();
    return;
  }
  if (mode.value === 'signup' && !agree.value) {
    // Без согласия с документами регистрацию не продолжаем.
    useToast('Нужно согласие', 'Подтвердите условия и политику', 'warning');
    return;
  }

  try {
    loading.value = true;
    setPendingAccessCode(accessCode.value);
    const marketingAttribution = getCurrentMarketingAttribution();
    if (mode.value === 'signin') {
      await auth.loginEmail({
        email: email.value,
        password: password.value,
        locale: locale.value,
        marketingAttribution,
      });
    } else {
      const response = await auth.registerEmail({
        email: email.value,
        password: password.value,
        name: name.value || undefined,
        locale: locale.value,
        // Передаем согласия на документы и маркетинг.
        acceptTerms: agree.value,
        acceptPrivacy: agree.value,
        marketingConsent: marketingConsent.value,
        marketingAttribution,
      });

      if (response.verificationEmailSent === false) {
        useToast(
          'Письмо не отправлено',
          response.verificationEmailMessage,
          'error'
        );
        return;
      }

      startVerificationFlow();
    }
  } catch (e: any) {
    if (mode.value === 'signup') {
      const statusCode = e?.statusCode || e?.response?.status || 500;
      if (statusCode === 400) {
        // Ошибка валидации — не переходим в шаг подтверждения.
        return;
      }
      const retryAfter = getRetryAfterFromError(e);
      const isLimited = statusCode === 429 || !!retryAfter;
      startVerificationFlow({ retryAfter, rateLimited: isLimited });
      console.error('[Auth] Register error:', getErrorDiagnosticsLog(e));
      return;
    }

    const payload = e?.data || e?.response?._data || {};
    const message = sanitizePublicErrorMessage(
      payload?.message ||
        payload?.statusMessage ||
        (e instanceof Error ? e.message : ''),
      'Не удалось войти. Проверь подключение и попробуй ещё раз.'
    );
    useToast('Ошибка входа', String(message), 'error');
    console.error('[Auth] Signin error:', getErrorDiagnosticsLog(e));
  } finally {
    loading.value = false;
  }
}

async function confirmCode() {
  const cleanCode = verificationCode.value.replace(/\D/g, '');
  if (!verificationEmail.value || cleanCode.length !== 6) {
    useToast('Ошибка', 'Введите 6-значный код', 'error');
    return;
  }

  try {
    loading.value = true;
    await auth.verifyEmailCode({
      email: verificationEmail.value,
      code: cleanCode,
    });
  } catch (e: any) {
    const payload = e?.data || e?.response?._data || {};
    attemptsLeft.value = payload?.data?.attemptsLeft ?? attemptsLeft.value;
    console.error('[Auth] Verify code error:', getErrorDiagnosticsLog(e));
  } finally {
    loading.value = false;
  }
}

async function resendCode() {
  if (resendRemaining.value > 0 || !verificationEmail.value) return;
  try {
    const response: any = await auth.resendEmailCode({
      email: verificationEmail.value,
    });
    const retryAfter = response?.retryAfter ? Number(response.retryAfter) : 60;
    startResendTimer(Number.isFinite(retryAfter) ? retryAfter : 60);
    // Перезапускаем таймер действия кода при повторной отправке (15 минут = 900 секунд)
    startCodeExpiryCountdown(900);
    if (response?.retryAfter) {
      isRateLimited.value = true;
      const minutes = Math.floor(retryAfter / 60);
      const seconds = retryAfter % 60;
      useToast(
        'Слишком много запросов',
        `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
        'warning'
      );
    } else {
      isRateLimited.value = false;
      useToast(
        'Проверьте почту',
        'Мы отправили письмо с кодом подтверждения.\nЕсли вы уже использовали Ментала ранее, вы сможете войти или восстановить доступ',
        'info'
      );
    }
  } catch (e: any) {
    console.error('[Auth] Resend code error:', getErrorDiagnosticsLog(e));
  }
}

async function loginWithApple() {
  try {
    appleLoading.value = true;
    oauthLoading.value = true;
    await auth.loginWithApple(getCurrentMarketingAttribution());
  } catch (e: any) {
    const message =
      e instanceof Error && e.message
        ? e.message
        : 'Не удалось войти через Apple';
    useToast('Ошибка входа через Apple', message, 'error');
    console.error('[Auth] Apple login error:', getErrorDiagnosticsLog(e));
  } finally {
    appleLoading.value = false;
    oauthLoading.value = false;
  }
}

async function loginWithGoogle() {
  try {
    oauthLoading.value = true;
    setPendingAccessCode(accessCode.value);
    await auth.loginWithGoogle(locale.value, getCurrentMarketingAttribution());
  } catch (e: any) {
    const message =
      e instanceof Error && e.message
        ? e.message
        : 'Не удалось войти через Google';
    useToast('Ошибка входа через Google', message, 'error');
    console.error('[Auth] Google login error:', getErrorDiagnosticsLog(e));
  } finally {
    oauthLoading.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  captureFromCurrentRoute();

  // Определяем iOS после гидрации, чтобы избежать SSR-мисматча
  try {
    const { Capacitor } = await import('@capacitor/core');
    isIos.value =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    isIos.value = false;
  }

  if (route.query.error === 'email_not_verified') {
    useToast(
      'Ошибка',
      'Google не подтвердил ваш email. Подтвердите его в аккаунте Google.',
      'error'
    );
  }
  if (route.query.error === 'email_required') {
    useToast(
      'Ошибка',
      'OAuth-провайдер не вернул email. Попробуйте другой способ входа.',
      'error'
    );
  }

  const queryAccessCode = [
    normalizePendingAccessCode(String(route.query.ref || '')),
    normalizePendingAccessCode(String(route.query.promo || '')),
    normalizePendingAccessCode(String(route.query.code || '')),
  ].find((value) => value.length >= 3);
  accessCode.value = queryAccessCode || pendingAccessCode.value || '';
  if (queryAccessCode) {
    setPendingAccessCode(queryAccessCode);
  }
});
</script>

<style lang="scss">
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.signin__form-brand-logo-img {
  width: 100%;
  height: 100%;
}
</style>
