export const INTENT_OPTIONS = [
  { label: 'Приобрести', value: 'build' },
  { label: 'Избавиться', value: 'quit' },
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

// Опции для привычек QUIT (избавиться) - без reminder
export const SUBTYPE_OPTIONS_QUIT = SUBTYPE_OPTIONS.filter(
  (opt) => opt.value !== 'reminder'
);

// Опции для привычек BUILD (приобрести привычку) - все опции
export const SUBTYPE_OPTIONS_BUILD = SUBTYPE_OPTIONS;

// Опции без "Смешанные" для редактора текстов
export const SUBTYPE_OPTIONS_WITHOUT_MIXED = SUBTYPE_OPTIONS.filter(
  (opt) => opt.value !== 'mixed'
);

// Опции для привычек QUIT без "Смешанные" (для редактора)
export const SUBTYPE_OPTIONS_QUIT_WITHOUT_MIXED = SUBTYPE_OPTIONS_QUIT.filter(
  (opt) => opt.value !== 'mixed'
);

// Опции для привычек BUILD без "Смешанные" (для редактора)
export const SUBTYPE_OPTIONS_BUILD_WITHOUT_MIXED = SUBTYPE_OPTIONS_BUILD.filter(
  (opt) => opt.value !== 'mixed'
);

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

// Опции для стиля уведомлений (directness)
export const DIRECTNESS_OPTIONS = [
  {
    label: 'Мягкий',
    icon: '😊',
    value: 'soft' as const,
  },
  {
    label: 'Сдержанный',
    icon: '😐',
    value: 'moderate' as const,
  },
  {
    label: 'Жесткий',
    icon: '😑',
    value: 'hard' as const,
  },
];
