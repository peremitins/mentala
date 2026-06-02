<template>
  <ClientOnly>
    <div class="moodax">
      <div v-if="hasNoData" class="moodax__empty">
        <p class="moodax__empty-title">{{ emptyTitle }}</p>
        <p class="moodax__empty-text">{{ emptyText }}</p>
      </div>
      <component
        :is="ApexChartComponent"
        v-else
        type="area"
        :height="compact ? 96 : 240"
        :options="chartOptions"
        :series="series"
      />
    </div>
    <template #fallback>
      <div class="moodax moodax--skeleton" aria-hidden="true">
        <div class="moodax__skeleton-line" style="width: 92%" />
        <div class="moodax__skeleton-line" style="width: 78%" />
        <div class="moodax__skeleton-line" style="width: 96%" />
      </div>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import {
  buildMoodAnxietyChartOptions,
  buildMoodAnxietyChartSeries,
} from '@/app/components/garden/moodAnxietyChartConfig';
import { useAuthStore } from '@/app/stores/auth';
import type {
  AnxietyTimelinePointDto,
  MoodTimelinePointDto,
} from '@/shared/dto/program-checkpoint';

/**
 * График динамики одной метрики (тревога ИЛИ настроение) за период программы.
 *
 * Архитектурное решение: каждая метрика — отдельный график. Раньше два
 * source данных (anxiety scale 0-10 + mood -2..+2) рисовались вместе на одной
 * canvas с двумя Y-осями, и это давало путаницу: разные шкалы накладывались,
 * при малом числе точек получалась визуальная каша. Каждая метрика — это
 * самостоятельная клиническая концепция (SUDS-тревога vs. валентность mood),
 * их нельзя совмещать в одной плоскости.
 *
 * Использование: рендерить компонент столько раз, сколько метрик с данными.
 *   <MoodAnxietyChart mode="anxiety" :anxiety-timeline="..." />
 *   <MoodAnxietyChart mode="mood" :mood-timeline="..." />
 *
 * Режим `compact` уменьшает высоту до 96px (для KPI-карточек и timeline-точек).
 */

const props = withDefaults(
  defineProps<{
    /**
     * Что показывать на графике:
     *   - 'anxiety' — только тревога (rating_scale 0-10);
     *   - 'mood' — только настроение (-2..+2);
     *   - 'both' — обе шкалы на одной canvas (legacy, оставлено для совместимости).
     */
    mode?: 'anxiety' | 'mood' | 'both';
    anxietyTimeline?: AnxietyTimelinePointDto[];
    moodTimeline?: MoodTimelinePointDto[];
    compact?: boolean;
  }>(),
  {
    mode: 'both',
    anxietyTimeline: () => [],
    moodTimeline: () => [],
    compact: false,
  }
);

// vue3-apexcharts — динамический импорт, чтобы apexcharts не попадал в SSR-бандл.
const ApexChartComponent = defineAsyncComponent(async () => {
  const mod = await import('vue3-apexcharts');
  return mod.default;
});

const auth = useAuthStore();
// Локаль из настроек пользователя (auth.user.locale) — нормализуем к
// BCP-47 формату для Intl.DateTimeFormat. По умолчанию русский.
const userLocale = computed(() => {
  const raw = auth.user?.locale?.toString().toLowerCase() ?? '';
  if (!raw) return 'ru-RU';
  if (raw === 'ru' || raw === 'rus') return 'ru-RU';
  if (raw === 'en' || raw === 'eng') return 'en-US';
  // Если уже полная BCP-47 (ru-RU, en-US) — отдаём как есть.
  return raw;
});

// Эффективные timeline'ы с учётом mode. Если mode='anxiety' — moodTimeline
// игнорируется (даже если передан), и наоборот. Это гарантирует, что
// каждый экземпляр компонента рисует ровно одну серию = одну понятную линию.
const effectiveAnxietyTimeline = computed(() =>
  props.mode === 'mood' ? [] : props.anxietyTimeline
);
const effectiveMoodTimeline = computed(() =>
  props.mode === 'anxiety' ? [] : props.moodTimeline
);

const hasAnxiety = computed(() => effectiveAnxietyTimeline.value.length > 0);
const hasMood = computed(() => effectiveMoodTimeline.value.length > 0);

const hasNoData = computed(() => !hasAnxiety.value && !hasMood.value);

const series = computed(() =>
  buildMoodAnxietyChartSeries({
    anxietyTimeline: effectiveAnxietyTimeline.value,
    moodTimeline: effectiveMoodTimeline.value,
  })
);

const chartOptions = computed(() =>
  buildMoodAnxietyChartOptions({
    compact: props.compact,
    hasAnxiety: hasAnxiety.value,
    hasMood: hasMood.value,
    anxietyMin: effectiveAnxietyTimeline.value[0]?.min ?? 0,
    anxietyMax: effectiveAnxietyTimeline.value[0]?.max ?? 10,
    locale: userLocale.value,
  })
);

// Подсказка для пустого состояния в зависимости от mode — пользователь
// должен понимать, какая именно метрика отсутствует.
const emptyTitle = computed(() => {
  if (props.mode === 'anxiety') return 'Данных по тревоге пока нет';
  if (props.mode === 'mood') return 'Данных по настроению пока нет';
  return 'Динамика появится здесь';
});
const emptyText = computed(() => {
  if (props.mode === 'anxiety') {
    return 'Когда отметишь тревогу по шкале 0–10 на шаге программы, график начнёт собираться.';
  }
  if (props.mode === 'mood') {
    return 'Когда отметишь настроение смайликом на главной, график начнёт собираться.';
  }
  return 'Когда отметишь тревогу на шкале или настроение, график начнёт собираться.';
});
</script>

<style scoped>
.moodax {
  position: relative;
  width: 100%;
  padding: 4px 0;
}

.moodax--skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
  justify-content: center;
}

.moodax__skeleton-line {
  height: 12px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.09) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  border-radius: 6px;
  animation: moodax-skeleton 1.5s ease-in-out infinite;
}

@keyframes moodax-skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.moodax__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 24px 16px;
  text-align: center;
  background: rgba(255, 255, 255, 0.025);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.moodax__empty-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground) / 0.75);
}

.moodax__empty-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: hsl(var(--foreground) / 0.5);
}
</style>
