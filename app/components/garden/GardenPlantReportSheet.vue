<template>
  <Teleport to="body">
    <Transition name="report-backdrop">
      <div
        v-if="open && plant"
        class="report-backdrop"
        :style="{ opacity: 1 - dragProgress }"
        role="dialog"
        aria-modal="true"
        :aria-label="`Итог сада ${plant.title}`"
        @click.self="onClose"
      />
    </Transition>

    <Transition name="report-sheet">
      <section
        v-if="open && plant"
        class="report-sheet"
        :style="sheetStyle"
        @scroll="onScroll"
      >
        <!-- Sticky header: появляется при скролле, показывает мини-название
             и close-кнопку. Mimics iOS native modal sheet behavior. -->
        <header
          class="report-sheet__sticky-header"
          :class="{ 'report-sheet__sticky-header--visible': isHeaderSticky }"
        >
          <div class="flex items-center justify-between gap-3 px-4 py-3">
            <p class="truncate text-sm font-semibold text-foreground">
              {{ plant.title }}
            </p>
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-foreground/80 transition hover:bg-white/15"
              aria-label="Закрыть отчёт"
              @click="onClose"
            >
              <IconX class="h-4 w-4" />
            </button>
          </div>
        </header>

        <!-- Swipe handle: широкая зона касания + видимая полоска. По жесту
             вниз модалка плавно уезжает за нижний край и закрывается. -->
        <div
          :ref="(el) => bindHandle(el as HTMLElement | null)"
          class="report-sheet__handle"
          role="presentation"
        >
          <span class="report-sheet__handle-pill" aria-hidden="true" />
        </div>

        <!-- Close-кнопка в углу когда sticky header невидим -->
        <button
          v-show="!isHeaderSticky"
          type="button"
          class="glass-deep absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center !rounded-full text-white/90 transition hover:bg-black/45"
          aria-label="Закрыть отчёт"
          @click="onClose"
        >
          <IconX class="h-5 w-5" />
        </button>

        <!-- Hero. Растение показываем всегда — и на промежуточной сводке, и на
             финале. Для промежуточной сводки изображение соответствует текущей
             стадии роста (а не финальному цветению). -->
        <div class="report-sheet__hero">
          <div class="report-sheet__hero-glow" aria-hidden="true" />
          <button
            type="button"
            class="glass-deep report-sheet__plant-button"
            :aria-label="`Увеличить растение «${plant.title}»`"
            @click="openZoom"
          >
            <img
              :src="imageSrc"
              :alt="plant.title"
              class="report-sheet__plant"
              loading="eager"
              decoding="async"
            />
          </button>
          <div class="report-sheet__hero-meta">
            <p
              class="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200/85"
            >
              {{ heroEyebrow }}
            </p>
            <h1
              class="mt-2 text-3xl font-semibold leading-tight text-foreground"
            >
              {{ plant.title }}
            </h1>
            <p v-if="heroSubtitle" class="mt-1.5 text-sm text-foreground/55">
              {{ heroSubtitle }}
            </p>
          </div>
        </div>

        <!-- KPI row: 4 метрики путешествия. Появляются с лёгким stagger fade-in. -->
        <div v-if="metricsItems.length > 0" class="report-sheet__kpi">
          <div
            v-for="(kpi, index) in metricsItems"
            :key="kpi.label"
            class="glass-deep report-sheet__kpi-card"
            :style="{ animationDelay: `${index * 80}ms` }"
          >
            <component
              :is="kpi.icon"
              class="h-4 w-4 text-foreground/60"
              aria-hidden="true"
            />
            <p class="report-sheet__kpi-value">{{ kpi.value }}</p>
            <p class="report-sheet__kpi-label">{{ kpi.label }}</p>
          </div>
        </div>

        <!-- Timeline промежуточных + финального отчётов. Показывается только
             если бэк отдал несколько чекпоинтов (для активных программ или
             у завершённых, где есть промежуточные). Тап по точке меняет
             отображаемый текст ниже. -->
        <section v-if="hasTimeline" class="glass-deep report-sheet__timeline">
          <p class="report-sheet__section-eyebrow">Точки пути</p>
          <GardenReportsTimeline
            :items="timelineItems"
            :selected-step="selectedCheckpointStep"
            @select="onTimelineSelect"
          />
        </section>

        <!-- Графики динамики: каждая метрика — отдельный график со своей
             шкалой. Раньше тревога и настроение рисовались на одной canvas
             с двумя Y-осями — это давало визуальную кашу при малом N точек.
             Рендерим только те графики, для которых есть данные. -->
        <section v-if="hasAnxietyChart" class="glass-deep report-sheet__chart">
          <p class="report-sheet__section-eyebrow">Динамика тревоги</p>
          <MoodAnxietyChart
            mode="anxiety"
            :anxiety-timeline="currentStructuredData?.anxietyTimeline ?? []"
          />
        </section>
        <section v-if="hasMoodChart" class="glass-deep report-sheet__chart">
          <p class="report-sheet__section-eyebrow">Динамика настроения</p>
          <MoodAnxietyChart
            mode="mood"
            :mood-timeline="currentStructuredData?.moodTimeline ?? []"
          />
        </section>

        <!-- Markdown-разбор -->
        <article
          v-if="renderedSummary"
          class="glass-deep report-sheet__article"
          v-html="renderedSummary"
        />
        <div
          v-else-if="isLoadingSummary"
          class="glass-deep report-sheet__article-skeleton"
        >
          <div class="report-sheet__skeleton-line" style="width: 92%" />
          <div class="report-sheet__skeleton-line" style="width: 78%" />
          <div class="report-sheet__skeleton-line" style="width: 96%" />
          <div class="report-sheet__skeleton-line" style="width: 64%" />
          <div class="report-sheet__skeleton-line" style="width: 84%" />
        </div>

        <!-- Сохранённые мысли -->
        <section
          v-if="savedThoughtsPreview.length > 0"
          class="glass-deep report-sheet__thoughts"
        >
          <div class="flex items-center gap-2">
            <IconQuote class="h-4 w-4 text-foreground/55" aria-hidden="true" />
            <p
              class="text-[11px] font-semibold uppercase tracking-wide text-foreground/55"
            >
              Сохранённые мысли периода
            </p>
          </div>
          <ul class="mt-3 space-y-2">
            <li
              v-for="thought in savedThoughtsPreview"
              :key="thought.id"
              class="glass-deep px-3.5 py-3"
            >
              <p class="text-[13px] leading-relaxed text-foreground/85">
                «{{ thought.text }}»
              </p>
            </li>
          </ul>
          <NuxtLink
            to="/thoughts"
            class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-200 hover:text-emerald-100"
          >
            Все сохранённые мысли
            <IconArrowRight class="h-3 w-3" />
          </NuxtLink>
        </section>

        <!-- Footer CTAs -->
        <footer class="report-sheet__footer">
          <!-- Share доступен только для финального отчёта (kind='final'
               или нет timeline и summaryText есть напрямую от plant). -->
          <button
            v-if="isFinalReportActive"
            type="button"
            class="glass-deep report-sheet__action-btn"
            @click="onShareReport"
          >
            <IconShare class="h-4 w-4" aria-hidden="true" />
            Поделиться садом
          </button>
          <button
            type="button"
            class="w-full rounded-full bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.99]"
            @click="onClose"
          >
            Закрыть
          </button>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import IconArrowRight from '~icons/lucide/arrow-right';
import IconBookOpen from '~icons/lucide/book-open';
import IconCalendar from '~icons/lucide/calendar-days';
import IconCheckCircle from '~icons/lucide/check-circle-2';
import IconMessages from '~icons/lucide/messages-square';
import IconQuote from '~icons/lucide/quote';
import IconShare from '~icons/lucide/share-2';
import IconX from '~icons/lucide/x';
import { useAPI } from '@/app/composables/useAPI';
import { useBottomSheetSwipe } from '@/app/composables/useBottomSheetSwipe';
import { useMarkdown } from '@/app/composables/useMarkdown';
import { usePhotoSwipe } from '@/app/composables/usePhotoSwipe';
import { shareContent } from '@/app/composables/useShareContent';
import { useToast } from '@/app/composables/useToast';
import { getRetentionPlantImageSrc } from '@/app/utils/retentionPlant';
import GardenReportsTimeline from '@/app/components/garden/GardenReportsTimeline.vue';
import MoodAnxietyChart from '@/app/components/garden/MoodAnxietyChart.vue';
import type { GardenPlantItemDto } from '@/shared/dto/garden';
import type {
  CheckpointItemDto,
  CheckpointStructuredDataDto,
  ProgramTimelineResponseDto,
} from '@/shared/dto/program-checkpoint';

/**
 * Премиальный полноэкранный sheet с клиническим разбором завершённого Сада.
 * Заменяет старый `GardenPlantLoreCard.vue` (тесный Dialog с короткой цитатой).
 *
 * Архитектура:
 *   - Teleport в body + fixed-overlay (mobile-first, работает в Capacitor).
 *   - Sticky header с close-кнопкой появляется при скролле.
 *   - Hero с pulsing glow на растении (PhotoSwipe-zoom).
 *   - 4 KPI-карточки с метриками путешествия (stagger fade-in).
 *   - Markdown-секции отчёта (9 заголовков из garden-summary.service.ts).
 *   - Сохранённые мысли периода (deeplink в /thoughts).
 *
 * Источник данных: GET /api/garden/plants/:id/summary-status (status='ready' →
 * summaryText + metrics). При первом открытии когда summaryText ещё нет —
 * polling endpoint'а делает родитель (через ProgramFinalReportPreparing.vue),
 * этот компонент получает уже готовый отчёт через prop initial-summary-text.
 */

type Metrics = {
  durationDays: number;
  completedSteps: number;
  journalEntriesCount: number;
  aiChatSessionsCount: number;
  reflectionsCount: number;
};

const props = defineProps<{
  open: boolean;
  plant: GardenPlantItemDto | null;
  /**
   * Предзагруженный summaryText (например, переданный из preparing-overlay'я).
   * Если задан — используем сразу без fetch'а. Если null — компонент сам
   * сделает fetch при открытии.
   */
  initialSummaryText?: string | null;
  /**
   * Предзагруженные метрики путешествия. Аналогично initialSummaryText —
   * избегаем повторного запроса если данные уже есть.
   */
  initialMetrics?: Metrics | null;
  /**
   * Точка пути, которую нужно открыть по умолчанию (например, только что
   * завершённый промежуточный чекпоинт 7/14/21). Если не задана — открываем
   * последний доступный отчёт (обычно финал). Используется, чтобы один и тот
   * же sheet показывал и промежуточные сводки, и итог — единым дизайном.
   */
  initialSelectedStep?: number | null;
}>();
const emit = defineEmits<{ (e: 'update:open', open: boolean): void }>();

const { openPhotoSwipe } = usePhotoSwipe();
const { renderMarkdown } = useMarkdown();

// Swipe-to-dismiss на верхнем handle. По жесту вниз модалка плавно уезжает
// и вызывает onClose. dragOffsetY/dragProgress используются для inline-стиля
// контента и backdrop'а, чтобы дать «следование за пальцем».
const { dragOffsetY, isDragging, dragProgress, bindHandle, reset } =
  useBottomSheetSwipe(() => {
    emit('update:open', false);
  });

const fetchedSummary = ref<string | null>(null);
const fetchedMetrics = ref<Metrics | null>(null);
const isLoadingSummary = ref(false);
const isHeaderSticky = ref(false);

const sheetStyle = computed(() => ({
  transform: dragOffsetY.value > 0 ? `translateY(${dragOffsetY.value}px)` : '',
  transition: isDragging.value || dragOffsetY.value > 0 ? 'none' : '',
}));

// Timeline промежуточных + финального отчётов (если есть). Загружается
// параллельно с summary при открытии sheet'а. Если пусто — рендерим
// старый одинокий summaryText (обратная совместимость для plants без
// чекпоинт-отчётов, например миграция legacy).
const timelineItems = ref<CheckpointItemDto[]>([]);
const selectedCheckpointStep = ref<number>(30);

const imageSrc = computed(() => {
  if (!props.plant) return '';
  const safeIndex = Math.max(0, Math.min(14, props.plant.stateIndex - 1));
  return getRetentionPlantImageSrc(safeIndex, props.plant.plantSetSlug);
});

const completedDate = computed(() => {
  if (!props.plant?.completedAt) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(props.plant.completedAt));
  } catch {
    return '';
  }
});

const savedThoughtsPreview = computed(
  () => props.plant?.savedThoughts?.slice(0, 3) ?? []
);

// Заголовок hero зависит от того, какая точка пути открыта: для промежуточной
// сводки — «Промежуточная сводка», для финала (или legacy без timeline) —
// «Клинический итог программы». Один и тот же sheet обслуживает оба случая.
const isWeeklyCheckpointActive = computed(
  () => selectedCheckpoint.value?.kind === 'weekly'
);

const heroEyebrow = computed(() =>
  isWeeklyCheckpointActive.value ? 'Промежуточная сводка' : 'Итог программы'
);

// Период отрезка выбранной промежуточной точки (даты «дд месяц — дд месяц»).
const selectedPeriodLabel = computed(() => {
  const cp = selectedCheckpoint.value?.structuredData;
  if (!cp?.periodStart || !cp.periodEnd) return '';
  try {
    const fmt = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
    });
    return `${fmt.format(new Date(cp.periodStart))} — ${fmt.format(new Date(cp.periodEnd))}`;
  } catch {
    return '';
  }
});

const heroSubtitle = computed(() => {
  if (isWeeklyCheckpointActive.value) return selectedPeriodLabel.value;
  return completedDate.value ? `Завершён ${completedDate.value}` : '';
});

// Текущий выбранный чекпоинт (из timeline, если есть). По умолчанию — финал (30).
const selectedCheckpoint = computed<CheckpointItemDto | null>(
  () =>
    timelineItems.value.find(
      (i) => i.checkpointStep === selectedCheckpointStep.value
    ) ?? null
);

const summaryText = computed(() => {
  // Если timeline загружен и выбран какой-то чекпоинт — берём его текст.
  if (selectedCheckpoint.value?.summaryText) {
    return selectedCheckpoint.value.summaryText;
  }
  if (props.initialSummaryText && props.initialSummaryText.trim().length > 0) {
    return props.initialSummaryText;
  }
  if (fetchedSummary.value) return fetchedSummary.value;
  return props.plant?.summaryText || '';
});

const renderedSummary = computed(() =>
  summaryText.value ? renderMarkdown(summaryText.value) : ''
);

const hasTimeline = computed(() => timelineItems.value.length > 0);

const currentStructuredData = computed(
  () => selectedCheckpoint.value?.structuredData ?? null
);

const hasAnxietyChart = computed(
  () => (currentStructuredData.value?.anxietyTimeline.length ?? 0) > 0
);
const hasMoodChart = computed(
  () => (currentStructuredData.value?.moodTimeline.length ?? 0) > 0
);

function onTimelineSelect(step: 7 | 14 | 21 | 30) {
  selectedCheckpointStep.value = step;
  // Скроллим к началу markdown-секции — sheet остаётся открытым.
}

// Финальный отчёт активен (выбран): для него доступны share + PDF.
// Если timeline не загрузился — fallback: считаем финальным, если есть
// summaryText напрямую от plant (legacy путь без timeline).
const isFinalReportActive = computed(() => {
  if (selectedCheckpoint.value) {
    return selectedCheckpoint.value.kind === 'final';
  }
  return Boolean(props.plant?.summaryText);
});

// Share-кнопка: открывает native share-sheet (iOS/Android) или Web Share API.
// Ссылка ведёт на /share/garden/[slug] — landing-страницу со smart-redirect.
// На web прикладываем картинку финального растения; на native — превью
// рендерится из og:image шеренной ссылки.
async function onShareReport() {
  if (!props.plant) return;
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://mentala.app';
  const shareUrl = `${origin}/share/garden/${encodeURIComponent(props.plant.programSlug)}`;
  const text = `У меня в Ментала вырос сад «${props.plant.title}». Это мой маленький шаг к большему спокойствию и вниманию к себе. Загляни, если тебе тоже хочется попробовать.`;
  const absoluteImage = imageSrc.value
    ? new URL(imageSrc.value, origin).toString()
    : undefined;
  const result = await shareContent({
    title: `Сад «${props.plant.title}» · Ментала`,
    text,
    url: shareUrl,
    dialogTitle: 'Поделиться садом',
    fallbackText: `${text}\n${shareUrl}`,
    imageUrl: absoluteImage,
    imageFileName: `mentala-${props.plant.programSlug}.webp`,
  });
  if (result === 'copied') {
    useToast(
      'Ссылка скопирована',
      'Теперь можно вставить её куда угодно.',
      'success'
    );
  } else if (result === 'failed') {
    useToast(
      'Не удалось поделиться',
      'Попробуй ещё раз или скопируй ссылку из адресной строки.',
      'warning'
    );
  }
}

const metrics = computed<Metrics | null>(() => {
  if (props.initialMetrics) return props.initialMetrics;
  return fetchedMetrics.value;
});

// Длительность отрезка выбранной точки пути (по датам периода).
function checkpointDurationDays(cp: CheckpointStructuredDataDto): number {
  if (!cp.periodStart || !cp.periodEnd) return 0;
  try {
    const start = new Date(cp.periodStart).getTime();
    const end = new Date(cp.periodEnd).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
  } catch {
    return 0;
  }
}

// Формируем массив KPI-карточек. Когда открыта точка пути из timeline — берём
// метрики именно её отрезка (для финала это вся программа). Это держит KPI
// согласованными с открытым отчётом и решает задвоение от повторных
// прохождений шага. Fallback — метрики всей программы (legacy без timeline).
const metricsItems = computed(() => {
  const items: Array<{
    label: string;
    value: string;
    icon: typeof IconCalendar;
  }> = [];

  const cp = selectedCheckpoint.value?.structuredData;
  if (cp?.metrics) {
    const days = checkpointDurationDays(cp);
    if (days > 0) {
      items.push({
        icon: IconCalendar,
        value: String(days),
        label: pluralDays(days),
      });
    }
    if (cp.metrics.stepsCompleted > 0) {
      items.push({
        icon: IconCheckCircle,
        value: String(cp.metrics.stepsCompleted),
        label: pluralSteps(cp.metrics.stepsCompleted),
      });
    }
    if (cp.metrics.aiChatSessions > 0) {
      items.push({
        icon: IconMessages,
        value: String(cp.metrics.aiChatSessions),
        label: pluralAiChats(cp.metrics.aiChatSessions),
      });
    }
    if (cp.metrics.journalEntries > 0) {
      items.push({
        icon: IconBookOpen,
        value: String(cp.metrics.journalEntries),
        label: pluralJournal(cp.metrics.journalEntries),
      });
    }
    return items;
  }

  const m = metrics.value;
  if (!m) return items;
  items.push({
    icon: IconCalendar,
    value: String(m.durationDays),
    label: pluralDays(m.durationDays),
  });
  items.push({
    icon: IconCheckCircle,
    value: String(m.completedSteps),
    label: pluralSteps(m.completedSteps),
  });
  if (m.aiChatSessionsCount > 0) {
    items.push({
      icon: IconMessages,
      value: String(m.aiChatSessionsCount),
      label: pluralAiChats(m.aiChatSessionsCount),
    });
  }
  if (m.journalEntriesCount > 0) {
    items.push({
      icon: IconBookOpen,
      value: String(m.journalEntriesCount),
      label: pluralJournal(m.journalEntriesCount),
    });
  }
  return items;
});

function pluralDays(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'день пути';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'дня пути';
  return 'дней пути';
}
function pluralSteps(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'шаг пройден';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'шага пройдено';
  return 'шагов пройдено';
}
function pluralAiChats(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'AI-разговор';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'AI-разговора';
  return 'AI-разговоров';
}
function pluralJournal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'запись в дневнике';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return 'записи в дневнике';
  return 'записей в дневнике';
}

// При открытии — параллельно с fetch summary'и грузим timeline (если есть).
// Timeline всегда подсасываем даже при готовом initialSummaryText, чтобы
// показать переключатель Этапов 1/2/3/Финал. Если в БД ничего нет — массив
// пустой и UI просто не показывает timeline.
async function loadTimelineForActiveProgram(programSlug: string) {
  try {
    const result = await useAPI<ProgramTimelineResponseDto>(
      `/api/programs/${encodeURIComponent(programSlug)}/timeline`,
      { method: 'GET', suppressErrorToast: true }
    );
    timelineItems.value = result.items ?? [];
    // Выбор точки по умолчанию: если родитель указал initialSelectedStep
    // (например, только что завершённый промежуточный чекпоинт) и для него
    // есть готовый отчёт — открываем именно его. Иначе — последний доступный
    // (обычно финал=30).
    const ready = timelineItems.value.filter((i) => i.status === 'ready');
    if (ready.length > 0) {
      const preferred =
        props.initialSelectedStep != null &&
        ready.some((i) => i.checkpointStep === props.initialSelectedStep)
          ? props.initialSelectedStep
          : ready[ready.length - 1]?.checkpointStep;
      selectedCheckpointStep.value = preferred ?? 30;
    }
    // Mark-viewed для всех непросмотренных ready отчётов — юзер открыл sheet
    // и сейчас может листать timeline. Это убирает in-app модалку и
    // отменяет push-нотификацию.
    for (const item of timelineItems.value) {
      if (item.status === 'ready' && !item.viewedAt && item.id) {
        void useAPI(`/api/garden/reports/${item.id}/mark-viewed`, {
          method: 'POST',
          suppressErrorToast: true,
        });
      }
    }
  } catch (error) {
    // Тихая ошибка — timeline опциональна, UI работает и без неё.
    console.warn('[GardenPlantReportSheet] timeline load failed:', error);
    timelineItems.value = [];
  }
}

watch(
  () => [props.open, props.plant?.programSlug] as const,
  async ([isOpen, programSlug]) => {
    if (!isOpen || !programSlug) return;
    // Timeline тянем всегда — параллельно, не блокируя.
    void loadTimelineForActiveProgram(programSlug);
    // Если parent передал готовый summary — fetch не нужен.
    if (
      props.initialSummaryText &&
      props.initialSummaryText.trim().length > 0
    ) {
      return;
    }
    if (isLoadingSummary.value) return;
    isLoadingSummary.value = true;
    try {
      const result = await useAPI<{
        plantId: number;
        status: 'ready' | 'pending';
        summaryText: string | null;
        metrics: Metrics | null;
      }>(
        `/api/garden/plants/by-slug/${encodeURIComponent(programSlug)}/summary-status`,
        {
          method: 'GET',
          suppressErrorToast: true,
        }
      );
      if (result.status === 'ready' && result.summaryText) {
        fetchedSummary.value = result.summaryText;
        fetchedMetrics.value = result.metrics;
      } else {
        // Старый сад без summary — триггерим генерацию через refresh-summary
        // (идемпотентный endpoint, force-генерация при первой попытке).
        const refresh = await useAPI<{
          summaryText: string;
          generated: boolean;
        }>(
          `/api/garden/plants/by-slug/${encodeURIComponent(programSlug)}/refresh-summary`,
          {
            method: 'POST',
            suppressErrorToast: true,
          }
        );
        fetchedSummary.value = refresh.summaryText;
      }
    } catch (error) {
      console.error('[GardenPlantReportSheet] fetch summary failed:', error);
    } finally {
      isLoadingSummary.value = false;
    }
  },
  { immediate: true }
);

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      isHeaderSticky.value = false;
      return;
    }
    // При открытии: блокируем скролл body + сбрасываем drag-offset
    // (после dismiss он остался равен высоте экрана, иначе модалка
    // мелькнёт за пределами viewport'а перед slide-in анимацией).
    reset();
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  }
);

watch(
  () => props.open,
  (isOpen) => {
    if (typeof document !== 'undefined' && !isOpen) {
      document.body.style.overflow = '';
    }
  }
);

function onScroll(event: Event) {
  const el = event.currentTarget as HTMLElement;
  isHeaderSticky.value = el.scrollTop > 120;
}

function openZoom() {
  if (!props.plant) return;
  // Скачивание доступно только для итоговой картинки сада (финальный отчёт),
  // не для промежуточных контрольных точек.
  const downloadFileName = isFinalReportActive.value
    ? `mentala-${props.plant.programSlug}.png`
    : undefined;
  void openPhotoSwipe([
    {
      src: imageSrc.value,
      width: 1200,
      height: 1200,
      alt: props.plant.title,
      downloadFileName,
    },
  ]);
}

function onClose() {
  emit('update:open', false);
}
</script>

<style scoped>
.report-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(8, 12, 20, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.report-backdrop-enter-active,
.report-backdrop-leave-active {
  transition: opacity 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.report-backdrop-enter-from,
.report-backdrop-leave-to {
  opacity: 0;
}

.report-sheet {
  position: fixed;
  inset: 0;
  z-index: 61;
  overflow-y: auto;
  overflow-x: hidden;
  color: hsl(var(--foreground));
  /* На мобильном — full-screen без закруглений и боковых отступов, как
     iOS-modal в полноэкранной форме. На десктопе ниже даём отступы и
     закругления (там это смотрится естественно). */
  border-radius: 0;
  padding-bottom: 40px;
  -webkit-overflow-scrolling: touch;
  will-change: transform;
}

@media (min-width: 768px) {
  .report-sheet {
    inset: 4vh max(8vw, calc(50vw - 420px));
    max-width: 800px;
    margin: 0 auto;
    border-radius: 28px;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
  }
}

.report-sheet-enter-active {
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1);
}
.report-sheet-leave-active {
  transition: transform 260ms cubic-bezier(0.4, 0, 1, 1);
}
.report-sheet-enter-from,
.report-sheet-leave-to {
  transform: translateY(100%);
}

/* Swipe handle: расширенная зона касания + сама полоска. touch-action: none
   на всём блоке блокирует pull-to-refresh и нативный scroll-down во время
   drag — задаётся внутри useBottomSheetSwipe через JS. */
.report-sheet__handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px 0 8px;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.report-sheet__handle:active {
  cursor: grabbing;
}

.report-sheet__handle-pill {
  width: 44px;
  height: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  transition:
    background 200ms ease,
    width 200ms ease;
}

.report-sheet__handle:hover .report-sheet__handle-pill {
  background: rgba(255, 255, 255, 0.36);
  width: 52px;
}

.report-sheet__sticky-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: linear-gradient(
    180deg,
    rgba(10, 14, 22, 0.92) 0%,
    rgba(10, 14, 22, 0.78) 80%,
    rgba(10, 14, 22, 0) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease;
}
.report-sheet__sticky-header--visible {
  opacity: 1;
  pointer-events: auto;
}

.report-sheet__hero {
  position: relative;
  padding: 28px 24px 12px;
  text-align: center;
  overflow: hidden;
}

.report-sheet__hero-glow {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(167, 243, 208, 0.18) 0%,
    rgba(167, 243, 208, 0.06) 45%,
    transparent 75%
  );
  animation: report-glow-pulse 5.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes report-glow-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: translateX(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateX(-50%) scale(1.06);
  }
}

/* .glass-deep задаёт фон, border, blur. Здесь — только layout и форма. */
.report-sheet__plant-button {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 180px;
  padding: 8px;
  border-radius: 36px !important;
  cursor: zoom-in;
  transition: transform 220ms ease;
}
.report-sheet__plant-button:active {
  transform: scale(0.98);
}

.report-sheet__plant {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.5));
}

.report-sheet__hero-meta {
  position: relative;
  z-index: 1;
  margin-top: 22px;
}

.report-sheet__kpi {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 16px 16px 0;
}

@media (min-width: 480px) {
  .report-sheet__kpi {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* .glass-deep даёт стеклянный фон + border + blur. Локально только layout
   и stagger-анимация появления. */
.report-sheet__kpi-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  border-radius: 18px !important;
  opacity: 0;
  animation: report-kpi-in 420ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

@keyframes report-kpi-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.report-sheet__kpi-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
  color: hsl(var(--foreground));
  font-feature-settings: 'tnum' 1;
}

.report-sheet__kpi-label {
  font-size: 11px;
  line-height: 1.3;
  color: hsl(var(--foreground) / 0.55);
}

.report-sheet__article {
  margin: 24px 16px 0;
  padding: 22px 20px;
  border-radius: 18px !important;
  font-size: 14.5px;
  line-height: 1.65;
  color: hsl(var(--foreground) / 0.92);
}

.report-sheet__article :deep(h2) {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: hsl(var(--foreground) / 0.55);
  margin: 28px 0 8px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.report-sheet__article :deep(h2:first-of-type) {
  margin-top: 6px;
  padding-top: 0;
  border-top: none;
}

.report-sheet__article :deep(p) {
  margin: 10px 0;
}

.report-sheet__article :deep(ul),
.report-sheet__article :deep(ol) {
  margin: 14px 0;
  padding-left: 0;
  list-style: none;
}

.report-sheet__article :deep(ul li) {
  position: relative;
  margin: 10px 0;
  padding-left: 22px;
  line-height: 1.6;
}

/* Кастомные emerald-маркеры: ::marker плохо стилизуется в Capacitor WebView,
   поэтому рисуем точку через ::before. Премиальный градиент + лёгкое свечение. */
.report-sheet__article :deep(ul li::before) {
  content: '';
  position: absolute;
  left: 4px;
  top: 0.65em;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: radial-gradient(
    circle at 30% 30%,
    rgba(167, 243, 208, 0.95) 0%,
    rgba(110, 231, 183, 0.85) 60%,
    rgba(52, 211, 153, 0.7) 100%
  );
  box-shadow: 0 0 0 2px rgba(167, 243, 208, 0.12);
}

.report-sheet__article :deep(ol) {
  counter-reset: report-action;
}

.report-sheet__article :deep(ol li) {
  position: relative;
  margin: 10px 0;
  padding-left: 30px;
  line-height: 1.6;
  counter-increment: report-action;
}

.report-sheet__article :deep(ol li::before) {
  content: counter(report-action);
  position: absolute;
  left: 0;
  top: 0.05em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: rgba(167, 243, 208, 0.14);
  color: rgb(167, 243, 208);
  font-size: 11px;
  font-weight: 700;
  font-feature-settings: 'tnum' 1;
  border: 1px solid rgba(167, 243, 208, 0.22);
}

.report-sheet__article :deep(strong) {
  color: hsl(var(--foreground));
  font-weight: 600;
}

.report-sheet__article :deep(em) {
  color: hsl(var(--foreground) / 0.8);
}

.report-sheet__article-skeleton {
  margin: 24px 16px 0;
  padding: 20px;
  border-radius: 18px !important;
}

.report-sheet__skeleton-line {
  height: 14px;
  margin: 12px 0;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.09) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  border-radius: 6px;
  animation: report-skeleton 1.5s ease-in-out infinite;
}

@keyframes report-skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.report-sheet__thoughts {
  margin: 28px 16px 0;
  padding: 16px;
  border-radius: 18px !important;
}

.report-sheet__thoughts ul li {
  /* Чтобы вложенная цитата вписывалась в материнский glass-deep, чуть
     ослабляем её фон до полупрозрачного — иначе получается слишком плотный
     стек двух стеклянных слоёв и теряется иерархия. */
  border-radius: 14px !important;
  background: rgba(255, 255, 255, 0.04) !important;
  background-image: none !important;
}

.report-sheet__timeline {
  margin: 24px 16px 0;
  padding: 12px 12px 6px;
  border-radius: 18px !important;
}

.report-sheet__chart {
  margin: 16px 16px 0;
  padding: 12px;
  border-radius: 18px !important;
}

.report-sheet__section-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: hsl(var(--foreground) / 0.55);
  padding: 4px 4px 8px;
}

.report-sheet__footer {
  margin-top: 32px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.report-sheet__action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 11px 16px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground) / 0.85);
  border-radius: 999px !important;
  transition:
    transform 200ms ease,
    color 200ms ease;
}
.report-sheet__action-btn:hover {
  color: hsl(var(--foreground));
}
.report-sheet__action-btn:active {
  transform: scale(0.98);
}
</style>
