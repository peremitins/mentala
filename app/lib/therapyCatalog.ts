/**
 * Справочник тем терапии (Therapy Topics)
 * Версия: 2.5 (2025-12-17)
 *
 * 12 тематических направлений для эмоциональной терапевтической поддержки
 * (каталог используется для текстовых уведомлений: названия и описания короткие и “узнаваемые”)
 */

export type TherapyTopicKey =
  | 'anxiety'
  | 'stress'
  | 'mood'
  | 'sleep'
  | 'anger'
  | 'selfesteem'
  | 'focus'
  | 'relations'
  | 'grief'
  | 'loneliness'
  | 'perfectionism'
  | 'sos';

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
    key: 'stress',
    name: 'Стресс и выгорание',
    description:
      'Помогаем снизить напряжение и усталость, восстановить ресурс и ощущение контроля',
    emoji: '😮‍💨',
    color: 'gray',
  },
  {
    key: 'mood',
    name: 'Низкое настроение',
    description:
      'Помогаем вернуть энергию и опору: маленькие шаги, забота о себе и благодарность',
    emoji: '😔',
    color: 'yellow',
  },
  {
    key: 'sleep',
    name: 'Сон и восстановление',
    description:
      'Помогаем легче засыпать и высыпаться: вечерние практики, расслабление и режим сна',
    emoji: '😴',
    color: 'purple',
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
    key: 'focus',
    name: 'Фокус и прокрастинация',
    description:
      'Помогаем начать и удержать внимание: правило 2 минут, короткие фокус-сессии и меньше откладывания',
    emoji: '🎯',
    color: 'green',
  },
  {
    key: 'relations',
    name: 'Отношения и границы',
    description:
      'Помогаем говорить о важном спокойно: Я‑сообщения, поддержка в конфликтах и напоминания о самоценности',
    emoji: '💬',
    color: 'indigo',
  },
  {
    key: 'grief',
    name: 'Утрата и горе',
    description:
      'Помогаем пережить утрату мягко: поддержка, дыхание, заземление и нормализация чувств',
    emoji: '💔',
    color: 'slate',
  },

  // NEW (для уведомлений отлично подходит: микрошаги к контакту, выход из изоляции)
  {
    key: 'loneliness',
    name: 'Одиночество',
    description:
      'Помогаем сделать маленькие шаги к общению и почувствовать связь',
    emoji: '🤝',
    color: 'amber',
  },

  // NEW (хорошо для уведомлений: “разрешающие” фразы, анти-прокрастинация)
  {
    key: 'perfectionism',
    name: 'Перфекционизм',
    description:
      'Помогаем снизить давление “надо идеально”: “достаточно хорошо”, черновики и маленькие шаги',
    emoji: '✨',
    color: 'violet',
  },

  {
    key: 'sos',
    name: 'Экстренная поддержка',
    description:
      'Быстрая стабилизация при сильной тревоге: короткие техники, чтобы вернуться в “здесь и сейчас”',
    emoji: '🆘',
    color: 'orange',
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
