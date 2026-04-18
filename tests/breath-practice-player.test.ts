import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';

const phases: BreathPhase[] = [
  {
    type: 'inhale',
    label: 'Вдох',
    seconds: 4,
    cue: 'inhale',
  },
  {
    type: 'hold',
    label: 'Задержка',
    seconds: 4,
    cue: 'hold',
  },
  {
    type: 'exhale',
    label: 'Выдох',
    seconds: 4,
    cue: 'exhale',
  },
];

describe('useBreathPracticePlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T10:00:00.000Z'));
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: globalThis,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
  });

  it('повторно эмитит текущую фазу после pause/resume', async () => {
    const phaseStarts: string[] = [];
    const { useBreathPracticePlayer } = await import(
      '../app/composables/useBreathPracticePlayer'
    );

    const player = useBreathPracticePlayer({
      onSessionStart: () => Date.now(),
      onPhaseStart: (phase) => {
        phaseStarts.push(phase.type);
      },
    });

    player.setPhases(phases);
    player.setSessionDuration(60);
    await player.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(phaseStarts).toEqual(['inhale']);

    await vi.advanceTimersByTimeAsync(1000);
    player.pause();
    player.resume();

    expect(phaseStarts).toEqual(['inhale', 'inhale']);
    expect(player.currentPhase.value?.type).toBe('inhale');
    expect(player.phaseRemainingSeconds.value).toBe(3);
  });

  it('по sync пересчитывает фазу и завершает сессию после долгого background gap', async () => {
    const phaseStarts: string[] = [];
    const completed = vi.fn();
    const { useBreathPracticePlayer } = await import(
      '../app/composables/useBreathPracticePlayer'
    );

    const player = useBreathPracticePlayer({
      onSessionStart: () => Date.now(),
      onPhaseStart: (phase) => {
        phaseStarts.push(phase.type);
      },
      onSessionComplete: completed,
    });

    player.setPhases(phases);
    player.setSessionDuration(12);
    await player.start();

    await vi.advanceTimersByTimeAsync(3000);
    expect(player.currentPhase.value?.type).toBe('inhale');

    vi.setSystemTime(new Date('2026-04-17T10:00:08.000Z'));
    player.sync();

    expect(player.currentPhase.value?.type).toBe('hold');
    expect(player.phaseRemainingSeconds.value).toBe(3);
    expect(phaseStarts.at(-1)).toBe('hold');

    vi.setSystemTime(new Date('2026-04-17T10:00:16.500Z'));
    player.sync();

    expect(player.isCompleted.value).toBe(true);
    expect(player.isRunning.value).toBe(false);
    expect(player.sessionRemainingSeconds.value).toBe(0);
    expect(completed).toHaveBeenCalledTimes(1);
  });
});
