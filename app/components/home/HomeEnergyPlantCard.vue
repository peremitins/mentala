<template>
  <section
    data-tour="home-garden"
    class="glass-deep relative grid grid-cols-[minmax(0,1fr)_96px] items-center gap-4 overflow-hidden p-4 animate-slide-up cursor-pointer transition hover:border-white/20 hover:bg-white/[0.04]"
    role="button"
    tabindex="0"
    aria-label="Открыть оранжерею"
    @click="openGarden"
    @keydown.enter.prevent="openGarden"
    @keydown.space.prevent="openGarden"
  >
    <!-- Ссылка-аффорданс «Оранжерея →» в правом верхнем углу всей карточки
         (над растением). Вся карточка кликабельна, ссылка — визуальный hint. -->
    <span
      class="absolute right-4 top-4 z-10 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-200"
      aria-hidden="true"
    >
      Оранжерея
      <IconArrowRight class="h-3 w-3" />
    </span>

    <div class="min-w-0 space-y-3">
      <div class="space-y-1">
        <p
          class="text-[10px] font-semibold uppercase tracking-wide text-emerald-200"
        >
          Мой росток
        </p>
        <h2 class="text-lg font-semibold leading-tight text-foreground">
          {{ stageTitle }}
        </h2>
        <p class="text-xs leading-relaxed text-foreground/65">
          {{ stageHint }}
        </p>
      </div>

      <div class="flex items-center gap-3">
        <div class="relative h-14 w-14 shrink-0">
          <svg
            class="h-14 w-14 -rotate-90"
            viewBox="0 0 48 48"
            aria-hidden="true"
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              stroke-width="5"
            />
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="url(#energy-ring-gradient)"
              stroke-linecap="round"
              stroke-width="5"
              :style="ringStyle"
            />
            <defs>
              <linearGradient
                id="energy-ring-gradient"
                x1="0"
                x2="1"
                y1="0"
                y2="1"
              >
                <stop offset="0" stop-color="#67e8f9" />
                <stop offset="1" stop-color="#6ee7b7" />
              </linearGradient>
            </defs>
          </svg>
          <div
            class="absolute inset-0 flex items-center justify-center text-emerald-100"
          >
            <IconDroplets class="h-5 w-5" />
          </div>
        </div>

        <div class="min-w-0">
          <p class="text-sm font-semibold text-foreground">
            {{ weeklyDropsText }}
          </p>
          <p class="text-xs text-foreground/60">
            {{ weeklyProgressText }}
          </p>
        </div>
      </div>
    </div>

    <div class="relative flex justify-end">
      <div
        class="absolute inset-2 rounded-full bg-emerald-300/20 blur-2xl"
        aria-hidden="true"
      />
      <!-- Растение — визуальная часть кликабельной карточки. Сам клик
           обрабатывает корневой section (вся карточка ведёт в Оранжерею). -->
      <div
        class="plant-frame relative h-24 w-24 rounded-[28px] transition active:scale-[0.98]"
        aria-hidden="true"
      >
        <span
          class="plant-water-glow absolute inset-2 rounded-full"
          :class="{ 'plant-water-glow--active': waterActive }"
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
        <Transition name="plant-crossfade" appear>
          <img
            :key="plantImageKey"
            :src="resolvedPlantSrc"
            :alt="stageTitle"
            class="plant-stage-image absolute inset-0 h-full w-full rounded-[28px] object-contain shadow-[0_16px_40px_-24px_rgba(110,231,183,0.8)]"
            loading="lazy"
            decoding="async"
            @error="handlePlantImageError"
          />
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import IconDroplets from '~icons/lucide/droplets';
import IconArrowRight from '~icons/lucide/arrow-right';
import {
  getRetentionPlantFallbackSrc,
  getRetentionPlantImageSrc,
  getRetentionPlantNextThreshold,
  getRetentionPlantStateIndex,
  getRetentionPlantTitle,
} from '@/app/utils/retentionPlant';
import type {
  ProgramOverviewDto,
  TodayResponseDto,
} from '@/shared/dto/retention';

const props = defineProps<{
  energy: TodayResponseDto['energy'];
  program: ProgramOverviewDto;
  waterSignal?: number;
  waterIntensity?: 'small' | 'medium' | 'large';
}>();
const waterActive = ref(false);
let waterTimer: number | null = null;

const completedSteps = computed(() =>
  Math.max(0, Math.min(props.program.completedSteps, props.program.totalSteps))
);

const stageIndex = computed(() =>
  getRetentionPlantStateIndex(completedSteps.value, props.program.totalSteps)
);

const stageTitle = computed(() =>
  getRetentionPlantTitle(stageIndex.value, props.program.plantSetSlug)
);
const plantSrc = computed(() =>
  getRetentionPlantImageSrc(stageIndex.value, props.program.plantSetSlug)
);
const plantFallbackSrc = computed(() =>
  getRetentionPlantFallbackSrc(stageIndex.value)
);
const resolvedPlantSrc = ref(plantSrc.value);
const plantImageKey = computed(
  () => `${stageIndex.value}-${resolvedPlantSrc.value}`
);
const waterDropCount = computed(() => {
  if (props.waterIntensity === 'small') return 3;
  if (props.waterIntensity === 'large') return 7;
  return 5;
});
const waterDrops = computed(() => {
  const count = waterDropCount.value;
  return Array.from({ length: count }, (_, index) => {
    const spread = index / (count - 1);
    return {
      id: index,
      style: {
        left: `${22 + spread * 56}%`,
        '--plant-water-delay': `${index * 90}ms`,
        '--plant-water-drift': `${index % 2 === 0 ? -8 : 8}px`,
        '--plant-water-duration': `${980 + index * 55}ms`,
      },
    };
  });
});

const stageHint = computed(() => {
  const nextThreshold = getRetentionPlantNextThreshold(
    stageIndex.value,
    props.program.totalSteps
  );
  if (!nextThreshold)
    return 'Программа завершена. Росток стал символом твоего пути.';

  const remaining = Math.max(1, nextThreshold - completedSteps.value);
  return `До следующей стадии: ${remaining} ${formatSteps(remaining)}.`;
});

const weeklyPercent = computed(() => {
  if (!props.energy.weeklyGoal) return 0;
  return Math.min(100, (props.energy.weekly / props.energy.weeklyGoal) * 100);
});

const ringStyle = computed(() => {
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (weeklyPercent.value / 100) * circumference;
  return {
    strokeDasharray: `${circumference} ${circumference}`,
    strokeDashoffset: `${offset}`,
  };
});

const weeklyDropsText = computed(
  () => `За неделю: ${props.energy.weekly} ${formatDrops(props.energy.weekly)}`
);

const weeklyProgressText = computed(() => {
  const remaining = Math.max(0, props.energy.weeklyGoal - props.energy.weekly);
  if (remaining === 0)
    return `Цель ${props.energy.weeklyGoal} ${formatDrops(props.energy.weeklyGoal)} выполнена.`;
  return `До цели: ${remaining} ${formatDrops(remaining)}.`;
});

function formatSteps(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'шагов';
  if (last === 1) return 'шаг';
  if (last >= 2 && last <= 4) return 'шага';
  return 'шагов';
}

function formatDrops(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'капель';
  if (last === 1) return 'капля';
  if (last >= 2 && last <= 4) return 'капли';
  return 'капель';
}

function handlePlantImageError() {
  if (resolvedPlantSrc.value === plantFallbackSrc.value) return;
  void capturePlantAssetWarning(stageIndex.value, resolvedPlantSrc.value);
  resolvedPlantSrc.value = plantFallbackSrc.value;
}

function openGarden() {
  // Тап по растению — единственная точка входа в Оранжерею (см.
  // retention/retention_long_term_strategy.md). Zoom-крупно через PhotoSwipe
  // перенесён на лор-карточку внутри `/garden`.
  void navigateTo('/garden');
}

async function capturePlantAssetWarning(stateIndex: number, src: string) {
  if (typeof window === 'undefined') return;

  try {
    const Sentry = await import('@sentry/vue');
    Sentry.captureMessage('Retention plant image failed to load', {
      level: 'warning',
      tags: {
        feature: 'retention_plant',
        surface: 'home',
      },
      extra: {
        stage: stateIndex + 1,
        src,
      },
    });
  } catch {
    console.warn('[RetentionPlant] Не удалось загрузить изображение:', src);
  }
}

function clearWaterTimer() {
  if (!waterTimer) return;
  clearTimeout(waterTimer);
  waterTimer = null;
}

function runInlineWater() {
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

watch(
  plantSrc,
  (src) => {
    resolvedPlantSrc.value = src;
  },
  { immediate: true }
);

watch(
  () => props.waterSignal,
  (signal, previousSignal) => {
    if (!signal || signal === previousSignal) return;
    runInlineWater();
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

.plant-water-glow--active {
  animation: plant-water-card-glow 1.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.plant-water-drop {
  top: -8px;
  width: 4px;
  height: 7px;
  border: 0.7px solid rgba(255, 255, 255, 0.45);
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
  transform: translate3d(0, -12px, 0) rotate(16deg) scale(0.72);
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
    transform: translate3d(0, -12px, 0) rotate(16deg) scale(0.72);
  }
  24% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--plant-water-drift), 74px, 0) rotate(16deg)
      scale(0.92);
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
