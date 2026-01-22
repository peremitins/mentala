import type { BreathPracticeTag } from '@/app/lib/breathPracticesCatalog';
import type { HabitKey } from '@/app/lib/habitsCatalog';
import type { TherapyTopicKey } from '@/app/lib/therapyCatalog';

// Списки ключей, где быстрые практики скрываем полностью.
const THERAPY_PRACTICE_HIDDEN_KEYS = new Set<TherapyTopicKey>([
  'selfesteem',
  'relations',
  'loneliness',
]);

const HABIT_PRACTICE_HIDDEN_KEYS = new Set<HabitKey>([
  'water',
  'steps',
  'nutrition',
  'gratitude',
  'caffeine',
  'smoking',
  'alcohol',
  'sugar',
  'junk_food',
  'procrastination',
]);

// Карта соответствий терапевтических тем и групп дыхательных практик.
const THERAPY_TO_BREATH_GROUP_MAP: Partial<
  Record<TherapyTopicKey, BreathPracticeTag>
> = {
  anxiety: 'anxiety',
  sos: 'anxiety',
  stress: 'focus',
  anger: 'focus',
  mood: 'sleep',
  grief: 'sleep',
  perfectionism: 'focus',
};

// Карта соответствий привычек и групп дыхательных практик.
const HABIT_TO_BREATH_GROUP_MAP: Partial<
  Record<HabitKey, BreathPracticeTag>
> = {
  meditation: 'anxiety',
};

export function isTherapyPracticeHidden(key: string): boolean {
  return THERAPY_PRACTICE_HIDDEN_KEYS.has(key as TherapyTopicKey);
}

export function isHabitPracticeHidden(key: string): boolean {
  return HABIT_PRACTICE_HIDDEN_KEYS.has(key as HabitKey);
}

export function mapTherapyToBreathGroup(
  key: string
): BreathPracticeTag | null {
  return (
    (THERAPY_TO_BREATH_GROUP_MAP as Record<string, BreathPracticeTag>)[key] ||
    null
  );
}

export function mapHabitToBreathGroup(key: string): BreathPracticeTag | null {
  return (
    (HABIT_TO_BREATH_GROUP_MAP as Record<string, BreathPracticeTag>)[key] || null
  );
}
