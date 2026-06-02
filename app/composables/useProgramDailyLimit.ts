import { computed, onScopeDispose, readonly, ref, watch } from 'vue';
import { useAPI } from '@/app/composables/useAPI';
import {
  TodayResponseDto,
  type ProgramDailyLimitDto,
} from '@/shared/dto/retention';

/**
 * Централизованный snapshot текущего daily-лимита программы (2 шага в день).
 *
 * Источник истины — `GET /api/today` поле `programDailyLimit`. Этот composable
 * нужен экранам Карты пути и Главной, чтобы:
 *  - не давать пользователю войти в шаг, который уже за пределами лимита
 *    (иначе backend возвращает 409 E_DAILY_LIMIT, и step runner будет редиректить
 *    на главную с тостом — UX скачок);
 *  - показать единый countdown «следующий шаг через …» в нескольких местах;
 *  - не делать дублирующих fetch'ей `/api/today` при переходе между Главной и
 *    Картой пути — один shared ref на все компоненты в текущем component-scope.
 *
 * При входе пользователя в step runner проверка дублируется на сервере
 * (`startProgramStep` → `countCompletedProgramStepsInLimitWindow`), так что
 * этот composable — UX-слой, а не security-слой.
 */

export type ProgramDailyLimitSnapshot = {
  limit: ProgramDailyLimitDto | null;
  isReached: boolean;
  nextResetAtMs: number | null;
};

const RESET_REFRESH_BUFFER_MS = 750;

export function getProgramDailyLimitResetMs(
  limit: ProgramDailyLimitDto | null | undefined
): number | null {
  const at = limit?.nextResetAt;
  if (!at) return null;
  const ms = new Date(at).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isProgramDailyLimitReachedAt(
  limit: ProgramDailyLimitDto | null | undefined,
  nowMs: number
): boolean {
  if (!limit || limit.stepsDoneToday < limit.dailyStepLimit) return false;
  const resetMs = getProgramDailyLimitResetMs(limit);
  if (resetMs === null) return false;
  // Если локальный момент сброса уже наступил, stale snapshot не должен
  // блокировать вход в следующий шаг до ручного refresh страницы.
  return nowMs < resetMs;
}

export function getProgramDailyLimitRefreshDelayMs(
  limit: ProgramDailyLimitDto | null | undefined,
  nowMs: number,
  bufferMs = RESET_REFRESH_BUFFER_MS
): number | null {
  if (!limit || limit.stepsDoneToday < limit.dailyStepLimit) return null;
  const resetMs = getProgramDailyLimitResetMs(limit);
  if (resetMs === null) return null;
  if (resetMs <= nowMs) return 0;
  return resetMs - nowMs + Math.max(0, bufferMs);
}

export function useProgramDailyLimit() {
  const limit = ref<ProgramDailyLimitDto | null>(null);
  const isLoading = ref(false);
  const loadError = ref<string | null>(null);
  const nowMs = ref(Date.now());
  let loadPromise: Promise<void> | null = null;
  let resetRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  function updateNowMs(): number {
    nowMs.value = Date.now();
    return nowMs.value;
  }

  function clearResetRefreshTimer(): void {
    if (!resetRefreshTimer) return;
    clearTimeout(resetRefreshTimer);
    resetRefreshTimer = null;
  }

  async function load(): Promise<void> {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      isLoading.value = true;
      loadError.value = null;
      try {
        const raw = await useAPI<unknown>('/api/today', {
          method: 'GET',
          suppressErrorToast: true,
        });
        const parsed = TodayResponseDto.parse(raw);
        limit.value = parsed.programDailyLimit ?? null;
      } catch (error) {
        console.error(
          '[useProgramDailyLimit] failed to load /api/today:',
          error
        );
        loadError.value =
          (error as Error)?.message || 'Не удалось загрузить лимит';
      } finally {
        isLoading.value = false;
        loadPromise = null;
      }
    })();
    return loadPromise;
  }

  function setSnapshot(next: ProgramDailyLimitDto | null | undefined): void {
    limit.value = next ?? null;
  }

  function scheduleResetRefresh(): void {
    clearResetRefreshTimer();
    if (typeof window === 'undefined') return;

    const delayMs = getProgramDailyLimitRefreshDelayMs(limit.value, Date.now());
    if (delayMs === null) return;

    resetRefreshTimer = window.setTimeout(() => {
      resetRefreshTimer = null;
      updateNowMs();
      // Один мягкий refresh точечно обновляет daily-limit после сброса.
      void load().catch(() => undefined);
    }, delayMs);
  }

  function isReachedNow(): boolean {
    return isProgramDailyLimitReachedAt(limit.value, updateNowMs());
  }

  async function refreshIfExpired(): Promise<void> {
    const delayMs = getProgramDailyLimitRefreshDelayMs(
      limit.value,
      updateNowMs()
    );
    if (delayMs === 0) {
      await load();
    }
  }

  function handleForegroundCheck(): void {
    const delayMs = getProgramDailyLimitRefreshDelayMs(
      limit.value,
      updateNowMs()
    );
    if (delayMs === 0) {
      void load().catch(() => undefined);
      return;
    }
    scheduleResetRefresh();
  }

  watch(
    [
      () => limit.value?.nextResetAt ?? null,
      () => limit.value?.stepsDoneToday ?? 0,
      () => limit.value?.dailyStepLimit ?? 0,
    ],
    scheduleResetRefresh,
    { immediate: true }
  );

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleForegroundCheck);
  }
  const handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined') {
      if (document.visibilityState === 'visible') {
        handleForegroundCheck();
      }
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  onScopeDispose(() => {
    clearResetRefreshTimer();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleForegroundCheck);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  });

  const isReached = computed(() => {
    return isProgramDailyLimitReachedAt(limit.value, nowMs.value);
  });

  const nextResetAtMs = computed<number | null>(() => {
    return getProgramDailyLimitResetMs(limit.value);
  });

  return {
    limit: readonly(limit),
    isLoading: readonly(isLoading),
    loadError: readonly(loadError),
    isReached,
    nextResetAtMs,
    load,
    isReachedNow,
    refreshIfExpired,
    setSnapshot,
  };
}
