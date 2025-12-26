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
            <div class="text-sm text-muted-foreground">вход и регистрация</div>
          </div>

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
                <label class="block text-sm mb-1 text-foreground">Имя</label>
                <Input
                  v-model="name"
                  type="text"
                  required
                  :show-clear-button="false"
                />
              </div>
            </template>

            <div>
              <label class="block text-sm mb-1 text-foreground">Email</label>
              <Input
                v-model="email"
                type="email"
                required
                :show-clear-button="false"
              />
            </div>

            <div>
              <label class="block text-sm mb-1 text-foreground">Пароль</label>
              <Input
                v-model="password"
                type="password"
                required
                :show-clear-button="false"
              />
            </div>

            <div class="flex items-center justify-end" v-if="mode === 'signin'">
              <NuxtLink
                to="/forgot"
                class="text-sm text-muted-foreground hover:text-foreground transition"
                >Забыли пароль?</NuxtLink
              >
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
                      >Условия</NuxtLink
                    >
                    и
                    <NuxtLink
                      to="/legal/privacy"
                      class="underline text-primary hover:text-primary/80"
                      >Политику</NuxtLink
                    ></span
                  >
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

        <p class="mt-4 text-center text-xs text-muted-foreground">
          Защита данных: end-to-end для приватных чатов, ключи разделены
          (zero-trust). Подробнее в
          <NuxtLink
            to="/legal/privacy"
            class="underline text-primary hover:text-primary/80"
            >политике</NuxtLink
          >.
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
import NeuralBg from '@/app/components/ui/bg-neural/NeuralBg.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';

definePageMeta({
  layout: 'auth',
});

const auth = useAuthStore();

const mode = ref<'signin' | 'signup'>('signin');
const email = ref(''),
  password = ref(''),
  name = ref(''),
  agree = ref(false),
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
