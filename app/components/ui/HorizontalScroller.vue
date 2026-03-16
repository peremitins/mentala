<template>
  <div class="relative mb-4">
    <div
      v-if="showDesktopControls && canScrollLeft"
      class="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-black/40 via-black/12 to-transparent transition-opacity duration-300"
    />
    <div
      v-if="showDesktopControls && canScrollRight"
      class="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-black/40 via-black/12 to-transparent transition-opacity duration-300"
    />

    <Button
      v-if="showDesktopControls && canScrollLeft"
      variant="ghost"
      size="icon-sm"
      class="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md hover:border-white/25 hover:bg-black/65"
      aria-label="Прокрутить влево"
      @click="scrollByStep(-1)"
    >
      <IconChevronLeft class="h-4 w-4" />
    </Button>

    <Button
      v-if="showDesktopControls && canScrollRight"
      variant="ghost"
      size="icon-sm"
      class="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/15 bg-black/45 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-md hover:border-white/25 hover:bg-black/65"
      aria-label="Прокрутить вправо"
      @click="scrollByStep(1)"
    >
      <IconChevronRight class="h-4 w-4" />
    </Button>

    <div
      ref="viewportRef"
      :aria-label="ariaLabel"
      class="overflow-x-auto no-scrollbar"
      :class="viewportClasses"
      data-lenis-prevent
      style="touch-action: pan-y pan-x"
      @click.capture="handleClickCapture"
      @dragstart.prevent
      @pointerdown="handlePointerDown"
    >
      <div ref="contentRef" :class="contentClasses">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  useEventListener,
  useMediaQuery,
  useResizeObserver,
} from '@vueuse/core';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';
import { Button } from '@/app/components/ui/button';
import { cn } from '@/app/lib/utils';
import { isDocumentAvailable } from '@/app/utils/document';

const DRAG_THRESHOLD_PX = 6;
const SCROLL_EDGE_EPSILON_PX = 4;

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
};

const props = withDefaults(
  defineProps<{
    ariaLabel?: string;
    viewportClass?: string;
    contentClass?: string;
    arrowStepRatio?: number;
  }>(),
  {
    ariaLabel: 'Горизонтальный список',
    viewportClass: '',
    contentClass: 'flex gap-4 pl-4 pr-6',
    arrowStepRatio: 0.86,
  }
);

const viewportRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
const isOverflowing = ref(false);
const isDragging = ref(false);
const shouldSuppressClick = ref(false);
const dragState = ref<DragState | null>(null);

const hasFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
const browserWindow = typeof window !== 'undefined' ? window : undefined;
let initialSyncTimer: ReturnType<typeof setTimeout> | null = null;

const showDesktopControls = computed(
  () => hasFinePointer.value && isOverflowing.value
);

const viewportClasses = computed(() =>
  cn(
    showDesktopControls.value && !isDragging.value && 'cursor-grab',
    showDesktopControls.value &&
      isDragging.value &&
      'cursor-grabbing select-none',
    props.viewportClass
  )
);

const contentClasses = computed(() =>
  cn('flex gap-4 pl-4 pr-6', props.contentClass)
);

function syncScrollState() {
  const viewport = viewportRef.value;
  if (!viewport) return;

  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth
  );
  isOverflowing.value = maxScrollLeft > SCROLL_EDGE_EPSILON_PX;
  canScrollLeft.value = viewport.scrollLeft > SCROLL_EDGE_EPSILON_PX;
  canScrollRight.value =
    viewport.scrollLeft < maxScrollLeft - SCROLL_EDGE_EPSILON_PX;
}

function getScrollStep() {
  const viewport = viewportRef.value;
  if (!viewport) return 280;
  return Math.max(240, Math.round(viewport.clientWidth * props.arrowStepRatio));
}

function scrollByStep(direction: -1 | 1) {
  const viewport = viewportRef.value;
  if (!viewport) return;

  viewport.scrollBy({
    left: getScrollStep() * direction,
    behavior: prefersReducedMotion.value ? 'auto' : 'smooth',
  });
}

function handleWheel(event: WheelEvent) {
  const viewport = viewportRef.value;
  if (!viewport || !showDesktopControls.value) return;

  const maxScrollLeft = Math.max(
    0,
    viewport.scrollWidth - viewport.clientWidth
  );
  if (maxScrollLeft <= 0) return;

  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

  if (Math.abs(delta) < 0.5) return;

  const nextScrollLeft = Math.min(
    maxScrollLeft,
    Math.max(0, viewport.scrollLeft + delta)
  );

  if (Math.abs(nextScrollLeft - viewport.scrollLeft) < 0.5) return;

  // На desktop превращаем wheel в горизонтальную прокрутку, если список реально двигается.
  viewport.scrollLeft = nextScrollLeft;
  event.preventDefault();
  syncScrollState();
}

function handlePointerDown(event: PointerEvent) {
  const viewport = viewportRef.value;
  const target = event.target;
  if (
    !viewport ||
    !showDesktopControls.value ||
    event.button !== 0 ||
    !(target instanceof HTMLElement)
  ) {
    return;
  }

  if (target.closest('[data-no-drag-scroll], input, textarea, select, label')) {
    return;
  }

  dragState.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startScrollLeft: viewport.scrollLeft,
  };

  shouldSuppressClick.value = false;
  isDragging.value = false;

  if (typeof viewport.setPointerCapture === 'function') {
    viewport.setPointerCapture(event.pointerId);
  }
}

function handlePointerMove(event: PointerEvent) {
  const viewport = viewportRef.value;
  const currentDrag = dragState.value;
  if (!viewport || !currentDrag || currentDrag.pointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - currentDrag.startX;
  if (!isDragging.value && Math.abs(deltaX) < DRAG_THRESHOLD_PX) {
    return;
  }

  // После порога считаем жест осознанным drag и подавляем обычный click по карточке.
  isDragging.value = true;
  shouldSuppressClick.value = true;
  viewport.scrollLeft = currentDrag.startScrollLeft - deltaX;
  syncScrollState();
  event.preventDefault();
}

function finishDrag(pointerId?: number) {
  const viewport = viewportRef.value;
  const currentDrag = dragState.value;
  if (!currentDrag) return;

  if (pointerId !== undefined && currentDrag.pointerId !== pointerId) {
    return;
  }

  if (
    viewport &&
    typeof viewport.releasePointerCapture === 'function' &&
    viewport.hasPointerCapture(currentDrag.pointerId)
  ) {
    viewport.releasePointerCapture(currentDrag.pointerId);
  }

  dragState.value = null;

  browserWindow?.setTimeout(() => {
    isDragging.value = false;
  }, 0);
}

function handleClickCapture(event: MouseEvent) {
  if (!shouldSuppressClick.value) return;
  shouldSuppressClick.value = false;
  event.preventDefault();
  event.stopPropagation();
}

function handlePointerUp(event: Event) {
  finishDrag((event as PointerEvent).pointerId);
}

useEventListener(viewportRef, 'scroll', syncScrollState, { passive: true });
useEventListener(viewportRef, 'wheel', handleWheel, { passive: false });
useEventListener(browserWindow, 'pointermove', handlePointerMove, {
  passive: false,
});
useEventListener(browserWindow, 'pointerup', handlePointerUp, {
  passive: true,
});
useEventListener(browserWindow, 'pointercancel', handlePointerUp, {
  passive: true,
});
useEventListener(browserWindow, 'blur', () => finishDrag(), { passive: true });
useEventListener(browserWindow, 'resize', syncScrollState, { passive: true });

useResizeObserver(viewportRef, () => {
  syncScrollState();
});

useResizeObserver(contentRef, () => {
  syncScrollState();
});

onMounted(async () => {
  if (!isDocumentAvailable() || typeof window === 'undefined') return;

  await nextTick();
  syncScrollState();

  // После входной анимации и загрузки карточек повторно синхронизируем стрелки.
  initialSyncTimer = setTimeout(() => {
    syncScrollState();
    initialSyncTimer = null;
  }, 120);
});

onBeforeUnmount(() => {
  if (initialSyncTimer) {
    clearTimeout(initialSyncTimer);
    initialSyncTimer = null;
  }
  finishDrag();
});
</script>
