import { computed, ref } from 'vue';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';

interface BreathPracticePlayerOptions {
  onPhaseStart?: (phase: BreathPhase) => void;
  onSessionComplete?: () => void;
}

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

  let timerId: number | null = null;

  const currentPhase = computed(() => phases.value[phaseIndex.value] || null);

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
    return Math.min(
      100,
      ((total - phaseRemainingSeconds.value) / total) * 100
    );
  });

  function clearTimer() {
    if (timerId === null) return;
    clearInterval(timerId);
    timerId = null;
  }

  function resetState() {
    // Сбрасываем все флаги и таймеры при остановке.
    clearTimer();
    isRunning.value = false;
    isPaused.value = false;
    isCompleted.value = false;
    prepCountdown.value = 0;
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
  }

  function emitPhaseStart() {
    const phase = currentPhase.value;
    if (!phase) return;
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
    options?.onSessionComplete?.();
  }

  function startMainTimer() {
    if (!currentPhase.value) return;
    emitPhaseStart();

    if (typeof window === 'undefined') return;
    timerId = window.setInterval(() => {
      if (!isRunning.value || isPaused.value) return;

      if (sessionRemainingSeconds.value <= 0) {
        finishSession();
        return;
      }

      sessionRemainingSeconds.value = Math.max(
        0,
        sessionRemainingSeconds.value - 1
      );

      if (phaseRemainingSeconds.value <= 1) {
        const nextIndex =
          (phaseIndex.value + 1) % Math.max(phases.value.length, 1);
        phaseIndex.value = nextIndex;
        phaseRemainingSeconds.value =
          phases.value[nextIndex]?.seconds || 0;
        emitPhaseStart();
      } else {
        phaseRemainingSeconds.value -= 1;
      }

      if (sessionRemainingSeconds.value <= 0) {
        finishSession();
      }
    }, 1000);
  }

  function startPrepTimer() {
    clearTimer();

    if (typeof window === 'undefined') return;
    timerId = window.setInterval(() => {
      if (prepCountdown.value <= 1) {
        prepCountdown.value = 0;
        clearTimer();
        startMainTimer();
      } else {
        prepCountdown.value -= 1;
      }
    }, 1000);
  }

  function start() {
    if (!phases.value.length || sessionDurationSeconds.value <= 0) return;

    // Полный перезапуск с подготовительным отсчётом.
    resetState();
    isRunning.value = true;
    isPaused.value = false;
    isCompleted.value = false;
    prepCountdown.value = 3;
    sessionRemainingSeconds.value = sessionDurationSeconds.value;
    phaseIndex.value = 0;
    phaseRemainingSeconds.value = phases.value[0]?.seconds || 0;

    startPrepTimer();
  }

  function pause() {
    if (!isRunning.value || isPaused.value) return;
    isPaused.value = true;
    clearTimer();
  }

  function resume() {
    if (!isRunning.value || !isPaused.value) return;
    isPaused.value = false;
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
    sessionProgress,
    phaseProgress,
    setPhases,
    setSessionDuration,
    start,
    pause,
    resume,
    stop,
  };
}
