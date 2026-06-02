<template>
  <section class="glass-deep p-4">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1 space-y-2">
        <p
          class="inline-flex rounded-full border border-emerald-200/25 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-100"
        >
          Сейчас растёт
        </p>
        <h2 class="text-lg font-semibold text-foreground">
          {{ plant.title }}
        </h2>
        <p
          v-if="plant.summaryText"
          class="text-xs leading-relaxed text-foreground/70"
        >
          {{ plant.summaryText }}
        </p>
        <!-- Прогресс по шагам программы. Переехал из бывшего /programs/index,
             объединённого с Оранжереей. Догружается из overview-endpoint;
             если недоступен — просто не показываем (карточка остаётся целой). -->
        <div v-if="progress" class="space-y-1 pt-0.5">
          <p class="text-[11px] text-foreground/55">
            {{ progress.completedSteps }} из {{ progress.totalSteps }} ·
            {{ progress.progressPercent }}%
          </p>
          <div class="h-1.5 overflow-hidden rounded-full bg-white/12">
            <div
              class="h-full rounded-full bg-emerald-300 transition-all duration-500"
              :style="{ width: `${progress.progressPercent}%` }"
            />
          </div>
        </div>

        <NuxtLink
          :to="`/programs/${plant.programSlug}/map`"
          class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-200 hover:text-emerald-100"
        >
          Продолжить путь →
        </NuxtLink>
      </div>

      <!-- Превью текущей стадии растения. Тап открывает фото во весь экран
           через PhotoSwipe (тот же composable, что в дневнике благодарности). -->
      <button
        v-if="plantImageSrc"
        type="button"
        class="relative h-20 w-20 shrink-0 cursor-zoom-in rounded-2xl bg-white/[0.04] p-1.5 transition active:scale-[0.97]"
        :aria-label="`Увеличить растение «${plant.title}»`"
        @click="openZoom"
      >
        <img
          :src="plantImageSrc"
          :alt="plant.title"
          class="h-full w-full object-contain"
          loading="lazy"
          decoding="async"
          @error="onPlantImageError"
        />
      </button>
    </div>

    <!-- Плашка готовых промежуточных отчётов. Появляется когда юзер прошёл
         хотя бы один контрольный этап (шаг 7, 14 или 21) и есть готовый
         отчёт. Тап открывает GardenPlantReportSheet с timeline для активной
         программы (родительский garden.vue обрабатывает emit). -->
    <button
      v-if="readyReportsCount > 0"
      type="button"
      class="relative mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-left transition hover:bg-white/[0.07] active:scale-[0.99]"
      @click="handleOpenReports"
    >
      <span
        v-if="props.locked"
        class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
        aria-hidden="true"
        >⭐</span
      >
      <div class="flex items-center gap-2.5">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200"
        >
          <IconScroll class="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p class="text-[13px] font-semibold text-foreground">
            {{ reportsLabel }}
          </p>
          <p class="text-[11px] text-foreground/55">
            Свежий итог по пройденному отрезку
          </p>
        </div>
      </div>
      <IconArrowRight class="h-4 w-4 text-foreground/55" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import IconArrowRight from '~icons/lucide/arrow-right';
import IconScroll from '~icons/lucide/scroll-text';
import { useAPI } from '@/app/composables/useAPI';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import { useHaptics } from '@/app/composables/useHaptics';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import type { GardenPlantItemDto } from '@/shared/dto/garden';
import type { ProgramTimelineResponseDto } from '@/shared/dto/program-checkpoint';
import type { ProgramOverviewDto } from '@/shared/dto/retention';

const props = defineProps<{
  plant: GardenPlantItemDto;
  locked?: boolean;
}>();

const emit = defineEmits<{
  (e: 'open-reports'): void;
}>();

const { openPhotoSwipe } = usePhotoSwipe();
const { triggerLight } = useHaptics();

const plantImageSrc = computed(() => {
  // stateIndex в Garden хранится 1..15 (1-based), helper использует 0-based.
  // Clamp до 14 защищает от out-of-bounds.
  const safeIndex = Math.max(
    0,
    Math.min(14, (props.plant.stateIndex || 1) - 1)
  );
  return getRetentionPlantImageSrc(safeIndex, props.plant.plantSetSlug);
});

// Получаем количество готовых промежуточных отчётов. Запрос дешёвый:
// один SELECT в `user_program_checkpoint_summaries` по userProgramId.
// Если timeline-endpoint вернёт 404 (активной программы нет) — тихо игнорируем.
const readyReportsCount = ref(0);

// Прогресс по шагам активной программы для прогресс-бара. null — пока не
// загрузилось или endpoint недоступен (тогда бар просто не рендерится).
const progress = ref<{
  completedSteps: number;
  totalSteps: number;
  progressPercent: number;
} | null>(null);

async function loadProgress() {
  try {
    const data = await useAPI<ProgramOverviewDto>(
      `/api/programs/${encodeURIComponent(props.plant.programSlug)}`,
      { method: 'GET', suppressErrorToast: true }
    );
    progress.value = {
      completedSteps: data.completedSteps,
      totalSteps: data.totalSteps,
      progressPercent: data.progressPercent,
    };
  } catch {
    progress.value = null;
  }
}

async function loadReadyReportsCount() {
  try {
    const result = await useAPI<ProgramTimelineResponseDto>(
      `/api/programs/${encodeURIComponent(props.plant.programSlug)}/timeline`,
      { method: 'GET', suppressErrorToast: true }
    );
    readyReportsCount.value = result.items.filter(
      (i) => i.status === 'ready' && i.kind === 'weekly'
    ).length;
  } catch {
    readyReportsCount.value = 0;
  }
}

const reportsLabel = computed(() => {
  const n = readyReportsCount.value;
  if (n === 1) return '1 отчёт о твоём пути';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) {
    return `${n} отчёта о твоём пути`;
  }
  return `${n} отчётов о твоём пути`;
});

onMounted(() => {
  void loadReadyReportsCount();
  void loadProgress();
});

watch(
  () => props.plant.programSlug,
  () => {
    void loadReadyReportsCount();
    void loadProgress();
  }
);

function onPlantImageError(event: Event) {
  const img = event.target as HTMLImageElement | null;
  if (img) img.style.visibility = 'hidden';
}

function openZoom() {
  if (!plantImageSrc.value) return;
  void triggerLight();
  void openPhotoSwipe([
    {
      src: plantImageSrc.value,
      width: 1200,
      height: 1200,
      alt: props.plant.title,
    },
  ]);
}

function handleOpenReports() {
  void triggerLight();
  emit('open-reports');
}
</script>
