<template>
  <div
    ref="containerRef"
    class="roadmap-path"
    :class="{ 'roadmap-path--ready': isReady }"
    :style="{ height: `${totalHeight}px` }"
    role="list"
    aria-label="Карта пути программы"
  >
    <!-- Banner-разделитель главы на всю ширину. Стоит в «микропаузе» между
         последним узлом предыдущей главы и первым узлом следующей. Glass-фон
         через `glass-deep` гарантирует читаемость поверх любой подложки. -->
    <div
      v-for="(label, idx) in chapterLabels"
      :key="`chapter-${label.chapter.chapter}`"
      class="roadmap-chapter"
      :style="{
        top: `${label.cy}px`,
        '--reveal-delay': `${idx * 60 + 80}ms`,
      }"
    >
      <div class="glass-deep roadmap-chapter__inner">
        <span class="roadmap-chapter__icon" aria-hidden="true">
          {{ chapterIcon(label.chapter.chapter) }}
        </span>
        <span class="roadmap-chapter__title">
          {{ label.chapter.title }}
        </span>
        <IconCheck
          v-if="isChapterCompleted(label.chapter)"
          class="roadmap-chapter__check"
          aria-hidden="true"
        />
      </div>
    </div>

    <ProgramRoadmapNode
      v-for="node in nodes"
      :key="node.step.id"
      :node="node"
      :reveal-delay-ms="node.index * 28"
      :revealed="isReady"
      @select="(step) => emit('select', step)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useElementSize, useIntersectionObserver } from '@vueuse/core';
import gsap from 'gsap';
import IconCheck from '~icons/lucide/check';
import ProgramRoadmapNode from './ProgramRoadmapNode.vue';
import { useReducedMotion } from '@/app/composables/useReducedMotion';
import { useRoadmapHaptics } from '@/app/composables/useRoadmapHaptics';
import { useRoadmapLayout } from '@/app/composables/useRoadmapLayout';
import type {
  ProgramChapterDto,
  ProgramStepDto,
  ProgramStepStatus,
} from '@/shared/dto/retention';

const props = defineProps<{
  steps: readonly ProgramStepDto[];
  chapters?: readonly ProgramChapterDto[];
}>();

const emit = defineEmits<{
  select: [step: ProgramStepDto];
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);

const stepsRef = computed(() => props.steps);
const chaptersRef = computed(() => props.chapters);

const { nodes, chapterLabels, totalHeight } = useRoadmapLayout(
  stepsRef,
  containerWidth,
  chaptersRef
);

const activeStep = computed<ProgramStepDto | null>(
  () => nodes.value.find((n) => n.status === 'active')?.step ?? null
);

const activeNodeEl = ref<HTMLElement | null>(null);
const activeNodeVisible = ref(true);

// Обновление ссылки на DOM-узел активного шага. Нужно для IntersectionObserver
// и для scrollToActive.
function updateActiveNodeEl() {
  if (!containerRef.value) {
    activeNodeEl.value = null;
    return;
  }
  activeNodeEl.value = containerRef.value.querySelector<HTMLElement>(
    '.roadmap-node--active'
  );
}

watch(
  () => nodes.value,
  async () => {
    await nextTick();
    updateActiveNodeEl();
  },
  { immediate: true, flush: 'post' }
);

useIntersectionObserver(
  activeNodeEl,
  (entries) => {
    const entry = entries[0];
    activeNodeVisible.value = entry ? entry.isIntersecting : true;
  },
  { threshold: 0.5 }
);

/**
 * Скролл к активному узлу. Использует scrollIntoView с `block: 'center'` —
 * браузер сам найдёт ближайший scrollable parent и поставит узел по центру.
 * Не делает ничего, если активного узла в DOM ещё нет.
 */
function scrollToActive(behavior: 'auto' | 'smooth' = 'smooth') {
  if (!activeNodeEl.value) return;
  activeNodeEl.value.scrollIntoView({ behavior, block: 'center' });
}

defineExpose({ activeStep, activeNodeVisible, scrollToActive });

// === Initial mount: scroll + reveal ===
//
// Раньше reveal делал GSAP `gsap.from(opacity: 0)` ПОСЛЕ того, как узлы
// уже отрендерены и видимы → пользователь видел вспышку «карта появилась,
// потом скрылась, потом fades-in». Сейчас узлы изначально opacity: 0 в CSS,
// и только когда родитель получает класс `.roadmap-path--ready`, они
// плавно появляются со stagger через CSS transition.
//
// Auto-scroll к active step: исполняется ВНУТРИ этого же flow, до того как
// reveal начнётся. Пользователь не увидит «прыжок» — узлы все ещё opacity 0
// во время мгновенного scroll-jump'а.
//
// Reduced motion: CSS-правило ниже даёт `transition-duration: 1ms` и
// мгновенную opacity 1, что эквивалентно «no animation».
const prefersReducedMotion = useReducedMotion();
const isReady = ref(false);
const initialMountDone = ref(false);

async function performInitialMount() {
  if (initialMountDone.value) return;
  initialMountDone.value = true;
  await nextTick();
  // Два RAF: первый даёт useElementSize обновить containerWidth, второй —
  // Vue отрендерить узлы с корректными inline-стилями cx/cy.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      // Обновляем activeNodeEl до scroll'а на случай если предыдущий
      // watcher ещё не отработал (race).
      updateActiveNodeEl();
      if (activeNodeEl.value) {
        // behavior: 'auto' = instant, чтобы пользователь не видел сам
        // scroll-процесс (он происходит пока узлы ещё opacity: 0).
        activeNodeEl.value.scrollIntoView({
          behavior: 'auto',
          block: 'center',
        });
      }
      // Толкаем reveal на следующий frame — даём scroll положиться.
      requestAnimationFrame(() => {
        isReady.value = true;
      });
    });
  });
}

watch(
  [() => nodes.value.length, containerWidth],
  ([count, width]) => {
    if (count > 0 && width > 0 && !initialMountDone.value) {
      void performInitialMount();
    }
  },
  { immediate: true }
);

// === Step completion detection ===
const haptics = useRoadmapHaptics();
const prevStatusByStep = ref<Map<number, ProgramStepStatus>>(new Map());

function playStepCompletedBounce(stepNumber: number) {
  if (prefersReducedMotion.value) return;
  if (!containerRef.value) return;
  const node = containerRef.value.querySelector<HTMLElement>(
    `.roadmap-node[data-step="${stepNumber}"] .roadmap-node__circle`
  );
  if (!node) return;
  gsap
    .timeline()
    .to(node, { scale: 1.18, duration: 0.18, ease: 'power2.out' })
    .to(node, { scale: 1, duration: 0.35, ease: 'back.out(2.2)' });
}

watch(
  () => nodes.value,
  (newNodes) => {
    const transitionedToCompleted: number[] = [];
    const isFirstSnapshot = prevStatusByStep.value.size === 0;
    for (const node of newNodes) {
      const prev = prevStatusByStep.value.get(node.step.step);
      if (prev === 'active' && node.status === 'completed') {
        transitionedToCompleted.push(node.step.step);
      }
      prevStatusByStep.value.set(node.step.step, node.status);
    }
    if (isFirstSnapshot || transitionedToCompleted.length === 0) return;

    void haptics.trigger('step-completed');
    void nextTick().then(() => {
      const stepN = transitionedToCompleted.at(-1);
      if (stepN !== undefined) playStepCompletedBounce(stepN);
    });

    const completedChapters = (props.chapters ?? []).filter((c) =>
      c.steps.every((s) =>
        s.step === transitionedToCompleted.at(-1)
          ? true
          : prevStatusByStep.value.get(s.step) === 'completed'
      )
    );
    const justCompletedChapter = completedChapters.find((c) =>
      c.steps.some((s) => transitionedToCompleted.includes(s.step))
    );
    if (justCompletedChapter) {
      window.setTimeout(() => {
        void haptics.trigger('chapter-completed');
      }, 280);
    }
  },
  { flush: 'post' }
);

function chapterIcon(chapter: number) {
  return ['🌱', '🔧', '🧭', '🔬', '🏁'][chapter - 1] || '·';
}

function isChapterCompleted(chapter: ProgramChapterDto): boolean {
  return chapter.steps.every((s) => s.status === 'completed');
}
</script>

<style scoped>
.roadmap-path {
  position: relative;
  width: 100%;
}

/* === Banner-разделитель главы (на всю ширину контейнера) === */

.roadmap-chapter {
  position: absolute;
  left: 0;
  right: 0;
  transform: translateY(-50%);
  z-index: 0;
  pointer-events: none;
  /* Initial state: невидимы. Переключение управляется родительским
     `.roadmap-path--ready`. Без этого пользователь видел бы «вспышку»
     до того как JS успеет применить reveal. */
  opacity: 0;
  transition: opacity 380ms cubic-bezier(0.32, 0.72, 0, 1);
  transition-delay: var(--reveal-delay, 0ms);
}

.roadmap-path--ready .roadmap-chapter {
  opacity: 1;
}

.roadmap-chapter__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  /* Уменьшенный padding (было 14px) — banner стал визуально компактнее
     и плотнее «дышит» с соседними блоками. */
  padding: 10px 16px;
  pointer-events: auto;
}

.roadmap-chapter__icon {
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}

.roadmap-chapter__title {
  font-size: 13px;
  font-weight: 700;
  color: hsl(var(--foreground));
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.roadmap-chapter__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: hsl(var(--roadmap-track-completed));
}

@media (max-width: 340px) {
  .roadmap-chapter__inner {
    padding: 9px 14px;
    gap: 8px;
  }
  .roadmap-chapter__title {
    font-size: 12px;
  }
  .roadmap-chapter__icon {
    font-size: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .roadmap-chapter {
    opacity: 1 !important;
    transition: none !important;
  }
}
</style>
