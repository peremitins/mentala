export const MEDITATION_TOPICS = [
  {
    key: 'sleep',
    name: 'Сон',
    subtitle: 'Глубокий отдых и засыпание',
    emoji: '🌙',
  },
  {
    key: 'anxiety',
    name: 'Тревога',
    subtitle: 'Заземление и ровное дыхание',
    emoji: '🫧',
  },
  {
    key: 'stress',
    name: 'Стресс',
    subtitle: 'Сбросить напряжение',
    emoji: '🌿',
  },
] as const;

export type MeditationTopicKey = (typeof MEDITATION_TOPICS)[number]['key'];

export type MeditationTopic = (typeof MEDITATION_TOPICS)[number];

export const MEDITATION_TOPIC_MAP = MEDITATION_TOPICS.reduce(
  (acc, topic) => {
    acc[topic.key] = topic;
    return acc;
  },
  {} as Record<MeditationTopicKey, MeditationTopic>
);

export function isMeditationTopicKey(key: string): key is MeditationTopicKey {
  return Boolean(MEDITATION_TOPIC_MAP[key as MeditationTopicKey]);
}
