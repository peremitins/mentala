<template>
  <div class="min-h-dvh">
    <NeuralBg />
    <div
      class="container mx-auto px-4 py-8 flex items-center justify-center min-h-dvh relative z-10"
    >
      <div class="w-full max-w-md">
        <div class="glass-deep p-6">
          <div class="text-center mb-6">
            <div class="text-2xl font-semibold text-foreground">Ментала</div>
            <div class="text-sm text-foreground">привязка аккаунта</div>
          </div>

          <div v-if="!linkingToken" class="text-sm text-destructive">
            Ссылка для привязки недействительна. Попробуйте войти через Google
            еще раз.
          </div>

          <div v-else class="space-y-4">
            <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
              <div class="text-sm text-foreground">
                Мы нашли аккаунт с email
                <span class="text-foreground font-medium">{{
                  linkingEmail
                }}</span>
              </div>
              <div class="text-xs text-foreground mt-1">
                Подтвердите владение аккаунтом, чтобы связать Google.
              </div>
            </div>

            <Tabs v-model="tab" class="w-full">
              <TabsList class="grid grid-cols-2">
                <TabsTrigger value="password">Пароль</TabsTrigger>
                <TabsTrigger value="code">Код на email</TabsTrigger>
              </TabsList>

              <TabsContent value="password" class="space-y-4 pt-3">
                <div>
                  <label class="block text-sm mb-1 text-foreground"
                    >Пароль</label
                  >
                  <Input
                    v-model="password"
                    type="password"
                    :show-clear-button="false"
                  />
                </div>
                <button
                  type="button"
                  :disabled="loading"
                  class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  @click="confirmPassword"
                >
                  {{ loading ? '...' : 'Подтвердить' }}
                </button>
              </TabsContent>

              <TabsContent value="code" class="space-y-4 pt-3">
                <button
                  type="button"
                  class="w-full py-2.5 rounded-xl border border-border/40 text-foreground hover:bg-muted/40 transition disabled:opacity-60"
                  :disabled="loading || resendRemaining > 0"
                  @click="sendCode"
                >
                  {{
                    resendRemaining > 0
                      ? `Повтор через ${resendRemaining}с`
                      : 'Отправить код'
                  }}
                </button>

                <div>
                  <label class="block text-sm mb-1 text-foreground">Код</label>
                  <Input
                    v-model="code"
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="6"
                    :show-clear-button="false"
                    @input="onCodeInput"
                  />
                </div>

                <div
                  class="text-xs text-foreground"
                  v-if="attemptsLeft !== null"
                >
                  Осталось попыток: {{ attemptsLeft }}
                </div>

                <button
                  type="button"
                  :disabled="loading"
                  class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  @click="confirmCode"
                >
                  {{ loading ? '...' : 'Подтвердить код' }}
                </button>
              </TabsContent>
            </Tabs>

            <button
              type="button"
              class="w-full py-2 rounded-xl text-foreground hover:text-foreground border border-border/40 transition"
              @click="cancelLinking"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useCountdown } from '@vueuse/core';
import { useAuthStore } from '@/app/stores/auth';
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';
import { useToast } from '@/app/composables/useToast';

definePageMeta({
  layout: 'auth',
});

const route = useRoute();
const auth = useAuthStore();

const linkingToken = computed(() => String(route.query.token || ''));
const linkingEmail = computed(() => String(route.query.email || ''));

// Извлекаем путь из back URL, если это абсолютный URL
const backUrl = computed(() => {
  const back = String(route.query.back || '/');
  try {
    const url = new URL(back);
    // Если это абсолютный URL, извлекаем путь
    return url.pathname + url.search;
  } catch {
    // Если это не валидный URL, возвращаем как есть (относительный путь)
    return back;
  }
});

const tab = ref<'password' | 'code'>('password');
const password = ref('');
const code = ref('');
const loading = ref(false);
const attemptsLeft = ref<number | null>(null);

const { remaining: resendRemaining, start, reset } = useCountdown(0);

function onCodeInput() {
  code.value = code.value.replace(/\D/g, '').slice(0, 6);
}

function startResendTimer(seconds = 60) {
  reset(seconds);
  start();
}

async function confirmPassword() {
  if (!linkingToken.value || !password.value) {
    useToast('Ошибка', 'Введите пароль', 'error');
    return;
  }

  try {
    loading.value = true;
    await auth.linkOAuthVerifyPassword({
      linkingToken: linkingToken.value,
      password: password.value,
    });
    await navigateTo(backUrl.value || '/');
  } catch (e: any) {
    // Ошибка уже показана глобальным обработчиком API
  } finally {
    loading.value = false;
  }
}

async function sendCode() {
  if (!linkingToken.value) return;
  try {
    loading.value = true;
    const response: any = await auth.linkOAuthSendCode({
      linkingToken: linkingToken.value,
    });
    const retryAfter = response?.retryAfter ? Number(response.retryAfter) : 60;
    startResendTimer(Number.isFinite(retryAfter) ? retryAfter : 60);
    useToast('Код отправлен', 'Проверьте почту');
  } catch (e: any) {
    // Ошибка уже показана глобальным обработчиком API
  } finally {
    loading.value = false;
  }
}

async function confirmCode() {
  const clean = code.value.replace(/\D/g, '');
  if (!linkingToken.value || clean.length !== 6) {
    useToast('Ошибка', 'Введите 6-значный код', 'error');
    return;
  }

  try {
    loading.value = true;
    const response = await auth.linkOAuthVerifyCode({
      linkingToken: linkingToken.value,
      code: clean,
    });
    // Если метод не выбросил ошибку, значит линковка прошла успешно
    await navigateTo(backUrl.value || '/');
  } catch (e: any) {
    const payload = e?.data || e?.response?._data || {};
    attemptsLeft.value = payload?.data?.attemptsLeft ?? attemptsLeft.value;
    // Ошибка уже показана глобальным обработчиком API
  } finally {
    loading.value = false;
  }
}

async function cancelLinking() {
  if (!linkingToken.value) {
    await navigateTo('/auth');
    return;
  }

  try {
    await auth.linkOAuthCancel({ linkingToken: linkingToken.value });
  } catch (e) {
    console.error('Ошибка отмены привязки:', e);
  }
  await navigateTo('/auth');
}

onMounted(() => {
  if (!linkingToken.value) {
    useToast('Ошибка', 'Ссылка для привязки недействительна', 'error');
  }
});
</script>
