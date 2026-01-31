<template>
  <div
    class="w-max px-3 py-2 items-center max-w-[80%] glass-deep transition-all duration-300"
  >
    <div class="flex items-center gap-2">
      <!-- Текст -->
      <span class="text-sm text-foreground transition-opacity duration-300">
        {{ text }}
      </span>
      <!-- Анимированные точки -->
      <div class="flex items-center gap-1">
        <span
          v-for="i in 3"
          :key="i"
          class="w-2 h-2 rounded-full bg-primary-ui/80 animate-pulse-smooth"
          :style="{
            animationDelay: `${(i - 1) * 0.15}s`,
            animationDuration: '1.2s',
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  text?: string;
}

const props = withDefaults(defineProps<Props>(), {
  text: 'Пишу...',
});
</script>

<style scoped>
/* Более плавная анимация пульсации точек */
@keyframes pulse-smooth {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.1);
    opacity: 1;
  }
}

.animate-pulse-smooth {
  animation: pulse-smooth 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
