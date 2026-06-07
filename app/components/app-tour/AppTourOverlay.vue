<template>
  <Teleport to="body">
    <!-- Полупрозрачный overlay поверх всего экрана. driver.js рендерит свой
         собственный SVG-spotlight внутри body.driver-active, поэтому здесь мы
         только визуально подкрашиваем общий фон в случае центрированного шага -->
    <div
      v-if="tour.isActive.value && !targetRect"
      class="app-tour-overlay app-tour-overlay--center"
      aria-hidden="true"
    />

    <!-- Bubble попап -->
    <AppTourBubble
      v-if="tour.isActive.value && tour.currentStep.value"
      :step="tour.currentStep.value"
      :visible="bubbleVisible"
      :target-rect="targetRect"
      :is-first-step="tour.isFirstStep.value"
      :is-last-step="tour.isLastStep.value"
      :is-transitioning="tour.isTransitioning.value || tour.isCompleting.value"
      :progress="tour.progress.value"
      :total-steps="tour.totalSteps.value"
      @next="tour.next"
      @prev="tour.prev"
      @skip="tour.complete"
    />

    <!-- Tap-ripple -->
    <AppTourTapRipple
      :at="tour.tapRippleAt.value"
      @done="tour.notifyRippleDone"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from '#app';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAppTour } from '@/app/composables/useAppTour';
import AppTourBubble from './AppTourBubble.vue';
import AppTourTapRipple from './AppTourTapRipple.vue';

const tour = useAppTour();
const route = useRoute();

// Сколько пользователь должен непрерывно пробыть на подходящей странице
// (обычно главной), прежде чем мы запустим тур. Запуск привязан к «дольке
// спокойствия» на странице, а не к таймеру с момента входа: если юзер ушёл
// (например, проходит тест из воронки) — отсчёт сбрасывается и тур не мешает.
const TOUR_START_DWELL_MS = 5000;

let driverInstance: Driver | null = null;
const targetRect = ref<DOMRect | null>(null);
const bubbleVisible = ref(false);
let resizeObserver: ResizeObserver | null = null;
let updateRectAnimationFrame: number | null = null;
let pendingStartTimeout: number | null = null;

// -------------------------------------------------------------------
// Запуск тура: следим за computed-флагом canStart, который учитывает:
// - auth.user + welcome/appTour флаги онбординга
// - appLock.canShowPrivateContent (юзер реально видит приложение)
// - текущий маршрут не публичный (не /auth, /onboarding и т.д.)
//
// Когда canStart переходит в true (юзер вошёл, ввёл пин, попал на приватный
// маршрут) — запускаем тур с небольшой задержкой, давая странице отрендериться.
// Когда canStart переходит в false во время активного тура (юзер свернул
// приложение и AppLock включился) — корректно закрываем тур, чтобы он
// не висел поверх лок-экрана. При следующем разблоке тур запустится снова.
// -------------------------------------------------------------------
// Следим и за canStart, и за текущим маршрутом. Смена маршрута сбрасывает
// отложенный запуск: dwell-таймер отсчитывает непрерывное пребывание на одной
// странице. start() сам не активируется, пока юзер не на странице первого шага
// (главной), поэтому на тесте/оценке тур не стартует и не дёргает навигацию.
watch(
  [() => tour.canStart.value, () => route.path],
  ([canStart]) => {
    // Любая смена условий/маршрута отменяет ранее запланированный старт.
    if (pendingStartTimeout !== null) {
      window.clearTimeout(pendingStartTimeout);
      pendingStartTimeout = null;
    }

    if (canStart && !tour.isActive.value) {
      pendingStartTimeout = window.setTimeout(() => {
        pendingStartTimeout = null;
        // Перепроверяем условия после задержки — за это время юзер мог
        // свернуть приложение, перейти на /auth или уйти со страницы.
        if (tour.canStart.value && !tour.isActive.value) {
          void tour.start();
        }
      }, TOUR_START_DWELL_MS);
    } else if (!canStart && tour.isActive.value) {
      // Условия перестали выполняться (AppLock сработал, юзер ушёл на /auth и т.д.) —
      // закрываем тур без пометки appTour=true. При следующем удачном моменте
      // (юзер ввёл пин, вернулся на главную) — тур запустится снова с первого шага.
      tour.forceClose();
    }
  },
  { immediate: true }
);

// -------------------------------------------------------------------
// Replay-режим: в нём canStart всегда false (appTour уже true),
// поэтому watcher выше не закроет тур при срабатывании AppLock или
// уходе на /auth посреди прохождения. canRemainOpen покрывает этот кейс:
// если auth слетел, AppLock закрыл контент или юзер ушёл на публичный
// маршрут — мягко закрываем тур через forceClose (без бэкенда).
// -------------------------------------------------------------------
watch(
  () => tour.canRemainOpen.value,
  (open) => {
    if (!open && tour.isActive.value) {
      tour.forceClose();
    }
  }
);

// -------------------------------------------------------------------
// Когда тур активируется — настраиваем driver.js + блокировку body
// -------------------------------------------------------------------
watch(
  () => tour.isActive.value,
  (active) => {
    if (active) {
      enableTour();
    } else {
      disableTour();
    }
  }
);

// -------------------------------------------------------------------
// Отслеживаем смену шага: обновляем driver.js highlight + target rect
// -------------------------------------------------------------------
watch(
  () => tour.currentStep.value?.id,
  () => {
    if (!tour.isActive.value) return;
    // Скрываем bubble на время transitioning, чтобы не дёргался
    bubbleVisible.value = false;
    // На след. кадре пересчитываем
    requestAnimationFrame(() => {
      updateHighlight();
    });
  }
);

// -------------------------------------------------------------------
// Включаем тур
// -------------------------------------------------------------------
function enableTour() {
  if (typeof document === 'undefined') return;

  document.body.classList.add('app-tour-active');
  // Блокируем скролл body — это снимает соблазн скроллить мимо подсветки
  document.body.style.overflow = 'hidden';

  driverInstance = driver({
    overlayColor: 'rgba(0, 0, 0, 0.65)',
    overlayOpacity: 0.65,
    stagePadding: 0,
    stageRadius: 12,
    smoothScroll: true,
    allowClose: false,
    disableActiveInteraction: true,
    // Мы используем свой bubble и кнопки. Нативный popover driver.js
    // полностью скрывается через глобальный CSS (.driver-popover { display: none })
    // в стилях ниже — это надёжнее, чем onPopoverRender callback,
    // который успевает мигнуть на 1 кадр.
    showButtons: [],
  });

  updateHighlight();

  // Listeners для resize / scroll, чтобы обновлять targetRect
  window.addEventListener('resize', scheduleRectUpdate);
  window.addEventListener('scroll', scheduleRectUpdate, true);
}

// -------------------------------------------------------------------
// Выключаем тур
// -------------------------------------------------------------------
function disableTour() {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('app-tour-active');
  document.body.style.overflow = '';
  bubbleVisible.value = false;
  targetRect.value = null;

  if (driverInstance) {
    try {
      driverInstance.destroy();
    } catch (e) {
      console.warn('[AppTour] Ошибка destroy driver.js:', e);
    }
    driverInstance = null;
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (updateRectAnimationFrame !== null) {
    cancelAnimationFrame(updateRectAnimationFrame);
    updateRectAnimationFrame = null;
  }

  window.removeEventListener('resize', scheduleRectUpdate);
  window.removeEventListener('scroll', scheduleRectUpdate, true);
}

// -------------------------------------------------------------------
// Обновление подсветки на текущем шаге
// -------------------------------------------------------------------
function updateHighlight() {
  if (!driverInstance) return;
  const step = tour.currentStep.value;
  if (!step) return;

  const sel = step.targetSelector;

  if (!sel) {
    // Центрированный bubble — гасим driver, но overlay остаётся через CSS
    try {
      // driver.js не умеет очищать highlight, кроме destroy + recreate.
      // Поэтому пересоздаём instance с пустым шагом (overlay и так останется).
      driverInstance.destroy();
    } catch {
      // ignore
    }
    driverInstance = driver({
      overlayColor: 'rgba(0, 0, 0, 0.65)',
      overlayOpacity: 0.65,
      stagePadding: 0,
      stageRadius: 12,
      allowClose: false,
      disableActiveInteraction: true,
      showButtons: [],
    });
    targetRect.value = null;
    bubbleVisible.value = true;
    return;
  }

  const el = document.querySelector<HTMLElement>(sel);
  if (!el) {
    // Не нашли target — закрываем тур (graceful)
    console.warn(`[AppTour] Target selector not found: ${sel}`);
    tour.forceClose();
    return;
  }

  // Помечаем все интерактивные элементы внутри target как заблокированные
  lockInteractiveDescendants(el);

  // Обновляем driver.js
  driverInstance.highlight({
    element: el,
    popover: {
      // Передаём пустой popover — driver.js не отрендерит свой
      title: '',
      description: '',
    },
  });

  // Замеряем rect
  refreshRect(el, step.highlightPadding ?? 8);

  // Подключаем ResizeObserver для отслеживания размеров
  if (resizeObserver) resizeObserver.disconnect();
  resizeObserver = new ResizeObserver(() => {
    scheduleRectUpdate();
  });
  resizeObserver.observe(el);

  // Скроллим элемент в viewport, если нужно
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Делаем bubble видимым после короткой задержки (ждём пока driver.js нарисует overlay)
  window.setTimeout(() => {
    bubbleVisible.value = true;
  }, 100);
}

function refreshRect(el: HTMLElement, padding: number) {
  const r = el.getBoundingClientRect();
  // Расширяем rect на padding для корректного позиционирования bubble относительно spotlight
  const expanded = new DOMRect(
    r.left - padding,
    r.top - padding,
    r.width + padding * 2,
    r.height + padding * 2
  );
  targetRect.value = expanded;
}

function scheduleRectUpdate() {
  if (updateRectAnimationFrame !== null) return;
  updateRectAnimationFrame = requestAnimationFrame(() => {
    updateRectAnimationFrame = null;
    const step = tour.currentStep.value;
    if (!step?.targetSelector) return;
    const el = document.querySelector<HTMLElement>(step.targetSelector);
    if (el) refreshRect(el, step.highlightPadding ?? 8);
  });
}

// -------------------------------------------------------------------
// Блокировка интерактивных дочерних элементов у target
// -------------------------------------------------------------------
function lockInteractiveDescendants(root: HTMLElement) {
  // Помечаем все кнопки/ссылки внутри target атрибутом data-tour-lock,
  // чтобы CSS отключил у них pointer-events.
  // Сам target оставляем кликабельным только если он сам — кнопка/ссылка
  // (нам это не нужно, но для будущего гибкости).
  const interactives = root.querySelectorAll<HTMLElement>(
    'a, button, input, textarea, select, [role="button"]'
  );
  interactives.forEach((el) => {
    el.setAttribute('data-tour-lock', '');
  });
  // И сам root тоже блокируем — пользователь не должен кликать на подсвеченный элемент
  root.setAttribute('data-tour-lock', '');
}

onBeforeUnmount(() => {
  if (pendingStartTimeout !== null) {
    window.clearTimeout(pendingStartTimeout);
    pendingStartTimeout = null;
  }
  disableTour();
});

onMounted(() => {
  // На момент mount auth.user уже может быть загружен и AppLock проинициализирован.
  // Проверяем все условия сразу — если выполняются, отложенный старт уже
  // запланирует watcher выше с { immediate: true }. Здесь — страховка.
  if (
    tour.canStart.value &&
    !tour.isActive.value &&
    pendingStartTimeout === null
  ) {
    pendingStartTimeout = window.setTimeout(() => {
      pendingStartTimeout = null;
      if (tour.canStart.value && !tour.isActive.value) {
        void tour.start();
      }
    }, 600);
  }
});
</script>

<style>
/* ========================================================================
 * Глобальные стили для всего тура.
 *
 * ВАЖНО: driver.js при активации добавляет класс `driver-active` к <body>
 * и применяет правило:
 *
 *   .driver-active .driver-overlay, .driver-active * { pointer-events: none }
 *
 * Это делает наш Bubble и Ripple (которые через Teleport уходят в body)
 * НЕНАЖИМАЕМЫМИ. Поэтому ниже мы явно возвращаем pointer-events: auto
 * для всех элементов тура и поднимаем z-index выше driver.js (его popover
 * имеет z-index: 1000000000).
 * ======================================================================== */

/* Блокируем интерактив у подсвеченных элементов */
body.app-tour-active [data-tour-lock] {
  pointer-events: none !important;
}

/* --- ПОЛНОСТЬЮ СКРЫВАЕМ НАТИВНЫЙ POPOVER DRIVER.JS ---
   У нас свой bubble (AppTourBubble), нативный popover driver.js не нужен.
   driver.js всё равно его рендерит при каждом highlight() — даже если мы
   передаём пустые title/description. Без этого правила он мигает белым
   прямоугольником на 1 кадр перед тем как наш onPopoverRender отработает,
   особенно заметно при `prev`. Глобальный CSS-селектор гарантирует, что
   popover не покажется ни в один момент. */
.driver-popover,
body .driver-popover,
body.driver-active .driver-popover {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* --- ПЕРЕОПРЕДЕЛЕНИЕ pointer-events для наших элементов --- */
/* driver.js ставит pointer-events: none на ВСЁ внутри body.driver-active.
   Возвращаем auto для своих элементов и всех их потомков, чтобы кнопки
   "Назад / Далее" в bubble действительно работали.
   Селектор body.driver-active поднимает specificity, чтобы переопределить
   встроенное правило driver.js. */
body.driver-active .app-tour-bubble,
body.driver-active .app-tour-bubble *,
body.driver-active .app-tour-overlay,
.app-tour-bubble,
.app-tour-bubble *,
.app-tour-overlay {
  pointer-events: auto !important;
}

/* Ripple — декоративный, никогда не ловит клики */
.app-tour-ripple,
.app-tour-ripple *,
body.driver-active .app-tour-ripple,
body.driver-active .app-tour-ripple * {
  pointer-events: none !important;
}

/* --- ПОДСВЕТКА АКТИВНОГО ЭЛЕМЕНТА --- */
/* driver.js рисует "stage" вокруг target — добавим к нему мягкое свечение */
body.app-tour-active .driver-active-element {
  border-radius: 12px;
  box-shadow: 0 0 0 4px rgba(155, 120, 255, 0.35);
  transition:
    box-shadow 240ms ease,
    border-radius 240ms ease;
}

/* --- ЦЕНТРИРОВАННЫЙ OVERLAY (для шагов без targetSelector) --- */
/* z-index: 999999999 — выше driver.js overlay (~10001), но ниже bubble.
   Bubble и ripple имеют z-index из миллиардов (см. их .vue-файлы). */
.app-tour-overlay {
  position: fixed;
  inset: 0;
  z-index: 999999999;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(2px);
}

/* На мобиле — отключаем blur (тяжёлый рендеринг) */
@media (max-width: 640px) {
  .app-tour-overlay {
    backdrop-filter: none;
  }
}
</style>
