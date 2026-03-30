<template>
  <div class="w-full">
    <NeuralBg />
    <div
      class="container mx-auto px-4 py-8 flex items-center justify-center relative z-10"
    >
      <div class="w-full max-w-md">
        <div class="glass-deep p-6">
          <div class="text-center mb-6">
            <div class="text-2xl font-semibold text-foreground">Ментала</div>
            <div class="text-sm text-foreground">Восстановление пароля</div>
          </div>

          <Transition name="fade" mode="out-in">
            <div v-if="!emailSent" key="form" class="space-y-4">
              <p class="text-sm text-foreground text-center">
                Введите email, и мы отправим ссылку для восстановления пароля
              </p>

              <form @submit.prevent="submit">
                <div>
                  <label class="block text-sm mb-1 text-foreground"
                    >Email</label
                  >
                  <Input
                    v-model="email"
                    type="email"
                    required
                    :show-clear-button="false"
                    :disabled="loading"
                  />
                </div>

                <button
                  type="submit"
                  :disabled="loading"
                  class="relative w-full mt-4 py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <ButtonLoader v-if="loading" />
                  <span :class="loading ? 'invisible' : ''">
                    Получить письмо
                  </span>
                </button>
              </form>

              <div class="text-center">
                <NuxtLink
                  to="/auth"
                  class="text-sm text-foreground hover:text-foreground transition"
                >
                  Вспомнили пароль? Войти
                </NuxtLink>
              </div>
            </div>

            <div v-else key="success" class="space-y-4">
              <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
                <div class="text-sm text-foreground text-center">
                  <template v-if="isRateLimited">
                    Слишком много запросов. Повторите через
                    <span class="text-foreground font-medium">
                      {{ formattedRetryAfter }}
                    </span>
                  </template>
                  <template v-else>
                    Мы отправили письмо с кодом подтверждения на
                    <span class="text-foreground font-medium">
                      {{ maskedEmail }} </span
                    >.
                  </template>
                </div>
              </div>

              <div class="text-center">
                <NuxtLink
                  to="/auth"
                  class="text-sm text-foreground hover:text-foreground transition"
                >
                  Вспомнили пароль? Войти
                </NuxtLink>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCountdown } from '@vueuse/core';
import { useAuthStore } from '@/app/stores/auth';
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { useToast } from '@/app/composables/useToast';

definePageMeta({
  layout: 'auth',
  middleware: [], // Отключаем все middleware для этой страницы
});

const auth = useAuthStore();

const email = ref('');
const loading = ref(false);
const emailSent = ref(false);
const maskedEmail = ref('');
const isRateLimited = ref(false);
const retryAfter = ref(0);

const { start, reset } = useCountdown(0);

const formattedRetryAfter = computed(() => {
  const minutes = Math.floor(retryAfter.value / 60);
  const seconds = retryAfter.value % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

async function submit() {
  if (!email.value) {
    useToast('Ошибка', 'Введите email', 'error');
    return;
  }

  try {
    loading.value = true;
    const response: any = await auth.requestPasswordReset({
      email: email.value,
    });

    const retryAfterValue = response?.retryAfter
      ? Number(response.retryAfter)
      : null;

    maskedEmail.value = response?.maskedEmail || email.value;
    emailSent.value = true;

    if (retryAfterValue && Number.isFinite(retryAfterValue)) {
      isRateLimited.value = true;
      retryAfter.value = retryAfterValue;
      reset(retryAfterValue);
      start();
      const minutes = Math.floor(retryAfterValue / 60);
      const seconds = retryAfterValue % 60;
      useToast(
        'Слишком часто',
        `Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`,
        'warning'
      );
    } else {
      isRateLimited.value = false;
      useToast('Письмо отправлено', 'Проверьте вашу почту');
    }
  } catch (e: any) {
    const payload = e?.data || e?.response?._data || {};
    const message = payload?.message || 'Не удалось отправить письмо';
    useToast('Ошибка', String(message), 'error');
  } finally {
    loading.value = false;
  }
}
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
