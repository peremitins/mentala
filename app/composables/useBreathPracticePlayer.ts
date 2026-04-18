import { computed, ref } from 'vue';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';

interface BreathPracticePlayerOptions {
  onSessionStart?: () => Promise<number | void> | number | void;
  onPhaseStart?: (phase: BreathPhase) => void;
  onSessionComplete?: () => void;
}

const PREP_COUNTDOWN_SECONDS = 3;
const TICK_MS = 250;

export function useBreathPracticePlayer(options?: BreathPracticePlayerOptions) {
  const phases = ref<BreathPhase[]>([]);
  const sessionDurationSeconds = ref(0);
  const sessionRemainingSeconds = ref(0);
  const phaseIndex = ref(0);
  const phaseRemainingSeconds = ref(0);
  const prepCountdown = ref(0);
  const isRunning = ref(false);
  const isPaused = ref(false);
  const isCompleted = ref(false);
  const sessionEndsAt = ref<number | null>(null);

  let timerId: number | null = null;
  let prepEndsAtMs: number | null = null;
  let sessionStartedAtMs: number | null = null;
  let pausedAtMs: number | null = null;
  let totalPausedMs = 0;
  let lastPhaseCursor = '';
  let sessionStartTask: Promise<void> | null = null;

  const currentPhase = computed(() => phases.value[phaseIndex.value] || null);
  const cycleDurationSeconds = computed(() =>
    phases.value.reduce((total, phase) => total + Math.max(phase.seconds, 0), 0)
  );

  const sessionProgress = computed(() => {
    if (!sessionDurationSeconds.value) return 0;
    return Math.min(
      100,
      ((sessionDurationSeconds.value - sessionRemainingSeconds.value) /
        sessionDurationSeconds.value) *
        100
    );
  });

  const phaseProgress = computed(() => {
    const total = currentPhase.value?.seconds || 0;
    if (!total) return 0;
    return Math.min(100, ((total - phaseRemainingSeconds.value) / total) * 100);
  });

  function clearTimer() {
    if (timerId === null) return;
    clearInterval(timerId);
    timerId = null;
  }

  function resetState() {
    // Сбрасываем все флаги и таймеры при остановке.
    clearTimer();
    prepEndsAtMs = null;
    sessionStartedAtMs = null;
    pausedAtMs = null;
    totalPausedMs = 0;
    lastPhaseCursor = '';
    sessionStartTask = null;
    isRunning.value = false;
    isPaused.value = false;
    isCompleted.value = false;
    prepCountdown.value = 0;
    sessionEndsAt.value = null;
    phaseIndex.value = 0;
    phaseRemainingSeconds.value = phases.value[0]?.seconds || 0;
    sessionRemainingSeconds.value = sessionDurationSeconds.value;
  }

  function setPhases(next: BreathPhase[]) {
    phases.value = next;
    if (!isRunning.value) {
      phaseIndex.value = 0;
      phaseRemainingSeconds.value = next[0]?.seconds || 0;
    }
  }

  function setSessionDuration(seconds: number) {
    sessionDurationSeconds.value = seconds;
    // Всегда синхронизируем оставшееся время с новой длительностью,
    // иначе UI показывает несоответствие (особенно при увеличении таймера).
    sessionRemainingSeconds.value = seconds;
    if (
      isRunning.value &&
      !isPaused.value &&
      prepCountdown.value === 0 &&
      sessionStartedAtMs !== null
    ) {
      sessionEndsAt.value = Date.now() + sessionRemainingSeconds.value * 1000;
    }
  }

  function emitPhaseStart(force = false) {
    const phase = currentPhase.value;
    if (!phase) return;
    const cycleSeconds = Math.max(cycleDurationSeconds.value, 1);
    const completedSessionSeconds = Math.max(
      0,
      sessionDurationSeconds.value - sessionRemainingSeconds.value
    );
    const phaseCycle = Math.floor(completedSessionSeconds / cycleSeconds);
    const cursor = `${phaseCycle}:${phaseIndex.value}`;
    if (!force && cursor === lastPhaseCursor) return;
    lastPhaseCursor = cursor;
    // Не ждём завершения side-effect, чтобы не блокировать таймер.
    void options?.onPhaseStart?.(phase);
  }

  function finishSession() {
    // Фиксируем завершение и даём UI показать экран окончания.
    clearTimer();
    isRunning.value = false;
    isPaused.value = false;
    isCompleted.value = true;
    prepCountdown.value = 0;
    sessionRemainingSeconds.value = 0;
    sessionEndsAt.value = null;
    options?.onSessionComplete?.();
  }

  async function beginMainSession(now = Date.now(), forcePhaseStart = false) {
    if (!currentPhase.value) return;
    prepEndsAtMs = null;
    prepCountdown.value = 0;

    if (sessionStartTask) {
      await sessionStartTask;
      return;
    }

    sessionStartTask = (async () => {
      let actualStartAtMs = now;
      if (sessionStartedAtMs === null) {
        totalPausedMs = 0;
      }

      try {
        const startResult = await options?.onSessionStart?.();
        if (typeof startResult === 'number' && Number.isFinite(startResult)) {
          actualStartAtMs = Math.floor(startResult);
        } else {
          actualStartAtMs = Date.now();
        }
      } catch (error) {
        actualStartAtMs = Date.now();
        console.error(
          '[useBreathPracticePlayer] Failed to start native breathing session:',
          error
        );
      }

      sessionStartedAtMs = actualStartAtMs;
      sessionEndsAt.value =
        actualStartAtMs + sessionRemainingSeconds.value * 1000;
      syncActiveSession(forcePhaseStart, actualStartAtMs);
      startMainTimer();
    })();

    try {
      await sessionStartTask;
    } finally {
      sessionStartTask = null;
    }
  }

  function getElapsedSessionSeconds(now = Date.now()) {
    if (sessionStartedAtMs === null) return 0;
    const pausedDurationMs = pausedAtMs !== null ? now - pausedAtMs : 0;
    const elapsedMs = Math.max(
      0,
      now - sessionStartedAtMs - totalPausedMs - pausedDurationMs
    );
    return Math.floor(elapsedMs / 1000);
  }

  function syncActiveSession(forcePhaseStart = false, now = Date.now()) {
    if (!phases.value.length || sessionStartedAtMs === null) return;
    const durationSeconds = sessionDurationSeconds.value;
    if (durationSeconds <= 0) {
      finishSession();
      return;
    }

    const elapsedSeconds = getElapsedSessionSeconds(now);
    if (elapsedSeconds >= durationSeconds) {
      finishSession();
      return;
    }

    const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
    sessionRemainingSeconds.value = remainingSeconds;

    const totalCycleSeconds = Math.max(cycleDurationSeconds.value, 1);
    const cycleOffsetSeconds = elapsedSeconds % totalCycleSeconds;

    let nextPhaseIndex = 0;
    let nextPhaseRemaining = phases.value[0]?.seconds || 0;
    let phaseStartOffset = 0;
    for (let index = 0; index < phases.value.length; index += 1) {
      const phase = phases.value[index];
      const phaseEndOffset = phaseStartOffset + Math.max(phase.seconds, 0);
      if (cycleOffsetSeconds < phaseEndOffset) {
        nextPhaseIndex = index;
        nextPhaseRemaining = Math.max(1, phaseEndOffset - cycleOffsetSeconds);
        break;
      }
      phaseStartOffset = phaseEndOffset;
    }

    const phaseChanged = phaseIndex.value !== nextPhaseIndex;
    phaseIndex.value = nextPhaseIndex;
    phaseRemainingSeconds.value = nextPhaseRemaining;

    if (phaseChanged || forcePhaseStart) {
      emitPhaseStart(forcePhaseStart);
    }
  }

  function syncPrepCountdown(now = Date.now()) {
    if (prepEndsAtMs === null) return;
    const remainingMs = prepEndsAtMs - now;
    if (remainingMs <= 0) {
      void beginMainSession(now, true);
      return;
    }

    prepCountdown.value = Math.max(1, Math.ceil(remainingMs / 1000));
  }

  function startMainTimer() {
    if (typeof window === 'undefined') return;
    clearTimer();
    timerId = window.setInterval(() => {
      if (!isRunning.value || isPaused.value) return;
      sync();
    }, TICK_MS);
  }

  function sync(forcePhaseStart = false) {
    const now = Date.now();
    if (!isRunning.value) return;

    if (prepEndsAtMs !== null) {
      syncPrepCountdown(now);
      return;
    }

    if (sessionStartedAtMs === null) return;

    if (isPaused.value) return;
    syncActiveSession(forcePhaseStart, now);
  }

  function start() {
    if (!phases.value.length || sessionDurationSeconds.value <= 0) return;

    // Полный перезапуск с подготовительным отсчётом.
    resetState();
    isRunning.value = true;
    isPaused.value = false;
    isCompleted.value = false;
    prepCountdown.value = PREP_COUNTDOWN_SECONDS;
    sessionRemainingSeconds.value = sessionDurationSeconds.value;
    phaseIndex.value = 0;
    phaseRemainingSeconds.value = phases.value[0]?.seconds || 0;
    prepEndsAtMs = Date.now() + PREP_COUNTDOWN_SECONDS * 1000;

    startMainTimer();
  }

  function pause() {
    if (!isRunning.value || isPaused.value) return;
    isPaused.value = true;
    pausedAtMs = Date.now();
    sessionEndsAt.value = null;
    clearTimer();
  }

  function resume() {
    if (!isRunning.value || !isPaused.value) return;
    const now = Date.now();
    if (pausedAtMs !== null) {
      totalPausedMs += now - pausedAtMs;
      pausedAtMs = null;
    }
    isPaused.value = false;
    sync(true);
    if (isRunning.value && !isPaused.value) {
      sessionEndsAt.value = now + sessionRemainingSeconds.value * 1000;
    }
    startMainTimer();
  }

  function stop() {
    resetState();
  }

  return {
    phases,
    currentPhase,
    phaseIndex,
    phaseRemainingSeconds,
    sessionDurationSeconds,
    sessionRemainingSeconds,
    prepCountdown,
    isRunning,
    isPaused,
    isCompleted,
    sessionEndsAt,
    sessionProgress,
    phaseProgress,
    setPhases,
    setSessionDuration,
    start,
    pause,
    resume,
    sync,
    stop,
  };
}
