import type confetti from 'canvas-confetti';

type ConfettiOptions = NonNullable<Parameters<typeof confetti>[0]>;

type CelebrationIntensity = 'soft' | 'standard';

type CelebrationOptions = {
  intensity?: CelebrationIntensity;
};

const CELEBRATION_COLORS = [
  '#6ee7b7',
  '#67e8f9',
  '#fef3c7',
  '#f0abfc',
  '#ffffff',
];

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function withDefaults(options: ConfettiOptions): ConfettiOptions {
  return {
    colors: CELEBRATION_COLORS,
    disableForReducedMotion: true,
    ticks: 220,
    ...options,
  };
}

export function useCelebrationConfetti() {
  async function launchStepCompletionConfetti(
    options: CelebrationOptions = {}
  ) {
    if (typeof window === 'undefined' || prefersReducedMotion()) return;

    const { default: confetti } = await import('canvas-confetti');
    const intensity = options.intensity || 'standard';
    const particleMultiplier = intensity === 'soft' ? 0.72 : 1;
    const ticks = intensity === 'soft' ? 120 : 220;

    // Несколько коротких залпов создают success-прелюдию перед поливом растения.
    void confetti(
      withDefaults({
        particleCount: Math.round(46 * particleMultiplier),
        spread: 64,
        startVelocity: 34,
        scalar: 0.86,
        ticks,
        origin: { x: 0.5, y: 0.58 },
      })
    );

    window.setTimeout(() => {
      void confetti(
        withDefaults({
          particleCount: Math.round(34 * particleMultiplier),
          angle: 62,
          spread: 58,
          startVelocity: 38,
          scalar: 0.74,
          ticks,
          origin: { x: 0.08, y: 0.72 },
        })
      );
      void confetti(
        withDefaults({
          particleCount: Math.round(34 * particleMultiplier),
          angle: 118,
          spread: 58,
          startVelocity: 38,
          scalar: 0.74,
          ticks,
          origin: { x: 0.92, y: 0.72 },
        })
      );
    }, 700);

    window.setTimeout(() => {
      void confetti(
        withDefaults({
          particleCount: Math.round(24 * particleMultiplier),
          spread: 110,
          startVelocity: 22,
          decay: 0.92,
          scalar: 0.68,
          ticks,
          origin: { x: 0.5, y: 0.42 },
        })
      );
    }, 1600);
  }

  return {
    launchStepCompletionConfetti,
  };
}
