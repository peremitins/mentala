<template>
  <button
    type="button"
    class="roadmap-node"
    :class="[
      `roadmap-node--${node.status}`,
      {
        'roadmap-node--active-larger': node.status === 'active',
        'roadmap-node--revealed': revealed,
      },
    ]"
    :style="rootStyle"
    :data-step="node.step.step"
    :aria-label="ariaLabel"
    role="listitem"
    @click="onTap"
  >
    <span class="roadmap-node__circle" :style="circleStyle">
      <!-- Фоновый слой: только он масштабируется при пульсе.
           Цифра и иконка остаются на месте. -->
      <span ref="circleRef" class="roadmap-node__circle-bg" />
      <span
        class="roadmap-node__step-num"
        :style="stepNumStyle"
        aria-hidden="true"
        >{{ node.step.step }}</span
      >
      <IconCheck
        v-if="node.status === 'completed'"
        class="roadmap-node__icon"
      />
      <IconPlay
        v-else-if="node.status === 'active'"
        class="roadmap-node__icon roadmap-node__icon--play"
      />
      <IconLock v-else class="roadmap-node__icon" />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import gsap from 'gsap';
import IconCheck from '~icons/lucide/check';
import IconLock from '~icons/lucide/lock';
import IconPlay from '~icons/lucide/play';
import { useReducedMotion } from '@/app/composables/useReducedMotion';
import { useRoadmapHaptics } from '@/app/composables/useRoadmapHaptics';
import type { RoadmapNode } from '@/app/composables/useRoadmapLayout';

const props = withDefaults(
  defineProps<{
    node: RoadmapNode;
    /** Задержка появления узла при entrance-reveal (мс). Передаётся родителем
     *  для stagger-эффекта: каждый следующий узел появляется чуть позже. */
    revealDelayMs?: number;
    /** True → узел становится видимым с CSS transition. False → opacity 0
     *  (initial state). Управляется родителем через флаг `isReady`. */
    revealed?: boolean;
  }>(),
  {
    revealDelayMs: 0,
    revealed: false,
  }
);

const emit = defineEmits<{
  select: [step: RoadmapNode['step']];
}>();

// Узел абсолютно позиционирован по cx/cy через `translate(-50%, -50%)`
// — это даёт «центральную точку» узла ровно на координате, рассчитанной
// useRoadmapLayout. Размер берётся из node.radius (active крупнее).
// `--reveal-delay` — CSS-переменная для stagger-задержки fade-in (см. style).
const rootStyle = computed(() => ({
  left: `${props.node.cx}px`,
  top: `${props.node.cy}px`,
  width: `${props.node.radius * 2}px`,
  height: `${props.node.radius * 2}px`,
  '--reveal-delay': `${props.revealDelayMs}ms`,
}));

const circleStyle = computed(() => ({
  width: `${props.node.radius * 2}px`,
  height: `${props.node.radius * 2}px`,
}));

// Размер цифры-watermark: ~55% диаметра, active чуть крупнее для акцента
const stepNumStyle = computed(() => ({
  fontSize: `${Math.round(props.node.radius * 1.1)}px`,
}));

const haptics = useRoadmapHaptics();

function onTap() {
  // Тактильная отдача зависит от статуса узла. На web silent, на iOS/Android
  // — Capacitor Haptics с подобранной интенсивностью.
  switch (props.node.status) {
    case 'active':
      void haptics.trigger('tap-active');
      break;
    case 'completed':
      void haptics.trigger('tap-completed');
      break;
    case 'locked':
    case 'available':
      void haptics.trigger('tap-locked');
      break;
  }
  emit('select', props.node.step);
}

const ariaLabel = computed(() => {
  const stepLabel = `Шаг ${props.node.step.step}`;
  const title = props.node.step.title ? `: ${props.node.step.title}` : '';
  const statusLabel = (() => {
    switch (props.node.status) {
      case 'completed':
        return 'пройден';
      case 'active':
        return 'текущий';
      case 'locked':
        return 'закрыт';
      case 'available':
        return 'доступен';
      default:
        return '';
    }
  })();
  return `${stepLabel}${title}, ${statusLabel}`;
});

// === Idle pulse для активного узла (Этап 5) ===
// Мягкое «дыхание»: scale 1 → 1.04 в бесконечном sine-цикле 2.4s.
// При reduced-motion полностью отключён. Если статус узла меняется
// (например, шаг завершён) — pulse останавливается, scale возвращается к 1.
const circleRef = ref<HTMLElement | null>(null);
const prefersReducedMotion = useReducedMotion();
let pulseTween: gsap.core.Tween | null = null;

function startPulse() {
  if (!circleRef.value) return;
  if (prefersReducedMotion.value) return;
  stopPulse();
  pulseTween = gsap.to(circleRef.value, {
    scale: 1.04,
    duration: 1.2,
    repeat: -1,
    yoyo: true,
    ease: 'sine.inOut',
    transformOrigin: '50% 50%',
  });
}

function stopPulse() {
  pulseTween?.kill();
  pulseTween = null;
  if (circleRef.value) {
    // Возвращаем элемент к исходному scale без анимации. clearProps
    // удаляет inline transform, который GSAP записал.
    gsap.set(circleRef.value, { clearProps: 'scale,transform' });
  }
}

watch(
  () => props.node.status,
  (newStatus, oldStatus) => {
    if (newStatus === 'active') {
      startPulse();
    } else if (oldStatus === 'active') {
      stopPulse();
    }
  }
);

watch(prefersReducedMotion, (reduced) => {
  if (reduced) {
    stopPulse();
  } else if (props.node.status === 'active') {
    startPulse();
  }
});

onMounted(() => {
  if (props.node.status === 'active') startPulse();
});

onBeforeUnmount(() => {
  stopPulse();
});
</script>

<style scoped>
/* Узел тропы. Абсолютно позиционирован по координатам, рассчитанным
   useRoadmapLayout. Кружок внутри обёрнут в button для tap-цели полного
   размера (48px+ — соответствует WCAG 2.1 AA для touch). */
.roadmap-node {
  position: absolute;
  display: block;
  padding: 0;
  border: 0;
  background: transparent;
  transform: translate(-50%, -50%);
  cursor: pointer;
  z-index: 1;
  min-width: 48px;
  min-height: 48px;
  /* Initial state: узел невидим. Видимость переключается классом
     `.roadmap-node--revealed`, который ставит родитель (ProgramRoadmapPath)
     через prop `revealed`. CSS-переменная `--reveal-delay` (из rootStyle)
     даёт stagger-эффект. Решает FOUC, который был при GSAP-based reveal. */
  opacity: 0;
  transition: opacity 320ms cubic-bezier(0.32, 0.72, 0, 1);
  transition-delay: var(--reveal-delay, 0ms);
}

.roadmap-node--revealed {
  opacity: 1;
}

.roadmap-node:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 4px;
  border-radius: 999px;
}

.roadmap-node__circle {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
}

/* Фоновый слой — анимируется GSAP (scale для пульса). Содержит цвет,
   рамку и glow. Цифра и иконка лежат поверх и не масштабируются. */
.roadmap-node__circle-bg {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  border: 1.5px solid transparent;
  transition:
    box-shadow 240ms ease,
    background 240ms ease,
    border-color 240ms ease;
}

/* Watermark-цифра шага: крупная, полупрозрачная, позади иконки.
   Лежит вне circleRef, поэтому GSAP-пульс на circle не затрагивает её. */
.roadmap-node__step-num {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  line-height: 1;
  letter-spacing: -0.04em;
  opacity: 0.13;
  pointer-events: none;
  user-select: none;
  z-index: 0;
}

.roadmap-node--active .roadmap-node__step-num {
  opacity: 0.2;
}

.roadmap-node--completed .roadmap-node__step-num {
  opacity: 0.1;
}

/* Tap-feedback: масштабируем только фоновый слой. */
.roadmap-node:not(.roadmap-node--active):active .roadmap-node__circle-bg {
  transform: scale(0.94);
  transition:
    transform 180ms cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 240ms ease,
    background 240ms ease,
    border-color 240ms ease;
}

.roadmap-node--active:active .roadmap-node__circle-bg {
  opacity: 0.88;
}

.roadmap-node__icon {
  position: relative;
  z-index: 1;
  width: 44%;
  height: 44%;
  stroke-width: 2.5;
  opacity: 0.7;
}

.roadmap-node__icon--play {
  /* Иконка play выравнивается «оптически» — её центр масс смещён влево
     из-за треугольника. Сдвигаем на 1px чтобы выглядела по центру. */
  transform: translateX(1px);
}

/* === Состояния === */

.roadmap-node--completed .roadmap-node__circle-bg {
  background: hsl(var(--roadmap-node-completed-bg));
  border-color: hsl(var(--roadmap-node-completed-border) / 0.5);
}

.roadmap-node--completed .roadmap-node__circle {
  color: hsl(var(--background));
}

.roadmap-node--active .roadmap-node__circle-bg {
  background: hsl(var(--roadmap-node-active-bg));
  border-color: hsl(var(--roadmap-node-active-border) / 0.9);
  box-shadow:
    0 0 0 4px hsl(var(--roadmap-glow-active) / 0.18),
    0 8px 24px -8px hsl(var(--roadmap-glow-active) / 0.5);
}

.roadmap-node--active .roadmap-node__circle {
  color: hsl(var(--background));
}

.roadmap-node--locked .roadmap-node__circle-bg,
.roadmap-node--available .roadmap-node__circle-bg {
  background: hsl(var(--roadmap-node-locked-bg));
  border: 1.5px dashed hsl(var(--roadmap-node-locked-border) / 0.22);
}

.roadmap-node--locked .roadmap-node__circle,
.roadmap-node--available .roadmap-node__circle {
  color: hsl(var(--foreground) / 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .roadmap-node {
    opacity: 1 !important;
    transition: none !important;
  }
  .roadmap-node__circle-bg {
    transition:
      background 240ms ease,
      border-color 240ms ease;
  }
  .roadmap-node:active .roadmap-node__circle-bg {
    transform: none;
    opacity: 1;
  }
}
</style>
