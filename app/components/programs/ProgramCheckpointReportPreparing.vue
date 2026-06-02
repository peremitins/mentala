<template>
  <Teleport to="body">
    <Transition name="checkpoint-preparing-fade">
      <div
        v-if="open && visible"
        class="checkpoint-preparing-overlay"
        role="status"
        aria-live="polite"
        :aria-busy="isPolling"
      >
        <div class="checkpoint-preparing-glow" aria-hidden="true" />

        <div class="checkpoint-preparing-content">
          <p class="checkpoint-preparing-eyebrow">
            Промежуточная сводка · Этап {{ weekNumber }}
          </p>
          <h1 class="checkpoint-preparing-title">Готовлю короткий итог</h1>

          <p class="checkpoint-preparing-status">
            {{ statusMessage }}
          </p>

          <div class="checkpoint-preparing-progress" aria-hidden="true">
            <div class="checkpoint-preparing-progress-bar" />
          </div>

          <Transition name="checkpoint-long-wait">
            <button
              v-if="showLongWait"
              type="button"
              class="checkpoint-preparing-skip"
              @click="onSkip"
            >
              Пропустить и продолжить
            </button>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import type {
  CheckpointSummaryResponseDto,
  CheckpointStructuredDataDto,
} from '@/shared/dto/program-checkpoint';

/**
 * Короткий polling overlay для генерации промежуточного чекпоинт-отчёта.
 * Показывается сразу после завершения weekly_check на шагах 7, 14, 21.
 *
 * Архитектура:
 *   1. Родитель (step.vue) триггерит open=true сразу после успешного complete
 *      шага с weekly_check action.
 *   2. Этот компонент шлёт POST /api/programs/:slug/checkpoint-summary,
 *      ждёт результат до 30 сек.
 *   3. При успехе эмитит 'ready' с summaryText + structuredData — родитель
 *      открывает GardenPlantReportSheet на нужной точке пути.
 *   4. При таймауте/сбое эмитит 'failed' — фронт показывает обычный
 *      success-экран без отчёта (отчёт всё равно сохранится в БД, доступен
 *      из Оранжереи позже).
 *   5. CTA «Пропустить» (после 12 сек) — эмитит 'skip', фронт идёт дальше
 *      без отчёта.
 *
 * Стилистически проще ProgramFinalReportPreparing — это промежуточный, не
 * финальный, поэтому без растения hero и pulsing aura.
 */

const props = withDefaults(
  defineProps<{
    open: boolean;
    programSlug: string | null;
    checkpointStep: 7 | 14 | 21 | 30 | null;
    /**
     * Видимость оверлея. Генерация стартует по `open` независимо от флага —
     * родитель запускает её в фоне во время анимации цветка, а оверлей
     * показывает только после её завершения. По умолчанию true (обратная
     * совместимость).
     */
    visible?: boolean;
  }>(),
  { visible: true }
);

const emit = defineEmits<{
  (
    e: 'ready',
    payload: {
      reportId: number | null;
      summaryText: string;
      structuredData: CheckpointStructuredDataDto;
    }
  ): void;
  (e: 'failed'): void;
  (e: 'skip'): void;
}>();

const isPolling = ref(false);
const showLongWait = ref(false);
const elapsedSec = ref(0);
const phaseIndex = ref(0);

let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let phaseTimer: ReturnType<typeof setInterval> | null = null;
let abortController: AbortController | null = null;

const STATUS_PHASES = [
  'Перечитываю твои шаги',
  'Слежу за динамикой тревоги',
  'Достаю цитаты из твоих записей',
  'Собираю короткий итог',
];

const statusMessage = computed(
  () => STATUS_PHASES[phaseIndex.value % STATUS_PHASES.length]
);

const weekNumber = computed(() => {
  if (!props.checkpointStep) return 1;
  return Math.ceil(props.checkpointStep / 7);
});

async function startGeneration() {
  if (!props.programSlug || !props.checkpointStep) return;
  isPolling.value = true;
  elapsedSec.value = 0;
  phaseIndex.value = 0;
  showLongWait.value = false;
  abortController = new AbortController();

  elapsedTimer = setInterval(() => {
    elapsedSec.value += 1;
    if (elapsedSec.value >= 12) showLongWait.value = true;
    if (elapsedSec.value >= 30) {
      stopAll();
      emit('failed');
    }
  }, 1000);
  phaseTimer = setInterval(() => {
    phaseIndex.value += 1;
  }, 3000);

  try {
    const result = await useAPI<CheckpointSummaryResponseDto>(
      `/api/programs/${encodeURIComponent(props.programSlug)}/checkpoint-summary`,
      {
        method: 'POST',
        body: { checkpointStep: props.checkpointStep },
        suppressErrorToast: true,
      }
    );
    stopAll();
    if (
      result.status === 'ready' &&
      result.summaryText &&
      result.structuredData
    ) {
      emit('ready', {
        reportId: result.id ?? null,
        summaryText: result.summaryText,
        structuredData: result.structuredData,
      });
    } else if (result.summaryText) {
      // failed-статус, но fallback-текст есть — всё равно показываем.
      emit('ready', {
        reportId: result.id ?? null,
        summaryText: result.summaryText,
        structuredData: result.structuredData ?? {
          anxietyTimeline: [],
          moodTimeline: [],
          weeklyCheckAnswer: null,
          topChips: [],
          structuredFormHighlights: [],
          metrics: {
            stepsCompleted: 0,
            journalEntries: 0,
            aiChatSessions: 0,
            practicesCompleted: 0,
          },
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
        },
      });
    } else {
      emit('failed');
    }
  } catch (error) {
    console.error('[ProgramCheckpointReportPreparing] generate failed:', error);
    stopAll();
    emit('failed');
  }
}

function stopAll() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  if (phaseTimer) {
    clearInterval(phaseTimer);
    phaseTimer = null;
  }
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  isPolling.value = false;
}

function onSkip() {
  stopAll();
  emit('skip');
}

watch(
  () => [props.open, props.programSlug, props.checkpointStep] as const,
  ([isOpen]) => {
    if (isOpen) {
      void startGeneration();
    } else {
      stopAll();
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopAll();
});
</script>

<style scoped>
.checkpoint-preparing-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(
    180deg,
    rgba(8, 12, 20, 0.95) 0%,
    rgba(10, 14, 22, 0.98) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.checkpoint-preparing-fade-enter-active,
.checkpoint-preparing-fade-leave-active {
  transition: opacity 280ms cubic-bezier(0.22, 1, 0.36, 1);
}
.checkpoint-preparing-fade-enter-from,
.checkpoint-preparing-fade-leave-to {
  opacity: 0;
}

.checkpoint-preparing-glow {
  position: absolute;
  top: 25%;
  left: 50%;
  transform: translateX(-50%);
  width: 60vmin;
  height: 60vmin;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(167, 243, 208, 0.14) 0%,
    rgba(167, 243, 208, 0.05) 50%,
    transparent 75%
  );
  animation: checkpoint-glow 4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes checkpoint-glow {
  0%,
  100% {
    opacity: 0.7;
    transform: translateX(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateX(-50%) scale(1.08);
  }
}

.checkpoint-preparing-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  text-align: center;
  color: hsl(var(--foreground));
}

.checkpoint-preparing-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: hsl(var(--foreground) / 0.55);
}

.checkpoint-preparing-title {
  margin-top: 10px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.checkpoint-preparing-status {
  margin-top: 16px;
  min-height: 40px;
  font-size: 13.5px;
  line-height: 1.5;
  color: hsl(var(--foreground) / 0.7);
}

.checkpoint-preparing-progress {
  position: relative;
  width: 180px;
  height: 3px;
  margin: 24px auto 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.checkpoint-preparing-progress-bar {
  position: absolute;
  inset: 0;
  width: 40%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(167, 243, 208, 0.9) 50%,
    transparent 100%
  );
  border-radius: 999px;
  animation: checkpoint-bar 1.7s ease-in-out infinite;
}

@keyframes checkpoint-bar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.checkpoint-preparing-skip {
  display: inline-flex;
  margin-top: 32px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground) / 0.7);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  cursor: pointer;
  transition: all 200ms ease;
}
.checkpoint-preparing-skip:hover {
  color: hsl(var(--foreground));
  background: rgba(255, 255, 255, 0.05);
}

.checkpoint-long-wait-enter-active {
  transition:
    opacity 360ms ease,
    transform 360ms ease;
}
.checkpoint-long-wait-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
</style>
