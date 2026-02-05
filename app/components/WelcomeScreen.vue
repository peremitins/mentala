<template>
  <div
    class="glass-deep h-auto w-full m-auto flex flex-none flex-col items-center justify-center px-5 py-5 space-y-4"
  >
    <!-- Приветственный блок -->
    <div class="text-center space-y-2 animate-fade-in">
      <h1 class="text-3xl font-bold text-foreground">Привет!</h1>
      <p class="text-lg text-white/80">Здесь можно поговорить</p>
    </div>

    <!-- Основное действие -->
    <div class="w-full max-w-md space-y-4">
      <Button
        @click="handleSelect"
        variant="outline"
        class="w-full rounded-xl p-4 flex items-center gap-4 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group animate-slide-up bg-transparent"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        Начать
      </Button>
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
