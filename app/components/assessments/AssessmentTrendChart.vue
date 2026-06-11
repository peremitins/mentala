<template>
  <div
    class="xs:p-5 p-4"
    :class="
      embedded
        ? 'rounded-2xl border border-white/10 bg-white/[0.05]'
        : 'glass-deep rounded-lg'
    "
  >
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-semibold text-foreground">Динамика</h2>
        <p class="mt-1 text-xs leading-relaxed text-foreground/55">
          {{ directionLabel }}
        </p>
      </div>
    </div>

    <div
      v-if="points.length < 2"
      class="rounded-2xl border border-white/10 bg-white/[0.08] p-4 text-sm leading-relaxed text-foreground/62"
    >
      График появится после двух прохождений в разные дни.
    </div>

    <svg
      v-else
      viewBox="0 0 320 150"
      class="h-[150px] w-full overflow-visible"
      role="img"
      aria-label="График динамики оценки состояния"
    >
      <line
        v-for="tick in ticks"
        :key="tick"
        x1="0"
        x2="320"
        :y1="tick"
        :y2="tick"
        class="stroke-foreground/10"
        stroke-width="1"
      />
      <polyline
        :points="polylinePoints"
        fill="none"
        class="stroke-foreground"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle
        v-for="point in normalized"
        :key="point.attemptId"
        :cx="point.x"
        :cy="point.y"
        r="5"
        class="fill-background stroke-foreground"
        stroke-width="3"
      />
    </svg>

    <div
      v-if="points.length >= 2"
      class="mt-3 flex items-center justify-between text-[11px] text-foreground/50"
    >
      <span>{{ points[0]?.userDate }}</span>
      <span>{{ points[points.length - 1]?.userDate }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  AssessmentChartPoint,
  AssessmentScoreDirection,
} from '@/shared/dto/assessments';

const props = defineProps<{
  points: AssessmentChartPoint[];
  scoreDirection: AssessmentScoreDirection;
  minScore: number;
  maxScore: number;
  embedded?: boolean;
}>();

const ticks = [18, 52, 86, 120];

const directionLabel = computed(() =>
  props.scoreDirection === 'higher_is_better'
    ? 'Чем выше показатель, тем лучше состояние.'
    : 'Чем ниже показатель, тем легче состояние.'
);

const normalized = computed(() => {
  const range = Math.max(1, props.maxScore - props.minScore);
  const lastIndex = Math.max(1, props.points.length - 1);
  return props.points.map((point, index) => {
    const ratio = (point.totalScore - props.minScore) / range;
    return {
      ...point,
      x: 12 + (index / lastIndex) * 296,
      y: 132 - Math.max(0, Math.min(1, ratio)) * 114,
    };
  });
});

const polylinePoints = computed(() =>
  normalized.value.map((point) => `${point.x},${point.y}`).join(' ')
);
</script>
