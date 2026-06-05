<template>
  <div :class="frameClass" :style="frameStyle" aria-hidden="true">
    <span
      class="plant-water-glow absolute rounded-full"
      :class="glowClasses"
      aria-hidden="true"
    />
    <span
      v-if="waterActive"
      class="plant-water-layer absolute inset-0"
      aria-hidden="true"
    >
      <span
        v-for="drop in waterDrops"
        :key="drop.id"
        class="plant-water-drop absolute"
        :style="drop.style"
      />
    </span>
    <Transition :name="transitionName" appear>
      <img
        :key="plantImageKey"
        :src="resolvedSrc"
        :alt="alt"
        :class="imageClass"
        loading="lazy"
        decoding="async"
        @error="handleImageError"
      />
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  buildRetentionPlantWaterFrameVars,
  type RetentionPlantWaterFrameVars,
} from '@/app/utils/retentionPlantWaterFrame';
import type { PlantWaterIntensity } from '@/app/composables/usePlantWaterFeedback';

const props = withDefaults(
  defineProps<{
    src: string;
    fallbackSrc: string;
    alt?: string;
    waterSignal?: number;
    waterIntensity?: PlantWaterIntensity;
    framePx?: number;
    frameClass?: string;
    glowClass?: string;
    glowVariant?: 'default' | 'strong' | 'header';
    imageClass?: string;
    transitionName?: string;
  }>(),
  {
    alt: '',
    waterSignal: 0,
    waterIntensity: 'medium',
    framePx: 96,
    frameClass: 'plant-frame relative h-24 w-24 rounded-[28px]',
    glowClass: 'inset-2',
    glowVariant: 'default',
    imageClass:
      'plant-stage-image absolute inset-0 h-full w-full rounded-[28px] object-contain',
    transitionName: 'plant-crossfade',
  }
);

const emit = defineEmits<{
  (e: 'image-error', src: string): void;
}>();

const waterActive = ref(false);
const resolvedSrc = ref(props.src);
let waterTimer: number | null = null;

const frameStyle = computed<RetentionPlantWaterFrameVars>(() =>
  buildRetentionPlantWaterFrameVars(props.framePx)
);

const glowClasses = computed(() => [
  props.glowClass,
  {
    'plant-water-glow--active': waterActive.value,
    'plant-water-glow--strong': props.glowVariant === 'strong',
    'plant-water-glow--header': props.glowVariant === 'header',
  },
]);

const plantImageKey = computed(() => `${props.src}-${resolvedSrc.value}`);

const waterDropCount = computed(() => {
  if (props.waterIntensity === 'small') return 3;
  if (props.waterIntensity === 'large') return 7;
  return 5;
});

const waterDrops = computed(() => {
  const count = waterDropCount.value;
  return Array.from({ length: count }, (_, index) => {
    const spread = index / (count - 1);
    const driftSign = index % 2 === 0 ? -1 : 1;

    return {
      id: index,
      style: {
        left: `${22 + spread * 56}%`,
        '--plant-water-delay': `${index * 90}ms`,
        '--plant-water-drift': `calc(var(--plant-water-drop-drift-base) * ${driftSign})`,
        '--plant-water-duration': `${980 + index * 55}ms`,
      },
    };
  });
});

function clearWaterTimer() {
  if (!waterTimer) return;
  window.clearTimeout(waterTimer);
  waterTimer = null;
}

function runWaterAnimation() {
  if (typeof window === 'undefined') return;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }

  clearWaterTimer();
  waterActive.value = false;

  const scheduleFrame = (callback: (time: number) => void) => {
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
      return;
    }
    window.setTimeout(() => callback(Date.now()), 16);
  };

  scheduleFrame(() => {
    waterActive.value = true;
    waterTimer = window.setTimeout(() => {
      waterActive.value = false;
      waterTimer = null;
    }, 1500);
  });
}

function handleImageError() {
  if (resolvedSrc.value === props.fallbackSrc) return;
  emit('image-error', resolvedSrc.value);
  resolvedSrc.value = props.fallbackSrc;
}

watch(
  () => props.src,
  (src) => {
    resolvedSrc.value = src;
  },
  { immediate: true }
);

watch(
  () => props.waterSignal,
  (signal, previousSignal) => {
    if (!signal || signal === previousSignal) return;
    runWaterAnimation();
  }
);

onBeforeUnmount(() => {
  clearWaterTimer();
});
</script>

<style scoped>
.plant-frame {
  transform: translateZ(0);
}

.plant-water-layer,
.plant-water-glow {
  pointer-events: none;
}

.plant-water-glow {
  z-index: 0;
  background: radial-gradient(
    circle,
    rgba(187, 247, 208, 0.32),
    rgba(103, 232, 249, 0.14) 48%,
    transparent 72%
  );
  opacity: 0;
  transform: scale(0.88);
}

.plant-water-glow--strong {
  background: radial-gradient(
    circle at 50% 58%,
    rgba(240, 253, 250, 0.82) 0 14%,
    rgba(110, 231, 183, 0.6) 34%,
    rgba(45, 212, 191, 0.38) 55%,
    rgba(20, 184, 166, 0.2) 73%,
    transparent 90%
  );
  filter: saturate(1.22);
}

.plant-water-glow--active {
  animation: plant-water-card-glow 1.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.plant-water-glow--strong.plant-water-glow--active {
  animation-name: plant-water-card-glow-strong;
}

.plant-water-glow--header {
  background: radial-gradient(
    circle,
    rgba(134, 239, 172, 0.52) 0%,
    rgba(52, 211, 153, 0.28) 42%,
    rgba(20, 184, 166, 0.12) 68%,
    transparent 88%
  );
  filter: blur(7px);
}

.plant-water-glow--header.plant-water-glow--active {
  animation: plant-water-header-glow 1.6s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.plant-water-drop {
  top: var(--plant-water-drop-top);
  width: var(--plant-water-drop-width);
  height: var(--plant-water-drop-height);
  border: var(--plant-water-drop-border) solid rgba(255, 255, 255, 0.45);
  border-radius: 52% 48% 58% 42% / 64% 56% 44% 36%;
  background: radial-gradient(
      circle at 34% 26%,
      rgba(255, 255, 255, 0.95) 0 13%,
      transparent 15%
    ),
    linear-gradient(
      150deg,
      rgba(240, 249, 255, 0.92),
      rgba(125, 211, 252, 0.58) 58%,
      rgba(34, 211, 238, 0.34)
    );
  opacity: 0;
  transform: translate3d(0, var(--plant-water-drop-start-y), 0) rotate(16deg)
    scale(0.72);
  animation: plant-water-card-drop var(--plant-water-duration)
    cubic-bezier(0.16, 1, 0.3, 1) both;
  animation-delay: var(--plant-water-delay);
}

.plant-water-layer {
  z-index: 2;
}

.plant-stage-image {
  z-index: 1;
  transform-origin: center;
  will-change: opacity, transform;
}

.plant-crossfade-enter-active,
.plant-crossfade-leave-active {
  pointer-events: none;
}

.plant-crossfade-enter-active {
  animation: plant-stage-emerge 1000ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.plant-crossfade-leave-active {
  animation: plant-stage-dissolve 1000ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes plant-stage-emerge {
  0% {
    opacity: 0;
    transform: translate3d(0, 4px, 0) scale(0.985);
  }
  48% {
    opacity: 0.58;
    transform: translate3d(0, 1px, 0) scale(0.997);
  }
  72% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1.012);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes plant-stage-dissolve {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate3d(0, -2px, 0) scale(0.985);
  }
}

@keyframes plant-water-card-drop {
  0% {
    opacity: 0;
    transform: translate3d(0, var(--plant-water-drop-start-y), 0) rotate(16deg)
      scale(0.72);
  }
  24% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(
        var(--plant-water-drift),
        var(--plant-water-drop-fall),
        0
      )
      rotate(16deg) scale(0.92);
  }
}

@keyframes plant-water-card-glow {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.88);
  }
  42%,
  76% {
    opacity: 1;
    transform: scale(1.08);
  }
}

@keyframes plant-water-card-glow-strong {
  0%,
  100% {
    opacity: 0;
    transform: scale(0.84);
  }
  26% {
    opacity: 0.78;
    transform: scale(1);
  }
  48%,
  78% {
    opacity: 1;
    transform: scale(1.2);
  }
}

@keyframes plant-water-header-glow {
  0% {
    opacity: 0;
    transform: scale(0.7);
    filter: blur(10px);
  }
  22% {
    opacity: 0.72;
    transform: scale(1.05);
    filter: blur(6px);
  }
  48%,
  68% {
    opacity: 0.95;
    transform: scale(1);
    filter: blur(5px);
  }
  100% {
    opacity: 0;
    transform: scale(1.5);
    filter: blur(12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .plant-crossfade-enter-active,
  .plant-crossfade-leave-active {
    animation: plant-stage-fade-reduced 120ms ease both;
  }

  .plant-crossfade-leave-active {
    animation-name: plant-stage-fade-out-reduced;
  }

  .plant-water-glow--active,
  .plant-water-drop {
    animation: none;
  }
}

@keyframes plant-stage-fade-reduced {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes plant-stage-fade-out-reduced {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
</style>
