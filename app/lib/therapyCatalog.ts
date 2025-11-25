/**
 * Справочник тем терапии (Therapy Topics)
 * Версия: 2.4 (2025-11-06)
 *
 * 10 тематических направлений для эмоциональной терапевтической поддержки
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
      'Помогаем успокоиться и восстановить чувство безопасности через дыхание и заземление',
    emoji: '😰',
    color: 'blue',
    techniques: ['breath', 'grounding', 'reframe', 'sos'],
  },
  {
    key: 'stress',
    name: 'Стресс и выгорание',
    description:
      'Снятие перенапряжения, усталости, восстановление ощущения контроля и отдыха',
    emoji: '😮‍💨',
    color: 'gray',
    techniques: ['breath', 'body_scan', 'reframe'],
  },
  {
    key: 'mood',
    name: 'Низкое настроение',
    description:
      'Повышение энергии, активация, поддержка через микро-цели и благодарность',
    emoji: '😔',
    color: 'yellow',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'sleep',
    name: 'Сон и восстановление',
    description:
      'Помощь при засыпании, формирование режима, вечерние напоминания',
    emoji: '😴',
    color: 'purple',
    techniques: ['breath', 'body_scan'],
  },
  {
    key: 'anger',
    name: 'Раздражительность и злость',
    description: 'Управление импульсами, техники охлаждения, дыхательные паузы',
    emoji: '😤',
    color: 'red',
    techniques: ['breath', 'grounding', 'body_scan'],
  },
  {
    key: 'selfesteem',
    name: 'Самооценка и самокритика',
    description:
      'Снижение самокритики, фразы само-поддержки, мягкий рефрейминг',
    emoji: '🤗',
    color: 'pink',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'focus',
    name: 'Прокрастинация и фокус',
    description:
      'Повышение концентрации, правило 2 минут, фокус-слоты, борьба с откладыванием',
    emoji: '🎯',
    color: 'green',
    techniques: ['mi_prompt', 'reframe'],
  },
  {
    key: 'relations',
    name: 'Отношения и границы',
    description:
      'Поддержка в конфликтах, напоминания про самоценность, I-сообщения',
    emoji: '💬',
    color: 'indigo',
    techniques: ['reframe', 'mi_prompt'],
  },
  {
    key: 'grief',
    name: 'Потери и горе',
    description:
      'Помощь при утрате, мягкая поддержка, дыхание, нормализация чувств',
    emoji: '💔',
    color: 'slate',
    techniques: ['breath', 'grounding', 'reframe'],
  },
  {
    key: 'sos',
    name: 'Экстренная поддержка (SOS)',
    description:
      'Быстрая стабилизация при высокой тревоге, короткие SOS-техники',
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
