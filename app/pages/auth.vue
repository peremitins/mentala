<template>
  <div class="min-h-dvh">
    <div
      class="container mx-auto px-4 py-8 flex items-center justify-center min-h-dvh"
    >
      <div class="w-full max-w-md">
        <div
          class="rounded-3xl border border-white/10 bg-white/10 dark:bg-black/30 backdrop-blur-xl shadow-xl p-6"
        >
          <div class="text-center mb-6">
            <div class="text-2xl font-semibold">MentAI</div>
            <div class="text-sm opacity-70">вход и регистрация</div>
          </div>

          <div
            class="grid grid-cols-2 p-1 rounded-xl bg-white/10 dark:bg-white/5 mb-6"
          >
            <button
              :class="[
                'py-2 rounded-lg text-sm transition',
                mode === 'signin'
                  ? 'bg-white/70 dark:bg-white/10 shadow text-black dark:text-white'
                  : 'text-white/80',
              ]"
              @click="mode = 'signin'"
            >
              Вход
            </button>
            <button
              :class="[
                'py-2 rounded-lg text-sm transition',
                mode === 'signup'
                  ? 'bg-white/70 dark:bg-white/10 shadow text-black dark:text-white'
                  : 'text-white/80',
              ]"
              @click="mode = 'signup'"
            >
              Регистрация
            </button>
          </div>

          <form class="space-y-4" @submit.prevent="submit">
            <template v-if="mode === 'signup'">
              <div>
                <label class="block text-sm mb-1">Имя</label>
                <input
                  v-model="name"
                  type="text"
                  required
                  class="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-white/10 border border-white/20 outline-none focus:ring-2 focus:ring-white/40"
                />
              </div>
            </template>

            <div>
              <label class="block text-sm mb-1">Email</label>
              <input
                v-model="email"
                type="email"
                required
                class="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-white/10 border border-white/20 outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>

            <div>
              <label class="block text-sm mb-1">Пароль</label>
              <input
                v-model="password"
                type="password"
                required
                class="w-full px-3 py-2 rounded-xl bg-white/70 dark:bg-white/10 border border-white/20 outline-none focus:ring-2 focus:ring-white/40"
              />
            </div>

            <div
              class="flex items-center justify-between"
              v-if="mode === 'signin'"
            >
              <label class="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  v-model="remember"
                  class="accent-white/80"
                />
                Запомнить меня
              </label>
              <NuxtLink
                to="/forgot"
                class="text-sm text-white/80 hover:text-white"
                >Забыли пароль?</NuxtLink
              >
            </div>

            <div v-else class="text-sm">
              <label class="flex items-start gap-2">
                <input
                  type="checkbox"
                  v-model="agree"
                  class="mt-1 accent-white/80"
                  required
                />
                <span
                  >Я принимаю
                  <NuxtLink to="/legal/terms" class="underline"
                    >Условия</NuxtLink
                  >
                  и
                  <NuxtLink to="/legal/privacy" class="underline"
                    >Политику</NuxtLink
                  ></span
                >
              </label>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-2.5 rounded-xl bg-white text-black hover:opacity-90 active:opacity-80 transition font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
            <div class="flex-1 h-px bg-white/20"></div>
            <div class="px-3 text-xs uppercase tracking-wider text-white/60">
              или
            </div>
            <div class="flex-1 h-px bg-white/20"></div>
          </div>

          <div class="grid grid-cols-5 gap-2">
            <!-- 1️⃣ Google -->
            <button
              @click="oauth('google')"
              class="h-10 rounded-xl bg-white/80 hover:bg-white text-black flex items-center justify-center"
            >
              <GoogleIcon class="w-5 h-5" />
            </button>

            <!-- 7️⃣ VK -->
            <button
              @click="oauth('vk')"
              class="h-10 rounded-xl bg-[#2787F5] hover:brightness-110 text-white flex items-center justify-center"
            >
              <VkIcon class="w-5 h-5" />
            </button>

            <!-- 9️⃣ Telegram -->
            <button
              @click="oauth('telegram')"
              class="h-10 rounded-xl bg-[#229ED9] hover:brightness-110 text-white flex items-center justify-center"
            >
              <TelegramIcon class="w-5 h-5" />
            </button>
          </div>

          <div class="mt-6 text-center text-sm text-white/70">
            {{ mode === 'signin' ? 'Нет аккаунта?' : 'Уже есть аккаунт?' }}
            <button
              class="underline"
              @click="mode = mode === 'signin' ? 'signup' : 'signin'"
            >
              {{ mode === 'signin' ? 'Создать' : 'Войти' }}
            </button>
          </div>
        </div>

        <p class="mt-4 text-center text-xs text-white/60">
          Защита данных: end-to-end для приватных чатов, ключи разделены
          (zero-trust). Подробнее в
          <NuxtLink to="/legal/privacy" class="underline">политике</NuxtLink>.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import TelegramIcon from '~icons/mdi/telegram';
import VkIcon from '~icons/simple-icons/vk';
import GoogleIcon from '~icons/logos/google-icon';

definePageMeta({
  layout: 'auth',
});

const auth = useAuthStore();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref(''),
  password = ref(''),
  name = ref(''),
  agree = ref(false),
  remember = ref(true),
  loading = ref(false);

const langCookie = useCookie<string | null>('mentai.lang', {
  maxAge: 365 * 24 * 3600,
  path: '/',
});
const locale = computed(() => langCookie.value || 'ru');

async function submit() {
  try {
    loading.value = true;
    if (mode.value === 'signin') {
      const payload = {
        email: email.value,
        password: password.value,
        locale: locale.value,
      };
      await auth.loginEmail(payload);
    } else {
      const payload = {
        email: email.value,
        password: password.value,
        name: name.value || undefined,
        locale: locale.value,
      };
      await auth.registerEmail(payload);
    }
  } catch (e) {
    console.error('Auth error', e);
  } finally {
    loading.value = false;
  }
}

function oauth(provider: string) {
  auth.oauth(provider, locale.value);
}
</script>
