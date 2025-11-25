/**
 * Справочник привычек (Habits Catalog)
 * Версия: 1.0 (2025-11-13)
 *
 * Каталог всех доступных привычек для формирования полезных привычек и отказа от вредных
 */

export type HabitKey =
  | 'water'
  | 'sleep'
  | 'steps'
  | 'meditation'
  | 'nutrition'
  | 'focus_start'
  | 'gratitude'
  | 'morning_routine'
  | 'planning'
  | 'smoking'
  | 'alcohol'
  | 'sugar'
  | 'procrastination'
  | 'screentime'
  | 'caffeine';

export type HabitIntent = 'build' | 'quit';

export interface HabitCatalogItem {
  habitKey: HabitKey;
  name: string;
  emoji: string;
  intent: HabitIntent;
  description: string;
}

/**
 * Статичный каталог привычек
 * Эти данные НЕ хранятся в БД — они определены в коде
 */
export const HABITS_CATALOG: readonly HabitCatalogItem[] = [
  // build
  {
    habitKey: 'water',
    name: 'Пить больше воды',
    emoji: '💧',
    intent: 'build',
    description: 'Поддержание водного баланса',
  },
  {
    habitKey: 'sleep',
    name: 'Лучше спать',
    emoji: '😴',
    intent: 'build',
    description: 'Режим сна, вечерние ритуалы',
  },
  {
    habitKey: 'steps',
    name: 'Больше двигаться',
    emoji: '🏃',
    intent: 'build',
    description: 'Активность каждый день',
  },
  {
    habitKey: 'meditation',
    name: 'Медитация и дыхание',
    emoji: '🧘',
    intent: 'build',
    description:
      'Ежедневная медитация и короткие дыхательные паузы в течение дня',
  },
  {
    habitKey: 'nutrition',
    name: 'Регулярное питание',
    emoji: '🥗',
    intent: 'build',
    description: 'Регулярные приёмы пищи без переедания и перекусов «на бегу»',
  },
  {
    habitKey: 'focus_start',
    name: 'Фокус-старт',
    emoji: '🎯',
    intent: 'build',
    description:
      'Короткая фокус-сессия в начале работы или учёбы без отвлечений',
  },
  {
    habitKey: 'gratitude',
    name: 'Дневник благодарности',
    emoji: '📔',
    intent: 'build',
    description: 'Записывай хотя бы одну мысль благодарности в конце дня',
  },
  {
    habitKey: 'morning_routine',
    name: 'Утренний ритуал',
    emoji: '🌅',
    intent: 'build',
    description:
      'Простой утренний ритуал: вода, немного движения и план на день',
  },
  {
    habitKey: 'planning',
    name: 'План на день',
    emoji: '🗒️',
    intent: 'build',
    description: 'Мини-план из 3 главных дел на день',
  },
  // quit
  {
    habitKey: 'smoking',
    name: 'Бросить курить',
    emoji: '🚭',
    intent: 'quit',
    description: 'Отказ от сигарет, вейпа, снюса, стиков и прочего',
  },
  {
    habitKey: 'alcohol',
    name: 'Меньше алкоголя',
    emoji: '🚫',
    intent: 'quit',
    description: 'Помощь сократить алкоголь и делать больше трезвых дней',
  },
  {
    habitKey: 'sugar',
    name: 'Меньше сахара и фастфуда',
    emoji: '🚫',
    intent: 'quit',
    description: 'Снижение тяги к сладкому/перекусам',
  },
  {
    habitKey: 'procrastination',
    name: 'Меньше прокрастинации',
    emoji: '🚫',
    intent: 'quit',
    description: 'Правило 2 минут и микрошаги, чтобы легче начинать дела',
  },
  {
    habitKey: 'screentime',
    name: 'Меньше телефона ночью',
    emoji: '📵',
    intent: 'quit',
    description: 'Засыпание без скролла и яркого экрана перед сном',
  },
  {
    habitKey: 'caffeine',
    name: 'Меньше кофеина',
    emoji: '🚫',
    intent: 'quit',
    description: 'Сокращение кофе и энергетиков, последняя порция днём',
  },
] as const;

/**
 * Найти привычку по ключу
 */
export function findHabitByKey(key: string): HabitCatalogItem | undefined {
  return HABITS_CATALOG.find((h) => h.habitKey === key);
}

/**
 * Получить все привычки по типу intent
 */
export function getHabitsByIntent(
  intent: HabitIntent
): readonly HabitCatalogItem[] {
  return HABITS_CATALOG.filter((h) => h.intent === intent);
}

/**
 * Получить все ключи привычек
 */
export function getAllHabitKeys(): HabitKey[] {
  return HABITS_CATALOG.map((h) => h.habitKey);
}

/**
 * Валидация ключа привычки
 */
export function isValidHabitKey(key: string): key is HabitKey {
  return getAllHabitKeys().includes(key as HabitKey);
}

/**
 * Получить каталог как Record для быстрого доступа по ключу
 */
export function getHabitsCatalogAsRecord(): Record<HabitKey, HabitCatalogItem> {
  return HABITS_CATALOG.reduce(
    (acc, habit) => {
      acc[habit.habitKey] = habit;
      return acc;
    },
    {} as Record<HabitKey, HabitCatalogItem>
  );
}
