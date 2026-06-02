import { findBreathPractice } from '@/app/lib/breathPracticesCatalog';

export const PROGRAM_BREATH_LEGACY_ALIASES: Record<string, string> = {
  box: 'box-breathing',
  '5-4-3-2-1': 'box-breathing',
  calm: 'diaphragmatic',
  release: 'long-exhale-4-6',
  active: 'physiological-sigh',
  'equal-breathing': 'equal-5-5',
  'slow-exhale': 'long-exhale-4-6',
  'long-exhale': 'long-exhale-4-6',
  'steady-breath': 'equal-5-5',
  'calm-start': 'diaphragmatic',
  anxiety: 'long-exhale-4-6',
  stress: 'box-breathing',
  breathing_4_6: 'long-exhale-4-6',
  box_breathing: 'box-breathing',
};

export function resolveProgramBreathPracticeSlug(template?: string | null) {
  const rawTemplate = template?.trim() || 'diaphragmatic';
  return PROGRAM_BREATH_LEGACY_ALIASES[rawTemplate] ?? rawTemplate;
}

export function resolveProgramBreathPractice(template?: string | null) {
  return findBreathPractice(resolveProgramBreathPracticeSlug(template)) || null;
}
