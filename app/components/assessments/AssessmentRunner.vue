<template>
  <div class="xs:space-y-3 space-y-1">
    <section
      v-if="status === 'pending'"
      class="h-40 animate-pulse"
      :class="panelClass"
    />

    <section
      v-else-if="status === 'error' || !item"
      class="rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive"
    >
      Не удалось открыть опросник. Попробуй вернуться и запустить его ещё раз.
    </section>

    <!-- Фаза результата: показываем балл, интерпретацию и динамику прямо здесь,
         без перехода на отдельную страницу. Пока resultBand грузится — скелетон,
         чтобы не мелькали вопросы при возврате к уже пройденному опроснику. -->
    <template v-else-if="phase === 'result'">
      <template v-if="resultBand">
        <AssessmentResultSummary
          :title="resultBand.title"
          :short-text="resultBand.shortText"
          :score="resultScore"
          :category="item.category"
          :comparison-text="comparison?.text"
          :safety-level="resultBand.safetyLevel"
          :min-score="item.scoring.minScore"
          :max-score="item.scoring.maxScore"
          :score-direction="item.scoreDirection"
          :bands="item.resultBands"
          :active-band-id="resultBand.id"
          :embedded="embedded"
        />

        <article class="p-5" :class="panelClass">
          <div class="space-y-4">
            <div class="space-y-2">
              <h2 class="text-base font-semibold text-foreground">
                Что это значит
              </h2>
              <p class="text-sm leading-relaxed text-foreground/70">
                {{ resultBand.description }}
              </p>
            </div>
            <div
              class="space-y-1 rounded-2xl border border-white/10 bg-white/[0.08] p-4"
            >
              <p class="text-sm font-semibold text-foreground">Что дальше</p>
              <p class="text-sm leading-relaxed text-foreground/70">
                {{ resultBand.recommendationText }}
              </p>
            </div>
            <p class="text-xs leading-relaxed text-foreground/48">
              Результат не является диагнозом, медицинским заключением или
              оценкой личности.
            </p>
          </div>
        </article>

        <AssessmentTrendChart
          :points="chartPoints"
          :score-direction="item.scoreDirection"
          :min-score="item.scoring.minScore"
          :max-score="item.scoring.maxScore"
          :embedded="embedded"
        />
      </template>
      <section v-else class="h-40 animate-pulse" :class="panelClass" />
    </template>

    <!-- Фаза прохождения: один вопрос на экран. -->
    <template v-else>
      <div class="relative overflow-hidden p-4" :class="panelClass">
        <div class="relative space-y-3">
          <div class="flex items-start justify-between gap-3">
            <p class="text-sm leading-relaxed text-foreground/72">
              {{ contextText }}
            </p>
            <span
              class="shrink-0 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-xs text-foreground/72"
            >
              {{ item.estimatedMinutes }} мин
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full rounded-full bg-foreground transition-all duration-500 ease-out"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>
      </div>

      <Transition name="assessment-step" mode="out-in">
        <div :key="currentQuestion?.id" class="p-5" :class="panelClass">
          <div class="space-y-5">
            <div class="space-y-2">
              <p class="text-sm font-medium text-foreground/50">
                Вопрос {{ currentIndex + 1 }} из {{ item.questions.length }}
              </p>
              <h2 class="text-2xl font-semibold leading-tight text-foreground">
                {{ currentQuestionText }}
              </h2>
            </div>

            <div class="grid grid-cols-1 gap-2">
              <AssessmentAnswerOption
                v-for="(option, index) in item.options"
                :key="option.id"
                :label="option.label"
                :index="index"
                :selected="currentAnswer === option.id"
                @click="selectOption(option.id)"
              />
            </div>

            <div
              v-if="submitError"
              class="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
            >
              {{ submitError }}
            </div>

            <div class="flex items-center gap-2 pt-1">
              <button
                type="button"
                class="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-full border border-foreground/10 bg-white/[0.08] text-foreground transition hover:bg-white/[0.14] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45"
                :disabled="submitting"
                aria-label="Предыдущий вопрос"
                @click="goPrev"
              >
                <IconArrowLeft class="h-5 w-5" />
              </button>
              <button
                type="button"
                class="relative flex min-h-12 flex-1 items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!currentAnswer || submitting"
                :aria-busy="submitting"
                @click="goNext"
              >
                <ButtonLoader v-if="submitting" />
                <span :class="{ invisible: submitting }">
                  {{ isLastQuestion ? 'Показать результат' : 'Дальше' }}
                </span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import IconArrowLeft from '~icons/lucide/arrow-left';
import AssessmentAnswerOption from '@/app/components/assessments/AssessmentAnswerOption.vue';
import AssessmentResultSummary from '@/app/components/assessments/AssessmentResultSummary.vue';
import AssessmentTrendChart from '@/app/components/assessments/AssessmentTrendChart.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { useAPI } from '@/app/composables/useAPI';
import { useAuthStore } from '@/app/stores/auth';
import { useAppAnalytics } from '@/app/composables/useAppAnalytics';
import { applyGender } from '@/app/utils/genderedText';
import type {
  AssessmentAttemptResponse,
  AssessmentAttemptSource,
  AssessmentChartResponse,
  AssessmentResultResponse,
  AssessmentRunResponse,
} from '@/shared/dto/assessments';

// ВАЖНО: boolean-пропсы задаём через withDefaults. Vue приводит ОТСУТСТВУЮЩИЙ
// boolean-проп к false (а не undefined), поэтому без явного дефолта inlineResult
// в Roadmap становился false и встроенный результат не показывался.
const props = withDefaults(
  defineProps<{
    slug: string;
    source: AssessmentAttemptSource;
    linkedProgramSlug?: string | null;
    linkedProgramAttemptId?: number | null;
    // Если передан — раннер сразу показывает результат этой попытки (без вопросов).
    // Используется, когда юзер уже прошёл опросник и возвращается к шагу.
    initialAttemptId?: number | null;
    // Показывать ли результат прямо в раннере. Roadmap — true (встроенный итог).
    // Страница практик передаёт false: она ведёт на отдельный экран результата.
    inlineResult?: boolean;
    // embedded: раннер вставлен внутрь уже существующей glass-deep панели шага
    // (Roadmap). Тогда блоки рисуем как внутренние карточки, без вложенного
    // glass-deep, чтобы не было двойной рамки.
    embedded?: boolean;
  }>(),
  {
    inlineResult: true,
    embedded: false,
  }
);

const emit = defineEmits<{
  complete: [payload: { attemptId: number }];
  prev: [];
}>();

const authStore = useAuthStore();
const { reachGoal } = useAppAnalytics();

const phase = ref<'question' | 'result'>(
  props.initialAttemptId ? 'result' : 'question'
);

// Внутри Roadmap внешняя glass-deep панель уже есть (даёт шаг), поэтому блоки
// раннера рисуем как внутренние карточки. На отдельной странице практик — своя
// glass-deep рамка со стандартным радиусом.
const panelClass = computed(() =>
  props.embedded
    ? 'rounded-2xl border border-white/10 bg-white/[0.05]'
    : 'glass-deep rounded-lg'
);
const currentIndex = ref(0);
const answers = ref<Record<string, string>>({});
const submitting = ref(false);
const submitError = ref<string | null>(null);

const resultScore = ref(0);
const resultBandId = ref<string | null>(null);
const comparison = ref<AssessmentResultResponse['comparison']>(null);
const chartPoints = ref<AssessmentChartResponse['points']>([]);

// Определение опросника грузим императивно (без top-level await), чтобы раннер
// можно было безопасно монтировать динамически внутри шага Roadmap, не запуская
// Suspense-fallback всей страницы.
const item = ref<AssessmentRunResponse['item'] | null>(null);
const status = ref<'pending' | 'ready' | 'error'>('pending');

onMounted(async () => {
  try {
    const res = await useAPI<AssessmentRunResponse>(
      `/api/assessments/${props.slug}/run`,
      { suppressErrorToast: true }
    );
    item.value = res.item;
    status.value = 'ready';
    if (props.initialAttemptId && phase.value === 'result') {
      await loadResult(props.initialAttemptId);
    }
  } catch (err) {
    console.error('[AssessmentRunner] Не удалось загрузить опросник:', err);
    status.value = 'error';
  }
});
const currentQuestion = computed(
  () => item.value?.questions[currentIndex.value] ?? null
);
const currentQuestionText = computed(() =>
  applyGender(currentQuestion.value?.text ?? '', authStore.user?.gender)
);
const currentAnswer = computed(() =>
  currentQuestion.value ? answers.value[currentQuestion.value.id] : null
);
const isLastQuestion = computed(
  () => currentIndex.value >= (item.value?.questions.length ?? 1) - 1
);
const progressPercent = computed(() => {
  if (!item.value || item.value.questions.length === 0) return 0;
  return Math.round(
    ((currentIndex.value + 1) / item.value.questions.length) * 100
  );
});
const resultBand = computed(() => {
  if (!item.value || !resultBandId.value) return null;
  return (
    item.value.resultBands.find((band) => band.id === resultBandId.value) ??
    null
  );
});
const contextText = computed(() => {
  if (props.slug === 'self_compassion_scs_sf_v1') {
    return 'Отметь, насколько это обычно похоже на тебя в трудные моменты.';
  }
  return 'За последние две недели отметь, как часто это беспокоило:';
});

function selectOption(optionId: string) {
  const question = currentQuestion.value;
  if (!question) return;
  answers.value = { ...answers.value, [question.id]: optionId };
}

function goPrev() {
  if (currentIndex.value === 0) {
    emit('prev');
    return;
  }
  currentIndex.value -= 1;
}

function getClientTimezone(): string | null {
  if (typeof Intl === 'undefined') return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// Подгружает результат по attemptId (используется при возврате к уже
// пройденному опроснику). Балл/диапазон берём из самого attempt, сравнение и
// график — best-effort: их сбой не должен прятать результат.
async function loadResult(attemptId: number) {
  const resultRes = await useAPI<AssessmentResultResponse>(
    `/api/assessments/${props.slug}/attempts/${attemptId}`,
    { suppressErrorToast: true }
  );
  resultScore.value = resultRes.item.totalScore;
  resultBandId.value = resultRes.item.bandId;
  comparison.value = resultRes.comparison;
  phase.value = 'result';
  void loadChart();
}

async function loadChart() {
  try {
    const chartRes = await useAPI<AssessmentChartResponse>(
      `/api/assessments/${props.slug}/chart`,
      { suppressErrorToast: true }
    );
    chartPoints.value = chartRes.points ?? [];
  } catch (err) {
    console.warn('[AssessmentRunner] График динамики не загрузился:', err);
  }
}

// Подгружает сравнение со стартовой точкой по attemptId (best-effort).
async function loadComparison(attemptId: number) {
  try {
    const resultRes = await useAPI<AssessmentResultResponse>(
      `/api/assessments/${props.slug}/attempts/${attemptId}`,
      { suppressErrorToast: true }
    );
    comparison.value = resultRes.comparison;
  } catch (err) {
    console.warn('[AssessmentRunner] Сравнение не загрузилось:', err);
  }
}

async function goNext() {
  if (!item.value || !currentQuestion.value || !currentAnswer.value) return;
  submitError.value = null;

  if (!isLastQuestion.value) {
    currentIndex.value += 1;
    return;
  }

  submitting.value = true;
  try {
    const result = await useAPI<AssessmentAttemptResponse>(
      `/api/assessments/${item.value.slug}/attempts`,
      {
        method: 'POST',
        body: {
          source: props.source,
          linkedProgramSlug: props.linkedProgramSlug ?? null,
          linkedProgramAttemptId: props.linkedProgramAttemptId ?? null,
          timezone: getClientTimezone(),
          answers: item.value.questions.map((question) => ({
            questionId: question.id,
            optionId: answers.value[question.id],
          })),
        },
        suppressErrorToast: true,
      }
    );

    emit('complete', { attemptId: result.item.id });
    reachGoal('assessment_completed', {
      assessmentSlug: item.value.slug,
      source: props.source,
      linkedProgramSlug: props.linkedProgramSlug ?? null,
    });
    if (props.inlineResult !== false) {
      // Показываем результат СРАЗУ из ответа POST (балл, диапазон уже есть) —
      // не блокируемся на доп. запросах. Сравнение и график докидываем фоном,
      // их сбой не должен мешать показать результат.
      resultScore.value = result.item.totalScore;
      resultBandId.value = result.item.bandId;
      comparison.value = null;
      chartPoints.value = [];
      phase.value = 'result';
      void loadComparison(result.item.id);
      void loadChart();
    }
  } catch (err) {
    console.error('[AssessmentRunner] Не удалось сохранить результат:', err);
    submitError.value =
      'Не удалось сохранить результат. Проверь соединение и попробуй ещё раз.';
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.assessment-step-enter-active,
.assessment-step-leave-active {
  transition: opacity 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.assessment-step-enter-from,
.assessment-step-leave-to {
  opacity: 0;
}
</style>
