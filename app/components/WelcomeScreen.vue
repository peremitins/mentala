<template>
  <div
    class="flex flex-col items-center justify-center h-full px-4 py-8 space-y-8"
  >
    <!-- Приветственный блок -->
    <div class="text-center space-y-2 animate-fade-in">
      <h1 class="text-3xl font-bold text-foreground">Привет!</h1>
      <p class="text-lg text-white/80">О чём поговорим сейчас?</p>
    </div>

    <!-- Основное действие -->
    <div class="w-full max-w-md space-y-4">
      <button
        @click="handleSelect"
        class="w-full glass-deep rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        <div
          class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-500 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
        >
          <IconMessageCircle class="w-6 h-6 text-primary-foreground" />
        </div>
        <div class="flex-1 text-left">
          <div class="text-base font-semibold text-foreground mb-1">
            Поговорить
          </div>
          <div class="text-sm text-foreground">
            Начать диалог и получить поддержку
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import IconMessageCircle from '~icons/lucide/message-circle';

const emit = defineEmits<{
  (e: 'select'): void;
}>();

function handleSelect() {
  emit('select');
}
</script>
