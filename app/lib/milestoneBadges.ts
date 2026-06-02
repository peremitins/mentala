export interface MilestoneBadgeMeta {
  id: string;
  title: string;
  description: string;
  category: 'start' | 'regularity' | 'garden' | 'return';
  imagePath: string;
}

export const MILESTONE_BADGES: MilestoneBadgeMeta[] = [
  {
    id: 'first_step',
    title: 'Первый шаг',
    description: 'Ты начал путь. Маленькое действие уже считается.',
    category: 'start',
    imagePath: '/badges/badge_first_step.webp',
  },
  {
    id: 'first_thought_saved',
    title: 'Первая опора',
    description: 'Ты сохранил мысль, к которой можно вернуться.',
    category: 'start',
    imagePath: '/badges/badge_first_thought_saved.webp',
  },
  {
    id: 'first_week',
    title: 'Первая неделя',
    description: 'Семь дней заботы. Не идеально, а достаточно.',
    category: 'regularity',
    imagePath: '/badges/badge_first_week.webp',
  },
  {
    id: 'thirty_active_days',
    title: '30 дней рядом с собой',
    description: 'Ты возвращался к себе снова и снова. Это уже опора.',
    category: 'regularity',
    imagePath: '/badges/badge_thirty_active_days.webp',
  },
  {
    id: 'hundred_active_days',
    title: '100 дней заботы',
    description:
      'Это уже не случайность. Ты выстроил ритм, который поддерживает тебя.',
    category: 'regularity',
    imagePath: '/badges/badge_hundred_active_days.webp',
  },
  {
    id: 'returned_after_pause',
    title: 'Ты вернулся',
    description: 'Пауза не отменяет путь. Продолжать можно с любого места.',
    category: 'return',
    imagePath: '/badges/badge_returned_after_pause.webp',
  },
];

// Fallback для садов без собственного badge-ассета — пион принятия
const PEONY_FALLBACK = '/badges/badge_garden_self_kindness_21.webp';

export const GARDEN_BADGES: MilestoneBadgeMeta[] = [
  {
    id: 'garden_calm_anxiety_30',
    title: 'Орхидея спокойствия',
    description: 'Ты научился жить рядом с тревогой, а не против неё.',
    category: 'garden',
    imagePath: '/badges/badge_garden_calm_anxiety_30.webp',
  },
  {
    id: 'garden_self_kindness_21',
    title: 'Пион принятия',
    description: 'Быть добрым к себе сложнее, чем кажется. Ты это сделал.',
    category: 'garden',
    imagePath: '/badges/badge_garden_self_kindness_21.webp',
  },
  {
    id: 'garden_relationships_21',
    title: 'Цикламен близости',
    description: 'Ты разобрался, где заканчиваешься ты и начинаются другие.',
    category: 'garden',
    imagePath: '/badges/badge_garden_relationships_21.webp',
  },
  {
    id: 'garden_burnout_21',
    title: 'Азалия возвращения',
    description: 'Ты прошёл через истощение и нашёл дорогу обратно к себе.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
  {
    id: 'garden_gentle_sleep_21',
    title: 'Тюльпан ночи',
    description: 'Ночь стала тише. Ты вернул себе отдых.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
  {
    id: 'garden_emotion_regulation_21',
    title: 'Георгин эмоций',
    description: 'Ты научился слышать себя, а не бояться своих реакций.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
  {
    id: 'garden_sustainable_habits_21',
    title: 'Ландыш ритма',
    description: 'Маленькие ритуалы стали частью тебя.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
  {
    id: 'garden_joy_practice_21',
    title: 'Подсолнух радости',
    description: 'Ты снова замечаешь маленькое хорошее.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
  {
    id: 'garden_purpose_28',
    title: 'Протея смысла',
    description: 'Ты нашёл ориентиры, которые держат даже в трудные дни.',
    category: 'garden',
    imagePath: PEONY_FALLBACK,
  },
];

export function getGardenBadgeMeta(programSlug: string): MilestoneBadgeMeta {
  const found = GARDEN_BADGES.find(
    (b) => b.id === `garden_${programSlug}`
  );
  return (
    found ?? {
      id: `garden_${programSlug}`,
      title: 'Сад завершён',
      description: 'Ты прошёл весь путь этой программы.',
      category: 'garden',
      imagePath: PEONY_FALLBACK,
    }
  );
}

export function getBadgeMeta(badgeId: string): MilestoneBadgeMeta | null {
  if (badgeId.startsWith('garden_')) {
    return getGardenBadgeMeta(badgeId.slice(7));
  }
  return MILESTONE_BADGES.find((b) => b.id === badgeId) ?? null;
}

// Единый источник истины для итогового числа достижений.
// Используется и на странице /milestones, и в виджете Оранжереи.
export const ALL_BADGES_TOTAL = MILESTONE_BADGES.length + GARDEN_BADGES.length;

export const BADGE_CATEGORY_LABELS: Record<
  MilestoneBadgeMeta['category'],
  string
> = {
  start: 'Начало пути',
  regularity: 'Регулярность',
  garden: 'Сады',
  return: 'Возвращение',
};
