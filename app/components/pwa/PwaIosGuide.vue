<template>
  <!-- Инструкция для добавления PWA на iOS экран Домой (Safari) -->
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="fixed bottom-safe-area-inset left-4 right-4 z-50 mb-4 rounded-2xl bg-zinc-900 p-4 shadow-xl ring-1 ring-white/10"
    >
      <div class="flex items-start justify-between gap-2 mb-3">
        <p class="text-sm font-semibold text-white leading-tight">
          Добавьте Ментала на экран Домой
        </p>
        <!-- Крестик = просто закрыть, без запоминания -->
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

      <!-- Шаги установки -->
      <div class="space-y-2">
        <div class="flex items-center gap-3">
          <div
            class="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white"
          >
            1
          </div>
          <p class="text-xs text-zinc-300 leading-snug">
            Нажмите
            <span
              class="inline-flex items-center gap-0.5 text-indigo-400 font-medium"
            >
              <!-- Иконка Share в Safari -->
              <svg
                class="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M10 3v10m0-10L7 6m3-3l3 3M4 13v3a1 1 0 001 1h10a1 1 0 001-1v-3"
                />
              </svg>
              Поделиться
            </span>
            в браузере Safari
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
            <span class="font-medium text-white">«На экран Домой»</span>
            из списка
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
            <span class="font-medium text-white">«Добавить»</span>
            — приложение появится на рабочем столе
          </p>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-white/10">
        <p class="text-xs text-zinc-500 leading-snug">
          После установки запускайте Ментала с рабочего стола без браузерного
          интерфейса
        </p>
      </div>

      <button
        class="mt-3 w-full rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-white/15 active:bg-white/20 transition-colors"
        @click="$emit('close')"
      >
        Понятно
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
}>();

defineEmits<{
  /** Закрыл — скроем до следующих 10:00 */
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
