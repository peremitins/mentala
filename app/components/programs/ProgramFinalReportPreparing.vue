<template>
  <Teleport to="body">
    <Transition name="preparing-fade">
      <div
        v-if="open && visible"
        class="preparing-overlay"
        role="status"
        aria-live="polite"
        :aria-busy="isPolling"
      >
        <div class="preparing-glow" aria-hidden="true" />

        <div class="preparing-content">
          <!-- Анимированное растение в bloom — то самое, что пользователь
               только что вырастил. Лёгкое breathing-анимация. -->
          <div class="preparing-plant-wrap">
            <div class="preparing-plant-aura" aria-hidden="true" />
            <img
              v-if="plantImageSrc"
              :src="plantImageSrc"
              :alt="plantTitle || 'Растение'"
              class="preparing-plant"
              loading="eager"
              decoding="async"
            />
          </div>

          <p class="preparing-eyebrow">Готовлю итоговый отчёт</p>
          <h1 class="preparing-title">
            {{ plantTitle ? `Сад «${plantTitle}»` : 'Твой сад' }} завершён
          </h1>

          <!-- Status messages по фазам. Слова меняются каждые ~3-4 сек,
               чтобы пользователь ощущал прогресс, даже если LLM долго думает. -->
          <p class="preparing-status">
            {{ statusMessage }}
          </p>

          <!-- Прогресс-индикатор: тонкая horizontal line с moving gradient -->
          <div class="preparing-progress" aria-hidden="true">
            <div class="preparing-progress-bar" />
          </div>

          <!-- Long-wait CTA — появляется через 15 сек -->
          <Transition name="long-wait">
            <div v-if="showLongWait" class="preparing-long-wait">
              <p class="preparing-long-wait-text">
                Отчёт готовится в фоне. Можешь подождать здесь или уйти: он
                откроется на странице «Оранжерея», когда будет готов.
              </p>
              <button
                type="button"
                class="preparing-long-wait-btn"
                @click="onLeave"
              >
                Уйти в «Оранжерею»
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import { useToast } from '@/app/composables/useToast';
import { useAuthStore } from '@/app/stores/auth';
import { applyGender } from '@/app/utils/genderedText';

const authStore = useAuthStore();

/**
 * Full-screen блокирующий overlay, который показывается сразу после complete
 * последнего шага программы. Polling endpoint'а `summary-status` каждые 2 сек,
 * пока LLM не закончит итоговый отчёт (5-15 сек в среднем).
 *
 * Состояния:
 *   - polling: показываем breathing-растение + меняющиеся status-фразы;
 *   - long-wait (>15 сек): дополнительно появляется CTA «Уйти в Оранжерею»;
 *   - error / timeout (>60 сек): закрываем overlay через emit('failed').
 *
 * При успехе (status='ready'): эмитим 'ready' с summaryText + metrics —
 * родитель должен открыть GardenPlantReportSheet с этими данными.
 */

type Metrics = {
  durationDays: number;
  completedSteps: number;
  journalEntriesCount: number;
  aiChatSessionsCount: number;
  reflectionsCount: number;
};

const props = withDefaults(
  defineProps<{
    open: boolean;
    programSlug: string | null;
    plantTitle: string | null;
    plantImageSrc: string | null;
    /**
     * Видимость оверлея. Генерация (polling) стартует по `open` независимо от
     * этого флага — это позволяет родителю запускать генерацию в фоне во время
     * анимации цветка, а сам оверлей показывать только после её завершения.
     * По умолчанию true — обратная совместимость со старыми вызовами.
     */
    visible?: boolean;
    /**
     * Режим повторного прохождения: отчёт уже существует, но юзер заново прошёл
     * финальный шаг. Тогда вместо polling кэша форсим пересборку отчёта по
     * свежим данным (refresh-summary?force=1) и ждём её, иначе summary-status
     * мгновенно вернул бы старый кэш.
     */
    forceRefresh?: boolean;
  }>(),
  { visible: true, forceRefresh: false }
);
const emit = defineEmits<{
  (
    e: 'ready',
    payload: {
      plantId: number;
      summaryText: string;
      metrics: Metrics | null;
    }
  ): void;
  (e: 'failed'): void;
  (e: 'leave'): void;
}>();

const isPolling = ref(false);
const showLongWait = ref(false);
const elapsedSec = ref(0);
const phaseIndex = ref(0);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let phaseTimer: ReturnType<typeof setInterval> | null = null;

// Меняющиеся подсказки в overlay'е. Цикл фраз по ~3.5 сек чтобы пользователь
// не «застывал» на одном тексте. Это пафосно тёплый, но не приторный тон —
// как реальный психотерапевт, готовящий заключение.
const STATUS_PHASES = [
  applyGender(
    'Перечитываю все шаги, которые ты {прошёл|прошла}',
    authStore.user?.gender
  ),
  'Свожу заметки из дневника и рефлексий',
  'Анализирую mood-трек и разговоры',
  'Связываю наблюдения с методикой программы',
  'Формулирую итог и рекомендации',
];

const statusMessage = computed(
  () => STATUS_PHASES[phaseIndex.value % STATUS_PHASES.length]
);

function startPolling() {
  if (!props.programSlug) return;
  isPolling.value = true;
  elapsedSec.value = 0;
  phaseIndex.value = 0;
  showLongWait.value = false;

  // Тикер прошедшего времени + фаза статуса.
  elapsedTimer = setInterval(() => {
    elapsedSec.value += 1;
    if (elapsedSec.value >= 15) {
      showLongWait.value = true;
    }
    if (elapsedSec.value >= 60) {
      // Жёсткий timeout: 60 сек — overlay снимаем, чтобы пользователь не залип.
      // backend всё ещё может довести генерацию до конца, и при следующем
      // заходе на /garden пользователь увидит готовый отчёт.
      stopAllTimers();
      useToast(
        'Итоговый отчёт готовится в фоне',
        'Загляни в «Оранжерею» через минуту-другую: там будет готовый итог.',
        'info'
      );
      emit('failed');
    }
  }, 1000);
  phaseTimer = setInterval(() => {
    phaseIndex.value += 1;
  }, 3500);

  // Основной polling — каждые 2 сек.
  const doPoll = async () => {
    if (!props.programSlug) return;
    try {
      const result = await useAPI<{
        plantId: number;
        status: 'ready' | 'pending';
        summaryText: string | null;
        metrics: Metrics | null;
      }>(
        `/api/garden/plants/by-slug/${encodeURIComponent(props.programSlug)}/summary-status`,
        {
          method: 'GET',
          suppressErrorToast: true,
        }
      );
      if (result.status === 'ready' && result.summaryText) {
        stopAllTimers();
        emit('ready', {
          plantId: result.plantId,
          summaryText: result.summaryText,
          metrics: result.metrics,
        });
      }
    } catch (error) {
      console.error('[ProgramFinalReportPreparing] poll failed:', error);
      // Один сбой polling'а — не критично, продолжаем (network blip).
      // Если будут падать постоянно — elapsed timeout на 60 сек закроет overlay.
    }
  };

  void doPoll(); // первый сразу
  pollTimer = setInterval(doPoll, 2000);
}

// Повторное прохождение: форсим пересборку отчёта по свежим данным и ждём её.
// Polling кэша тут не подходит — он вернул бы старый отчёт мгновенно.
function startForceRefresh() {
  if (!props.programSlug) return;
  isPolling.value = true;
  elapsedSec.value = 0;
  phaseIndex.value = 0;
  showLongWait.value = false;

  elapsedTimer = setInterval(() => {
    elapsedSec.value += 1;
    if (elapsedSec.value >= 15) showLongWait.value = true;
    if (elapsedSec.value >= 60) {
      stopAllTimers();
      useToast(
        'Итоговый отчёт готовится в фоне',
        'Загляни в «Оранжерею» через минуту-другую: там будет готовый итог.',
        'info'
      );
      emit('failed');
    }
  }, 1000);
  phaseTimer = setInterval(() => {
    phaseIndex.value += 1;
  }, 3500);

  const slug = props.programSlug;
  void (async () => {
    try {
      await useAPI(
        `/api/garden/plants/by-slug/${encodeURIComponent(slug)}/refresh-summary?force=1`,
        { method: 'POST', suppressErrorToast: true }
      );
      // Пересборка завершилась — забираем свежий отчёт + метрики + plantId.
      const result = await useAPI<{
        plantId: number;
        status: 'ready' | 'pending';
        summaryText: string | null;
        metrics: Metrics | null;
      }>(
        `/api/garden/plants/by-slug/${encodeURIComponent(slug)}/summary-status`,
        { method: 'GET', suppressErrorToast: true }
      );
      if (result.summaryText) {
        stopAllTimers();
        emit('ready', {
          plantId: result.plantId,
          summaryText: result.summaryText,
          metrics: result.metrics,
        });
        return;
      }
      stopAllTimers();
      emit('failed');
    } catch (error) {
      console.error(
        '[ProgramFinalReportPreparing] force refresh failed:',
        error
      );
      stopAllTimers();
      emit('failed');
    }
  })();
}

function stopAllTimers() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  if (phaseTimer) {
    clearInterval(phaseTimer);
    phaseTimer = null;
  }
  isPolling.value = false;
}

function onLeave() {
  stopAllTimers();
  emit('leave');
}

watch(
  () => [props.open, props.programSlug] as const,
  ([isOpen, slug]) => {
    if (isOpen && slug) {
      if (props.forceRefresh) {
        startForceRefresh();
      } else {
        startPolling();
      }
    } else {
      stopAllTimers();
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopAllTimers();
});
</script>

<style scoped>
.preparing-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(
    180deg,
    rgba(8, 12, 20, 0.96) 0%,
    rgba(10, 14, 22, 0.99) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.preparing-fade-enter-active,
.preparing-fade-leave-active {
  transition: opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
.preparing-fade-enter-from,
.preparing-fade-leave-to {
  opacity: 0;
}

.preparing-glow {
  position: absolute;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  width: 70vmin;
  height: 70vmin;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(167, 243, 208, 0.16) 0%,
    rgba(167, 243, 208, 0.06) 50%,
    transparent 75%
  );
  animation: preparing-glow-pulse 4.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes preparing-glow-pulse {
  0%,
  100% {
    opacity: 0.7;
    transform: translateX(-50%) scale(1);
  }
  50% {
    opacity: 1;
    transform: translateX(-50%) scale(1.1);
  }
}

.preparing-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
  text-align: center;
  color: hsl(var(--foreground));
}

.preparing-plant-wrap {
  position: relative;
  width: 180px;
  height: 180px;
  margin: 0 auto 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preparing-plant-aura {
  position: absolute;
  inset: -16px;
  border-radius: 50%;
  background: radial-gradient(
    closest-side,
    rgba(167, 243, 208, 0.22) 0%,
    rgba(167, 243, 208, 0.08) 50%,
    transparent 70%
  );
  animation: preparing-aura 3.2s ease-in-out infinite;
}

@keyframes preparing-aura {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

.preparing-plant {
  position: relative;
  z-index: 1;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.45));
  animation: preparing-plant-breathe 4s ease-in-out infinite;
}

@keyframes preparing-plant-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-4px) scale(1.02);
  }
}

.preparing-eyebrow {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: hsl(var(--foreground) / 0.55);
}

.preparing-title {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.preparing-status {
  margin-top: 18px;
  min-height: 44px;
  font-size: 14px;
  line-height: 1.5;
  color: hsl(var(--foreground) / 0.75);
  transition: opacity 320ms ease;
}

.preparing-progress {
  position: relative;
  width: 200px;
  height: 3px;
  margin: 24px auto 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.preparing-progress-bar {
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
  animation: preparing-bar 1.8s ease-in-out infinite;
}

@keyframes preparing-bar {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(250%);
  }
}

.preparing-long-wait {
  margin-top: 36px;
}

.long-wait-enter-active {
  transition:
    opacity 360ms ease,
    transform 360ms ease;
}
.long-wait-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.preparing-long-wait-text {
  font-size: 13px;
  line-height: 1.55;
  color: hsl(var(--foreground) / 0.65);
}

.preparing-long-wait-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  transition:
    background 200ms ease,
    transform 200ms ease;
}
.preparing-long-wait-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}
.preparing-long-wait-btn:active {
  transform: scale(0.98);
}
</style>
