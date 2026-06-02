import { computed, onBeforeUnmount, ref } from 'vue';

/**
 * Swipe-to-dismiss для bottom sheet'а.
 *
 * Слушает pointer events (универсально: touch на мобильных, mouse на web)
 * на «handle»-элементе (полоска сверху). При drag вниз:
 *  - Возвращает текущее смещение через `dragOffsetY` (>= 0).
 *  - На pointerup: если drag дальше threshold ИЛИ скорость выше velocity-
 *    threshold — вызывает onDismiss + анимирует sheet до off-screen.
 *  - Иначе — snap back к 0.
 *
 * Не использует GSAP — собственный rAF-loop для лёгких easings (cubic).
 * touchAction: none на handle блокирует браузерный pull-to-refresh.
 */

export type UseBottomSheetSwipeOptions = {
  dismissThreshold?: number;
  dismissVelocity?: number;
};

export function useBottomSheetSwipe(
  onDismiss: () => void,
  options: UseBottomSheetSwipeOptions = {}
) {
  const threshold = options.dismissThreshold ?? 80;
  const velocityThreshold = options.dismissVelocity ?? 0.6;

  const dragOffsetY = ref(0);
  const isDragging = ref(false);

  /**
   * Прогресс drag для overlay-opacity: 0 (sheet на месте) → 1 (sheet
   * почти скрыт). Делитель 220 = «sheet считается полу-скрытым».
   */
  const dragProgress = computed(() => Math.min(1, dragOffsetY.value / 220));

  let handleEl: HTMLElement | null = null;
  let startY = 0;
  let lastY = 0;
  let startTime = 0;
  let pointerId: number | null = null;
  let dismissAnimFrame: number | null = null;
  let snapAnimFrame: number | null = null;

  function cancelAnims() {
    if (dismissAnimFrame !== null) {
      cancelAnimationFrame(dismissAnimFrame);
      dismissAnimFrame = null;
    }
    if (snapAnimFrame !== null) {
      cancelAnimationFrame(snapAnimFrame);
      snapAnimFrame = null;
    }
  }

  function onPointerDown(e: PointerEvent) {
    // Только основная кнопка для mouse; touch/pen — всегда OK.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnims();
    pointerId = e.pointerId;
    startY = e.clientY;
    lastY = e.clientY;
    startTime = performance.now();
    isDragging.value = true;
    try {
      handleEl?.setPointerCapture(e.pointerId);
    } catch {
      // Игнорируем — некоторые браузеры могут отказать.
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging.value || e.pointerId !== pointerId) return;
    lastY = e.clientY;
    const deltaY = e.clientY - startY;
    dragOffsetY.value = Math.max(0, deltaY);
  }

  function snapBack() {
    const start = dragOffsetY.value;
    if (start === 0) return;
    const startedAt = performance.now();
    const duration = 280;
    function tick(now: number) {
      const t = Math.min(1, (now - startedAt) / duration);
      // power2.out: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      dragOffsetY.value = start * (1 - eased);
      if (t < 1) {
        snapAnimFrame = requestAnimationFrame(tick);
      } else {
        snapAnimFrame = null;
      }
    }
    snapAnimFrame = requestAnimationFrame(tick);
  }

  function animateDismiss() {
    const start = dragOffsetY.value;
    // Target — высота экрана + запас, чтобы sheet точно ушёл за нижний край.
    const target = Math.max(window.innerHeight, 600);
    const startedAt = performance.now();
    const duration = 220;
    function tick(now: number) {
      const t = Math.min(1, (now - startedAt) / duration);
      // power3.out — быстрое уходящее движение
      const eased = 1 - Math.pow(1 - t, 3);
      dragOffsetY.value = start + (target - start) * eased;
      if (t < 1) {
        dismissAnimFrame = requestAnimationFrame(tick);
      } else {
        dismissAnimFrame = null;
        // ВАЖНО: НЕ сбрасываем dragOffsetY на 0 здесь. Если сбросить,
        // inline transform мгновенно вернёт sheet в исходную позицию
        // (translateY(0)), а потом CSS leave-keyframes снова начнёт
        // тащить его вниз — пользователь видит «прыжок вверх и опять
        // вниз». Оставляем offset = target (sheet за экраном), и наш
        // condition `animation: 'none'` в BottomSheet.vue гасит CSS
        // leave-anim. Сброс происходит при следующем open=true через
        // watcher (см. BottomSheet.vue).
        onDismiss();
      }
    }
    dismissAnimFrame = requestAnimationFrame(tick);
  }

  /** Внешний сброс offset'а к 0. Вызывать перед следующим open=true,
   *  чтобы sheet не появился сразу за экраном. */
  function reset() {
    cancelAnims();
    dragOffsetY.value = 0;
    isDragging.value = false;
    pointerId = null;
  }

  function onPointerEnd(e: PointerEvent) {
    if (!isDragging.value || e.pointerId !== pointerId) return;
    isDragging.value = false;
    try {
      handleEl?.releasePointerCapture(e.pointerId);
    } catch {
      // Может выкинуть если pointer уже отпущен — игнорируем.
    }
    const distance = dragOffsetY.value;
    const elapsed = Math.max(1, performance.now() - startTime);
    const velocity = (lastY - startY) / elapsed;
    pointerId = null;

    if (distance > threshold || velocity > velocityThreshold) {
      animateDismiss();
    } else {
      snapBack();
    }
  }

  /**
   * Регистрирует listeners на handle-element. Pass `null` чтобы отвязать.
   * Через template ref в шаблоне: `:ref="(el) => bindHandle(el as HTMLElement)"`.
   */
  function bindHandle(el: HTMLElement | null) {
    if (handleEl === el) return;
    if (handleEl) {
      handleEl.removeEventListener('pointerdown', onPointerDown);
      handleEl.removeEventListener('pointermove', onPointerMove);
      handleEl.removeEventListener('pointerup', onPointerEnd);
      handleEl.removeEventListener('pointercancel', onPointerEnd);
      handleEl.style.touchAction = '';
    }
    handleEl = el;
    if (el) {
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerEnd);
      el.addEventListener('pointercancel', onPointerEnd);
      // Блокируем pull-to-refresh и нативный scroll-down во время drag.
      el.style.touchAction = 'none';
    }
  }

  onBeforeUnmount(() => {
    cancelAnims();
    bindHandle(null);
  });

  return { dragOffsetY, isDragging, dragProgress, bindHandle, snapBack, reset };
}
