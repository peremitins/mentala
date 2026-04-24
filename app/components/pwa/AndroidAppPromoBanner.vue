<template>
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="fixed bottom-safe-area-inset left-4 right-4 z-[70] mb-4"
    >
      <section
        class="glass-deep relative overflow-hidden rounded-[28px] px-4 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.34)]"
      >
        <!-- Декоративные glow-слои, чтобы карточка выглядела как часть продукта, а не как ad block. -->
        <div
          class="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-emerald-300/10 blur-3xl"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-sky-300/10 blur-3xl"
          aria-hidden="true"
        />

        <div class="relative flex items-start gap-3">
          <div
            class="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-white/12 bg-white/6 shadow-[0_12px_28px_rgba(0,0,0,0.22)]"
          >
            <img
              src="/brand-mark-192.png"
              alt="Mentala"
              class="h-9 w-9 rounded-[14px]"
            />
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                class="rounded-full border border-emerald-300/18 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100/85"
              >
                Android
              </span>
            </div>

            <p class="mt-2 text-sm font-semibold leading-tight text-white">
              {{ title }}
            </p>
          </div>

          <button
            type="button"
            class="rounded-full p-1.5 text-white/45 transition hover:bg-white/8 hover:text-white/78"
            aria-label="Закрыть баннер приложения"
            @click="$emit('close')"
          >
            <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
              />
            </svg>
          </button>
        </div>

        <div class="relative mt-4 flex flex-col gap-2">
          <button
            v-if="variant === 'open-app'"
            type="button"
            class="inline-flex min-h-12 items-center justify-center rounded-2xl border border-emerald-300/24 bg-gradient-to-r from-emerald-400/18 via-emerald-300/12 to-sky-300/18 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(16,185,129,0.18)] transition hover:border-emerald-200/35 hover:from-emerald-400/24 hover:to-sky-300/24"
            @click="$emit('open-app')"
          >
            Открыть приложение
          </button>

          <button
            v-else
            type="button"
            class="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-white/20 hover:bg-white/[0.06]"
            aria-label="Открыть приложение в Google Play"
            @click="$emit('open-store')"
          >
            <img
              src="/store-badges/google-play-badge.svg"
              alt="Доступно в Google Play"
              class="block h-auto w-full max-w-[210px]"
            />
          </button>

          <button
            type="button"
            class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm font-medium text-white/75 transition hover:border-white/18 hover:bg-white/[0.05] hover:text-white"
            @click="$emit('close')"
          >
            Продолжить в браузере
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean;
  variant: 'open-app' | 'google-play';
}>();

defineEmits<{
  'open-app': [];
  'open-store': [];
  close: [];
}>();

const title = computed(() => {
  return props.variant === 'open-app'
    ? 'Приложение уже установлено'
    : 'Откройте Mentala в Google Play';
});
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.28s ease,
    opacity 0.28s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.bottom-safe-area-inset {
  bottom: max(env(safe-area-inset-bottom), 1rem);
}
</style>
