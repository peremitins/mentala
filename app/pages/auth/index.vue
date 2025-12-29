<template>
  <div class="min-h-dvh">
    <NeuralBg />
    <div
      class="container mx-auto px-4 py-8 flex items-center justify-center min-h-dvh relative z-10"
    >
      <div class="w-full max-w-md">
        <div
          class="rounded-3xl border border-border/20 bg-card/95 backdrop-blur-xl shadow-xl p-6"
        >
          <div class="text-center mb-6">
            <div class="text-2xl font-semibold text-foreground">Mentala</div>
            <div class="text-sm text-muted-foreground">
              {{
                step === 'verify' ? 'подтверждение email' : 'вход и регистрация'
              }}
            </div>
          </div>

          <Transition name="fade" mode="out-in">
            <div v-if="step === 'verify'" key="verify" class="space-y-4">
              <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
                <div class="text-sm text-muted-foreground">
                  <template v-if="isRateLimited">
                    Сейчас нельзя отправить новый код для
                    <span class="text-foreground font-medium">
                      {{ verificationEmail }}
                    </span>
                  </template>
                  <template v-else>
                    Мы отправили код на
                    <span class="text-foreground font-medium">
                      {{ verificationEmail }}
                    </span>
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
                class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                @click="confirmCode"
              >
                {{ loading ? '...' : 'Подтвердить' }}
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
                  class="py-2 rounded-xl border border-border/40 text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
                  @click="resetVerification"
                >
                  Изменить email
                </button>
              </div>
            </div>

            <div v-else key="form">
              <div class="grid grid-cols-2 p-1 rounded-xl bg-muted/50 mb-6">
                <button
                  :class="[
                    'py-2 rounded-lg text-sm transition',
                    mode === 'signin'
                      ? 'bg-background shadow text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                  @click="mode = 'signin'"
                >
                  Вход
                </button>
                <button
                  :class="[
                    'py-2 rounded-lg text-sm transition',
                    mode === 'signup'
                      ? 'bg-background shadow text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                  @click="mode = 'signup'"
                >
                  Регистрация
                </button>
              </div>

              <form class="space-y-4" @submit.prevent="submit">
                <template v-if="mode === 'signup'">
                  <div>
                    <label class="block text-sm mb-1 text-foreground"
                      >Имя</label
                    >
                    <Input
                      v-model="name"
                      type="text"
                      :show-clear-button="false"
                    />
                  </div>
                </template>

                <div>
                  <label class="block text-sm mb-1 text-foreground"
                    >Email</label
                  >
                  <Input
                    v-model="email"
                    type="email"
                    required
                    :show-clear-button="false"
                  />
                </div>

                <div>
                  <label class="block text-sm mb-1 text-foreground"
                    >Пароль</label
                  >
                  <Input
                    v-model="password"
                    type="password"
                    required
                    minlength="8"
                    :show-clear-button="false"
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
                        <NuxtLink
                          to="/legal/terms"
                          class="underline text-primary hover:text-primary/80"
                        >
                          Условия
                        </NuxtLink>
                        и
                        <NuxtLink
                          to="/legal/privacy"
                          class="underline text-primary hover:text-primary/80"
                        >
                          Политику
                        </NuxtLink>
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  :disabled="loading"
                  class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {{
                    loading
                      ? '...'
                      : mode === 'signin'
                        ? 'Войти'
                        : 'Создать аккаунт'
                  }}
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
                <!-- 1️⃣ Google -->
                <button
                  @click="loginWithGoogle"
                  class="h-10 rounded-xl bg-white/80 hover:bg-white text-black flex items-center justify-center"
                >
                  <GoogleIcon class="w-full h-5" />
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
                  class="underline text-primary hover:text-primary/80 transition"
                  @click="mode = mode === 'signin' ? 'signup' : 'signin'"
                >
                  {{ mode === 'signin' ? 'Создать' : 'Войти' }}
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <p class="mt-4 text-center text-xs text-muted-foreground">
          Защита данных: end-to-end для приватных чатов, ключи разделены
          (zero-trust). Подробнее в
          <NuxtLink
            to="/legal/privacy"
            class="underline text-primary hover:text-primary/80"
          >
            политике
          </NuxtLink>
          .
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useCountdown } from '@vueuse/core';
import { useAuthStore } from '@/app/stores/auth';
import TelegramIcon from '~icons/mdi/telegram';
import VkIcon from '~icons/simple-icons/vk';
import GoogleIcon from '~icons/logos/google-icon';
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';
import { useToast } from '@/app/composables/useToast';

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
const loading = ref(false);

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

async function submit() {
  if (step.value === 'verify') {
    await confirmCode();
    return;
  }

  try {
    loading.value = true;
    if (mode.value === 'signin') {
      await auth.loginEmail({
        email: email.value,
        password: password.value,
        locale: locale.value,
      });
    } else {
      const response: any = await auth.registerEmail({
        email: email.value,
        password: password.value,
        name: name.value || undefined,
        locale: locale.value,
      });
      const retryAfter = response?.retryAfter
        ? Number(response.retryAfter)
        : null;
      verificationEmail.value = email.value;
      step.value = 'verify';
      attemptsLeft.value = null;
      verificationCode.value = '';
      // Запускаем таймер действия кода (15 минут = 900 секунд)
      startCodeExpiryCountdown(900);
      if (retryAfter && Number.isFinite(retryAfter)) {
        isRateLimited.value = true;
        startResendTimer(retryAfter);
        const minutes = Math.floor(retryAfter / 60);
        const seconds = retryAfter % 60;
        useToast(
          'Слишком часто',
          `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
          'warning'
        );
      } else {
        isRateLimited.value = false;
        startResendTimer(60);
        useToast('Код отправлен', `Мы отправили код на ${email.value}`);
      }
    }
  } catch (e: any) {
    console.error('[Auth] Register error:', e);
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
    console.error('[Auth] Verify code error:', e);
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
        'Слишком часто',
        `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
        'warning'
      );
    } else {
      isRateLimited.value = false;
      useToast('Код отправлен', 'Проверьте вашу почту');
    }
  } catch (e: any) {
    console.error('[Auth] Resend code error:', e);
  }
}

async function requestVerification() {
  if (!email.value) {
    useToast('Ошибка', 'Введите email', 'error');
    return;
  }
  try {
    const response: any = await auth.requestEmailVerification({
      email: email.value,
    });
    const retryAfter = response?.retryAfter
      ? Number(response.retryAfter)
      : null;
    if (retryAfter) {
      const minutes = Math.floor(retryAfter / 60);
      const seconds = retryAfter % 60;
      useToast(
        'Слишком часто',
        `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
        'warning'
      );
    } else {
      useToast('Код отправлен', 'Если аккаунт существует, мы отправили код');
    }
  } catch (e: any) {
    console.error('[Auth] Request verification error:', e);
  }
}

async function loginWithGoogle() {
  try {
    await auth.loginWithGoogle(locale.value);
  } catch (e: any) {
    console.error('[Auth] Google login error:', e);
  }
}

function oauth(provider: string) {
  auth.oauth(provider, locale.value);
}

onMounted(() => {
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
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
