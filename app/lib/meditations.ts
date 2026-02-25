import type { MeditationTopicKey } from '@/shared/dto/meditations';
import type { HabitKey } from '@/app/lib/habitsCatalog';
import type { TherapyTopicKey } from '@/app/lib/therapyCatalog';

export const MEDITATION_TOPIC_GRADIENTS: Record<MeditationTopicKey, string> = {
  sleep: 'from-slate-500 via-indigo-500 to-blue-600',
  anxiety: 'from-sky-500 via-cyan-500 to-emerald-500',
  stress: 'from-emerald-500 via-teal-500 to-sky-600',
};

// Сопоставляем ключи терапевтических тем с группами медитаций.
export const THERAPY_TO_MEDITATION_TOPIC_MAP: Partial<
  Record<TherapyTopicKey, MeditationTopicKey>
> = {
  anxiety: 'anxiety',
  stress: 'stress',
  anger: 'stress',
};

export function mapTherapyToMeditationTopic(
  key: string
): MeditationTopicKey | null {
  return (
    (THERAPY_TO_MEDITATION_TOPIC_MAP as Record<string, MeditationTopicKey>)[
      key
    ] || null
  );
}

// Сопоставляем ключи привычек с группами медитаций.
export const HABIT_TO_MEDITATION_TOPIC_MAP: Partial<
  Record<HabitKey, MeditationTopicKey>
> = {
  meditation: 'anxiety',
};

export function mapHabitToMeditationTopic(
  key: string
): MeditationTopicKey | null {
  return (
    (HABIT_TO_MEDITATION_TOPIC_MAP as Record<string, MeditationTopicKey>)[
      key
    ] || null
  );
}
