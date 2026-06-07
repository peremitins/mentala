import { computed, ref, readonly } from 'vue';
import { navigateTo, useRoute } from '#app';
import { useAuthStore } from '@/app/stores/auth';
import { useAppLockStore } from '@/app/stores/appLock';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAPI } from '@/app/composables/useAPI';
import { useAppAnalytics } from '@/app/composables/useAppAnalytics';
import {
  APP_TOUR_STEPS,
  type AppTourStep,
  type AppTourSkipContext,
} from '@/app/lib/appTourSteps';

/**
 * Публичные / pre-auth роуты — на них тур никогда не запускаем,
 * даже если по какой-то причине auth.user уже загрузился.
 * Список совпадает с publicRoutes в middleware/auth.global.ts.
 */
const PUBLIC_ROUTE_PREFIXES = [
  '/auth',
  '/error',
  '/forgot',
  '/reset-password',
  '/payment-success',
  '/onboarding', // welcome-онбординг — там свой UI, тур поверх него не нужен
];

function isPublicRoute(path: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

// -------------------------------------------------------------------
// Глобальный singleton-стейт. Composable вызывается из разных мест,
// но стейт должен быть один на всё приложение.
// -------------------------------------------------------------------
const isActive = ref(false);
const currentIndex = ref(0);
/** Блокирует повторный автозапуск, пока ждём роутинг и первый DOM-target. */
const isStarting = ref(false);
/** Блокирует кнопки на время tap-анимации + навигации + ожидания селектора */
const isTransitioning = ref(false);
const isCompleting = ref(false);
/**
 * Режим повторного прохождения тура (запуск из настроек).
 * При true: пропускаем проверку appTour=true в условиях запуска и
 * НЕ дёргаем бэкенд в complete() — флаг appTour уже стоит, незачем
 * нагружать сервер ради того же значения.
 */
const isReplay = ref(false);
/**
 * Координаты центра элемента, по которому нужно сыграть tap-анимацию.
 * Когда ref не null — компонент AppTourTapRipple монтируется и проигрывает анимацию.
 */
const tapRippleAt = ref<{ x: number; y: number } | null>(null);

// Фаза ripple: AppTourTapRipple сообщает о завершении анимации через ref ниже.
// Мы используем небольшой колбэк-механизм: при показе ripple задаём resolver,
// которым ripple-компонент завершает Promise через `notifyRippleDone`.
let rippleResolver: (() => void) | null = null;

// Время ожидания селектора в DOM после navigateTo (в мс)
const SELECTOR_WAIT_TIMEOUT_MS = 5000;
// Интервал между проверками наличия селектора
const SELECTOR_POLL_INTERVAL_MS = 80;

/**
 * Ждём, пока элемент с указанным селектором появится в DOM.
 * Возвращает HTMLElement или null если таймаут.
 */
function waitForSelector(
  selector: string,
  timeoutMs = SELECTOR_WAIT_TIMEOUT_MS
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const found = document.querySelector<HTMLElement>(selector);
    if (found) {
      resolve(found);
      return;
    }

    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el) {
        window.clearInterval(interval);
        resolve(el);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        window.clearInterval(interval);
        resolve(null);
      }
    }, SELECTOR_POLL_INTERVAL_MS);
  });
}

async function waitForTargetSelector(
  selector: string,
  timeoutMs = SELECTOR_WAIT_TIMEOUT_MS
): Promise<boolean> {
  const selectors = selector
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sel of selectors) {
    const el = await waitForSelector(sel, timeoutMs);
    if (el) {
      return true;
    }
  }

  return false;
}

/** Получить координаты центра элемента для tap-анимации. */
function getElementCenter(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** Вызывается ripple-компонентом по завершении CSS-анимации. */
function notifyRippleDone() {
  tapRippleAt.value = null;
  if (rippleResolver) {
    rippleResolver();
    rippleResolver = null;
  }
}

/** Запустить ripple на элементе и дождаться окончания анимации. */
async function playRipple(el: HTMLElement): Promise<void> {
  return new Promise<void>((resolve) => {
    tapRippleAt.value = getElementCenter(el);
    rippleResolver = resolve;
    // Safety net: если по какой-то причине ripple-компонент не вернёт сигнал,
    // принудительно резолвим через 1.2s, чтобы тур не залип.
    window.setTimeout(() => {
      if (rippleResolver) {
        rippleResolver();
        rippleResolver = null;
        tapRippleAt.value = null;
      }
    }, 1200);
  });
}

export function useAppTour() {
  const auth = useAuthStore();
  const appLock = useAppLockStore();
  const { getFeatureAccess } = useEntitlements();
  const route = useRoute();

  /**
   * Reactive-контекст для skipIf-функций каждого шага.
   * Пересчитывается автоматически, когда меняется биллинг/триал.
   * Если триал у юзера закончился и chat.assistant стал недоступен —
   * шаги про чат начнут пропускаться без хардкода.
   */
  const skipContext = computed<AppTourSkipContext>(() => ({
    hasChatAccess: getFeatureAccess('chat.assistant').available,
    hasRealtimeVoiceAccess: getFeatureAccess('chat.realtime_voice').available,
  }));

  /**
   * Должен ли указанный шаг быть пропущен прямо сейчас.
   * Учитывает skipIf-функцию шага.
   */
  function isStepSkipped(step: AppTourStep): boolean {
    if (!step.skipIf) return false;
    try {
      return step.skipIf(skipContext.value);
    } catch (e) {
      console.warn('[AppTour] skipIf threw, treating as not skipped:', e);
      return false;
    }
  }

  /**
   * Найти индекс ближайшего шага, начиная с fromIdx, который НЕ должен скипаться.
   * Возвращает -1, если все шаги до конца тура скипнуты.
   */
  function findNextEligibleIndex(fromIdx: number): number {
    for (let i = fromIdx; i < APP_TOUR_STEPS.length; i++) {
      const step = APP_TOUR_STEPS[i];
      if (step && !isStepSkipped(step)) return i;
    }
    return -1;
  }

  /**
   * Найти индекс ближайшего шага, идущего НАЗАД от fromIdx, который НЕ скипается.
   * Возвращает -1, если все предыдущие шаги скипнуты (т.е. это первый видимый шаг).
   */
  function findPrevEligibleIndex(fromIdx: number): number {
    for (let i = fromIdx; i >= 0; i--) {
      const step = APP_TOUR_STEPS[i];
      if (step && !isStepSkipped(step)) return i;
    }
    return -1;
  }

  const currentStep = computed<AppTourStep | null>(
    () => APP_TOUR_STEPS[currentIndex.value] ?? null
  );

  /**
   * Список шагов, которые видны юзеру в текущем контексте (с учётом skipIf).
   * Используется для прогресс-индикатора и определения "первого/последнего" шага.
   */
  const visibleSteps = computed(() =>
    APP_TOUR_STEPS.filter((step) => !isStepSkipped(step))
  );

  const totalSteps = computed(() => visibleSteps.value.length);

  /**
   * "Первый шаг" с точки зрения юзера = нет ни одного видимого шага раньше.
   * Это важно: если шаги 0..4 скипнуты и мы стартовали с шага 5,
   * для юзера это всё равно "первый шаг" → кнопка "Назад" должна быть скрыта.
   */
  const isFirstStep = computed(
    () => findPrevEligibleIndex(currentIndex.value - 1) === -1
  );

  /** "Последний шаг" = нет ни одного видимого шага после текущего. */
  const isLastStep = computed(
    () => findNextEligibleIndex(currentIndex.value + 1) === -1
  );

  /**
   * Прогресс среди ВИДИМЫХ шагов. Юзер не должен видеть "5 из 15", если
   * для него реально доступно только 11 шагов — это запутывает.
   */
  const progress = computed(() => {
    const visibleIdx = visibleSteps.value.findIndex(
      (s) => s.id === currentStep.value?.id
    );
    return {
      current: visibleIdx >= 0 ? visibleIdx + 1 : 1,
      total: Math.max(1, visibleSteps.value.length),
    };
  });

  /**
   * Проверка: нужно ли запустить тур для этого юзера ПРЯМО СЕЙЧАС.
   *
   * Все условия должны выполняться:
   *   1. Юзер авторизован (auth.user существует).
   *   2. Welcome-онбординг пройден.
   *   3. App Tour ещё не пройден.
   *   4. App Lock не активен (юзер реально видит контент, а не экран ввода пин-кода / отпечатка).
   *   5. Текущий маршрут — приватный (не /auth, не /onboarding, не /error и т.д.).
   *
   * Если хотя бы одно условие не выполняется — тур не запускается.
   * Когда условия начнут выполняться (например, юзер ввёл пин и AppLockGate закрылся),
   * watcher в AppTourOverlay подхватит изменение и запустит тур.
   */
  function shouldStart(): boolean {
    const u = auth.user;
    if (!u) return false;

    const welcomeDone = u.onboarding?.welcome === true;
    const tourDone = u.onboarding?.appTour === true;
    if (!welcomeDone || tourDone) return false;

    // Если App Lock ещё инициализируется или показывает gate (ввод пина / биометрии /
    // privacy overlay при возврате из фона) — тур не показываем.
    // canShowPrivateContent === true только когда юзер реально видит приложение.
    if (!appLock.canShowPrivateContent) return false;

    // На публичных маршрутах тур не запускаем
    if (isPublicRoute(route.path)) return false;

    return true;
  }

  /**
   * Reactive-вариант shouldStart() для использования в watch.
   * Возвращает computed, который пересчитывается при изменении любого
   * из его зависимых стейтов (user, appLock, route.path).
   */
  const canStart = computed(() => shouldStart());

  /**
   * Менее строгий computed: должен ли тур оставаться открытым ПРЯМО СЕЙЧАС.
   * Нужен для replay: в этом режиме appTour=true и canStart всегда false,
   * поэтому watcher на canStart не закроет тур, если посреди прохождения
   * сработает AppLock или юзер уйдёт на /auth. canRemainOpen проверяет всё
   * то же самое, кроме флага appTour.
   */
  const canRemainOpen = computed(() => {
    if (!auth.user) return false;
    if (!appLock.canShowPrivateContent) return false;
    if (isPublicRoute(route.path)) return false;
    return true;
  });

  /** Запуск тура. */
  async function start() {
    if (isActive.value) return;
    if (isStarting.value) return;
    if (!shouldStart()) return;

    isStarting.value = true;
    try {
      // Найти первый НЕ скипнутый шаг. Если все шаги скипнуты (например, у юзера
      // нет ни одного доступного фичлета) — сразу помечаем тур пройденным.
      const firstIdx = findNextEligibleIndex(0);
      if (firstIdx === -1) {
        void complete();
        return;
      }

      const firstStep = APP_TOUR_STEPS[firstIdx];
      if (!firstStep) return;

      // Тур НИКОГДА не уводит пользователя со страницы сам. Если первый шаг
      // привязан к другой странице (например, юзер пришёл из воронки лендинга
      // прямо на тест/оценку) — откладываем запуск. Тур стартует, когда
      // пользователь сам окажется на нужной странице (обычно главной). Это
      // убирает конфликт с post-auth редиректом, когда AppTour перебивал
      // переход на тест навигацией на главную. Принудительный переход остаётся
      // только в startReplay() — там запуск инициировал сам пользователь.
      if (firstStep.page !== route.path) {
        return;
      }

      // Главная сначала ждёт /api/today и только потом рендерит карточки
      // daily loop. Не активируем overlay, пока первый target реально не
      // появился, иначе driver.js мгновенно закроет тур как сломанный.
      if (
        firstStep.targetSelector &&
        !(await waitForTargetSelector(firstStep.targetSelector, 6000))
      ) {
        console.warn(
          `[AppTour] start: target ${firstStep.targetSelector} не появился, отмена`
        );
        return;
      }

      // Перепроверяем условия после ожидания DOM: за это время пользователь мог
      // свернуть приложение, уйти на публичный route или потерять сессию.
      if (!shouldStart()) return;

      currentIndex.value = firstIdx;
      isActive.value = true;
    } catch (e) {
      console.warn('[AppTour] start failed:', e);
    } finally {
      isStarting.value = false;
    }
  }

  /**
   * Запустить тур ПОВТОРНО из настроек, минуя проверку appTour=true.
   * Бэкенд не дёргаем ни на старте, ни на завершении — флаг и так стоит.
   * Остальные проверки (auth, appLock, публичный роут) сохраняем,
   * чтобы не показывать тур поверх лок-экрана или страницы /auth.
   */
  async function startReplay() {
    if (isActive.value) return;
    if (!auth.user) return;
    if (!appLock.canShowPrivateContent) return;
    if (isPublicRoute(route.path)) return;

    const firstIdx = findNextEligibleIndex(0);
    if (firstIdx === -1) return;

    const firstStep = APP_TOUR_STEPS[firstIdx];
    if (!firstStep) return;

    // Если первый шаг привязан к другой странице — навигируем туда.
    if (firstStep.page !== route.path) {
      try {
        await navigateTo(firstStep.page);
      } catch (e) {
        console.warn('[AppTour] startReplay: navigateTo failed:', e);
        return;
      }
    }

    // КРИТИЧНО: после navigateTo (или даже на той же странице) DOM может
    // быть ещё не готов — компоненты со <ClientOnly>/async setup рендерятся
    // в следующих тиках. Если включить isActive сразу, watcher в Overlay
    // вызовет updateHighlight → querySelector вернёт null → forceClose,
    // и юзер увидит просто редирект без тура. Поэтому ждём появления
    // target-селектора (или его fallback'ов).
    if (
      firstStep.targetSelector &&
      !(await waitForTargetSelector(firstStep.targetSelector, 3000))
    ) {
      console.warn(
        `[AppTour] startReplay: target ${firstStep.targetSelector} не появился, отмена`
      );
      return;
    }

    // Перепроверяем условия после ожидания — пока ждали DOM, юзер мог
    // свернуть приложение / уйти на /auth.
    if (
      !auth.user ||
      !appLock.canShowPrivateContent ||
      isPublicRoute(route.path)
    ) {
      return;
    }

    isReplay.value = true;
    currentIndex.value = firstIdx;
    isActive.value = true;
  }

  /** Закрыть тур БЕЗ пометки appTour=true (например, при ошибке). */
  function forceClose() {
    isActive.value = false;
    isTransitioning.value = false;
    isCompleting.value = false;
    isReplay.value = false;
    tapRippleAt.value = null;
    rippleResolver = null;
    if (typeof document !== 'undefined') {
      document.body.classList.remove('app-tour-active');
      document.body.style.overflow = '';
    }
  }

  /** Завершить тур и пометить appTour=true. */
  async function complete() {
    if (isCompleting.value) return;
    isCompleting.value = true;
    try {
      // В replay-режиме бэкенд не трогаем: appTour уже true, лишний запрос
      // бесполезен и потенциально опасен (а вдруг 5xx — нам всё равно нужно
      // просто закрыть оверлей).
      if (isReplay.value) {
        return;
      }

      await useAPI<{ ok: boolean }>('/api/user/onboarding/app-tour/complete', {
        method: 'POST',
        body: {},
        suppressErrorToast: true,
      } as any);

      const { reachGoal } = useAppAnalytics();
      reachGoal('app_tour_completed');

      // Локально обновляем стор: чтобы при перезагрузке страницы тур не запустился.
      if (auth.user?.onboarding) {
        auth.user.onboarding.appTour = true;
      } else if (auth.user) {
        auth.user.onboarding = { welcome: true, appTour: true };
      }
    } catch (e) {
      console.error('[AppTour] Ошибка при завершении тура:', e);
      // Всё равно закрываем — но appTour останется false → следующий вход
      // запустит тур повторно (в зависимости от того, что пришло с сервера).
    } finally {
      forceClose();
      isCompleting.value = false;
    }
  }

  /**
   * Шаг назад. Tap-анимации и обратная навигация не воспроизводятся —
   * это полезно для дебага и UX, чтобы не «откатывать» юзера через клики.
   * Учитывает skipIf — пропускает скрытые шаги назад.
   */
  async function prev() {
    if (isTransitioning.value) return;
    if (currentIndex.value === 0) return;

    const targetIdx = findPrevEligibleIndex(currentIndex.value - 1);
    if (targetIdx === -1) return;

    const targetStep = APP_TOUR_STEPS[targetIdx];
    if (!targetStep) return;

    try {
      isTransitioning.value = true;
      // Если шаг на другой странице — навигируем
      if (targetStep.page !== route.path) {
        await navigateTo(targetStep.page);
        const sel = targetStep.targetSelector;
        if (sel) {
          await waitForSelector(sel, 3000);
        }
      }
      currentIndex.value = targetIdx;
    } catch (e) {
      console.error('[AppTour] prev failed:', e);
      // Не закрываем тур — назад не критично, просто остаёмся на текущем шаге
    } finally {
      isTransitioning.value = false;
    }
  }

  /**
   * Шаг вперёд. Robust-логика:
   *   1. Tap-анимация на текущем шаге (если tapBeforeNext) — но только если
   *      следующий шаг ведёт на другую страницу (тапаем чтобы показать переход).
   *   2. Поиск ближайшего НЕ скипнутого следующего шага (учитывает skipIf).
   *   3. Если такой шаг ведёт на другую страницу — navigateTo.
   *   4. Если у шага есть targetSelector — ждём его появления (3s).
   *   5. Если selector не появился — ПРОПУСКАЕМ этот шаг и пробуем следующий.
   *   6. Защита от тупика: max 5 неудачных попыток подряд → завершаем тур
   *      через complete() (с пометкой appTour=true), чтобы юзер не застревал.
   */
  async function next() {
    if (isTransitioning.value || isCompleting.value) return;

    const fromIdx = currentIndex.value;
    const currentStep = APP_TOUR_STEPS[fromIdx];

    if (!currentStep) {
      await complete();
      return;
    }

    isTransitioning.value = true;

    try {
      // ---- Tap-анимация ----
      // Играем ripple, только если есть tapBeforeNext + target И следующий
      // НЕ скипнутый шаг ведёт на другую страницу. Иначе анимация бессмысленна
      // (мы тапаем, чтобы показать "переходим в чат", а если в чат не идём — не тапаем).
      const peekNextIdx = findNextEligibleIndex(fromIdx + 1);
      const willChangePage =
        peekNextIdx !== -1 && APP_TOUR_STEPS[peekNextIdx]!.page !== route.path;

      if (
        currentStep.tapBeforeNext &&
        currentStep.targetSelector &&
        willChangePage
      ) {
        const el = document.querySelector<HTMLElement>(
          currentStep.targetSelector
        );
        if (el) {
          await playRipple(el);
        }
      }

      // ---- Поиск и переход на следующий валидный шаг ----
      const advanced = await advanceToNext(fromIdx);

      if (!advanced) {
        // Все оставшиеся шаги либо скипнуты, либо не получилось их показать.
        // Завершаем тур с пометкой appTour=true, чтобы юзер не застревал
        // в туре повторно при каждом входе в приложение.
        await complete();
      }
    } catch (e) {
      console.error('[AppTour] next failed:', e);
      // На любую неожиданную ошибку — мягко завершаем тур (с пометкой),
      // чтобы избежать тупиков. Это безопаснее, чем forceClose().
      await complete();
    } finally {
      isTransitioning.value = false;
    }
  }

  /**
   * Пытается найти и показать следующий доступный шаг.
   * Возвращает true, если успешно перешли на новый шаг.
   * Возвращает false, если ни один шаг не подошёл (тур должен завершиться).
   */
  async function advanceToNext(fromIdx: number): Promise<boolean> {
    const MAX_FAILED_ATTEMPTS = 5;
    let candidateIdx = findNextEligibleIndex(fromIdx + 1);
    let failedAttempts = 0;

    while (candidateIdx !== -1) {
      const candidate = APP_TOUR_STEPS[candidateIdx];
      if (!candidate) {
        candidateIdx = findNextEligibleIndex(candidateIdx + 1);
        continue;
      }

      // Навигация на нужную страницу
      if (candidate.page && candidate.page !== route.path) {
        try {
          await navigateTo(candidate.page);
        } catch (e) {
          console.warn(
            `[AppTour] navigateTo(${candidate.page}) failed, trying next step:`,
            e
          );
          failedAttempts++;
          if (failedAttempts >= MAX_FAILED_ATTEMPTS) return false;
          candidateIdx = findNextEligibleIndex(candidateIdx + 1);
          continue;
        }
      }

      // Если задан target — ждём его появления в DOM
      if (candidate.targetSelector) {
        // Поддержка fallback-селекторов через запятую (на случай, если основной
        // элемент не появится — попробуем body как минимум для центрирования)
        const selectors = candidate.targetSelector
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        let found = false;
        for (const sel of selectors) {
          const el = await waitForSelector(sel, 3000);
          if (el) {
            found = true;
            break;
          }
        }
        if (!found) {
          // Элемент не появился — пропускаем этот шаг и пробуем следующий
          console.warn(
            `[AppTour] Target ${candidate.targetSelector} not found, skipping step "${candidate.id}"`
          );
          failedAttempts++;
          if (failedAttempts >= MAX_FAILED_ATTEMPTS) return false;
          candidateIdx = findNextEligibleIndex(candidateIdx + 1);
          continue;
        }
      }

      // Успех — переключаемся на этот шаг
      currentIndex.value = candidateIdx;
      return true;
    }

    return false;
  }

  return {
    // state
    isActive: readonly(isActive),
    currentIndex: readonly(currentIndex),
    currentStep,
    isFirstStep,
    isLastStep,
    isTransitioning: readonly(isTransitioning),
    isCompleting: readonly(isCompleting),
    progress,
    tapRippleAt: readonly(tapRippleAt),
    totalSteps,

    // reactive-флаг готовности к старту (учитывает auth, appLock, route)
    canStart,
    canRemainOpen,
    isReplay: readonly(isReplay),

    // actions
    start,
    startReplay,
    next,
    prev,
    complete,
    forceClose,
    shouldStart,
    notifyRippleDone,
  };
}
