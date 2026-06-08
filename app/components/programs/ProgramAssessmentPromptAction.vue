<template>
  <div class="xs:space-y-3 space-y-1">
    <!-- Прохождение опросника прямо внутри шага. Этот же инстанс после ответа
         показывает встроенный результат (inlineResult по умолчанию). Внешнюю
         glass-deep рамку даёт сам шаг — поэтому раннер в embedded-режиме. -->
    <AssessmentRunner
      v-if="phase === 'run'"
      embedded
      :slug="assessmentSlug"
      :source="source"
      :linked-program-slug="programSlug"
      :linked-program-attempt-id="attemptId"
      @complete="onComplete"
      @prev="onQuizPrev"
    />

    <!-- Юзер вернулся к уже пройденному на этом шаге опроснику: показываем
         сохранённый результат по attemptId. -->
    <AssessmentRunner
      v-else-if="completedAttemptId"
      embedded
      :slug="assessmentSlug"
      :source="source"
      :linked-program-slug="programSlug"
      :linked-program-attempt-id="attemptId"
      :initial-attempt-id="completedAttemptId"
    />

    <!-- Вступление (без своей glass-deep рамки — её даёт шаг) -->
    <div v-else>
      <!-- Скелетон пока грузим baseline-кандидата — предотвращает флеш
           между «без результата» и «с результатом» видами. -->
      <div v-if="baselineLoading" class="animate-pulse space-y-5">
        <div class="space-y-2">
          <div class="h-3 w-24 rounded-full bg-white/10" />
          <div class="h-7 w-2/3 rounded-full bg-white/10" />
          <div class="h-4 w-full rounded-full bg-white/10" />
          <div class="h-4 w-3/4 rounded-full bg-white/10" />
        </div>
        <div class="h-20 rounded-2xl bg-white/10" />
        <div class="h-12 rounded-full bg-white/10" />
        <div class="h-12 rounded-full bg-white/10" />
      </div>
      <div v-else class="space-y-5">
        <div class="space-y-2">
          <p
            class="text-xs font-medium uppercase tracking-[0.12em] text-foreground/45"
          >
            {{ sourceLabel }}
          </p>
          <h2 class="text-2xl font-semibold leading-tight text-foreground">
            {{ action.title }}
          </h2>
          <p class="text-sm leading-relaxed text-foreground/72">
            {{ reuseCandidate ? reusePromptText : promptText }}
          </p>
        </div>

        <!-- Недавний результат можно взять как стартовую точку (ТЗ §14) -->
        <div
          v-if="reuseCandidate"
          class="rounded-2xl border border-white/10 bg-white/[0.08] p-4"
        >
          <p class="text-sm font-medium text-foreground">
            {{ reuseCandidate.resultSnapshot.title }} ·
            {{ reuseCandidate.totalScore }} баллов
          </p>
          <p class="mt-1 text-xs text-foreground/55">
            Пройдено {{ reuseCandidateDate }}
          </p>
        </div>
        <div
          v-else
          class="rounded-2xl border border-white/10 bg-white/[0.08] p-4 text-sm leading-relaxed text-foreground/68"
        >
          Здесь нет правильных или неправильных ответов. Отвечай так, как есть
          прямо сейчас. Это твоя точка отсчёта.
        </div>

        <div
          v-if="reuseError"
          class="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {{ reuseError }}
        </div>

        <div class="grid grid-cols-1 gap-2">
          <template v-if="reuseCandidate">
            <!-- Когда есть недавний результат: обе кнопки одного веса -->
            <button
              type="button"
              class="relative inline-flex min-h-12 w-full items-center justify-center rounded-full border border-foreground/10 bg-white/[0.08] px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-white/[0.14] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="reusing"
              :aria-busy="reusing"
              @click="useRecentResult"
            >
              <ButtonLoader v-if="reusing" />
              <span :class="{ invisible: reusing }"
                >Использовать этот результат</span
              >
            </button>
            <button
              type="button"
              class="inline-flex min-h-12 w-full items-center justify-center rounded-full border border-foreground/10 bg-white/[0.08] px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-white/[0.14] active:scale-[0.99]"
              :disabled="reusing"
              @click="startQuiz"
            >
              Пройти заново
            </button>
          </template>
          <template v-else>
            <!-- Без недавнего результата: первичная кнопка + опция пропустить -->
            <button
              type="button"
              class="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-foreground px-5 py-2 text-sm font-semibold text-background transition hover:bg-foreground/90 active:scale-[0.99]"
              @click="startQuiz"
            >
              Пройти опросник
            </button>
            <button
              type="button"
              class="min-h-11 rounded-full border border-foreground/10 bg-white/[0.08] px-5 py-2 text-sm font-semibold text-foreground transition hover:bg-white/[0.14] active:scale-[0.99]"
              @click="$emit('skip')"
            >
              Пропустить
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AssessmentRunner from '@/app/components/assessments/AssessmentRunner.vue';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import { useAPI } from '@/app/composables/useAPI';
import type {
  AssessmentAttempt,
  AssessmentAttemptResponse,
  ProgramAssessmentBaselineResponse,
} from '@/shared/dto/assessments';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  action: ProgramStepActionStateDto;
  programSlug: string;
  step: number;
  attemptId: number;
  completedAttemptId: number | null;
  skipped: boolean;
}>();

const emit = defineEmits<{
  skip: [];
  complete: [attemptId: number];
}>();

const phase = ref<'intro' | 'run'>('intro');
const reuseCandidate = ref<AssessmentAttempt | null>(null);
const reusing = ref(false);
const reuseError = ref<string | null>(null);
// true пока идёт запрос на baseline-кандидата; предотвращает флеш
// между «без кандидата» и «с кандидатом» видами на intro-экране.
const baselineLoading = ref(
  props.action.template !== 'program_final' &&
    !props.completedAttemptId &&
    !props.skipped
);

const assessmentSlug = computed(
  () => props.action.targetId || 'anxiety_check_v1'
);
const source = computed(() =>
  props.action.template === 'program_final'
    ? ('program_final' as const)
    : ('program_baseline' as const)
);
const sourceLabel = computed(() =>
  source.value === 'program_final' ? 'Перед итогом сада' : 'В начале сада'
);
const promptText = computed(() => {
  if (source.value === 'program_final') {
    return 'Сад почти завершён. Можно пройти тот же опросник, что был в начале, и посмотреть, как изменились твои ответы за это время.';
  }
  return 'В начале сада можно пройти короткий опросник. Он покажет, с какой точки ты стартуешь, чтобы потом увидеть, что поменялось.';
});
const reusePromptText =
  'Этот опросник уже был пройден недавно. Можно взять тот результат как стартовую точку сада, чтобы потом сравнить динамику. Если хочешь, пройди опросник заново.';

const reuseCandidateDate = computed(() => {
  if (!reuseCandidate.value) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(reuseCandidate.value.completedAt));
});

// Только для стартового замера ищем недавний результат, который можно
// переиспользовать как baseline (ТЗ §14). Финальный замер всегда проходим заново.
onMounted(async () => {
  if (source.value !== 'program_baseline') return;
  if (props.completedAttemptId || props.skipped) return;
  try {
    const res = await useAPI<ProgramAssessmentBaselineResponse>(
      `/api/programs/${props.programSlug}/assessment-baseline`,
      {
        query: { assessmentSlug: assessmentSlug.value },
        suppressErrorToast: true,
      }
    );
    reuseCandidate.value = res.reusable;
  } catch (err) {
    // Тихо игнорируем: без подсказки о переиспользовании юзер просто пройдёт
    // опросник как обычно.
    console.warn('[AssessmentPrompt] baseline lookup failed:', err);
  } finally {
    baselineLoading.value = false;
  }
});

// «Использовать этот результат»: сохраняем новую baseline-попытку, повторяя
// ответы недавней, чтобы она была привязана к саду и попала в итоговый отчёт.
async function useRecentResult() {
  const candidate = reuseCandidate.value;
  if (!candidate || reusing.value) return;
  reusing.value = true;
  reuseError.value = null;
  try {
    const res = await useAPI<AssessmentAttemptResponse>(
      `/api/assessments/${assessmentSlug.value}/attempts`,
      {
        method: 'POST',
        body: {
          source: 'program_baseline',
          linkedProgramSlug: props.programSlug,
          linkedProgramAttemptId: props.attemptId,
          timezone: getClientTimezone(),
          answers: candidate.answers.map((answer) => ({
            questionId: answer.questionId,
            optionId: answer.optionId,
          })),
        },
        suppressErrorToast: true,
      }
    );
    emit('complete', res.item.id);
  } catch (err) {
    console.error('[AssessmentPrompt] reuse baseline failed:', err);
    reuseError.value =
      'Не удалось сохранить стартовую точку. Попробуй ещё раз или пройди опросник заново.';
  } finally {
    reusing.value = false;
  }
}

function getClientTimezone(): string | null {
  if (typeof Intl === 'undefined') return null;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function startQuiz() {
  phase.value = 'run';
}

function onQuizPrev() {
  phase.value = 'intro';
}

function onComplete(payload: { attemptId: number }) {
  emit('complete', payload.attemptId);
}

// Когда родитель сбрасывает completedAttemptId (пользователь нажал «Назад»
// из экрана результата), возвращаем компонент во вступительную фазу.
watch(
  () => props.completedAttemptId,
  (newVal) => {
    if (newVal === null) {
      phase.value = 'intro';
    }
  }
);
</script>
