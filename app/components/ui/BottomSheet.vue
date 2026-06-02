<template>
  <DialogRoot v-model:open="openModel">
    <DialogPortal>
      <DialogOverlay
        class="bottom-sheet-overlay"
        :style="{ opacity: 1 - dragProgress }"
      />
      <DialogContent
        class="bottom-sheet-content glass-deep"
        :style="contentStyle"
        @open-auto-focus="(e) => e.preventDefault()"
      >
        <div
          :ref="(el) => bindHandle(el as HTMLElement | null)"
          class="bottom-sheet-handle"
          role="presentation"
        >
          <span class="bottom-sheet-handle__pill" />
        </div>
        <!-- Scrollable wrapper — гарантирует что на маленьких экранах
             длинный контент не «обрезается» сверху (заголовок остаётся
             видимым, прокрутка внутри sheet'а). Handle остаётся sticky
             сверху и не двигается при scroll. -->
        <div class="bottom-sheet-scroll">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import {
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
} from 'radix-vue';
import { useBottomSheetSwipe } from '@/app/composables/useBottomSheetSwipe';

/**
 * Универсальный bottom sheet с плавной CSS-keyframes-анимацией
 * (iOS-style spring easing) + swipe-to-dismiss на handle-полоске.
 *
 * Использует radix-vue Dialog* для portal'а, focus-trap'а и a11y
 * (роль, esc-handling, click-outside). Анимации — собственные keyframes
 * через `data-state` атрибут от radix.
 *
 * Snippet usage:
 *   <BottomSheet v-model:open="isOpen">
 *     <div class="px-5 py-4">
 *       <DialogTitle>...</DialogTitle>
 *       ...
 *     </div>
 *   </BottomSheet>
 */

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const openModel = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
});

const { dragOffsetY, isDragging, dragProgress, bindHandle, reset } =
  useBottomSheetSwipe(() => {
    openModel.value = false;
  });

// При каждом открытии sheet'а сбрасываем drag-offset. После dismiss он
// остаётся равным viewport-height (sheet за пределами экрана через inline
// transform) — это нужно для того чтобы избежать «двойного движения»
// при swipe-down. Перед следующим показом возвращаем offset к 0 — sheet
// появится снизу через CSS keyframes bs-slide-in нормально.
watch(
  () => props.open,
  (newOpen, oldOpen) => {
    if (newOpen && !oldOpen) {
      reset();
    }
  }
);

/**
 * Стиль контента: во время drag — inline translateY без CSS transition И
 * без CSS animation (иначе keyframes-animation остаётся в final state и
 * перекрывает inline transform). После release composable анимирует
 * возврат к 0 через rAF.
 */
const contentStyle = computed(() => ({
  transform: dragOffsetY.value > 0 ? `translateY(${dragOffsetY.value}px)` : '',
  transition: isDragging.value || dragOffsetY.value > 0 ? 'none' : '',
  // Снимаем animation когда есть drag или активный snap-back — даёт inline
  // transform приоритет. После полного возврата к 0 animation property
  // снова '' (default), но keyframes уже отыграли, поэтому ничего не дёргается.
  animation: dragOffsetY.value > 0 ? 'none' : '',
}));
</script>

<style scoped>
/* === Overlay === */
.bottom-sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: hsl(0 0% 0% / 0.45);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  animation: bs-overlay-in 200ms cubic-bezier(0.32, 0.72, 0, 1) both;
}

.bottom-sheet-overlay[data-state='closed'] {
  animation: bs-overlay-out 180ms cubic-bezier(0.7, 0, 0.84, 0) both;
}

@keyframes bs-overlay-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes bs-overlay-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* === Sheet content ===
   Внешний вид (фон, border, blur, shine) полностью управляется классом
   `glass-deep` из main.scss — здесь только позиционирование, размеры и
   анимации входа/выхода. */
.bottom-sheet-content {
  position: fixed;
  z-index: 50;
  /* Inset 8px со всех сторон — тот же воздух, что и сбоку. */
  left: 8px;
  right: 8px;
  bottom: max(8px, env(safe-area-inset-bottom, 0px));
  max-width: 768px;
  margin-left: auto;
  margin-right: auto;
  outline: none;
  overflow: hidden;
  padding-bottom: 8px;
  /* Ограничение по высоте — на маленьких экранах sheet не должен вылезать
     за пределы viewport и обрезать заголовок сверху. Учитываем safe-area
     с обеих сторон. `dvh` динамически учитывает скрытие/появление address
     bar в мобильных браузерах. */
  max-height: calc(
    100vh - env(safe-area-inset-top, 0px) -
      max(8px, env(safe-area-inset-bottom, 0px)) - 16px
  );
  max-height: calc(
    100dvh - env(safe-area-inset-top, 0px) -
      max(8px, env(safe-area-inset-bottom, 0px)) - 16px
  );
  /* Flex column — handle сверху статичен, scroll-wrapper внутри занимает
     остаток высоты. */
  display: flex;
  flex-direction: column;
  /* 280ms — быстрая, но всё ещё плавная реакция (раньше было 480ms — пользователь
     ощущал задержку). iOS-spring easing сохраняем — это и даёт «pleasing» feel. */
  animation: bs-slide-in 280ms cubic-bezier(0.32, 0.72, 0, 1) both;
  /* will-change для smooth GPU-композиции при drag/анимациях. */
  will-change: transform, opacity;
}

/* Scrollable wrapper. min-height: 0 критично для flex+overflow — без него
   flex-item не «сжимается» под max-height родителя. overscroll-behavior
   изолирует scroll внутри sheet'а (не прокручивает страницу за ним). */
.bottom-sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.bottom-sheet-content[data-state='closed'] {
  animation: bs-slide-out 220ms cubic-bezier(0.7, 0, 0.84, 0) both;
}

@keyframes bs-slide-in {
  from {
    transform: translateY(110%);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes bs-slide-out {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(110%);
  }
}

/* === Drag handle === */
.bottom-sheet-handle {
  display: flex;
  justify-content: center;
  align-items: center;
  /* Большая зона касания (44px) для удобного swipe на мобильном. */
  padding: 14px 0 8px;
  cursor: grab;
}

.bottom-sheet-handle:active {
  cursor: grabbing;
}

.bottom-sheet-handle__pill {
  width: 44px;
  height: 5px;
  border-radius: 999px;
  background: hsl(0 0% 100% / 0.28);
  transition: background 200ms ease;
}

.bottom-sheet-handle:hover .bottom-sheet-handle__pill {
  background: hsl(0 0% 100% / 0.42);
}

@media (prefers-reduced-motion: reduce) {
  .bottom-sheet-overlay,
  .bottom-sheet-content {
    animation-duration: 1ms !important;
  }
}
</style>
