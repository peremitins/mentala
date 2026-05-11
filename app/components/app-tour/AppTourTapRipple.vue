<template>
  <Teleport to="body">
    <div
      v-if="position"
      class="app-tour-ripple"
      :style="{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }"
      aria-hidden="true"
      @animationend="onAnimationEnd"
    >
      <!-- Палец-курсор: имитирует тап -->
      <div class="app-tour-ripple__pointer">
        <svg
          viewBox="0 0 32 32"
          width="32"
          height="32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="16"
            cy="16"
            r="11"
            fill="rgba(255, 255, 255, 0.92)"
            stroke="rgba(155, 120, 255, 0.7)"
            stroke-width="2"
          />
          <circle cx="16" cy="16" r="4" fill="rgba(139, 92, 246, 0.8)" />
        </svg>
      </div>

      <!-- Расходящиеся круги -->
      <span class="app-tour-ripple__wave app-tour-ripple__wave--1" />
      <span class="app-tour-ripple__wave app-tour-ripple__wave--2" />
      <span class="app-tour-ripple__wave app-tour-ripple__wave--3" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  /** Координаты центра целевого элемента в viewport-пространстве */
  at: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  (e: 'done'): void;
}>();

const position = computed(() => props.at);

let lastFireTime = 0;
function onAnimationEnd(ev: AnimationEvent) {
  // animationend срабатывает на каждом элементе анимации.
  // Берём только событие самого «долгого» элемента: pointer (700ms total).
  if (ev.animationName !== 'app-tour-tap-pointer') return;
  // Защита от дребезга
  const now = Date.now();
  if (now - lastFireTime < 100) return;
  lastFireTime = now;
  emit('done');
}
</script>

<style>
.app-tour-ripple {
  position: fixed;
  /* Сам ripple не должен ловить клики (декоративный) */
  pointer-events: none;
  /* Выше bubble и driver.js popover, чтобы анимация всегда видна */
  z-index: 2100000000;
  /* центр элемента → центр ripple */
  transform: translate(-50%, -50%);
  width: 0;
  height: 0;
}

/* Палец */
.app-tour-ripple__pointer {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0);
  filter: drop-shadow(0 4px 12px rgba(139, 92, 246, 0.5));
  animation: app-tour-tap-pointer 700ms cubic-bezier(0.34, 1.56, 0.64, 1)
    forwards;
}

/* Волны */
.app-tour-ripple__wave {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid rgba(180, 140, 255, 0.7);
  transform: translate(-50%, -50%) scale(0);
  opacity: 0;
}
.app-tour-ripple__wave--1 {
  animation: app-tour-wave 700ms cubic-bezier(0.4, 0, 0.2, 1) 200ms forwards;
}
.app-tour-ripple__wave--2 {
  animation: app-tour-wave 700ms cubic-bezier(0.4, 0, 0.2, 1) 320ms forwards;
}
.app-tour-ripple__wave--3 {
  animation: app-tour-wave 700ms cubic-bezier(0.4, 0, 0.2, 1) 440ms forwards;
}

@keyframes app-tour-tap-pointer {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
  }
  20% {
    transform: translate(-50%, -50%) scale(1.05);
    opacity: 1;
  }
  35% {
    transform: translate(-50%, -50%) scale(0.85);
    opacity: 1;
  }
  55% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  85% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(0.7);
    opacity: 0;
  }
}

@keyframes app-tour-wave {
  0% {
    transform: translate(-50%, -50%) scale(0);
    opacity: 0;
    border-width: 3px;
  }
  20% {
    opacity: 0.7;
  }
  100% {
    transform: translate(-50%, -50%) scale(4);
    opacity: 0;
    border-width: 1px;
  }
}
</style>
