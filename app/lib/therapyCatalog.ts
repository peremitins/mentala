/**
 * Справочник тем терапии (Therapy Topics)
 * Версия: 2.7 (2026-03-09)
 *
 * 6 тематических направлений для эмоциональной терапевтической поддержки
 * (каталог используется для текстовых уведомлений: названия и описания короткие и “узнаваемые”)
 */

export type TherapyTopicKey =
  | 'anxiety'
  | 'phobias'
  | 'stress'
  | 'anger'
  | 'selfesteem'
  | 'relations';

export interface TherapyTopic {
  key: TherapyTopicKey;
  name: string;
  description: string;
  emoji: string;
  color: string; // Tailwind color class prefix (без dark:)
}

/**
 * Статичный каталог тем терапии
 * Эти данные НЕ хранятся в БД — они определены в коде
 */
export const THERAPY_TOPICS: readonly TherapyTopic[] = [
  {
    key: 'anxiety',
    name: 'Тревога и паника',
    description:
      'Помогаем успокоиться и вернуть чувство безопасности: дыхание, заземление и поддерживающие мысли',
    emoji: '😰',
    color: 'blue',
  },
  {
    key: 'phobias',
    name: 'Страхи',
    description:
      'Помогаем мягко встретиться со страхами и вернуть ощущение контроля: маленькие шаги и поддержка.',
    emoji: '🛡️',
    color: 'orange',
  },
  {
    key: 'stress',
    name: 'Стресс и выгорание',
    description:
      'Помогаем снизить напряжение и усталость, восстановить ресурс и ощущение контроля',
    emoji: '😮‍💨',
    color: 'gray',
  },
  {
    key: 'anger',
    name: 'Раздражительность и злость',
    description:
      'Помогаем снизить накал и вернуть контроль: пауза, дыхание и техники “охлаждения”',
    emoji: '😤',
    color: 'red',
  },
  {
    key: 'selfesteem',
    name: 'Самооценка и самокритика',
    description:
      'Помогаем уменьшить самокритику и поддержать себя: добрые формулировки и новые взгляды',
    emoji: '🤗',
    color: 'pink',
  },
  {
    key: 'relations',
    name: 'Отношения и границы',
    description:
      'Помогаем говорить о важном спокойно: Я‑сообщения, поддержка в конфликтах и напоминания о самоценности',
    emoji: '💬',
    color: 'indigo',
  },
] as const;

/**
 * Найти тему по ключу
 */
export function findTopicByKey(key: string): TherapyTopic | undefined {
  return THERAPY_TOPICS.find((t) => t.key === key);
}

/**
 * Получить все ключи тем
 */
export function getAllTopicKeys(): TherapyTopicKey[] {
  return THERAPY_TOPICS.map((t) => t.key);
}

/**
 * Валидация ключа темы
 */
export function isValidTopicKey(key: string): key is TherapyTopicKey {
  return getAllTopicKeys().includes(key as TherapyTopicKey);
}
