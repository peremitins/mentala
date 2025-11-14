export const AI_WORK_MODE_OPTIONS = [
  { label: '💛 &nbsp;Терапия', value: 'therapy' },
  { label: '💪 &nbsp;Привычки', value: 'habits' },
];

export const INTENT_OPTIONS = [
  { label: 'Привить привычку', value: 'build' },
  { label: 'Отказаться от привычки', value: 'quit' },
  { label: 'Своя привычка', value: 'custom' },
];

// Опции для привычек QUIT (избавиться от привычки)
export const SUBTYPE_OPTIONS_QUIT = [
  {
    label: 'Смешанное',
    value: 'mixed',
    description: 'Чередование информационных и мотивационных сообщений',
  },
  {
    label: 'Информационное',
    value: 'informational',
    description:
      'Факты о вреде и восстановлении: "Через 72 часа печень начинает восстанавливаться"',
  },
  {
    label: 'Мотивационное',
    value: 'motivational',
    description:
      'Поддержка и сила: "Твоя семья гордится тобой. Каждый день — победа"',
  },
];

// Опции для привычек BUILD (привить привычку)
export const SUBTYPE_OPTIONS_BUILD = [
  ...SUBTYPE_OPTIONS_QUIT,
  {
    label: 'Напоминание',
    value: 'reminder',
    description:
      'Простые напоминания о действии: "Выпей воду", "Пройди 5 минут"',
  },
];

// Legacy: для обратной совместимости (deprecated)
export const SUBTYPE_OPTIONS = SUBTYPE_OPTIONS_BUILD;

export const THEME_OPTIONS = [
  { label: 'Системная', value: 'system' },
  { label: 'Тёмная', value: 'dark' },
  { label: 'Светлая', value: 'light' },
  { label: 'Серая', value: 'gray' },
];
