<template>
  <article
    class="relative overflow-hidden xs:p-5 p-4"
    :class="
      embedded
        ? 'rounded-2xl border border-white/10 bg-white/[0.05]'
        : 'glass-deep rounded-lg'
    "
  >
    <div class="relative space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p
            class="text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
          >
            Результат
          </p>
          <h1 class="mt-1 text-2xl font-semibold leading-tight text-foreground">
            {{ title }}
          </h1>
        </div>
        <div
          class="flex shrink-0 items-baseline gap-1.5 rounded-2xl border border-foreground/12 bg-foreground/[0.05] px-4 py-2.5"
        >
          <span
            class="text-[32px] font-bold leading-none tabular-nums text-foreground"
            >{{ score }}</span
          >
          <span
            class="whitespace-nowrap text-sm font-medium leading-none text-foreground/40"
            >из {{ maxScore }}</span
          >
        </div>
      </div>

      <!-- Шкала с позицией результата: сегменты — диапазоны, маркер — текущий
           балл. Подписи концов зависят от направления шкалы. -->
      <div v-if="hasScale" class="space-y-2.5 pt-1">
        <div class="relative h-3">
          <div class="flex h-full gap-1">
            <span
              v-for="segment in segments"
              :key="segment.id"
              class="h-full rounded-full transition-colors"
              :class="
                segment.active ? 'bg-foreground/35' : 'bg-foreground/[0.1]'
              "
              :style="{ width: `${segment.width}%` }"
            />
          </div>
          <span
            class="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background/70 bg-foreground shadow-[0_4px_12px_-3px_rgba(0,0,0,0.6)]"
            :style="{ left: `${markerLeft}%` }"
          />
        </div>
        <div
          class="flex justify-between text-[11px] font-medium text-foreground/50"
        >
          <span>{{ scaleStartLabel }}</span>
          <span>{{ scaleEndLabel }}</span>
        </div>
      </div>

      <p class="text-sm leading-relaxed text-foreground/72">
        {{ shortText }}
      </p>

      <div
        v-if="comparisonText"
        class="rounded-2xl border border-white/10 bg-white/[0.08] p-4"
      >
        <p
          class="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
        >
          Сравнение с прошлым разом
        </p>
        <p class="text-sm leading-relaxed text-foreground/72">
          {{ comparisonText }}
        </p>
      </div>

      <div
        v-if="safetyLevel !== 'none'"
        class="rounded-2xl border border-amber-200/25 bg-amber-200/[0.14] p-4 text-sm leading-relaxed text-amber-50/90"
      >
        Ответы показывают, что сейчас может быть особенно тяжело. Это не
        диагноз, но важный сигнал не оставаться с этим в одиночку. Если тебе
        небезопасно или состояние резко ухудшается, обратись за срочной живой
        помощью в своём регионе.
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  AssessmentResultBand,
  AssessmentSafetyLevel,
  AssessmentScoreDirection,
} from '@/shared/dto/assessments';

const props = defineProps<{
  title: string;
  shortText: string;
  score: number;
  category: string;
  comparisonText?: string | null;
  safetyLevel: AssessmentSafetyLevel;
  // Данные шкалы для визуализации позиции результата.
  minScore: number;
  maxScore: number;
  scoreDirection: AssessmentScoreDirection;
  bands: Pick<AssessmentResultBand, 'id' | 'minScore' | 'maxScore'>[];
  // Активный диапазон — подсвечиваем нужный сегмент.
  activeBandId?: string | null;
  // embedded: внутри уже существующей glass-deep панели (Roadmap) — не дублируем
  // рамку, используем внутренний стиль карточки.
  embedded?: boolean;
}>();

const range = computed(() => Math.max(1, props.maxScore - props.minScore));

const hasScale = computed(
  () => props.bands.length > 0 && props.maxScore > props.minScore
);

// Сегменты шкалы строятся из диапазонов и сортируются по возрастанию балла.
const segments = computed(() =>
  [...props.bands]
    .sort((a, b) => a.minScore - b.minScore)
    .map((band) => ({
      id: band.id,
      width: ((band.maxScore - band.minScore + 1) / (range.value + 1)) * 100,
      active: band.id === props.activeBandId,
    }))
);

const markerLeft = computed(() => {
  const ratio = (props.score - props.minScore) / range.value;
  return Math.max(2, Math.min(98, ratio * 100));
});

// Подписи концов шкалы зависят от домена оценки, а не только от направления
// баллов: у отношений и самоподдержки одинаковое higher_is_better, но разный смысл.
const scaleStartLabel = computed(() => {
  if (props.scoreDirection === 'higher_is_worse') return 'спокойнее';
  if (props.category === 'relationships') return 'сложнее в отношениях';
  if (props.category === 'self_kindness') return 'меньше поддержки';
  return 'ниже результат';
});

const scaleEndLabel = computed(() => {
  if (props.scoreDirection === 'higher_is_worse') return 'тревожнее';
  if (props.category === 'relationships') return 'устойчивее в отношениях';
  if (props.category === 'self_kindness') return 'больше поддержки';
  return 'выше результат';
});
</script>
