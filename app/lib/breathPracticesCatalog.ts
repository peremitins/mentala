/**
 * Каталог дыхательных практик (MVP)
 * Данные хранятся в коде и используются для каталога и тренажёра.
 */

export type BreathPracticeTag = 'popular' | 'sleep' | 'anxiety' | 'focus';
export type BreathCueType = 'inhale' | 'exhale' | 'hold' | 'pause';
export type BreathPhaseType = 'inhale' | 'hold' | 'exhale' | 'pause';

export interface BreathPhase {
  type: BreathPhaseType;
  label: string;
  seconds: number;
  cue: BreathCueType;
}

export interface BreathPractice {
  slug: string;
  title: string;
  goal: string;
  description: string;
  pattern: string;
  phases: BreathPhase[];
  steps: string[];
  emoji: string;
  tags: BreathPracticeTag[];
}

export interface BreathCustomPractice {
  id: string;
  name: string;
  phases: BreathPhase[];
  createdAt: string;
  updatedAt: string;
}

const PHASE_LABELS: Record<BreathPhaseType, string> = {
  inhale: 'Вдох',
  hold: 'Задержка',
  exhale: 'Выдох',
  pause: 'Задержка',
};

const PHASE_CUES: Record<BreathPhaseType, BreathCueType> = {
  inhale: 'inhale',
  hold: 'hold',
  exhale: 'exhale',
  pause: 'pause',
};

function createPhase(
  type: BreathPhaseType,
  seconds: number,
  label?: string
): BreathPhase {
  return {
    type,
    seconds,
    label: label ?? PHASE_LABELS[type],
    cue: PHASE_CUES[type],
  };
}

function buildSteps(phases: BreathPhase[]): string[] {
  return phases.map((phase) => `${phase.label} ${phase.seconds}`);
}

function buildPattern(phases: BreathPhase[]): string {
  return phases.map((phase) => `${phase.label} ${phase.seconds}`).join(' → ');
}

function buildPractice(
  data: Omit<BreathPractice, 'steps' | 'pattern'> &
    Partial<Pick<BreathPractice, 'steps' | 'pattern'>>
): BreathPractice {
  return {
    ...data,
    steps: data.steps ?? buildSteps(data.phases),
    pattern: data.pattern ?? buildPattern(data.phases),
  };
}

export const BREATH_PRACTICES: readonly BreathPractice[] = [
  buildPractice({
    slug: '4-7-8',
    title: '4-7-8',
    goal: 'Сон / успокоение',
    description:
      'Техника расслабления, часто используют для снятия напряжения и вечернего ритуала.',
    phases: [
      createPhase('inhale', 4),
      createPhase('hold', 7),
      createPhase('exhale', 8),
    ],
    emoji: '🌙',
    tags: ['popular', 'sleep'],
  }),
  buildPractice({
    slug: 'box-breathing',
    title: '4-4-4-4',
    goal: 'Фокус / стабилизация',
    description: 'Квадратное дыхание для концентрации и снижения стресса.',
    phases: [
      createPhase('inhale', 4),
      createPhase('hold', 4),
      createPhase('exhale', 4),
      createPhase('pause', 4),
    ],
    emoji: '🧊',
    tags: ['popular', 'focus'],
  }),
  buildPractice({
    slug: 'equal-5-5',
    title: '5-5',
    goal: 'Баланс / восстановление',
    description:
      'Равные вдох и выдох помогают выровнять состояние и вернуть ритм.',
    phases: [createPhase('inhale', 5), createPhase('exhale', 5)],
    emoji: '⚖️',
    tags: ['popular'],
  }),
  buildPractice({
    slug: 'equal-6-6',
    title: '6-6',
    goal: 'Сон / восстановление',
    description:
      'Равные вдох и выдох помогают выровнять состояние и вернуть ритм.',
    phases: [createPhase('inhale', 6), createPhase('exhale', 6)],
    emoji: '🕯️',
    tags: ['sleep'],
  }),
  buildPractice({
    slug: 'long-exhale-4-6',
    title: '4-6',
    goal: 'Снятие тревоги / успокоение',
    description: 'Простой анти-стресс, легко делать на ходу, без задержек.',
    phases: [createPhase('inhale', 4), createPhase('exhale', 6)],
    emoji: '💨',
    tags: ['popular', 'anxiety', 'sleep'],
  }),
  buildPractice({
    slug: 'pursed-lip',
    title: '2-4',
    goal: 'Контроль дыхания / снижение напряжения',
    description:
      'Техника с медленным выдохом через сомкнутые губы, помогает замедлить дыхание.',
    phases: [createPhase('inhale', 2), createPhase('exhale', 4)],
    pattern: 'Вдох 2 → выдох 4 через сомкнутые губы',
    emoji: '👄',
    tags: ['anxiety'],
  }),
  buildPractice({
    slug: 'diaphragmatic',
    title: '4-4',
    goal: 'База / успокоение',
    description: 'Мягкое дыхание животом для стабилизации и расслабления.',
    phases: [createPhase('inhale', 4), createPhase('exhale', 4)],
    pattern: 'Вдох 4 → выдох 4',
    emoji: '🫁',
    tags: ['popular', 'anxiety'],
  }),
  buildPractice({
    slug: 'alternate-nostril',
    title: '4-4-2',
    goal: 'Баланс / ясность',
    description:
      'Практика с попеременным дыханием через ноздри. Здесь мы ведём ритм и подсказываем момент смены.',
    phases: [
      createPhase('inhale', 4),
      createPhase('exhale', 4),
      createPhase('pause', 2, 'Смена ноздри'),
    ],
    pattern: 'Вдох 4 → выдох 4 → смена ноздри 2',
    emoji: '🌀',
    tags: ['focus'],
  }),
  buildPractice({
    slug: 'physiological-sigh',
    title: 'Успокоиться',
    goal: 'Быстрое снижение стресса',
    description:
      'Два коротких вдоха подряд и длинный выдох. Часто используют как быстрый способ переключиться и успокоиться.',
    phases: [
      createPhase('inhale', 2, 'Вдох'),
      createPhase('inhale', 1, 'Добор'),
      createPhase('exhale', 6, 'Длинный выдох'),
    ],
    pattern: 'Вдох 2 → добор 1 → длинный выдох 6',
    emoji: '⚡',
    tags: ['anxiety'],
  }),
] as const;

// Быстрый поиск практики по slug, чтобы не дублировать логику на страницах.
export function findBreathPractice(slug: string): BreathPractice | undefined {
  return BREATH_PRACTICES.find((practice) => practice.slug === slug);
}

// Генерируем строку паттерна для пользовательских практик.
export function formatBreathPattern(phases: BreathPhase[]): string {
  return buildPattern(phases);
}

// Генерируем подписи фаз для карточек и превью.
export function formatBreathSteps(phases: BreathPhase[]): string[] {
  return buildSteps(phases);
}

// Стандартные фазы для пользовательских практик.
export function buildCustomPhases(count: 2 | 3 | 4): BreathPhase[] {
  const base: [BreathPhase, BreathPhase, BreathPhase, BreathPhase] = [
    createPhase('inhale', 4),
    createPhase('hold', 4),
    createPhase('exhale', 4),
    createPhase('pause', 4),
  ];

  if (count === 2) return [base[0], base[2]];
  if (count === 3) return [base[0], base[1], base[2]];
  return base;
}

// Сопоставляем пользовательскую практику с моделью каталога для UI.
export function mapCustomPractice(
  custom: BreathCustomPractice
): BreathPractice {
  return buildPractice({
    slug: `custom-${custom.id}`,
    title: custom.name,
    goal: 'Пользовательская практика',
    description: 'Практика, собранная по твоим параметрам.',
    phases: custom.phases,
    emoji: '✨',
    tags: ['popular'],
  });
}
