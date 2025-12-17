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
  techniques: string[]; // Типы техник для этой темы
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
    techniques: ['breath', 'grounding', 'reframe', 'sos'],
  },
  {
    key: 'stress',
    name: 'Стресс и выгорание',
    description:
      'Помогаем снизить напряжение и усталость, восстановить ресурс и ощущение контроля',
    emoji: '😮‍💨',
    color: 'gray',
    techniques: ['breath', 'body_scan', 'reframe'],
  },
  {
    key: 'mood',
    name: 'Низкое настроение',
    description:
      'Помогаем вернуть энергию и опору: маленькие шаги, забота о себе и благодарность',
    emoji: '😔',
    color: 'yellow',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'sleep',
    name: 'Сон и восстановление',
    description:
      'Помогаем легче засыпать и высыпаться: вечерние практики, расслабление и режим сна',
    emoji: '😴',
    color: 'purple',
    techniques: ['breath', 'body_scan'],
  },
  {
    key: 'anger',
    name: 'Раздражительность и злость',
    description:
      'Помогаем снизить накал и вернуть контроль: пауза, дыхание и техники “охлаждения”',
    emoji: '😤',
    color: 'red',
    techniques: ['breath', 'grounding', 'body_scan'],
  },
  {
    key: 'selfesteem',
    name: 'Самооценка и самокритика',
    description:
      'Помогаем уменьшить самокритику и поддержать себя: добрые формулировки и новые взгляды',
    emoji: '🤗',
    color: 'pink',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'focus',
    name: 'Фокус и прокрастинация',
    description:
      'Помогаем начать и удержать внимание: правило 2 минут, короткие фокус-сессии и меньше откладывания',
    emoji: '🎯',
    color: 'green',
    techniques: ['mi_prompt', 'reframe'],
  },
  {
    key: 'relations',
    name: 'Отношения и границы',
    description:
      'Помогаем говорить о важном спокойно: Я‑сообщения, поддержка в конфликтах и напоминания о самоценности',
    emoji: '💬',
    color: 'indigo',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'grief',
    name: 'Утрата и горе',
    description:
      'Помогаем пережить утрату мягко: поддержка, дыхание, заземление и нормализация чувств',
    emoji: '💔',
    color: 'slate',
    techniques: ['breath', 'grounding', 'reframe'],
  },

  // NEW (для уведомлений отлично подходит: микрошаги к контакту, выход из изоляции)
  {
    key: 'loneliness',
    name: 'Одиночество и социальные связи',
    description:
      'Помогаем сделать маленькие шаги к общению и почувствовать связь',
    emoji: '🤝',
    color: 'amber',
    techniques: ['mi_prompt', 'reframe', 'behavioral_activation'],
  },

  // NEW (хорошо для уведомлений: “разрешающие” фразы, анти-прокрастинация)
  {
    key: 'perfectionism',
    name: 'Перфекционизм и завышенные требования',
    description:
      'Помогаем снизить давление “надо идеально”: “достаточно хорошо”, черновики и маленькие шаги',
    emoji: '✨',
    color: 'violet',
    techniques: ['reframe', 'mi_prompt', 'behavioral_activation'],
  },

  {
    key: 'sos',
    name: 'Экстренная поддержка',
    description:
      'Быстрая стабилизация при сильной тревоге: короткие техники, чтобы вернуться в “здесь и сейчас”',
    emoji: '🆘',
    color: 'orange',
    techniques: ['sos', 'breath', 'grounding'],
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
