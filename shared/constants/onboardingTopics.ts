export const ONBOARDING_THERAPY_TOPIC_KEYS = [
  'anxiety',
  'phobias',
  'stress',
  'anger',
  'selfesteem',
  'relations',
] as const;

export const ONBOARDING_HABIT_TOPIC_KEYS = [
  'water',
  'steps',
  'meditation',
  'nutrition',
  'gratitude',
  'smoking',
  'alcohol',
  'sugar',
  'procrastination',
  'caffeine',
] as const;

export type OnboardingTherapyTopicKey =
  (typeof ONBOARDING_THERAPY_TOPIC_KEYS)[number];
export type OnboardingHabitTopicKey =
  (typeof ONBOARDING_HABIT_TOPIC_KEYS)[number];
export type OnboardingTopicKind = 'therapy' | 'habits';

export type OnboardingSelectedTopic =
  | {
      kind: 'therapy';
      entityKey: OnboardingTherapyTopicKey;
    }
  | {
      kind: 'habits';
      entityKey: OnboardingHabitTopicKey;
    };

export function getOnboardingTopicIdentity(topic: {
  kind: OnboardingTopicKind;
  entityKey: string;
}): string {
  return `${topic.kind}:${topic.entityKey}`;
}
