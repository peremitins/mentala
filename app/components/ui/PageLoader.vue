<template>
  <div class="heart-loader-wrapper">
    <div class="heart-loader" :style="{ fontSize: `${loaderSize}px` }">
      <div class="heart-piece heart-piece-0"></div>
      <div class="heart-piece heart-piece-1"></div>
      <div class="heart-piece heart-piece-2"></div>
      <div class="heart-piece heart-piece-3"></div>
      <div class="heart-piece heart-piece-4"></div>
      <div class="heart-piece heart-piece-5"></div>
      <div class="heart-piece heart-piece-6"></div>
      <div class="heart-piece heart-piece-7"></div>
      <div class="heart-piece heart-piece-8"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    size?: 'sm' | 'md' | 'lg' | number;
  }>(),
  {
    size: 'md',
  }
);

// Размеры в пикселях
const sizeMap = {
  sm: 12,
  md: 18,
  lg: 24,
};

// Вычисляем размер в пикселях
const loaderSize = computed(() => {
  if (typeof props.size === 'number') {
    return props.size;
  }
  return sizeMap[props.size];
});
</script>

<style scoped>
.heart-loader-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: auto;
}

.heart-loader {
  position: relative;
  display: flex;
  align-items: center;
  /* font-size устанавливается через :style для гибкости */
  filter: drop-shadow(0 0 0.67em hsla(var(--primary), 0.4));
  animation: loader-appear 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes loader-appear {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.heart-piece {
  position: relative;
  width: 1em;
  height: 1em;
  margin: 0 0.11em; /* 2px при font-size: 18px */
  border-radius: 50% / 0.5em;
  background-color: hsl(var(--primary));
}

.heart-piece::after,
.heart-piece::before {
  background-color: hsl(var(--primary));
  content: '';
  position: absolute;
  left: 0;
  width: 1em;
  transform: scaleY(0);
  animation: heart-scale 3.2s infinite;
}

.heart-piece::before {
  transform-origin: bottom center;
  bottom: 50%;
  border-top-left-radius: 50% 0.5em;
  border-top-right-radius: 50% 0.5em;
}

.heart-piece::after {
  transform-origin: top center;
  top: 50%;
  border-bottom-left-radius: 50% 0.5em;
  border-bottom-right-radius: 50% 0.5em;
}

/* Высоты для разных частей */
.heart-piece-4::before {
  height: 3em;
}
.heart-piece-4::after {
  height: 6.4em;
}

.heart-piece-3::before,
.heart-piece-5::before {
  height: 4em;
}
.heart-piece-3::after,
.heart-piece-5::after {
  height: 5.4em;
}

.heart-piece-2::before,
.heart-piece-6::before {
  height: 4.6em;
}
.heart-piece-2::after,
.heart-piece-6::after {
  height: 4.8em;
}

.heart-piece-1::before,
.heart-piece-7::before {
  height: 4em;
}
.heart-piece-1::after,
.heart-piece-7::after {
  height: 4em;
}

.heart-piece-0::before,
.heart-piece-8::before {
  height: 2em;
}
.heart-piece-0::after,
.heart-piece-8::after {
  height: 2em;
}

/* Задержки анимации */
.heart-piece-0::after,
.heart-piece-0::before {
  animation-delay: 0s;
}
.heart-piece-1::after,
.heart-piece-1::before {
  animation-delay: 0.15s;
}
.heart-piece-2::after,
.heart-piece-2::before {
  animation-delay: 0.3s;
}
.heart-piece-3::after,
.heart-piece-3::before {
  animation-delay: 0.45s;
}
.heart-piece-4::after,
.heart-piece-4::before {
  animation-delay: 0.6s;
}
.heart-piece-5::after,
.heart-piece-5::before {
  animation-delay: 0.75s;
}
.heart-piece-6::after,
.heart-piece-6::before {
  animation-delay: 0.9s;
}
.heart-piece-7::after,
.heart-piece-7::before {
  animation-delay: 1.05s;
}
.heart-piece-8::after,
.heart-piece-8::before {
  animation-delay: 1.2s;
}

@keyframes heart-scale {
  0%,
  10%,
  90%,
  100% {
    transform: scaleY(0);
  }

  45%,
  55% {
    transform: scaleY(1);
  }
}
</style>
