<template>
  <!-- Баннер установки PWA для Android и Desktop -->
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="fixed bottom-safe-area-inset left-4 right-4 z-50 mb-4 rounded-2xl bg-zinc-900 p-4 shadow-xl ring-1 ring-white/10"
    >
      <!-- Заголовок с иконкой и кнопкой закрыть -->
      <div class="flex items-start gap-3">
        <img
          src="/brand-mark-192.png"
          alt="Ментала"
          class="h-12 w-12 flex-shrink-0 rounded-xl"
        />

        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-white leading-tight">
            Установить Ментала
          </p>
          <p class="mt-0.5 text-xs text-zinc-400 leading-snug">
            Добавьте на рабочий стол быстрый доступ без браузера
          </p>
        </div>

        <!-- Крестик = просто закрыть, без запоминания (появится снова в следующей сессии) -->
        <button
          class="flex-shrink-0 p-1 text-zinc-500 hover:text-zinc-300"
          aria-label="Закрыть"
          @click="$emit('close')"
        >
          <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
            />
          </svg>
        </button>
      </div>

      <!-- Нативный промпт доступен — кнопка «Установить» -->
      <template v-if="native">
        <div class="mt-3 flex gap-2">
          <button
            class="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
            @click="$emit('install')"
          >
            Установить
          </button>
          <button
            class="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15 active:bg-white/20 transition-colors"
            @click="$emit('close')"
          >
            Не сейчас
          </button>
        </div>
      </template>

      <!-- Мануальный гайд для Android (beforeinstallprompt не пришёл) -->
      <template v-else>
        <div class="mt-3 space-y-2">
          <div class="flex items-center gap-3">
            <div
              class="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
            >
              1
            </div>
            <p class="text-xs text-zinc-300 leading-snug">
              Нажмите
              <span class="font-medium text-white">⋮</span>
              (меню) в правом верхнем углу браузера
            </p>
          </div>

          <div class="flex items-center gap-3">
            <div
              class="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
            >
              2
            </div>
            <p class="text-xs text-zinc-300 leading-snug">
              Выберите
              <span class="font-medium text-white"
                >«Добавить на главный экран»</span
              >
              или
              <span class="font-medium text-white"
                >«Установить приложение»</span
              >
            </p>
          </div>

          <div class="flex items-center gap-3">
            <div
              class="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
            >
              3
            </div>
            <p class="text-xs text-zinc-300 leading-snug">
              Нажмите
              <span class="font-medium text-white">«Установить»</span>
              в появившемся диалоге
            </p>
          </div>
        </div>

        <div class="mt-3 flex gap-2">
          <button
            class="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15 active:bg-white/20 transition-colors"
            @click="$emit('close')"
          >
            Понятно
          </button>
        </div>
      </template>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  /** true — доступен нативный beforeinstallprompt, false — показываем мануальный гайд */
  native?: boolean;
}>();

defineEmits<{
  install: [];
  /** Закрыл баннер — скроем до следующих 10:00 */
  close: [];
}>();
</script>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
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
