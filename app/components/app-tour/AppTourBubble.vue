<template>
  <Teleport to="body">
    <Transition name="app-tour-bubble">
      <div
        v-if="visible"
        ref="bubbleRef"
        class="app-tour-bubble"
        :class="bubbleClass"
        :style="bubbleStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`app-tour-title-${step.id}`"
      >
        <!-- Хвостик-стрелочка к target-элементу (только если не center) -->
        <div
          v-if="arrowVisible"
          class="app-tour-arrow"
          :class="`app-tour-arrow--${resolvedPlacement}`"
          :style="arrowStyle"
          aria-hidden="true"
        />

        <!-- Контент -->
        <div class="app-tour-bubble__inner">
          <!-- Медиа -->
          <div v-if="step.bubble.media" class="app-tour-media">
            <img
              v-if="
                step.bubble.media.type === 'image' ||
                step.bubble.media.type === 'gif'
              "
              :src="step.bubble.media.src"
              :alt="step.bubble.media.alt || ''"
              class="app-tour-media__img"
              loading="eager"
              @error="onMediaError"
            />
            <video
              v-else-if="step.bubble.media.type === 'video'"
              :src="step.bubble.media.src"
              :poster="step.bubble.media.poster"
              class="app-tour-media__video"
              autoplay
              loop
              muted
              playsinline
            />
          </div>

          <!-- Текст -->
          <div class="app-tour-bubble__body">
            <h3
              :id="`app-tour-title-${step.id}`"
              class="app-tour-bubble__title"
            >
              {{ step.bubble.title }}
            </h3>
            <p class="app-tour-bubble__description">
              {{ step.bubble.description }}
            </p>
          </div>

          <!-- Прогресс + кнопки -->
          <div class="app-tour-bubble__footer">
            <div class="app-tour-progress" aria-hidden="true">
              <span
                v-for="i in totalSteps"
                :key="i"
                class="app-tour-progress__dot"
                :class="{
                  'app-tour-progress__dot--active': i === progress.current,
                  'app-tour-progress__dot--passed': i < progress.current,
                }"
              />
            </div>
            <div class="app-tour-bubble__counter">
              {{ progress.current }} / {{ progress.total }}
            </div>
            <div class="app-tour-bubble__actions">
              <button
                v-if="!isFirstStep"
                type="button"
                class="app-tour-btn app-tour-btn--ghost"
                :disabled="isTransitioning"
                @click="$emit('prev')"
              >
                Назад
              </button>
              <button
                type="button"
                class="app-tour-btn app-tour-btn--primary"
                :disabled="isTransitioning"
                @click="$emit('next')"
              >
                <span v-if="isTransitioning" class="app-tour-spinner" />
                <span v-else>{{ isLastStep ? 'Начать' : 'Далее' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { AppTourStep, AppTourPlacement } from '@/app/lib/appTourSteps';

const props = defineProps<{
  step: AppTourStep;
  visible: boolean;
  /** Прямоугольник target-элемента (null если центрирование) */
  targetRect: DOMRect | null;
  isFirstStep: boolean;
  isLastStep: boolean;
  isTransitioning: boolean;
  progress: { current: number; total: number };
  totalSteps: number;
}>();

defineEmits<{
  (e: 'next'): void;
  (e: 'prev'): void;
}>();

const bubbleRef = ref<HTMLElement | null>(null);
/** Высота bubble — замеряется после рендера, нужна для корректного top
 *  при placement='top'/'left'/'right'. Ширина НЕ замеряется специально:
 *  использовать измеренную ширину для установки CSS width создаёт петлю
 *  (контент перенесётся под новую ширину → shrink-to-fit → ещё уже → ...)
 *  Поэтому ширина — фиксированная адаптивная константа (см. getBubbleWidth). */
const bubbleHeight = ref<number | null>(null);
const mediaFailed = ref(false);

function onMediaError() {
  mediaFailed.value = true;
}

/** Желаемая ширина bubble — детерминированная функция от viewport,
 *  СОВПАДАЕТ с шириной, заданной в CSS (см. .app-tour-bubble).
 *  - на узких экранах (< 412px): viewport - 32px (16px отступа с каждой стороны)
 *  - на остальных: фиксированные 380px */
const BUBBLE_MAX_WIDTH = 380;
const BUBBLE_HORIZONTAL_GAP = 32;

function getBubbleWidth(viewportW: number): number {
  return Math.min(BUBBLE_MAX_WIDTH, viewportW - BUBBLE_HORIZONTAL_GAP);
}

// При смене шага сбрасываем флаг ошибки медиа и высоту (контент изменился)
watch(
  () => props.step.id,
  () => {
    mediaFailed.value = false;
    bubbleHeight.value = null;
  }
);

// Замеряем ВЫСОТУ bubble после рендера для корректного позиционирования
// при placement='top' (bubble выше target) или 'left'/'right' (центрирование по Y).
watch(
  [() => props.visible, () => props.step.id, () => props.targetRect],
  async () => {
    await nextTick();
    if (bubbleRef.value) {
      const r = bubbleRef.value.getBoundingClientRect();
      bubbleHeight.value = r.height;
    }
  },
  { immediate: true }
);

const isMobile = computed(() => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 640px)').matches;
});

/** Эффективное placement — с учётом fallback для null/auto */
const resolvedPlacement = computed<AppTourPlacement>(() => {
  const requested = props.step.bubble.placement || 'auto';
  if (!props.targetRect || requested === 'center') return 'center';

  if (requested === 'auto') {
    // Решаем сами: если target в нижней половине — bubble сверху, иначе снизу
    if (typeof window === 'undefined') return 'bottom';
    const viewportH = window.innerHeight;
    const centerY = props.targetRect.top + props.targetRect.height / 2;
    return centerY > viewportH / 2 ? 'top' : 'bottom';
  }
  return requested;
});

const arrowVisible = computed(
  () => resolvedPlacement.value !== 'center' && !!props.targetRect
);

/** Позиция bubble (только left/top — width и max-width задаются через CSS,
 *  чтобы избежать петли «измерение ↔ применение width»). */
const bubbleStyle = computed(() => {
  const margin = 12;
  const safeMargin = 16;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 375;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 812;

  // Ширина — детерминированная функция от viewport (СОВПАДАЕТ с CSS).
  // Используется ТОЛЬКО для расчёта позиции, не для установки в inline-style.
  const bw = getBubbleWidth(viewportW);
  // Высота — измеренная (или fallback для первого рендера)
  const bh = bubbleHeight.value ?? 220;

  // Центрированный режим
  if (resolvedPlacement.value === 'center' || !props.targetRect) {
    const left = Math.max(safeMargin, (viewportW - bw) / 2);
    const top = Math.max(safeMargin, (viewportH - bh) / 2);
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }

  const r = props.targetRect;

  // На мобиле: bubble прижат сверху или снизу target, центрируется по горизонтали
  if (isMobile.value) {
    const left = (viewportW - bw) / 2;
    let top: number;
    if (resolvedPlacement.value === 'top') {
      top = Math.max(safeMargin, r.top - bh - margin);
    } else {
      top = Math.min(viewportH - bh - safeMargin, r.bottom + margin);
    }
    return {
      left: `${Math.max(safeMargin, left)}px`,
      top: `${top}px`,
    };
  }

  // Desktop: позиционируем в нужную сторону target'а
  let left: number;
  let top: number;

  switch (resolvedPlacement.value) {
    case 'top':
      left = r.left + r.width / 2 - bw / 2;
      top = r.top - bh - margin;
      break;
    case 'bottom':
      left = r.left + r.width / 2 - bw / 2;
      top = r.bottom + margin;
      break;
    case 'left':
      left = r.left - bw - margin;
      top = r.top + r.height / 2 - bh / 2;
      break;
    case 'right':
      left = r.right + margin;
      top = r.top + r.height / 2 - bh / 2;
      break;
    default:
      left = r.left + r.width / 2 - bw / 2;
      top = r.bottom + margin;
  }

  // Clamp в viewport
  left = Math.max(safeMargin, Math.min(viewportW - bw - safeMargin, left));
  top = Math.max(safeMargin, Math.min(viewportH - bh - safeMargin, top));

  return {
    left: `${left}px`,
    top: `${top}px`,
  };
});

/** Стиль стрелочки — позиционируется относительно bubble */
const arrowStyle = computed(() => {
  if (!props.targetRect) return {};
  // Считаем позицию target относительно bubble (left/top)
  const bubbleLeft = parseFloat(bubbleStyle.value.left as string);
  const bubbleTop = parseFloat(bubbleStyle.value.top as string);
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 375;
  const bw = getBubbleWidth(viewportW);
  const bh = bubbleHeight.value ?? 220;

  switch (resolvedPlacement.value) {
    case 'top':
    case 'bottom': {
      // Стрелка горизонтально по центру target внутри bubble
      const arrowX =
        props.targetRect.left + props.targetRect.width / 2 - bubbleLeft;
      return {
        left: `${Math.max(16, Math.min(bw - 16, arrowX))}px`,
      };
    }
    case 'left':
    case 'right': {
      const arrowY =
        props.targetRect.top + props.targetRect.height / 2 - bubbleTop;
      return {
        top: `${Math.max(16, Math.min(bh - 16, arrowY))}px`,
      };
    }
    default:
      return {};
  }
});

const bubbleClass = computed(() => ({
  [`app-tour-bubble--${resolvedPlacement.value}`]: true,
  'app-tour-bubble--mobile': isMobile.value,
}));
</script>

<style>
/* ВАЖНО: стили НЕ scoped, так как Teleport переносит компонент в body —
   при scoped стилях data-атрибут не применится из-за hash-неймспейса. */

.app-tour-bubble {
  position: fixed;
  /* Выше driver.js popover (1000000000). Без этого driver.js может
     накладываться на наш bubble. Также pointer-events: auto !important
     задан в AppTourOverlay.vue, чтобы обойти .driver-active * правило. */
  z-index: 2000000000;

  /* Адаптивная ФИКСИРОВАННАЯ ширина — детерминированная функция от viewport.
     ВАЖНО: значение должно совпадать с getBubbleWidth() в скрипте, иначе
     позиционирование будет рассинхронизировано.
     - на узких экранах (< 412px) шире просто не получится: 100vw - 32px
     - на остальных — 380px (комфортно для чтения, не перекрывает весь экран)
     Без явной width bubble использует shrink-to-fit и каждая итерация
     перерасчёта делает его всё уже (см. историю бага). */
  width: min(380px, calc(100vw - 32px));
  max-width: 380px;
  box-sizing: border-box;

  /* glassmorphism под общий стиль приложения */
  background: rgba(28, 28, 50, 0.92);
  backdrop-filter: blur(24px) saturate(120%);
  -webkit-backdrop-filter: blur(24px) saturate(120%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  box-shadow:
    0 20px 60px -10px rgba(0, 0, 0, 0.5),
    0 0 40px rgba(155, 120, 255, 0.15);
  color: #fff;
  overflow: hidden;
  animation: app-tour-bubble-pop 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.app-tour-bubble__inner {
  display: flex;
  flex-direction: column;
}

/* --- Медиа --- */
.app-tour-media {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 200px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  padding: 5px;
}
.app-tour-media__img,
.app-tour-media__video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

@media (min-width: 641px) {
  .app-tour-media {
    max-height: 220px;
  }
}

/* --- Текст --- */
.app-tour-bubble__body {
  padding: 16px 18px 12px;
}
.app-tour-bubble__title {
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 6px;
  color: #fff;
}
.app-tour-bubble__description {
  font-size: 14px;
  line-height: 1.55;
  margin: 0;
  color: rgba(255, 255, 255, 0.86);
}

/* --- Footer (прогресс + кнопки) --- */
.app-tour-bubble__footer {
  padding: 10px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.app-tour-progress {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 2px;
}
.app-tour-progress__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  transition:
    background 200ms ease,
    transform 200ms ease,
    width 200ms ease;
}
.app-tour-progress__dot--passed {
  background: rgba(155, 120, 255, 0.55);
}
.app-tour-progress__dot--active {
  background: rgba(180, 140, 255, 1);
  width: 18px;
}
.app-tour-bubble__counter {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 0.04em;
}
.app-tour-bubble__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* --- Кнопки --- */
.app-tour-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  min-height: 40px;
  min-width: 88px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background 160ms ease,
    transform 120ms ease,
    border-color 160ms ease,
    opacity 160ms ease;
  -webkit-tap-highlight-color: transparent;
}
.app-tour-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.app-tour-btn:not(:disabled):active {
  transform: scale(0.97);
}

.app-tour-btn--ghost {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.12);
}
.app-tour-btn--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.app-tour-btn--primary {
  background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
  color: #fff;
  box-shadow: 0 4px 16px rgba(139, 92, 246, 0.35);
}
.app-tour-btn--primary:hover:not(:disabled) {
  transform: translateY(-1px) scale(1.01);
  box-shadow: 0 6px 24px rgba(139, 92, 246, 0.5);
}

/* --- Spinner --- */
.app-tour-spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: app-tour-spin 800ms linear infinite;
}
@keyframes app-tour-spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- Стрелочки --- */
.app-tour-arrow {
  position: absolute;
  width: 14px;
  height: 14px;
  background: rgba(28, 28, 50, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  transform: rotate(45deg);
  z-index: -1;
}
.app-tour-arrow--top {
  bottom: -8px;
  border-top: none;
  border-left: none;
  margin-left: -7px;
}
.app-tour-arrow--bottom {
  top: -8px;
  border-bottom: none;
  border-right: none;
  margin-left: -7px;
}
.app-tour-arrow--left {
  right: -8px;
  border-bottom: none;
  border-left: none;
  margin-top: -7px;
}
.app-tour-arrow--right {
  left: -8px;
  border-top: none;
  border-right: none;
  margin-top: -7px;
}

/* --- Pop-анимация при появлении --- */
@keyframes app-tour-bubble-pop {
  0% {
    opacity: 0;
    transform: scale(0.92) translateY(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* --- Vue Transition --- */
.app-tour-bubble-enter-active,
.app-tour-bubble-leave-active {
  transition:
    opacity 200ms ease,
    transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.app-tour-bubble-enter-from,
.app-tour-bubble-leave-to {
  opacity: 0;
  transform: scale(0.94) translateY(8px);
}
</style>
