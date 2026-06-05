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
      <RetentionPlantWaterFrame
        :src="plantSrc"
        :fallback-src="plantFallbackSrc"
        :alt="stageTitle"
        :water-signal="waterSignal"
        :water-intensity="waterIntensity"
        :frame-px="96"
        frame-class="plant-frame relative h-24 w-24 rounded-[28px] transition active:scale-[0.98]"
        glow-class="inset-2"
        image-class="plant-stage-image absolute inset-0 h-full w-full rounded-[28px] object-contain shadow-[0_16px_40px_-24px_rgba(110,231,183,0.8)]"
        @image-error="handlePlantImageError"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconDroplets from '~icons/lucide/droplets';
import IconArrowRight from '~icons/lucide/arrow-right';
import RetentionPlantWaterFrame from '@/app/components/retention/RetentionPlantWaterFrame.vue';
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

function handlePlantImageError(src: string) {
  void capturePlantAssetWarning(stageIndex.value, src);
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
</script>
