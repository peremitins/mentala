<template>
  <div class="min-h-dvh">
    <NeuralBg />
    <div
      class="container mx-auto px-4 py-8 flex items-center justify-center min-h-dvh relative z-10"
    >
      <div class="w-full max-w-md">
        <div class="glass-deep p-6">
          <div class="text-center mb-6">
            <div class="text-2xl font-semibold text-foreground">Mentala</div>
            <div class="text-sm text-foreground">Новый пароль</div>
          </div>

          <Transition name="fade" mode="out-in">
            <div v-if="tokenValid === null" key="loading" class="space-y-4">
              <div class="text-center text-sm text-foreground">
                Проверка ссылки...
              </div>
            </div>

            <div v-else-if="!tokenValid" key="invalid" class="space-y-4">
              <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
                <div class="text-sm text-muted-foreground text-center">
                  Ссылка недействительна или истекла
                </div>
              </div>

              <NuxtLink
                to="/forgot"
                class="block w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium text-center"
              >
                Запросить новую ссылку
              </NuxtLink>
            </div>

            <div v-else-if="success" key="success" class="space-y-4">
              <div class="rounded-2xl border border-border/30 bg-muted/30 p-4">
                <div class="text-sm text-muted-foreground text-center">
                  Пароль успешно изменён
                </div>
              </div>
            </div>

            <div v-else key="form" class="space-y-4">
              <p class="text-sm text-foreground text-center">
                Введите новый пароль для вашего аккаунта
                <span v-if="maskedEmail" class="font-medium text-foreground">
                  {{ maskedEmail }}
                </span>
              </p>

              <form @submit.prevent="submit">
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm mb-1 text-foreground">
                      Новый пароль
                    </label>
                    <Input
                      v-model="password"
                      type="password"
                      required
                      minlength="8"
                      :show-clear-button="false"
                      :disabled="loading"
                    />
                  </div>

                  <div>
                    <label class="block text-sm mb-1 text-foreground">
                      Подтверждение пароля
                    </label>
                    <Input
                      v-model="confirmPassword"
                      type="password"
                      required
                      minlength="8"
                      :show-clear-button="false"
                      :disabled="loading"
                    />
                  </div>

                  <div v-if="error" class="text-sm text-destructive">
                    {{ error }}
                  </div>

                  <button
                    type="submit"
                    :disabled="loading"
                    class="w-full py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {{ loading ? '...' : 'Изменить пароль' }}
                  </button>
                </div>
              </form>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { useToast } from '@/app/composables/useToast';

definePageMeta({
  layout: 'auth',
});

const route = useRoute();
const auth = useAuthStore();

const token = ref(String(route.query.token || ''));
const password = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const tokenValid = ref<boolean | null>(null);
const maskedEmail = ref('');
const success = ref(false);
const error = ref('');

async function validateToken() {
  if (!token.value) {
    tokenValid.value = false;
    return;
  }

  try {
    const response: any = await auth.validateResetToken(token.value);
    if (response?.valid) {
      tokenValid.value = true;
      maskedEmail.value = response?.maskedEmail || '';
    } else {
      tokenValid.value = false;
    }
  } catch (e) {
    console.error('[ResetPassword] Failed to validate token:', e);
    tokenValid.value = false;
  }
}

async function submit() {
  error.value = '';

  if (password.value !== confirmPassword.value) {
    error.value = 'Пароли не совпадают';
    return;
  }

  if (password.value.length < 8) {
    error.value = 'Пароль должен быть не менее 8 символов';
    return;
  }

  try {
    loading.value = true;
    await auth.resetPassword({
      token: token.value,
      password: password.value,
      confirmPassword: confirmPassword.value,
    });

    success.value = true;
    useToast('Успех', 'Пароль успешно изменён');

    // Автоматический вход и редирект
    await navigateTo('/');
  } catch (e: any) {
    const payload = e?.data || e?.response?._data || {};
    const message = payload?.message || 'Не удалось изменить пароль';
    error.value = String(message);
    useToast('Ошибка', String(message), 'error');
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  validateToken();
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
