import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  programs,
  programStepTemplates,
  userPrograms,
} from '@/server/infrastructure/db/schema';
import type { ProgramStepAction } from '@/server/infrastructure/db/schema';

/**
 * Сезонные мини-челленджи (retention/retention_long_term_strategy.md).
 *
 * Mini-программа — это короткий 7-14-шаговый челлендж с темой (например,
 * «Неделя ровного дыхания», «3 дня внимательного утра»). Награда — декор
 * или цветок из резервного пула, не блокирующий основную retention-петлю
 * с регулярными Садами.
 *
 * Технически mini-программа использует ту же таблицу `programs` с полем
 * `kind = 'mini'` (см. schema.ts). У неё свои step templates, но без
 * необходимости расширять `STEP_BLUEPRINTS_BY_SLUG` — шаблоны генерируются
 * runtime'ом из готового пула breath/meditation/journal practices.
 *
 * Текущее состояние: skeleton-инфраструктура для будущей раскатки.
 * `generateMiniProgram` создаёт запись в БД с минимальным набором шагов.
 * UI входной точки (HomeMiniChallengeCard) делается отдельно после того,
 * как продукт определит конкретные темы и время запуска.
 */

export type MiniProgramTheme = 'breath_week' | 'morning_focus' | 'gratitude_3d';

type MiniProgramSpec = {
  slug: string;
  title: string;
  subtitle: string;
  themes: string[];
  stepCount: number;
  // Композиция шагов: для каждого indexа задаём тип готовой свободной практики
  // плюс шаблон. Реальный контент draft'ится в blueprint позже.
  stepKinds: Array<'breathing' | 'meditation' | 'journal_entry' | 'reflection'>;
};

const MINI_SPECS: Record<MiniProgramTheme, MiniProgramSpec> = {
  breath_week: {
    slug: 'mini_breath_week_7',
    title: 'Неделя ровного дыхания',
    subtitle: '7 коротких практик дыхания за неделю',
    themes: ['breath', 'calm', 'mini'],
    stepCount: 7,
    stepKinds: [
      'breathing',
      'breathing',
      'breathing',
      'reflection',
      'breathing',
      'breathing',
      'journal_entry',
    ],
  },
  morning_focus: {
    slug: 'mini_morning_focus_5',
    title: '5 утр внимательности',
    subtitle: '5 коротких утренних практик',
    themes: ['morning', 'focus', 'mini'],
    stepCount: 5,
    stepKinds: [
      'meditation',
      'breathing',
      'reflection',
      'meditation',
      'journal_entry',
    ],
  },
  gratitude_3d: {
    slug: 'mini_gratitude_3d',
    title: 'Три дня благодарности',
    subtitle: '3 шага про замечание хорошего',
    themes: ['gratitude', 'joy', 'mini'],
    stepCount: 3,
    stepKinds: ['journal_entry', 'reflection', 'journal_entry'],
  },
};

/**
 * Создаёт mini-программу для пользователя (или возвращает существующую).
 * Идемпотентно по `(userId, slug)`.
 *
 * Skeleton-логика: вставляет запись `programs` с `kind='mini'`, генерирует
 * базовые step templates под выбранную тему. UI запуска и rendering шагов
 * пока не подключены — это задача отдельной итерации (§9 стратегии).
 */
export async function generateMiniProgram(params: {
  userId: number;
  theme: MiniProgramTheme;
}): Promise<{ slug: string; programId: number }> {
  const spec = MINI_SPECS[params.theme];
  if (!spec) {
    throw new Error(`Unknown mini-program theme: ${params.theme}`);
  }

  const [existing] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, spec.slug))
    .limit(1);

  let programId: number;
  if (existing) {
    programId = existing.id;
  } else {
    const [created] = await db
      .insert(programs)
      .values({
        slug: spec.slug,
        title: spec.title,
        subtitle: spec.subtitle,
        totalSteps: spec.stepCount,
        themes: spec.themes,
        kind: 'mini',
        unlockRule: { kind: 'always' },
        plantSetSlug: null,
        difficulty: 'gentle',
        summaryText: null,
        metadata: { miniTheme: params.theme, bootstrap: true },
      })
      .returning({ id: programs.id });
    programId = created.id;

    // Базовые step templates — заглушки. Реальный контент CBT-промптов
    // будет добавлен когда продукт определит формулировки.
    const stepRows = spec.stepKinds.map((kind, index) => ({
      programId,
      step: index + 1,
      chapter: 1,
      title: stubTitleForKind(kind, index + 1),
      subtitle: 'Мини-челлендж · короткая практика',
      nextHint: null,
      durationMin: 4,
      energyReward: 2,
      actions: buildMiniActions(programId, index + 1, kind),
      metadata: { kind, miniTheme: params.theme },
    }));

    if (stepRows.length > 0) {
      await db
        .insert(programStepTemplates)
        .values(stepRows)
        .onConflictDoNothing();
    }
  }

  // Зарегистрируем пользователю эту mini-программу как активную (если ещё нет).
  await db
    .insert(userPrograms)
    .values({
      userId: params.userId,
      programId,
      currentStep: 1,
      status: 'active',
      metadata: { miniTheme: params.theme },
    })
    .onConflictDoNothing({
      target: [userPrograms.userId, userPrograms.programId],
    });

  return { slug: spec.slug, programId };
}

function stubTitleForKind(
  kind: MiniProgramSpec['stepKinds'][number],
  step: number
): string {
  const titles: Record<MiniProgramSpec['stepKinds'][number], string> = {
    breathing: `День ${step} — дыхание`,
    meditation: `День ${step} — медитация`,
    journal_entry: `День ${step} — запись`,
    reflection: `День ${step} — заметка`,
  };
  return titles[kind];
}

function buildMiniActions(
  programId: number,
  step: number,
  kind: MiniProgramSpec['stepKinds'][number]
): ProgramStepAction[] {
  // Заглушка: один primary action под тип практики, без mood/reflection/journal.
  // Полная композиция будет добавлена когда продукт согласует UX mini-челленджа.
  const baseId = `mini-${programId}-${step}`;
  switch (kind) {
    case 'breathing':
      return [
        {
          id: `${baseId}-breath`,
          type: 'breathing',
          title: 'Короткое дыхание',
          subtitle: 'Дыхательная пауза для перезагрузки',
          template: 'diaphragmatic',
          durationSeconds: 240,
          energy: 2,
          required: true,
        },
      ];
    case 'meditation':
      return [
        {
          id: `${baseId}-meditation`,
          type: 'meditation',
          title: 'Короткая медитация',
          subtitle: 'Аудио-пауза для замедления',
          template: 'stress',
          durationSeconds: 240,
          energy: 2,
          required: false,
        },
      ];
    case 'journal_entry':
      return [
        {
          id: `${baseId}-journal`,
          type: 'journal_entry',
          title: 'Запись в дневнике',
          subtitle: 'Пара строк о сегодняшнем',
          prompt: 'Что было хорошего сегодня? Допиши хотя бы одно.',
          energy: 1,
          required: false,
        },
      ];
    case 'reflection':
      return [
        {
          id: `${baseId}-reflection`,
          type: 'ai_reflection',
          title: 'Короткая рефлексия',
          subtitle: 'Что заметил',
          prompt:
            'Какая мелочь сегодня обрадовала или удивила? Отметь и допиши при желании.',
          energy: 1,
          required: false,
        },
      ];
    default:
      return [];
  }
}

// Защита от unused-import предупреждений (and используется в будущих
// фильтрах статуса mini-программы).
void and;
