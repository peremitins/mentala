import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useAPI } from '@/app/composables/useAPI';

/**
 * Опрос «есть ли непросмотренный готовый отчёт» для in-app модалки.
 *
 * Стратегия:
 *   - При mount: первый poll сразу + сценарии повторного триггера.
 *   - visibilitychange → визит снова стал visible → poll (юзер вернулся
 *     с другой вкладки, отчёт мог сгенерироваться).
 *   - Capacitor App.appStateChange (isActive=true) → poll (приложение
 *     открыли из background).
 *   - Дополнительный «спокойный» интервал ~5 минут на случай, если ни
 *     visibility, ни appState не сработали (длинная сессия в одной вкладке).
 *
 * Push (через FCM) — отдельный канал доставки, когда приложение неактивно.
 * Эта модалка предназначена для активного приложения.
 *
 * dismiss() — локальное скрытие до следующего успешного poll (с другим report).
 */

export type PendingReport = {
  id: number;
  userProgramId: number;
  programSlug: string;
  programTitle: string;
  checkpointStep: 7 | 14 | 21 | 30;
  kind: 'weekly' | 'final';
  generatedAt: string;
};

type PendingResponse = { report: PendingReport | null };

const SLOW_POLL_INTERVAL_MS = 5 * 60 * 1000;

export function usePendingReportNotification(options: {
  enabled: () => boolean;
}) {
  const pending = ref<PendingReport | null>(null);
  const dismissedIds = ref<Set<number>>(new Set());
  let slowPollTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityListener: (() => void) | null = null;
  let appStateRemove: (() => Promise<void>) | null = null;
  let inFlight = false;

  async function pollOnce() {
    if (!options.enabled()) return;
    if (inFlight) return;
    inFlight = true;
    try {
      const res = await useAPI<PendingResponse>(
        '/api/garden/reports/pending',
        { method: 'GET', suppressErrorToast: true }
      );
      const report = res.report;
      if (!report) {
        pending.value = null;
        return;
      }
      // Если юзер локально dismissed этот id — не показываем снова.
      if (dismissedIds.value.has(report.id)) {
        pending.value = null;
        return;
      }
      pending.value = report;
    } catch (error) {
      // Тихая ошибка: модалка опциональна, не ломаем UX.
      console.warn('[pendingReport] poll failed:', error);
    } finally {
      inFlight = false;
    }
  }

  function dismiss() {
    if (pending.value) {
      dismissedIds.value.add(pending.value.id);
    }
    pending.value = null;
  }

  // Принудительно очистить — после mark-viewed, чтобы модалка не вернулась
  // на следующем poll'е.
  function clear(reportId: number) {
    dismissedIds.value.add(reportId);
    pending.value = null;
  }

  onMounted(() => {
    void pollOnce();

    if (typeof document !== 'undefined') {
      const handler = () => {
        if (document.visibilityState === 'visible') {
          void pollOnce();
        }
      };
      document.addEventListener('visibilitychange', handler);
      visibilityListener = () =>
        document.removeEventListener('visibilitychange', handler);
    }

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener(
          'appStateChange',
          ({ isActive }) => {
            if (isActive) void pollOnce();
          }
        );
        appStateRemove = () => listener.remove();
      } catch {
        // Web — ничего не делаем, visibilitychange покрывает.
      }
    })();

    slowPollTimer = setInterval(() => {
      void pollOnce();
    }, SLOW_POLL_INTERVAL_MS);
  });

  onBeforeUnmount(() => {
    if (slowPollTimer) {
      clearInterval(slowPollTimer);
      slowPollTimer = null;
    }
    visibilityListener?.();
    visibilityListener = null;
    if (appStateRemove) {
      void appStateRemove();
      appStateRemove = null;
    }
  });

  return {
    pending,
    dismiss,
    clear,
    refresh: pollOnce,
  };
}
