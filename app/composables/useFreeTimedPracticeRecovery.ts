import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useFreePracticeEnergy } from '@/app/composables/useFreePracticeEnergy';
import {
  buildFreeTimedPracticeRecoveryId,
  completeTimedPracticeRecoveryRecord,
  createTimedPracticeRecoveryRecord,
  getTimedPracticeElapsedMs,
  getTimedPracticeRecoveryRecord,
  getTimedPracticeRecoveryRecords,
  hasTimedPracticeReachedRequiredTime,
  pauseTimedPracticeRecoveryRecord,
  removeTimedPracticeRecoveryRecord,
  startTimedPracticeRecoveryRecord,
  upsertTimedPracticeRecoveryRecord,
  type TimedPracticeRecoveryRecord,
} from '@/app/utils/timedPracticeRecovery';
import type { FreePracticeSource } from '@/shared/dto/retention';

export type FreeTimedPracticeRecoveryStart = {
  type: string;
  source: FreePracticeSource;
  sourceId: string;
  requiredSeconds: number;
};

type FreeTimedPracticeRecoveryOptions = {
  /**
   * При обычном route-unmount практика явно останавливается и запись удаляется.
   * При реальном pagehide/beforeunload запись сохраняется, чтобы пережить reload/WebView kill.
   */
  persistOnUnmount?: boolean;
};

const DEFAULT_OPTIONS: Required<FreeTimedPracticeRecoveryOptions> = {
  persistOnUnmount: true,
};

export function useFreeTimedPracticeRecovery(
  options?: FreeTimedPracticeRecoveryOptions
) {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const activeRecord = ref<TimedPracticeRecoveryRecord | null>(null);
  const { award } = useFreePracticeEnergy();

  let pageIsUnloading = false;
  let removeVisibilityListener: (() => void) | null = null;
  let removePagehideListener: (() => void) | null = null;
  let removeBeforeUnloadListener: (() => void) | null = null;
  let removeAppStateListener: (() => Promise<void> | void) | null = null;

  async function restoreCompletedRecords() {
    const now = Date.now();
    const records = await getTimedPracticeRecoveryRecords(now);
    const freeRecords = records.filter((record) => record.scope === 'free');

    for (const record of freeRecords) {
      const elapsedMs = Math.min(
        getTimedPracticeElapsedMs(record, now),
        record.requiredSeconds * 1000
      );
      const normalized: TimedPracticeRecoveryRecord = {
        ...record,
        accumulatedMs: elapsedMs,
        startedAtMs: null,
        running: false,
        updatedAtMs: now,
      };

      if (hasTimedPracticeReachedRequiredTime(normalized, now)) {
        await completeAndAward(normalized, { silent: true });
        continue;
      }

      // После reload partial-progress фиксируем как paused: скрытое время дальше не капает.
      await upsertTimedPracticeRecoveryRecord(normalized);
    }
  }

  async function start(params: FreeTimedPracticeRecoveryStart) {
    const normalized = normalizeStartParams(params);
    if (!normalized) return;

    const id = buildFreeTimedPracticeRecoveryId({
      source: normalized.source,
      sourceId: normalized.sourceId,
    });
    const existing = await getTimedPracticeRecoveryRecord(id);
    const base =
      existing && existing.scope === 'free'
        ? {
            ...existing,
            type: normalized.type,
            source: normalized.source,
            sourceId: normalized.sourceId,
            requiredSeconds: normalized.requiredSeconds,
            completedAtMs: null,
          }
        : createTimedPracticeRecoveryRecord({
            id,
            scope: 'free',
            type: normalized.type,
            source: normalized.source,
            sourceId: normalized.sourceId,
            requiredSeconds: normalized.requiredSeconds,
          });

    const next = startTimedPracticeRecoveryRecord(base);
    activeRecord.value = next;
    await upsertTimedPracticeRecoveryRecord(next);
  }

  async function pause() {
    const record = activeRecord.value;
    if (!record) return;

    const next = pauseTimedPracticeRecoveryRecord(record);
    activeRecord.value = next;
    await upsertTimedPracticeRecoveryRecord(next);
  }

  async function stop() {
    const record = activeRecord.value;
    activeRecord.value = null;
    if (!record) return;
    await removeTimedPracticeRecoveryRecord(record.id);
  }

  async function complete(params?: FreeTimedPracticeRecoveryStart) {
    let record = activeRecord.value;

    if (!record && params) {
      const normalized = normalizeStartParams(params);
      if (!normalized) return;
      record = createTimedPracticeRecoveryRecord({
        id: buildFreeTimedPracticeRecoveryId({
          source: normalized.source,
          sourceId: normalized.sourceId,
        }),
        scope: 'free',
        type: normalized.type,
        source: normalized.source,
        sourceId: normalized.sourceId,
        requiredSeconds: normalized.requiredSeconds,
      });
    }

    if (!record) return;
    await completeAndAward(record, { silent: false });
  }

  async function persistActiveRecord() {
    const record = activeRecord.value;
    if (!record) return;

    activeRecord.value = {
      ...record,
      updatedAtMs: Date.now(),
    };
    await upsertTimedPracticeRecoveryRecord(activeRecord.value);
  }

  async function completeActiveIfReached() {
    const record = activeRecord.value;
    if (!record) return;
    if (!hasTimedPracticeReachedRequiredTime(record)) return;
    await completeAndAward(record, { silent: false });
  }

  async function completeAndAward(
    record: TimedPracticeRecoveryRecord,
    options: { silent: boolean }
  ) {
    if (!record.source || !record.sourceId) return;

    const completed = completeTimedPracticeRecoveryRecord(record);
    await upsertTimedPracticeRecoveryRecord(completed);
    activeRecord.value =
      activeRecord.value?.id === record.id ? completed : activeRecord.value;
    const result = await award(
      record.source as FreePracticeSource,
      record.sourceId,
      {
        silent: options.silent,
      }
    );
    if (!result) return;

    await removeTimedPracticeRecoveryRecord(record.id);

    if (activeRecord.value?.id === record.id) {
      activeRecord.value = null;
    }
  }

  function handleVisibilityChange() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      void persistActiveRecord();
      return;
    }

    pageIsUnloading = false;
    void completeActiveIfReached();
  }

  function handlePageHide() {
    pageIsUnloading = true;
    void persistActiveRecord();
  }

  function handleBeforeUnload() {
    pageIsUnloading = true;
    void persistActiveRecord();
  }

  function bindLifecycle() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      removeVisibilityListener = () => {
        document.removeEventListener(
          'visibilitychange',
          handleVisibilityChange
        );
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', handlePageHide);
      removePagehideListener = () => {
        window.removeEventListener('pagehide', handlePageHide);
      };
      window.addEventListener('beforeunload', handleBeforeUnload);
      removeBeforeUnloadListener = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    void (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener(
          'appStateChange',
          ({ isActive }) => {
            if (isActive) {
              pageIsUnloading = false;
              void completeActiveIfReached();
              return;
            }

            void persistActiveRecord();
          }
        );
        removeAppStateListener = () => listener.remove();
      } catch {
        // Web закрыт visibility/pagehide; Capacitor может быть недоступен.
      }
    })();
  }

  function cleanupLifecycle() {
    removeVisibilityListener?.();
    removeVisibilityListener = null;
    removePagehideListener?.();
    removePagehideListener = null;
    removeBeforeUnloadListener?.();
    removeBeforeUnloadListener = null;
    if (removeAppStateListener) {
      void removeAppStateListener();
      removeAppStateListener = null;
    }
  }

  onMounted(() => {
    bindLifecycle();
    void restoreCompletedRecords();
  });

  onBeforeUnmount(() => {
    if (pageIsUnloading || resolvedOptions.persistOnUnmount) {
      void persistActiveRecord();
    } else {
      void stop();
    }
    cleanupLifecycle();
  });

  return {
    activeRecord,
    restoreCompletedRecords,
    start,
    pause,
    stop,
    complete,
    persistActiveRecord,
  };
}

function normalizeStartParams(
  params: FreeTimedPracticeRecoveryStart
): FreeTimedPracticeRecoveryStart | null {
  const sourceId = params.sourceId.trim().slice(0, 120);
  const type = params.type.trim();
  const requiredSeconds = Math.max(1, Math.floor(params.requiredSeconds));

  if (!sourceId || !type || !Number.isFinite(requiredSeconds)) return null;

  return {
    ...params,
    type,
    sourceId,
    requiredSeconds,
  };
}
