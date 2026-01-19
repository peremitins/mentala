/**
 * Пути к звукам дыхательных практик (файлы лежат в public).
 */

import type { BreathCueType } from '@/app/lib/breathPracticesCatalog';

export const BREATH_PRACTICE_SOUNDS: Record<BreathCueType, string> = {
  inhale: '/breath/sounds/inhale.m4a',
  exhale: '/breath/sounds/exhale.m4a',
  hold: '/breath/sounds/wait.m4a',
  pause: '/breath/sounds/pause.m4a',
};
