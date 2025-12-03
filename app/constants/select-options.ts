export const AI_WORK_MODE_OPTIONS = [
  { label: '💛 &nbsp;Терапия', value: 'therapy' },
  { label: '💪 &nbsp;Привычки', value: 'habits' },
];

export const INTENT_OPTIONS = [
  { label: 'Привить привычку', value: 'build' },
  { label: 'Отказаться от привычки', value: 'quit' },
];

// Универсальные опции subtype для всех видов уведомлений (habits и therapy)
export const SUBTYPE_OPTIONS = [
  {
    label: 'Напоминание',
    icon: '🔔',
    title: 'Напоминание о действии',
    value: 'reminder',
    description:
      'Короткие, конкретные сигналы сделать шаг или практику: выполнить упражнение, технику, действие из привычки или терапии',
  },
  {
    label: 'Факты',
    icon: '📘',
    title: 'Полезные факты',
    value: 'informational',
    description:
      'Короткие, понятные факты и объяснения о влиянии привычек и внутренних процессов на здоровье и самочувствие',
  },
  {
    label: 'Поддержка',
    icon: '🤝',
    title: 'Поддержка и мотивация',
    value: 'motivational',
    description:
      'Фразы, помогающие чувствовать поддержку, оставаться мотивированным и продолжать движение вперёд',
  },
  {
    label: 'Смешанные',
    icon: '🔀',
    title: 'Смешанные уведомления',
    value: 'mixed',
    description:
      'Чередование разных типов сообщений, которые создают естественный поток и не перегружают одним форматом',
  },
];

// Опции для привычек QUIT (избавиться от привычки) - без reminder
export const SUBTYPE_OPTIONS_QUIT = SUBTYPE_OPTIONS.filter(
  (opt) => opt.value !== 'reminder'
);

// Опции для привычек BUILD (привить привычку) - все опции
export const SUBTYPE_OPTIONS_BUILD = SUBTYPE_OPTIONS;

export const THEME_OPTIONS = [
  { label: 'Системная', value: 'system' },
  { label: 'Тёмная', value: 'dark' },
  { label: 'Светлая', value: 'light' },
];

// Опции для источника текстов уведомлений (для готовых шаблонов)
export const TEXT_SOURCE_OPTIONS = [
  {
    label: 'Шаблоны',
    value: 'templates',
    description: 'Использовать готовые тексты уведомлений',
  },
  {
    label: 'ИИ',
    value: 'ai',
    description:
      'Генерировать новые тексты с помощью искусственного интеллекта',
  },
  {
    label: 'Гибридный',
    value: 'hybrid',
    description: 'Комбинация готовых шаблонов и AI-генерации',
  },
];
