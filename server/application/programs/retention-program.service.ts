import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  dailyThoughts,
  energyEvents,
  moodCheckins,
  programs,
  programStepTemplates,
  users,
  userPlants,
  userPrograms,
  userProgramStepAttempts,
  userProgramStepProgress,
  userToolkitItems,
  type ProgramStepAction,
} from '@/server/infrastructure/db/schema';
import { resolveTrialUpsellAfterStep } from '@/server/application/subscriptions/trial-upsell.service';
import {
  getToolkitPhraseFields,
  resolveToolkitDestination,
  type ToolkitDestination,
} from '@/shared/toolkit/registry';
import type { ToolkitItemSource } from '@/shared/dto/toolkit';
import {
  MoodCheckinMoodEnum,
  ProgramStepActionDto,
  ProgramStepActionStateDto as ProgramStepActionStateSchema,
  type MoodCheckinMood,
  type ProgramOverviewDto,
  type ProgramStepActionStateDto,
  type ProgramStepDto,
  type ThoughtOfTheDayDto,
} from '@/shared/dto/retention';
import { toIsoString } from '@/server/utils/serialize';
import {
  DAILY_STEP_LIMIT_BASE,
  DEFAULT_RETENTION_TIMEZONE,
  diffDateKeys,
  getDailyLimitWindowMs,
  getDailyStepLimitForProgramDay,
  getDevDailyLimitCycleState,
  getLocalDateKey as getLocalDateKeyPure,
  getNextDailyResetAt,
  nextLocalMidnight as nextLocalMidnightPure,
  shiftDateKey as shiftDateKeyPure,
} from '@/server/application/programs/retention-timezone';
import { trackRetentionEvent } from '@/server/application/analytics/retention-events.service';
import {
  cancelPendingNextStepReminder,
  scheduleNextStepReminder,
} from '@/server/application/notifications/next-step-reminder.service';
import { getOrGeneratePlantSummary } from '@/server/application/garden/garden-summary.service';
import { recordStreakActivityForDate } from '@/server/application/streak/streak.service';
import {
  applyGender,
  applyGenderDeep,
  type UserGender,
} from '@/server/application/programs/gendered-text';

export const DEFAULT_RETENTION_PROGRAM_SLUG = 'calm_anxiety_30';
export const RETENTION_WEEKLY_GOAL = 25;

// Базовый максимум новых завершённых шагов программы за один локальный день
// пользователя. Первые дни программы лимит выше — см. DAILY_STEP_LIMIT_SCHEDULE
// в retention-timezone.ts (день 0 и 1 → 3 шага, дальше → 2).
// Replay (повтор уже завершённых шагов) лимитом не ограничен.
// См. retention/retention_long_term_strategy.md (pacing).
export const DAILY_STEP_LIMIT = DAILY_STEP_LIMIT_BASE;

const DEFAULT_TIMEZONE = DEFAULT_RETENTION_TIMEZONE;

const CHAPTERS = [
  { chapter: 1, title: 'Знакомство', stepRange: 'Шаги 1-3', accent: 'teal' },
  {
    chapter: 2,
    title: 'Инструменты',
    stepRange: 'Шаги 4-10',
    accent: 'violet',
  },
  { chapter: 3, title: 'Применение', stepRange: 'Шаги 11-20', accent: 'slate' },
  { chapter: 4, title: 'Углубление', stepRange: 'Шаги 21-28', accent: 'amber' },
  { chapter: 5, title: 'Финал', stepRange: 'Шаги 29-30', accent: 'rose' },
] as const;

const PEONY_CHAPTERS = [
  {
    chapter: 1,
    title: 'Старт и безопасность',
    stepRange: 'Шаги 1-3',
    accent: 'teal',
  },
  {
    chapter: 2,
    title: 'Тело и мягкое внимание',
    stepRange: 'Шаги 4-7',
    accent: 'violet',
  },
  {
    chapter: 3,
    title: 'Мысли и применение',
    stepRange: 'Шаги 8-14',
    accent: 'slate',
  },
  {
    chapter: 4,
    title: 'Действия на своей стороне',
    stepRange: 'Шаги 15-19',
    accent: 'amber',
  },
  {
    chapter: 5,
    title: 'Интеграция',
    stepRange: 'Шаги 20-21',
    accent: 'rose',
  },
] as const;

type ChapterAccent = (typeof CHAPTERS)[number]['accent'];

type StepBlueprintAction = Omit<ProgramStepAction, 'id'> & {
  idSuffix: string;
};

type StepBlueprint = {
  title: string;
  subtitle: string;
  nextHint: string;
  introText?: string;
  miniArticle?: NonNullable<ProgramStepDto['miniArticle']> | null;
  kind?:
    | 'breathing'
    | 'meditation'
    | 'quick_help_grounding'
    | 'quick_help_breathing'
    | 'quick_help_tension'
    | 'thought_dump'
    | 'reflection'
    | 'journal'
    // AI-чат как тип шага Roadmap (retention/retention_long_term_strategy.md).
    | 'ai_chat_session';
  template?: string;
  targetId?: string;
  /** Primary prompt для основного action этого шага. */
  prompt?: string;
  durationMin: number;
  /**
   * Явная multi-action композиция шага. Если задана - buildActions не добавляет
   * шаблонные mood/reflection/journal action'ы вокруг старого `kind`.
   */
  actions?: StepBlueprintAction[];
  // Поля для ai_chat_session. Используются только когда kind === 'ai_chat_session'.
  topicPrompt?: string;
  goalHint?: string;
  minQualifyingMessages?: number;
  minDurationSec?: number;
  // Расширенные поля контента (опционально). Берутся из `.docs/content/program_*.md`.
  // Если не заданы - buildActions использует дефолты.
  /** Subtitle отображается над primary action в step runner'е. */
  primarySubtitle?: string;
  /** Свой prompt для action `ai_reflection` («Как прошло?»). */
  reflectionPrompt?: string;
  /** Свой subtitle для action `ai_reflection`. */
  reflectionSubtitle?: string;
  /**
   * Кастомные chips для финальной reflection («Как прошло?») - варианты ответа,
   * согласованные с конкретной practice. Если заданы - UI рендерит именно их
   * вместо generic «Стало спокойнее / Чуть легче / ...».
   * Пример (после grounding'а): ['Зрение', 'Слух', 'Тело', 'Запах', 'Вкус'].
   */
  reflectionChipOptions?: string[];
  /** Свой prompt для финального journal_entry («Запись в дневнике»). */
  journalPrompt?: string;
  /** Свой subtitle для финального journal_entry. */
  journalSubtitle?: string;
  /**
   * Варианты chips для primary reflection action (kind='reflection').
   * Если заданы - UI рендерит именно их вместо generic «Стало спокойнее / ...».
   * Пример: ['тревога', 'усталость', 'беспокойные мысли', ...].
   */
  chipOptions?: string[];
};

type TimedProgramStepActionType =
  | 'breathing'
  | 'meditation'
  | 'quick_help_breathing'
  | 'quick_help_tension';

function actionWithId(
  idSuffix: string,
  action: Omit<StepBlueprintAction, 'idSuffix'>
): StepBlueprintAction {
  return {
    idSuffix,
    ...action,
  };
}

function breathingAction(params: {
  idSuffix?: string;
  title: string;
  subtitle?: string;
  template: string;
  durationSeconds: number;
  prompt?: string;
}): StepBlueprintAction {
  return timedAction({
    type: 'breathing',
    idSuffix: params.idSuffix ?? 'breathing',
    title: params.title,
    subtitle: params.subtitle,
    template: params.template,
    durationSeconds: params.durationSeconds,
    prompt: params.prompt,
    energy: 2,
  });
}

function meditationAction(params: {
  idSuffix?: string;
  title: string;
  subtitle?: string;
  template: string;
  durationSeconds: number;
  prompt?: string;
}): StepBlueprintAction {
  return timedAction({
    type: 'meditation',
    idSuffix: params.idSuffix ?? 'meditation',
    title: params.title,
    subtitle: params.subtitle,
    template: params.template,
    durationSeconds: params.durationSeconds,
    prompt: params.prompt,
    energy: 2,
  });
}

function tensionAction(params: {
  idSuffix?: string;
  title: string;
  subtitle?: string;
  durationSeconds: number;
  prompt?: string;
}): StepBlueprintAction {
  return timedAction({
    type: 'quick_help_tension',
    idSuffix: params.idSuffix ?? 'tension',
    title: params.title,
    subtitle: params.subtitle,
    durationSeconds: params.durationSeconds,
    prompt: params.prompt,
    energy: 2,
  });
}

function timedAction(params: {
  type: TimedProgramStepActionType;
  idSuffix: string;
  title: string;
  subtitle?: string;
  template?: string;
  durationSeconds: number;
  prompt?: string;
  energy?: number;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix, {
    type: params.type,
    title: params.title,
    subtitle: params.subtitle,
    template: params.template,
    prompt: params.prompt,
    durationSeconds: params.durationSeconds,
    completionDelaySeconds: params.durationSeconds,
    energy: params.energy ?? 2,
    required: true,
  });
}

function groundingAction(params: {
  idSuffix?: string;
  title?: string;
  subtitle?: string;
  estimatedDurationSeconds: number;
  prompt?: string;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'grounding', {
    type: 'quick_help_grounding',
    title: params.title ?? 'Заземление',
    subtitle: params.subtitle ?? 'Верни внимание в настоящий момент',
    prompt: params.prompt,
    estimatedDurationSeconds: params.estimatedDurationSeconds,
    completionDelaySeconds: null,
    energy: 2,
    required: true,
  });
}

function thoughtDumpAction(params: {
  idSuffix?: string;
  title?: string;
  subtitle?: string;
  prompt: string;
  estimatedDurationSeconds?: number;
  maxLength?: number;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'thought-dump', {
    type: 'thought_dump',
    title: params.title ?? 'Выгрузка мыслей',
    subtitle: params.subtitle ?? 'Пиши без структуры и редактуры',
    prompt: params.prompt,
    estimatedDurationSeconds: params.estimatedDurationSeconds ?? 360,
    completionDelaySeconds: null,
    maxLength: params.maxLength ?? 2000,
    energy: 2,
    required: true,
  });
}

function microReflectionAction(params: {
  idSuffix?: string;
  title?: string;
  question: string;
  chips: string[];
  chipMode?: 'single' | 'multi';
  helpHint?: NonNullable<ProgramStepAction['helpHint']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'micro-reflection', {
    type: 'micro_reflection',
    title: params.title ?? 'Короткий выбор',
    subtitle: 'Выбери вариант или добавь пару слов',
    prompt: params.question,
    chipQuestion: params.question,
    chipOptions: params.chips,
    chipMode: params.chipMode ?? 'single',
    helpHint: params.helpHint,
    completionDelaySeconds: null,
    energy: 1,
    required: true,
  });
}

function aiReflectionAction(params: {
  idSuffix?: string;
  title?: string;
  question: string;
  chips: string[];
  helpHint?: NonNullable<ProgramStepAction['helpHint']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'ai-reflection', {
    type: 'ai_reflection',
    title: params.title ?? 'Короткий разбор',
    subtitle: 'Выбери вариант или добавь пару слов',
    prompt: params.question,
    chipOptions: params.chips,
    helpHint: params.helpHint,
    completionDelaySeconds: null,
    energy: 1,
    required: true,
  });
}

function journalAction(params: {
  idSuffix?: string;
  title?: string;
  subtitle?: string;
  prompt: string;
  journalFormat: 'oneLine' | 'short' | 'structured';
  maxLength: number;
  required?: boolean;
  preparedAnswers?: string[];
  placeholderText?: string;
  helpHint?: NonNullable<ProgramStepAction['helpHint']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'journal', {
    type: 'journal_entry',
    title: params.title ?? 'Запись в дневнике',
    subtitle: params.subtitle ?? 'Запиши коротко, без редактуры',
    prompt: params.prompt,
    journalFormat: params.journalFormat,
    maxLength: params.maxLength,
    preparedAnswers: params.preparedAnswers,
    placeholderText: params.placeholderText,
    helpHint: params.helpHint,
    completionDelaySeconds: null,
    energy: 1,
    required: params.required ?? true,
  });
}

function aiChatAction(params: {
  idSuffix?: string;
  title: string;
  subtitle?: string;
  topicPrompt: string;
  goalHint: string;
  minQualifyingMessages: number;
  minDurationSec: number;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix ?? 'ai-chat', {
    type: 'ai_chat_session',
    title: params.title,
    subtitle: params.subtitle ?? 'Короткий разговор с ассистентом',
    topicPrompt: params.topicPrompt,
    goalHint: params.goalHint,
    minQualifyingMessages: params.minQualifyingMessages,
    minDurationSec: params.minDurationSec,
    completionDelaySeconds: null,
    energy: 3,
    required: true,
  });
}

function ratingScaleAction(params: {
  idSuffix: string;
  title: string;
  subtitle?: string;
  label: string;
  scaleMin: number;
  scaleMax: number;
  splitAroundActionIdSuffix?: string;
}): StepBlueprintAction {
  const isBeforeScale = params.idSuffix.includes('before');
  const isAfterScale = params.idSuffix.includes('after');

  return actionWithId(params.idSuffix, {
    type: 'rating_scale',
    title: params.title,
    subtitle: params.subtitle ?? 'Оцени интенсивность тревоги и напряжения',
    prompt: params.label,
    scaleBeforeLabel: isBeforeScale ? params.label : undefined,
    scaleAfterLabel: isAfterScale ? params.label : undefined,
    scaleMin: params.scaleMin,
    scaleMax: params.scaleMax,
    splitAroundActionIdSuffix: params.splitAroundActionIdSuffix,
    completionDelaySeconds: null,
    energy: 1,
    required: true,
  });
}

function structuredFormAction(params: {
  idSuffix: string;
  title: string;
  subtitle?: string;
  prompt?: string;
  formKind: string;
  fields: NonNullable<ProgramStepAction['fields']>;
  required?: boolean;
  helpHint?: NonNullable<ProgramStepAction['helpHint']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix, {
    type: 'structured_form',
    title: params.title,
    subtitle: params.subtitle ?? 'Заполни связанные поля по порядку',
    prompt: params.prompt,
    formKind: params.formKind,
    fields: params.fields,
    helpHint: params.helpHint,
    completionDelaySeconds: null,
    energy: 2,
    required: params.required ?? true,
  });
}

function guidedStepsAction(params: {
  idSuffix: string;
  title: string;
  subtitle?: string;
  prompt?: string;
  formKind?: string;
  template?: string;
  targetId?: string;
  steps: NonNullable<ProgramStepAction['steps']>;
  required?: boolean;
  helpHint?: NonNullable<ProgramStepAction['helpHint']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix, {
    type: 'guided_steps',
    title: params.title,
    subtitle: params.subtitle ?? 'Отмечай пункты по мере выполнения',
    prompt: params.prompt,
    formKind: params.formKind,
    template: params.template,
    targetId: params.targetId,
    steps: params.steps,
    helpHint: params.helpHint,
    completionDelaySeconds: null,
    energy: 2,
    required: params.required ?? true,
  });
}

function splitReadingParagraphs(value: string | null | undefined) {
  return (value ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function stepIntroAction(blueprint: StepBlueprint): StepBlueprintAction | null {
  if (!blueprint.introText && !blueprint.miniArticle) return null;

  return guidedStepsAction({
    idSuffix: 'intro',
    title: 'Коротко перед шагом',
    subtitle: 'Прочитай и переходи к практике',
    prompt: blueprint.introText,
    formKind: 'step_intro',
    required: false,
    steps: splitReadingParagraphs(blueprint.miniArticle?.body).map(
      (paragraph, index) => ({
        id: `article-${index + 1}`,
        title:
          index === 0
            ? (blueprint.miniArticle?.title ?? 'Коротко о шаге')
            : 'Продолжение',
        text: paragraph,
        required: false,
      })
    ),
  });
}

function weeklyCheckAction(params: {
  idSuffix: string;
  title?: string;
  subtitle?: string;
  prompt?: string;
  placement: 'after_completion' | 'before_final_completion';
  required?: boolean;
  questions?: NonNullable<ProgramStepAction['questions']>;
}): StepBlueprintAction {
  return actionWithId(params.idSuffix, {
    type: 'weekly_check',
    title: params.title ?? 'Короткая проверка',
    subtitle: params.subtitle ?? 'Зафиксируй динамику без оценки себя',
    prompt:
      params.prompt ??
      'Это не экзамен и не показатель успеха. Нужна честная отметка, чтобы дальше выбирать темп бережнее.',
    placement: params.placement,
    questions: params.questions ?? [
      {
        id: 'anxiety_level_last_days',
        type: 'rating_scale',
        question: 'Насколько тревога мешала тебе в последние дни?',
        min: 0,
        max: 10,
        minLabel: 'Почти не мешала',
        maxLabel: 'Очень сильно мешала',
      },
      {
        id: 'main_change',
        type: 'choice',
        question: 'Что стало заметнее за это время? Можно выбрать несколько.',
        mode: 'multiple',
        minSelected: 1,
        exclusiveOptionIds: ['no_change_yet', 'worse'],
        options: [
          { id: 'less_body_tension', label: 'Меньше напряжения в теле' },
          { id: 'notice_thoughts', label: 'Лучше замечаю мысли' },
          { id: 'more_pause', label: 'Чаще получается делать паузу' },
          { id: 'less_avoidance', label: 'Меньше избегаю' },
          { id: 'no_change_yet', label: 'Пока без заметных изменений' },
          { id: 'worse', label: 'Стало тяжелее' },
        ],
      },
      {
        id: 'support_need',
        type: 'choice',
        question: 'Как идут дела на этой неделе?',
        mode: 'single',
        minSelected: 1,
        options: [
          { id: 'better', label: 'Лучше, чем раньше' },
          { id: 'usual', label: 'Похоже на обычное состояние' },
          { id: 'harder', label: 'Тяжелее, чем хотелось бы' },
        ],
      },
    ],
    completionDelaySeconds: null,
    energy: 1,
    required: params.required ?? false,
  });
}

const CALM_TOOLKIT_TECHNIQUE_OPTIONS = [
  {
    id: 'diaphragmatic_breathing',
    label: 'Дыхание животом',
    helperText: 'Мягко замедлить тело через движение живота.',
  },
  {
    id: 'breathing_4_7_8',
    label: 'Дыхание 4-7-8',
    helperText: 'Длинный выдох, когда нужно быстро снизить напряжение.',
  },
  {
    id: 'breathing_4_6',
    label: 'Дыхание 4-6',
    helperText: 'Удлинённый выдох перед разбором тревожной мысли.',
  },
  {
    id: 'box_breathing',
    label: 'Квадратное дыхание',
    helperText: 'Ровный ритм, чтобы собрать внимание перед паузой.',
  },
  {
    id: 'grounding_5_4_3_2_1',
    label: 'Заземление 5-4-3-2-1',
    helperText: 'Вернуть фокус в настоящее через органы чувств.',
  },
  {
    id: 'tension_release',
    label: 'Снятие напряжения в теле',
    helperText: 'Напрячь и отпустить мышцы, чтобы заметить разницу.',
  },
  {
    id: 'stop_pause',
    label: 'СТОП-пауза',
    helperText: 'Вставить короткую паузу между тревогой и реакцией.',
  },
  {
    id: 'thought_card',
    label: 'Карточка тревожной мысли',
    helperText: 'Разложить ситуацию, эмоцию и мысль по отдельности.',
  },
  {
    id: 'thought_dump',
    label: 'Выгрузка мыслей',
    helperText: 'Вынести шум из головы в текст без редактуры.',
  },
  {
    id: 'prediction_vs_fact',
    label: 'Проверка прогноза фактами',
    helperText: 'Сравнить ожидание тревоги с тем, что произошло.',
  },
  {
    id: 'behavioral_experiment',
    label: 'Маленький поведенческий эксперимент',
    helperText: 'Проверить тревожный прогноз безопасным действием.',
  },
  {
    id: 'small_steps_ladder',
    label: 'Лестница маленьких шагов',
    helperText: 'Подойти к трудной ситуации постепенно.',
  },
  {
    id: 'task_plan',
    label: 'План задачи по шагам',
    helperText: 'Сузить проблему до первого понятного действия.',
  },
  {
    id: 'ai_chat',
    label: 'Чат с ассистентом',
    helperText: 'Разобрать ситуацию и собрать следующий шаг в разговоре.',
  },
  {
    id: 'not_clear_yet',
    label: 'Пока не понял, что подошло',
    helperText: 'Нормальный вариант, если эффект техник ещё неясен.',
  },
] satisfies NonNullable<
  NonNullable<ProgramStepAction['fields']>[number]['options']
>;

function makeChoiceOptions(labels: string[]) {
  return labels.map((label, index) => ({
    id: `option_${index + 1}`,
    label,
  }));
}

const SELF_KINDNESS_WEEKLY_CHECK_QUESTIONS = [
  {
    id: 'self_criticism_impact_last_days',
    type: 'rating_scale',
    question: 'Насколько самокритика мешала тебе в последние дни?',
    min: 0,
    max: 10,
    minLabel: 'Почти не мешала',
    maxLabel: 'Очень сильно мешала',
  },
  {
    id: 'main_shift',
    type: 'choice',
    question: 'Что ты {стал|стала} замечать чаще? Можно выбрать несколько.',
    mode: 'multiple',
    minSelected: 1,
    exclusiveOptionIds: ['no_change_yet', 'worse'],
    options: [
      { id: 'notice_critic', label: 'Быстрее замечаю критика' },
      { id: 'more_pause', label: 'Чаще появляется пауза' },
      {
        id: 'kinder_tone',
        label: 'Иногда получается мягче говорить с собой',
      },
      { id: 'small_action', label: 'Проще выбрать маленькое действие' },
      { id: 'no_change_yet', label: 'Пока без заметных изменений' },
      { id: 'worse', label: 'Стало тяжелее' },
    ],
  },
  {
    // Вопрос о текущем состоянии без обещания адаптировать следующие шаги.
    // Оставляем id опций better/usual/harder - они едины с остальными садами
    // и попадают в SUPPORT_NEED_LABELS при сборке отчёта.
    id: 'support_need',
    type: 'choice',
    question: 'Как ты сейчас?',
    mode: 'single',
    minSelected: 1,
    options: [
      { id: 'better', label: 'Стало чуть легче' },
      { id: 'usual', label: 'Пока без изменений' },
      { id: 'harder', label: 'Стало тяжелее' },
    ],
  },
] satisfies NonNullable<ProgramStepAction['questions']>;

function selfKindnessWeeklyCheckAction(params: {
  idSuffix: string;
  title: string;
  placement: 'after_completion' | 'before_final_completion';
  prompt: string;
}) {
  return weeklyCheckAction({
    ...params,
    questions: SELF_KINDNESS_WEEKLY_CHECK_QUESTIONS,
  });
}

// Blueprints конкретных Садов. Ключ - programs.slug. Логика ensureProgram() читает массив
// по slug; добавление нового Сада = новый ключ в этой map плюс запись в PROGRAM_BOOTSTRAP.
// Bootstrap-программа `calm_anxiety_30` остаётся вариантом по умолчанию.
// Полный контент 30 шагов программы «Спокойствие» - runtime-версия v5 из
// `.docs/content/program_calm_anxiety_30_v5.md`. Каждый шаг задаёт explicit
// actions[]: mood_checkin больше не добавляется шаблонно, а КПТ-смысл шага
// хранится внутри UI-ориентированных action payload'ов, не в новых top-level типах.
const STEP_BLUEPRINTS_CALM_ANXIETY_30: StepBlueprint[] = [
  {
    title: 'Начинаем спокойно',
    subtitle: 'Понимаем маршрут и выбираем главный фокус без спешки.',
    nextHint: 'Дальше разберём, как тревога проявляется сейчас.',
    introText:
      'Добро пожаловать в программу «Спокойствие». Здесь не нужно проходить всё идеально или быстро.\n\nМы будем короткими шагами понимать тревогу и собирать навыки для обычной жизни: дыхание, внимание, работа с мыслями и маленькие действия вместо избегания.\n\nСегодня достаточно просто начать и отметить, с каким состоянием ты {пришёл|пришла}.',
    miniArticle: {
      title: 'Что будет в этой программе',
      body: 'Тревога часто выглядит хаотичной: мысли бегут, тело напрягается, хочется срочно убрать неприятное чувство. Но обычно это цикл из тела, мыслей, внимания и поведения.\n\nВ программе мы сначала разберёмся, как работает тревога, затем попробуем телесные техники, запись мыслей, проверку прогнозов и маленькие действия вместо избегания.\n\nЭто не психотерапия и не диагностика. Это программа самопомощи, которая помогает лучше понимать себя и спокойнее реагировать в тревожные моменты.',
    },
    durationMin: 6,
    actions: [
      guidedStepsAction({
        idSuffix: 'baseline-assessment',
        title: 'Стартовая оценка тревоги',
        subtitle: 'Можно пройти или пропустить',
        formKind: 'assessment_prompt',
        template: 'program_baseline',
        targetId: 'anxiety_check_v1',
        required: false,
        steps: [
          {
            id: 'assessment-intro',
            title: 'Перед началом сада',
            text: 'Короткий опросник поможет понять, с какой точки ты начинаешь, и в конце сравнить динамику. Это не диагноз и не оценка того, насколько всё плохо.',
            required: false,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'current-state',
        title: 'Отметка состояния',
        question:
          'С чего ты сейчас начинаешь? Выбери один вариант, который ближе всего к твоему состоянию прямо в эту минуту. Это не оценка и не задание, просто мягкий старт, чтобы заметить, с чем ты {пришёл|пришла}.',
        chips: [
          'Очень тяжело',
          'Непросто',
          'Нормально',
          'Спокойнее обычного',
          'Хорошо',
        ],
      }),
      breathingAction({
        title: 'Первое дыхание',
        subtitle: 'Три минуты мягкого замедления',
        template: 'diaphragmatic',
        durationSeconds: 180,
        prompt:
          'Будем дышать животом, а не грудью. Когда живот мягко поднимается на вдохе и опускается на выдохе, тело быстрее успокаивается. Расположись, как удобно, положи ладонь на живот и просто замечай её движение. Делать что-то особенное не нужно.',
      }),
      microReflectionAction({
        idSuffix: 'garden-intention',
        title: 'Главный фокус программы',
        question:
          'Что тебе сейчас важнее всего получить от этой программы? Выбери один вариант или допиши свой.',
        chips: [
          'Понять тревогу',
          'Успокаивать тело',
          'Разбираться с мыслями',
          'Меньше избегать',
          'Получить опору на каждый день',
        ],
      }),
    ],
  },
  {
    title: 'Моя тревога сейчас',
    subtitle: 'Фиксируем стартовую точку: тело, мысли и влияние на день.',
    nextHint: 'Дальше отделим тревогу от опасности.',
    introText:
      'Перед тем как выбирать техники, важно понять исходную точку. Тревога бывает разной: у кого-то она больше в теле, у кого-то в мыслях, у кого-то в избегании дел и разговоров.\n\nСейчас мы коротко отметим, как тревога влияет на твою жизнь. Это не диагноз и не тест на «нормальность». Это способ увидеть, с чем именно стоит работать.',
    miniArticle: {
      title: 'Зачем оценивать тревогу',
      body: 'Тревога важна не только по силе ощущения. Иногда человек говорит: «Мне просто тревожно», но при этом плохо спит, откладывает важные дела, избегает людей или постоянно проверяет, не случилось ли что-то плохое.\n\nПоэтому полезно смотреть не только на вопрос «насколько мне тревожно», но и на другие признаки: как тревога влияет на сон, работу, учёбу, общение, тело и способность отдыхать.\n\nТакая проверка помогает не драматизировать состояние, но и не обесценивать его. Если тревога сильно мешает жить, нужна не сила воли, а более внимательная поддержка. Приложение может помочь с базовыми навыками, но при выраженном ухудшении лучше подключать живого специалиста.',
    },
    durationMin: 8,
    actions: [
      groundingAction({
        estimatedDurationSeconds: 180,
        prompt:
          'Это техника заземления 5-4-3-2-1. Когда внимание уходит в прогнозы и тревожные мысли, чувства возвращают его в настоящее. По очереди заметь пять объектов, которые видишь, четыре звука, три ощущения в теле, два запаха и один вкус. Не оценивай, просто называй.',
      }),
      aiReflectionAction({
        idSuffix: 'anxiety-areas',
        title: 'Где тревога проявляется',
        question:
          'Где тревога сейчас проявляется сильнее всего? Можно выбрать несколько вариантов.',
        chips: [
          'В теле',
          'В мыслях',
          'Во сне',
          'В работе или учёбе',
          'В общении',
          'В избегании дел',
        ],
      }),
      ratingScaleAction({
        idSuffix: 'anxiety-impact',
        title: 'Насколько тревога мешает?',
        label: 'Насколько тревога мешала тебе в последние дни?',
        scaleMin: 0,
        scaleMax: 10,
      }),
      microReflectionAction({
        idSuffix: 'risk-flags',
        title: 'Проверка состояния',
        question:
          'Есть ли сейчас что-то из этого? Можно выбрать несколько вариантов.',
        chips: [
          'Нужен живой человек рядом',
          'Почти не сплю',
          'Трудно есть',
          'Частые сильные приступы',
          'Трудно выполнять обычные дела',
          'Ничего из этого',
        ],
        chipMode: 'multi',
      }),
      aiChatAction({
        idSuffix: 'first-chat',
        title: 'Поговорить о своей тревоге',
        topicPrompt:
          'Ты только что {отметил|отметила}, где тревога даёт о себе знать сильнее всего и как она мешает в последние дни. Расскажи про одну такую ситуацию своими словами: что в ней труднее всего? Я рядом, чтобы помочь посмотреть на неё спокойнее, без оценок.',
        goalHint:
          'Дать пользователю первый тёплый опыт разговора с ассистентом на старте программы. Помочь назвать одну конкретную тревожную ситуацию и заметить в ней что-то новое. Без диагнозов, обещаний и клише. При любых признаках кризиса или риска - мягко направить к живой или экстренной поддержке.',
        minQualifyingMessages: 2,
        minDurationSec: 90,
      }),
    ],
  },
  {
    title: 'Что такое тревога',
    subtitle: 'Смотрим на тревогу как на защитную систему, а не слабость.',
    nextHint: 'Дальше увидим, как тревога раскручивается по кругу.',
    introText:
      'Тревога неприятна, но она не появляется просто так. Это часть защитной системы, которая пытается заранее заметить угрозу и подготовить тебя к действию.\n\nСложность начинается, когда сигнализация включается слишком часто, слишком громко или не выключается после того, как напряжение уже не помогает.',
    miniArticle: {
      title: 'Тревога как сигнализация',
      body: 'Тревога - это реакция организма на возможную угрозу. Она помогает быть внимательнее, быстрее реагировать и готовиться к важным событиям. В умеренном количестве тревога полезна: она может напомнить подготовиться к встрече, проверить важные детали или не игнорировать риск.\n\nНо тревожная система иногда работает слишком чувствительно. Тогда мозг воспринимает неопределённость, ошибку, задержку ответа, телесное ощущение или сложный разговор как признак опасности. Тело напрягается, мысли начинают искать худший сценарий, а поведение тянет к избеганию или проверкам.\n\nЭто не означает, что с тобой что-то «не так». Это означает, что защитная система пытается помочь, но делает это слишком резко. В этой программе мы не будем спорить с тревогой или силой выключать её. Мы будем учиться замечать сигнал, понимать его и выбирать более полезное действие.',
    },
    durationMin: 7,
    actions: [
      breathingAction({
        title: 'Ровный ритм',
        template: 'equal-5-5',
        durationSeconds: 180,
        prompt:
          'Дыши спокойно: вдох 5, выдох 5. Если мысли отвлекают, ничего страшного. Просто мягко возвращай внимание к дыханию.',
      }),
      microReflectionAction({
        idSuffix: 'reframe',
        title: 'Новая формула о тревоге',
        question:
          'В когнитивной терапии важно заметить: мысль - это ещё не приказ к действию. Уже одно это помогает ослабить её власть. Какое описание тревоги сейчас тебе ближе?',
        chips: [
          'Это сигнал защиты',
          'Это ощущение, а не доказательство',
          'Это телесная реакция',
          'Это мысль, а не приказ',
          'Пока не знаю',
        ],
      }),
      journalAction({
        prompt:
          'Запиши короткую фразу, к которой сможешь возвращаться в тревожный момент. Это твоя личная формула, она работает именно потому, что сказана твоими словами.',
        placeholderText:
          'Например: «Тревога это сигнал, а не приказ. Я могу сделать паузу и выбрать следующий шаг».',
        journalFormat: 'short',
        maxLength: 500,
        required: false,
      }),
    ],
  },
  {
    title: 'Как тревога раскручивается',
    subtitle: 'Разбираем цикл: триггер, тело, мысль, действие и избегание.',
    nextHint: 'Дальше обозначим границы приложения и живой помощи.',
    introText:
      'Тревога редко состоит только из одной мысли или одного ощущения. Обычно она раскручивается по кругу: что-то запускает реакцию, тело напрягается, мысль пугает сильнее, а поведение пытается быстро снять напряжение.\n\nСегодня мы найдём этот круг на простом примере.',
    miniArticle: {
      title: 'Цикл тревоги',
      body: 'У тревоги часто есть повторяющийся цикл. Сначала появляется триггер: сообщение без ответа, предстоящий разговор, странное ощущение в теле, ошибка, неопределённость или воспоминание. Затем тело включает режим готовности: сердцебиение, напряжение, жар, дрожь, ком в горле или тяжесть в груди.\n\nПосле этого мозг пытается объяснить, что происходит. Если он выбирает самый пугающий вариант, тревога усиливается: «я не справлюсь», «со мной что-то не так», «сейчас случится плохое». Затем появляется действие: избежать, проверить, попросить заверения, отложить, замереть или начать мысленно прокручивать ситуацию.\n\nПроблема в том, что такое действие часто даёт облегчение на несколько минут, но закрепляет цикл. Мозг запоминает: «я {спасся|спаслась} только потому, что {избежал|избежала} или {проверил|проверила}». В этой программе мы будем постепенно учиться разрывать цикл в разных местах.',
    },
    durationMin: 10,
    actions: [
      groundingAction({
        estimatedDurationSeconds: 240,
        prompt:
          'Короткое заземление помогает перевести внимание из тревожного потока в настоящее, чтобы дальше спокойнее разобрать схему. По очереди отметь пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус. Делай в своём темпе.',
      }),
      meditationAction({
        title: 'Наблюдение за реакцией',
        template: 'observe-reaction',
        durationSeconds: 180,
        prompt:
          'Закрой глаза или смотри мягко в одну точку. Замечай, что происходит в теле и мыслях, когда вспоминаешь свою тревожную ситуацию. Не пытайся ничего менять, просто отмечай.',
      }),
      journalAction({
        title: 'Цикл тревоги',
        subtitle: 'Запиши по пунктам, без идеальной формулировки',
        prompt:
          'Коротко разложи одну ситуацию:\n1) триггер,\n2) тело,\n3) мысль,\n4) действие или избегание.',
        journalFormat: 'structured',
        maxLength: 1200,
        helpHint: {
          title: 'Как это разложить',
          description:
            'Выбери одну реальную ситуацию из последних дней. Дальше распиши её по четырём пунктам. Не нужно «правильно». Даже одна короткая фраза на каждый пункт уже работает.',
          examples: [
            'Триггер: то, с чего всё началось. Например, прочитал сообщение от начальника.',
            'Тело: что почувствовал физически. Например, сжалось в груди, вспотели ладони.',
            'Мысль: какая фраза в голове крутилась. Например, «сейчас опять наругают».',
            'Действие или избегание: что в итоге {сделал|сделала} или, наоборот, {отложил|отложила}. Например, {перечитал|перечитала} сообщение 10 раз вместо ответа.',
          ],
        },
      }),
    ],
  },
  {
    title: 'Когда нужна живая помощь',
    subtitle:
      'Задаём безопасные границы: приложение помогает, но не заменяет человека.',
    nextHint: 'Дальше перейдём к телесным сигналам тревоги.',
    introText:
      'Самопомощь полезна, когда состояние позволяет читать, пробовать практики и делать маленькие шаги. Но бывают ситуации, где лучше не оставаться {одному|одной} с приложением.\n\nЭтот шаг нужен не для того, чтобы напугать. Он нужен, чтобы у тебя был ясный и спокойный план, если станет слишком тяжело.',
    miniArticle: {
      title: 'Когда стоит обратиться за поддержкой',
      body: 'Тревога бывает разной по силе. Иногда достаточно отдыха, разговора, дыхания, записи мыслей или маленького действия. Но если тревога сильно мешает спать, есть, работать, учиться, общаться или выходить из дома, стоит подключить живую поддержку.\n\nОсобенно важно обратиться за срочной помощью, если становится небезопасно оставаться {одному|одной}, есть ощущение потери контроля, сильная паника, опасное поведение, длительная бессонница или состояние, в котором трудно заботиться о себе.\n\nОбращение за помощью не означает, что ты не {справился|справилась}. Это означает, что ты выбираешь более надёжный уровень поддержки. Приложение может быть рядом как инструмент, но живой человек, специалист, близкий или экстренная служба, важен там, где нужна безопасность.',
    },
    durationMin: 8,
    actions: [
      ratingScaleAction({
        idSuffix: 'before-breathing',
        title: 'До дыхания',
        label: 'Насколько тяжело сейчас?',
        scaleMin: 0,
        scaleMax: 10,
        splitAroundActionIdSuffix: 'breathing',
      }),
      breathingAction({
        title: 'Спокойная пауза',
        template: 'long-exhale-4-6',
        durationSeconds: 240,
        prompt:
          'Когда выдох длиннее вдоха, тело получает понятный сигнал «можно расслабиться». Вдох на четыре, выдох на шесть. Дыши без усилия, ровный ритм важнее глубины.',
      }),
      ratingScaleAction({
        idSuffix: 'after-breathing',
        title: 'После дыхания',
        label: 'Насколько тяжело сейчас после паузы?',
        scaleMin: 0,
        scaleMax: 10,
        splitAroundActionIdSuffix: 'breathing',
      }),
      microReflectionAction({
        idSuffix: 'support-person',
        title: 'Карта опор на трудный день',
        question:
          'В трудный день бывает сложно быстро понять, на кого или на что можно опереться. Давай заранее отметим варианты, которые могут поддержать тебя, если станет тяжело. Можно выбрать несколько вариантов.',
        chips: [
          'Близкий человек',
          'Психолог',
          'Врач',
          'Горячая линия',
          'Пока не знаю',
        ],
        chipMode: 'multi',
      }),
    ],
  },
  {
    title: 'Где тревога живёт в теле',
    subtitle: 'Учимся описывать ощущения нейтрально, без пугающих выводов.',
    nextHint: 'Дальше потренируем длинный выдох.',
    introText:
      'Тревога часто начинается в теле раньше, чем мы успеваем её осознать. Напряжение в плечах, сжатая челюсть, сбившееся дыхание или ком в горле могут быть первыми сигналами.\n\nСегодня мы не будем пытаться срочно убрать ощущения. Сначала научимся их спокойно замечать.',
    miniArticle: {
      title: 'Почему тревога ощущается телом',
      body: 'Когда мозг замечает возможную угрозу, тело готовится действовать. Мышцы напрягаются, дыхание меняется, сердце может биться быстрее, внимание сужается. Это древняя защитная реакция, которая помогает быстрее реагировать.\n\nНо в обычной жизни такая реакция часто включается не только при реальной опасности. Её может запустить сообщение, дедлайн, разговор, неопределённость, воспоминание или собственная мысль. Из-за этого телесные ощущения могут пугать и усиливать тревогу: «почему так бьётся сердце?», «почему мне трудно дышать?», «а вдруг со мной что-то не так?».\n\nЗадача этого шага - заметить телесные сигналы без борьбы. Чем лучше ты узнаешь свои первые признаки тревоги, тем раньше сможешь выбрать подходящую практику.\n\nВажно: если ощущение новое, резкое, необычно сильное, связано с болью в груди, обмороком, выраженной одышкой или другим риском для здоровья, не списывай его на тревогу автоматически. В такой ситуации лучше обратиться за медицинской помощью.',
    },
    durationMin: 8,
    actions: [
      meditationAction({
        title: 'Сканирование тела',
        template: 'body-scan-soft',
        durationSeconds: 180,
        prompt:
          'Медленно переводи внимание от макушки к стопам. Если замечаешь напряжение, тяжесть или пустоту, просто отметь это.',
      }),
      thoughtDumpAction({
        title: 'Свободная выгрузка телесных сигналов',
        subtitle: 'Пиши потоком, без структуры и оценок',
        prompt:
          'Выгрузка нужна, чтобы заметить телесные сигналы тревоги в нейтральных словах, без выводов и диагнозов. Опиши, где ощущается, на что похоже, насколько сильно. Пиши потоком, не редактируй и не ищи правильную формулировку, она здесь не важна.',
        estimatedDurationSeconds: 240,
      }),
      journalAction({
        prompt:
          'Выбери одно самое заметное ощущение и опиши его простыми словами: где находится, на что похоже, насколько сильно чувствуется. Не объясняй причину, сейчас важно только заметить.',
        journalFormat: 'short',
        maxLength: 500,
      }),
    ],
  },
  {
    title: 'Длинный выдох',
    subtitle: 'Даём телу простой сигнал замедления через дыхание.',
    nextHint: 'Дальше научимся делать паузу перед автоматической реакцией.',
    introText:
      'Когда тревога включается, дыхание часто становится поверхностным и быстрым. Мы не будем заставлять себя «дышать правильно». Просто попробуем сделать выдох немного длиннее вдоха.\n\nЭто мягкий способ дать телу сигнал: «сейчас можно немного сбавить обороты».',
    miniArticle: null,
    durationMin: 7,
    actions: [
      breathingAction({
        title: 'Дыхание с длинным выдохом',
        template: 'long-exhale-4-6',
        durationSeconds: 240,
        prompt:
          'Когда выдох заметно длиннее вдоха, тело получает сигнал «безопасно, можно замедлиться». Вдох на четыре, выдох на шесть. Не старайся делать правильно, ритм важнее глубины. Если сбиваешься, спокойно возвращайся к счёту.',
      }),
      microReflectionAction({
        idSuffix: 'after-practice',
        title: 'Что осталось в теле после практики',
        question:
          'Замечать тонкие сдвиги после практики важно: так мы тренируемся видеть, что помогает, даже если перемена маленькая. Что ты {заметил|заметила} в теле прямо сейчас?',
        chips: [
          'Стало тише в теле',
          'Чуть легче дышать',
          'Пока без изменений',
          'Стало сложнее',
        ],
      }),
      weeklyCheckAction({
        idSuffix: 'weekly-check-1',
        placement: 'after_completion',
        required: true,
      }),
    ],
  },
  {
    title: 'Пауза «Стоп»',
    subtitle: 'Тренируем короткий промежуток между тревогой и реакцией.',
    nextHint: 'Дальше вернём внимание в настоящий момент.',
    introText:
      'Тревога часто толкает к быстрому действию: проверить, отменить, написать, спрятаться, отложить или прокрутить ситуацию ещё десять раз.\n\nПауза «Стоп» не запрещает действовать. Она даёт несколько секунд, чтобы выбрать действие осознаннее.',
    miniArticle: {
      title: 'Зачем нужна пауза',
      body: 'Когда тревога сильная, мозг стремится быстрее снять напряжение. Поэтому первое действие часто направлено не на решение ситуации, а на срочное облегчение: избежать разговора, проверить сообщение, попросить заверения, отложить задачу или начать мысленно разбирать все варианты.\n\nИногда это действительно помогает на пару минут. Но если так происходит постоянно, тревожный круг закрепляется. Мозг запоминает: «мне стало легче только потому, что я {избежал|избежала} или {проверил|проверила}». В следующий раз тревога включается быстрее.\n\nПауза «Стоп» помогает вставить небольшой промежуток между тревогой и реакцией. В этом промежутке появляется выбор: продолжить автоматически или сделать шаг, который действительно помогает.',
    },
    durationMin: 9,
    actions: [
      breathingAction({
        title: 'Подготовка к паузе',
        template: 'box-breathing',
        durationSeconds: 180,
        prompt:
          'Это простое дыхание «по квадрату»: четыре равные части. Оно помогает быстро успокоить тело и собрать внимание, поэтому его используют даже в моменты сильного стресса. Вдох на четыре счёта, пауза на четыре, выдох на четыре, снова пауза на четыре. Это короткая настройка перед практикой «Стоп».',
      }),
      guidedStepsAction({
        idSuffix: 'stop-practice',
        title: 'Практика «Стоп»',
        prompt:
          'Это короткая пауза из четырёх простых действий. Её цель не в том, чтобы выключить тревогу, а в том, чтобы добавить несколько секунд между импульсом и поступком. Пройди пункты по очереди и отмечай каждый после выполнения.',
        helpHint: {
          title: 'Когда использовать',
          description:
            'Техника «Стоп» подходит, когда хочется быстро сделать что-то на автомате: проверить, отменить, ответить срочно или отложить дело.\n\nСмысл не в идеальном выполнении. Важно дать себе несколько секунд, чтобы выбрать действие осознаннее.',
          examples: [
            'Подходит, когда заметил желание быстро отреагировать.',
            'Можно сделать за 30-60 секунд, даже на ходу.',
            'Не нужно проходить идеально. Даже одна короткая пауза уже полезна.',
          ],
        },
        steps: [
          {
            id: 'stop',
            title: 'Остановись',
            text: 'На несколько секунд прекрати текущее действие. Не отвечай, не открывай, не проверяй. Просто заметь: появилась тревога или сильный импульс что-то сделать.',
          },
          {
            id: 'breathe',
            title: 'Сделай вдох',
            text: 'Сделай один спокойный вдох и медленный выдох. Не нужно полностью успокаиваться. Эта короткая пауза помогает немного замедлиться перед следующим действием.',
          },
          {
            id: 'name',
            title: 'Назови, что происходит',
            text: 'Заметь, что сейчас сильнее всего: ощущение в теле, мысль или чувство. Назови это одним-двумя словами, без оценки: «напряжение в груди», «страх ошибки», «злость».',
          },
          {
            id: 'choose',
            title: 'Выбери действие',
            text: 'Спроси себя: «Что сейчас будет для меня полезнее?» Это может быть маленький шаг по делу, ответ позже или пауза без действия. Главное, чтобы это был выбор, а не автоматическая реакция.',
          },
        ],
      }),
      aiChatAction({
        title: 'Разобрать реакцию',
        topicPrompt:
          'Вспомни одну недавнюю ситуацию, где тревога подтолкнула тебя к быстрой реакции. Разбери её и выбери более осознанный следующий шаг после паузы «Стоп».',
        goalHint: 'Сформулировать один конкретный следующий шаг после паузы.',
        minDurationSec: 120,
        minQualifyingMessages: 2,
      }),
      microReflectionAction({
        idSuffix: 'stop-transfer',
        title: 'Перенос в день',
        question:
          'Чтобы навык закрепился, мозгу важно заранее представить ситуацию, где его можно применить. Выбери один реальный момент сегодняшнего дня, где попробуешь паузу «Стоп». Достаточно одного, без сверхнагрузки.',
        chips: [
          'Перед проверкой',
          'Перед сообщением',
          'Перед отказом',
          'Перед откладыванием',
          'Пока просто замечу',
        ],
      }),
    ],
  },
  {
    title: 'Вернуться в настоящий момент',
    subtitle: 'Используем 5-4-3-2-1, чтобы внимание не застревало в прогнозах.',
    nextHint: 'Дальше отпустим лишнее мышечное напряжение.',
    introText:
      'Тревога часто уносит внимание в будущее: «а вдруг», «что если», «а если не получится». Заземление помогает мягко вернуть часть внимания в то, что происходит прямо сейчас.\n\nМы будем использовать органы чувств: зрение, слух, прикосновение и дыхание.',
    miniArticle: null,
    durationMin: 6,
    actions: [
      groundingAction({
        estimatedDurationSeconds: 240,
        prompt:
          'Это простая техника заземления. Её часто используют при тревоге и панике, потому что она быстро переключает внимание из тревожных мыслей в то, что прямо перед тобой. По очереди называй пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус. Можно вслух или про себя.',
      }),
      microReflectionAction({
        idSuffix: 'senses',
        title: 'Какой канал помог сильнее всего?',
        question:
          'У каждого свой «якорь» в настоящем. У кого-то это зрение, у кого-то опора стопами в пол. Замечать, что работает лично у тебя, помогает быстрее возвращаться к практике в нужный момент. Какой канал помог сильнее всего?',
        chips: [
          'Зрение',
          'Слух',
          'Осязание',
          'Запах',
          'Вкус',
          'Опора ног',
          'Пока не понял',
        ],
        chipMode: 'multi',
      }),
      journalAction({
        prompt:
          'Запиши один конкретный предмет или звук, который помог вернуться в настоящее. Это станет твоей личной зацепкой в следующий раз.',
        placeholderText:
          'Например: оранжевая чашка на столе, шум вентилятора, шершавая стена.',
        journalFormat: 'oneLine',
        maxLength: 160,
        required: false,
      }),
    ],
  },
  {
    title: 'Отпустить лишнее напряжение',
    subtitle: 'Снимаем часть мышечного зажима, не требуя полного спокойствия.',
    nextHint: 'Дальше начнём работать с тревожными мыслями.',
    introText:
      'При тревоге мышцы часто работают так, будто нужно срочно защищаться: плечи поднимаются, челюсть сжимается, руки напрягаются.\n\nСегодня мы попробуем короткую практику: сначала заметить напряжение, потом мягко отпустить его.',
    miniArticle: null,
    durationMin: 7,
    actions: [
      tensionAction({
        title: 'Снятие напряжения',
        durationSeconds: 300,
        prompt:
          'Это техника постепенного расслабления мышц, её придумал американский врач Эдмунд Джейкобсон. Идея простая: ненадолго напрягаешь одну группу мышц, потом отпускаешь и замечаешь разницу. После нескольких таких циклов тело само переходит в более расслабленное состояние, и тревожный фон становится тише. Делай по подсказке, силу напряжения держи комфортной.',
      }),
      microReflectionAction({
        idSuffix: 'body-result',
        title: 'Где появилось чуть больше свободы',
        question:
          'Снятие зажима редко чувствуется сразу везде, чаще как маленькое освобождение в одной зоне. Замечать это место полезно: при стрессе оно подскажет, куда возвращать внимание. Где сейчас чуть свободнее?',
        chips: [
          'Плечи',
          'Челюсть',
          'Руки',
          'Грудь',
          'Живот',
          'Нигде пока',
          'Стало заметнее напряжение',
        ],
        chipMode: 'multi',
      }),
      journalAction({
        prompt:
          'Запиши один телесный сигнал, который ты {заметил|заметила} сегодня. Это может быть зажим, тепло, тяжесть или, наоборот, ощущение лёгкости.',
        placeholderText:
          'Например: к вечеру челюсть сжимается, особенно после звонков.',
        journalFormat: 'oneLine',
        maxLength: 160,
        required: false,
      }),
    ],
  },
  {
    title: 'Поймать тревожную мысль',
    subtitle:
      'Учимся замечать фразу в голове до того, как она станет приказом.',
    nextHint: 'Дальше разложим ситуацию по карточке мысли.',
    introText:
      'Тревога усиливается не только из-за самой ситуации, но и из-за того, как мозг её объясняет. Иногда мысль появляется так быстро, что кажется фактом.\n\nСегодня мы потренируемся ловить тревожную мысль и отделять её от реальности.',
    miniArticle: {
      title: 'Автоматические мысли',
      body: 'Автоматические мысли - это быстрые фразы или образы, которые появляются почти мгновенно. Например: «я не справлюсь», «они подумают плохо», «это закончится ужасно», «со мной что-то не так», «я {должен|должна} срочно всё проверить».\n\nТакие мысли могут звучать убедительно, потому что приходят вместе с сильными эмоциями и телесными ощущениями. Но сила ощущения не делает мысль фактом. Тревожная мысль - это версия мозга о происходящем, а не окончательная правда.\n\nВ когнитивно-поведенческом подходе важно сначала не спорить с мыслью, а заметить её. Когда мысль названа, появляется дистанция: «у меня есть мысль, что я не справлюсь», вместо «я точно не справлюсь».',
    },
    durationMin: 9,
    actions: [
      breathingAction({
        title: 'Выдох перед мыслью',
        template: '4-7-8',
        durationSeconds: 240,
        prompt:
          'Вдох 4, пауза 7, выдох 8. Сохраняй мягкий ритм. Пусть каждый длинный выдох помогает телу немного сбавить напряжение.',
      }),
      thoughtDumpAction({
        title: 'Выгрузка тревожных мыслей',
        subtitle: 'Пиши потоком, без редактуры и оценок',
        prompt:
          'Выпиши все тревожные мысли из одной недавней ситуации. Не нужно красиво формулировать, спорить с ними или искать правильное объяснение. Когда мысли выписаны, с ними легче работать дальше: видно, какие повторяются, а какие звучат особенно сильно.',
        estimatedDurationSeconds: 240,
      }),
      journalAction({
        prompt:
          'Выбери одну тревожную мысль, с которой хочешь работать дальше.',
        placeholderText:
          'Например: «Я точно опозорюсь на встрече» или «Что-то случится с близким, пока меня нет».',
        journalFormat: 'short',
        maxLength: 500,
      }),
    ],
  },
  {
    title: 'Разложить ситуацию по полкам',
    subtitle: 'Заполняем короткую карточку мысли: ситуация, чувство, мысль.',
    nextHint: 'Дальше проверим мысль через факты.',
    introText:
      'Когда тревога внутри головы, она часто выглядит огромной и запутанной. Запись помогает вынести её наружу и увидеть отдельные части: что произошло, что я {почувствовал|почувствовала}, что подумал.\n\nСегодня мы сделаем короткую карточку. Не идеально, а достаточно понятно.',
    miniArticle: {
      title: 'Почему запись помогает',
      body: 'Тревожные мысли часто смешиваются с фактами, эмоциями и телесными ощущениями. Например, «мне страшно» превращается в «точно случится плохое», а «я напряжён» превращается в «я не справлюсь». Пока это всё находится внутри головы, отличить одно от другого сложно.\n\nЗапись мысли помогает разложить ситуацию на части. Сначала мы описываем событие максимально нейтрально. Потом отмечаем эмоцию и её силу. Затем записываем мысль, которая усилила тревогу. Уже на этом этапе состояние иногда становится немного яснее, потому что мозг перестаёт держать всё сразу.\n\nЗапись нужна не для того, чтобы ругать себя за «неправильные» мысли. Она нужна, чтобы увидеть тревожный механизм и позже проверить его более спокойно.',
    },
    durationMin: 10,
    actions: [
      meditationAction({
        title: 'Пять минут наблюдения',
        template: 'thought-observer',
        durationSeconds: 300,
        prompt:
          'Представь мысли как облака, которые проплывают мимо. Не цепляйся за них и не отгоняй, просто замечай и называй про себя: «вот мысль о работе», «вот мысль о теле». Так мы тренируемся не сливаться с мыслями, а наблюдать их со стороны.',
      }),
      structuredFormAction({
        idSuffix: 'thought-record',
        title: 'Карточка мысли',
        formKind: 'thought_record',
        prompt:
          'Сейчас разложим одну сильную тревожную мысль на простые части. Когда видишь ситуацию, чувство, телесное ощущение и саму мысль по отдельности, она перестаёт казаться единым огромным фактом. С каждой строкой будет понятнее, что именно тебя зацепило.',
        helpHint: {
          title: 'Что такое карточка мысли',
          description:
            'Простой инструмент из терапии тревоги. Берём одну автоматическую мысль и раскладываем её на четыре части. Это не задание на правильный ответ, а способ заметить, как тревога устроена изнутри.',
          examples: [
            'Ситуация: где, когда и что именно произошло.',
            'Чувство: одно или два слова, например тревога, обида, стыд.',
            'Ощущение в теле: где именно. Например, давление в груди, ком в горле.',
            'Автоматическая мысль: какая фраза проскочила в голове первой.',
          ],
        },
        fields: [
          {
            id: 'situation',
            label: 'Ситуация',
            maxLength: 300,
            required: true,
          },
          {
            id: 'emotion',
            label: 'Чувство',
            maxLength: 160,
            required: true,
          },
          {
            id: 'body',
            label: 'Ощущение в теле',
            maxLength: 250,
            required: true,
          },
          {
            id: 'thought',
            label: 'Автоматическая мысль',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      journalAction({
        prompt:
          'Если хочется, коротко отметь, что стало яснее после карточки. Иногда уже сам процесс «разложить по полкам» даёт неожиданный сдвиг.',
        placeholderText:
          'Например: «Поняла, что больше всего боюсь не самой ситуации, а реакции людей».',
        journalFormat: 'oneLine',
        maxLength: 160,
        required: false,
      }),
    ],
  },
  {
    title: 'Проверить мысль',
    subtitle: 'Смотрим на доказательства за и против без самокритики.',
    nextHint: 'Дальше отдельно разберём катастрофизацию.',
    introText:
      'Тревожная мысль может звучать как правда, особенно когда тело напряжено. Но мысль - это не приговор. Её можно проверить.\n\nСегодня мы не будем убеждать себя в обратном. Мы просто посмотрим на факты с двух сторон.',
    miniArticle: {
      title: 'Проверка мысли без спора с собой',
      body: 'Работа с тревожной мыслью не означает «думай позитивно». Позитивные фразы часто не помогают, если внутри есть сильное напряжение и мозг им не верит.\n\nБолее полезный путь - проверка. Мы берём одну мысль и спрашиваем: какие факты говорят за неё? Какие факты говорят против? Есть ли другой, более спокойный и реалистичный взгляд? Такой подход помогает не отрицать трудности, но и не принимать самый пугающий сценарий за единственный.\n\nНапример, мысль «я точно провалюсь» можно проверить. Факты за: «я волнуюсь, у меня мало времени». Факты против: «раньше я {справлялся|справлялась}, можно подготовить главное, ошибка не равна провалу». Новая мысль может звучать так: «мне тревожно, но я могу сделать ближайший шаг».',
    },
    durationMin: 10,
    actions: [
      breathingAction({
        title: 'Дыхание перед проверкой',
        template: 'equal-5-5',
        durationSeconds: 240,
        prompt:
          'Вдох на 5 счётов, выдох на 5. Такое ровное дыхание помогает собрать внимание и немного снизить внутренний шум. После него будет легче спокойно посмотреть на факты, не уходя в спор с собой.',
      }),
      structuredFormAction({
        idSuffix: 'evidence-check',
        title: 'Факты за и против',
        formKind: 'evidence_check',
        prompt:
          'Сейчас не нужно доказывать себе, что мысль «неправда». Цель другая: собрать обе стороны, и то, что её поддерживает, и то, что её ослабляет. Из такой пары обычно сама собой рождается более точная и спокойная формулировка.',
        helpHint: {
          title: 'Как это работает',
          description:
            'Берём одну тревожную мысль и смотрим на неё как на гипотезу, а не как на факт. Слева собираем то, что её подтверждает. Справа то, что её ослабляет. Затем формулируем третий вариант, в котором есть обе стороны.',
          examples: [
            'Факты «за»: реальные ситуации, которые подтверждали мысль.',
            'Факты «против»: случаи, когда мысль не сбылась или оказалась преувеличена.',
            'Реалистичная мысль: формулировка, где есть обе стороны. Не «всё будет отлично», а «может быть тяжело, и я смогу справиться».',
          ],
        },
        fields: [
          {
            id: 'thought',
            label: 'Мысль для проверки',
            maxLength: 300,
            required: true,
          },
          {
            id: 'facts_for',
            label: 'Что говорит в пользу этой мысли?',
            maxLength: 500,
            required: true,
          },
          {
            id: 'facts_against',
            label: 'Что говорит против или делает прогноз менее точным?',
            maxLength: 500,
            required: true,
          },
          {
            id: 'balanced_view',
            label: 'Более реалистичная мысль',
            maxLength: 500,
            required: true,
          },
        ],
      }),
      ratingScaleAction({
        idSuffix: 'after-evidence-scale',
        title: 'Изменение состояния',
        label: 'Насколько тревожной кажется мысль после проверки?',
        scaleMin: 0,
        scaleMax: 10,
      }),
    ],
  },
  {
    title: 'Когда мозг рисует катастрофу',
    subtitle: 'Отделяем самый страшный прогноз от более вероятного сценария.',
    nextHint: 'Дальше разделим беспокойство и реальную задачу.',
    introText:
      'Иногда тревога показывает не просто сложный вариант, а самый страшный фильм в голове. Это называется катастрофизацией: мозг быстро прыгает к худшему сценарию.\n\nСегодня мы не будем спорить с этим фильмом. Мы уменьшим его масштаб.',
    miniArticle: {
      title: 'Что такое катастрофизация',
      body: 'Катастрофизация - это привычка тревожного мозга резко переходить к худшему исходу. Например: «если я ошибусь, меня уволят», «если мне не ответили, меня отвергли», «если сердце бьётся быстрее, значит случится что-то опасное», «если я не сделаю идеально, всё рухнет».\n\nТакой прогноз кажется убедительным, потому что тревога усиливает внимание к угрозе и отсекает нейтральные варианты. Мозг как будто говорит: «лучше я заранее напугаю тебя, чтобы ты {подготовился|подготовилась}». Но постоянное ожидание катастрофы истощает и часто мешает действовать.\n\nРабота с катастрофизацией не в том, чтобы сказать «ничего плохого не бывает». Бывает. Но между «всё идеально» и «всё ужасно» обычно есть много промежуточных вариантов. Сегодня мы попробуем найти их.',
    },
    durationMin: 11,
    actions: [
      breathingAction({
        title: 'Дыхание перед прогнозом',
        template: 'physiological-sigh',
        durationSeconds: 240,
        prompt:
          'Это техника «физиологического вздоха». Делаешь два коротких вдоха через нос подряд, а затем один длинный выдох через рот. Двойной вдох наполняет лёгкие, а длинный выдох помогает телу быстрее сбросить напряжение. Полезно перед сложной темой.',
      }),
      aiChatAction({
        title: 'Разобрать катастрофизацию',
        topicPrompt:
          'Найди самый пугающий прогноз, отдели его от более вероятного сценария и составь спокойный план на случай, если будет сложно.',
        goalHint:
          'Сформулировать более реалистичный прогноз и один шаг поддержки.',
        minDurationSec: 180,
        minQualifyingMessages: 3,
      }),
      journalAction({
        prompt:
          'Запиши более вероятный сценарий и один шаг поддержки, если будет сложно. Так у тебя останется готовая опора на тот случай, если тревога снова подсунет самый страшный вариант.',
        placeholderText:
          'Например: «Скорее всего разговор будет неприятным, но не катастрофой. Если станет тяжело, напишу подруге».',
        journalFormat: 'short',
        maxLength: 500,
      }),
      weeklyCheckAction({
        idSuffix: 'weekly-check-2',
        placement: 'after_completion',
        required: true,
      }),
    ],
  },
  {
    title: 'Беспокойство или задача',
    subtitle:
      'Разделяем гипотетическую тревогу и проблему, которую можно решать.',
    nextHint: 'Дальше посмотрим на потребность в полной гарантии.',
    introText:
      'Не всякая тревожная мысль требует решения. Иногда перед нами реальная задача, а иногда - бесконечное «а вдруг», которое нельзя закрыть до конца.\n\nСегодня мы научимся отличать одно от другого.',
    miniArticle: {
      title: 'Два типа тревоги',
      body: 'Есть тревога о реальной задаче. Например: «мне нужно записаться к врачу», «у меня срок по задаче», «нужно поговорить с человеком», «надо оплатить счёт». Здесь помогает план: что сделать первым, когда, с чьей помощью.\n\nА есть гипотетическое беспокойство: «а вдруг всё пойдёт не так», «а вдруг я пожалею», «а вдруг что-то случится», «а вдруг они подумают плохо». Такие мысли часто невозможно решить до конца, потому что они требуют полной гарантии. Чем больше их прокручивать, тем больше тревоги.\n\nПолезный вопрос: «Здесь есть конкретное действие, которое я могу сделать сегодня?» Если да, это задача. Если нет, это беспокойство, и с ним лучше работать через паузу, внимание, дыхание или отложенное время для тревоги.',
    },
    durationMin: 9,
    actions: [
      groundingAction({
        title: 'Опора перед сортировкой',
        estimatedDurationSeconds: 180,
        prompt:
          'Короткое заземление помогает переключиться из тревожного потока в спокойное наблюдение, чтобы дальше честнее разобрать тему. По очереди отметь пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус. Делай в своём темпе.',
      }),
      structuredFormAction({
        idSuffix: 'worry-sorting',
        title: 'Разделить тему',
        formKind: 'worry_sorting',
        prompt:
          'Иногда тревога смешивает в одну кучу два разных типа переживаний: то, на что мы реально можем повлиять, и то, что пока существует только в голове. Сейчас разложим одну тему на части и посмотрим, к какому типу она ближе.',
        helpHint: {
          title: 'Чем отличаются эти типы',
          description:
            'Гипотетическое беспокойство звучит как «а вдруг...», без конкретных фактов и без действий, которые можно сделать прямо сейчас. Реальная задача это что-то, где есть пусть маленький, но понятный следующий шаг. Смешано бывает, когда внутри одной темы есть и то, и другое.',
          examples: [
            'Гипотетическое беспокойство: «А вдруг через год меня уволят».',
            'Реальная задача: «Нужно дописать отчёт до пятницы».',
            'Смешано: «Боюсь сложного разговора с врачом», где есть и тревога, и конкретные действия.',
          ],
        },
        fields: [
          {
            id: 'topic',
            label: 'Тревожная тема',
            helperText:
              'Опиши коротко, что сейчас занимает мысли. Достаточно одной фразы.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'kind',
            label: 'Что это сейчас?',
            type: 'choice',
            mode: 'single',
            minSelected: 1,
            options: [
              { id: 'worry', label: 'Гипотетическое беспокойство' },
              { id: 'problem', label: 'Реальная задача' },
              { id: 'mixed', label: 'Смешано' },
            ],
          },
          {
            id: 'next_step',
            label: 'Если это задача, какой первый маленький шаг?',
            helperText:
              'Действие, которое можно сделать за 5-15 минут, без необходимости разрешить всё сразу.',
            placeholder:
              'Например: написать врачу одно сообщение с вопросом по приёму.',
            maxLength: 300,
            required: false,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'next-approach',
        title: 'Что сейчас поможет',
        question:
          'Понимая, что это за тип темы, легче выбрать честный следующий ход. Не геройский, а такой, на который сейчас реально есть силы. Какой подход тебе ближе?',
        chips: [
          'Отложить беспокойство',
          'Выбрать первый шаг',
          'Собрать факты',
          'Попросить помощи',
          'Пока не ясно',
        ],
      }),
    ],
  },
  {
    title: 'Почему хочется гарантий',
    subtitle: 'Замечаем, как тревога требует абсолютной уверенности.',
    nextHint: 'Дальше потренируем маленькую неопределённость.',
    introText:
      'Тревога часто хочет не просто решения, а полной гарантии: чтобы точно не ошибиться, точно не пожалеть, точно понравиться, точно не столкнуться с неприятным.\n\nПроблема в том, что жизнь редко даёт такие гарантии. Поэтому тревога продолжает требовать ещё одну проверку.',
    miniArticle: {
      title: 'Тревога и неопределённость',
      body: 'Неопределённость - одна из главных подпиток тревоги. Мозг хочет знать заранее: что произойдёт, как отреагируют люди, получится ли, не будет ли ошибки, не станет ли хуже. Когда ответа нет, тревога предлагает проверять, спрашивать, откладывать или продумывать все сценарии.\n\nИногда проверка полезна. Но если она повторяется снова и снова, уверенности становится не больше, а меньше. Мозг привыкает: «я могу двигаться только тогда, когда {уверен|уверена} на сто процентов». Так жизнь сужается.\n\nНавык работы с неопределённостью не означает безрассудство. Это способность делать небольшие безопасные шаги без полной гарантии: отправить простой текст, выбрать один вариант, не перепроверять лишний раз, начать с маленького действия.',
    },
    durationMin: 8,
    actions: [
      breathingAction({
        title: 'Пауза перед гарантией',
        template: 'box-breathing',
        durationSeconds: 240,
        prompt:
          'Дыхание «по квадрату»: четыре счёта на каждую из фаз, то есть вдох, пауза, выдох, снова пауза. Не торопись, это про устойчивое внимание, а не про скорость.',
      }),
      guidedStepsAction({
        idSuffix: 'guarantee-practice',
        title: 'Разобрать требование гарантии',
        prompt:
          'Тревога часто требует: «Сначала убедись на 100%». Эти три шага помогают увидеть это требование со стороны и понять, действительно ли оно тебе сейчас нужно.',
        helpHint: {
          title: 'Зачем эта практика',
          description:
            'Многие тревожные сценарии держатся на ощущении, что нельзя ничего делать, пока не получишь полную уверенность. Это называют «непереносимостью неопределённости». Цель не убрать неопределённость, а заметить, чего именно требует тревога, и найти формулировку, которая позволяет двигаться без 100% ответа.',
        },
        steps: [
          {
            id: 'notice',
            title: 'Заметь, чего хочет тревога',
            text: 'Сформулируй требование тревоги конкретно: «Я не могу действовать, пока не узнаю...». Что именно тревога хочет знать наверняка?',
          },
          {
            id: 'cost',
            title: 'Посмотри, какой ценой даётся уверенность',
            text: 'Пока ты ищешь полную уверенность, что стоит на месте? Дело откладывается, разговор не начинается, напряжение растёт? Просто отметь это без самокритики.',
          },
          {
            id: 'flex',
            title: 'Найди гибкую формулировку',
            text: 'Не нужна стопроцентная гарантия, что всё пройдёт идеально. Спроси себя: «Что мне достаточно знать, чтобы сделать один маленький безопасный шаг?» Часто этого минимума уже хватает.',
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'flex-phrase',
        title: 'Гибкая фраза для шага',
        question:
          'Подбери себе одну фразу, к которой можно возвращаться, когда тревога снова требует «всё узнать наверняка». Хорошая фраза та, в которую ты {сам|сама} веришь хотя бы немного.',
        chips: [
          'Мне не нужна 100% гарантия',
          'Достаточно малого шага',
          'Я могу проверить факт',
          'Можно двигаться осторожно',
          'Пока трудно',
        ],
      }),
    ],
  },
  {
    title: 'Маленькая тренировка неопределённости',
    subtitle: 'Пробуем не проверять одну безопасную мелочь несколько минут.',
    nextHint: 'Дальше перенесём внимание наружу.',
    introText:
      'Сегодня будет маленькая тренировка. Не героизм, не резкий выход из зоны комфорта и не проверка силы воли. Смысл простой: заметить желание проверить что-то ещё раз и не делать это сразу.\n\nТак мозг учится: неопределённость неприятна, но её можно выдерживать.',
    miniArticle: null,
    durationMin: 8,
    actions: [
      meditationAction({
        title: 'Шесть минут наблюдения',
        template: 'uncertainty-observer',
        durationSeconds: 360,
        prompt:
          'Сиди спокойно и замечай, что происходит внутри, когда что-то остаётся непроверенным. Тяга «убедиться» совершенно нормальна, её не нужно ни подавлять, ни сразу выполнять. Достаточно наблюдать, как она появляется, держится и сама ослабевает.',
      }),
      journalAction({
        prompt:
          'Запиши свой тревожный прогноз: что, как тебе кажется, случится, если ты не сделаешь лишнюю проверку?',
        placeholderText:
          'Например: «Если не перечитаю письмо третий раз, оно уйдёт с ошибкой и меня осудят».',
        journalFormat: 'short',
        maxLength: 500,
      }),
      microReflectionAction({
        idSuffix: 'uncertainty-choice',
        title: 'Мягкая тренировка на сегодня',
        question:
          'Маленькая практика без проверки помогает мозгу постепенно привыкать к тому, что неопределённость переносима. Выбери одну тренировку на сегодня, такую, чтобы она была чуть-чуть неудобной, но точно безопасной.',
        chips: [
          'Не перепроверять сообщение',
          'Не гуглить симптом',
          'Не уточнять мнение',
          'Оставить вещь неидеальной',
          'Нужен меньший шаг',
        ],
      }),
    ],
  },
  {
    title: 'Перенести внимание наружу',
    subtitle: 'Снижаем самонаблюдение через внешний фокус.',
    nextHint: 'Дальше разберём внутреннего критика.',
    introText:
      'Тревога часто заставляет постоянно следить за собой: как я выгляжу, как звучит голос, заметно ли напряжение, правильно ли я отвечаю, не странно ли себя веду.\n\nСегодня мы потренируем внешний фокус внимания.',
    miniArticle: {
      title: 'Самонаблюдение и тревога',
      body: 'Когда человек тревожится, внимание часто разворачивается внутрь. Он начинает сканировать тело, голос, выражение лица, ошибки, паузы, чужие реакции. Кажется, что так можно лучше контролировать ситуацию. Но на практике постоянное самонаблюдение усиливает напряжение.\n\nНапример, во время разговора тревожный мозг может следить не за собеседником, а за тем, как звучит собственный голос. Из-за этого сложнее слушать, отвечать и чувствовать контакт. Тревога получает ещё больше материала для анализа.\n\nВнешний фокус - это не игнорирование себя. Это мягкий перенос части внимания наружу: на человека, предметы, звуки, смысл разговора, конкретное действие. Такой навык помогает выйти из внутренней камеры наблюдения.',
    },
    durationMin: 9,
    actions: [
      tensionAction({
        title: 'Снять лишний зажим',
        // По NHS/Cleveland/VA активная форма PMR (напряги-расслабь) для
        // самопомощи - 5-10 минут; полная классическая сессия 15-20 минут
        // относится к терапевтическому формату. На середине программы
        // 6 минут - комфортная доза, не вызывающая усталости от циклов.
        durationSeconds: 360,
        prompt:
          'Это короткая версия техники «напряги и отпусти». По очереди ненадолго напрягаешь одну группу мышц, потом полностью отпускаешь и замечаешь разницу. После нескольких циклов лишний зажим уходит, и появляется внутреннее пространство, в которое легче дышать. Силу напряжения держи комфортной.',
      }),
      guidedStepsAction({
        idSuffix: 'external-focus',
        title: 'Практика внешнего фокуса',
        prompt:
          'Когда тревога усиливается, внимание часто уходит внутрь: к ощущениям, мыслям и тревожным прогнозам. Эта практика помогает мягко вернуть внимание к тому, что происходит вокруг. Пройди три шага по очереди и отмечай каждый после выполнения.',
        helpHint: {
          title: 'Почему это помогает',
          description:
            'При тревоге внимание часто застревает на себе: человек начинает постоянно проверять ощущения, мысли, голос, выражение лица или возможные ошибки. Из-за этого тревога может усиливаться. Когда ты переводишь внимание на конкретные детали вокруг, мозг получает опору в настоящем моменте, и появляется больше пространства для спокойного действия.',
        },
        steps: [
          {
            id: 'look',
            title: 'Найди три детали вокруг',
            text: 'Посмотри по сторонам и заметь три предмета или поверхности. Можно описывать про себя: «синяя кружка», «свет на стене», «трещина в полу». Главное - что-то конкретное снаружи, а не общая обстановка.',
          },
          {
            id: 'listen',
            title: 'Найди два звука',
            text: 'Послушай и выдели два разных звука - голоса, шум машин, гудение техники, своё дыхание. Не оценивай их, не пытайся объяснить - просто отметь, что они есть.',
          },
          {
            id: 'act',
            title: 'Сделай одно маленькое действие',
            text: 'Любое физическое движение, которое требует внимания: переложи предмет, налей воды, открой окно, напиши одну строку. Это «заземляет» внимание в теле и в моменте.',
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'external-result',
        question:
          'Что помогло выйти из самонаблюдения? Можно выбрать несколько вариантов.',
        chips: [
          'Детали вокруг',
          'Звуки',
          'Движение',
          'Опора тела',
          'Ничего пока',
          'Стало чуть легче',
        ],
        chipMode: 'multi',
      }),
      journalAction({
        prompt:
          'Можно записать, где ты чаще всего начинаешь слишком внимательно отслеживать себя.',
        journalFormat: 'short',
        maxLength: 500,
        required: false,
      }),
    ],
  },
  {
    title: 'Узнать внутреннего критика',
    subtitle: 'Отделяем факт от жёсткой оценки себя.',
    nextHint: 'Дальше соберём бережную опору.',
    introText:
      'Иногда тревогу усиливает не сама ситуация, а то, как мы говорим с собой внутри. Ошибка превращается в «я {ужасный|ужасная}», пауза в разговоре - в «я {странный|странная}», усталость - в «я {слабый|слабая}».\n\nСегодня мы отделим факт от самокритики.',
    miniArticle: {
      title: 'Внутренний критик',
      body: 'Внутренний критик часто звучит как жёсткий комментатор: «ты опять всё {испортил|испортила}», «нормальные люди так не реагируют», «надо было лучше», «ты {слабый|слабая}», «ты всем мешаешь». Иногда кажется, что такой голос помогает собраться. Но чаще он усиливает тревогу, стыд и желание спрятаться.\n\nПолезно отличать факт от оценки. Факт: «я {забыл|забыла} ответить на сообщение». Самокритика: «я ужасный человек». Факт: «я {волновался|волновалась} на встрече». Самокритика: «все заметили, что со мной что-то не так». Факт помогает выбрать действие. Самокритика чаще бьёт по самооценке и не даёт двигаться.\n\nМы не будем делать вид, что ошибок нет. Мы будем учиться говорить с собой точнее и человечнее.',
    },
    durationMin: 10,
    actions: [
      breathingAction({
        title: 'Дыхание перед жёсткой мыслью',
        template: 'equal-6-6',
        durationSeconds: 300,
        prompt:
          'Вдох на 6 счётов, выдох на 6. Дыши спокойно и ровно. Здесь важен не темп, а мягкий устойчивый ритм, который немного снижает фон самокритики ещё до того, как мы её разберём словами.',
      }),
      aiChatAction({
        title: 'Факт и самокритика',
        topicPrompt:
          'Вспомни одну недавнюю ситуацию и раздели её на две части: что произошло на самом деле и что добавила самокритика. Затем подбери более спокойную и честную фразу поддержки.',
        goalHint:
          'Сформулировать одну честную фразу поддержки без жёсткой самокритики.',
        minDurationSec: 180,
        minQualifyingMessages: 3,
      }),
      journalAction({
        prompt:
          'Запиши две фразы рядом: то, что сказал внутренний критик, и более точную версию без самоунижения. Сравнение полезно само по себе, в нём становится видна разница между фактом и оценкой.',
        placeholderText:
          'Например, критик говорит: «Я опять всё {провалил|провалила}». Точнее звучит так: «Я {устал|устала} и {сделал|сделала} меньше, чем {планировал|планировала}. Это не катастрофа».',
        journalFormat: 'short',
        maxLength: 500,
      }),
    ],
  },
  {
    title: 'Бережная опора',
    subtitle: 'Подбираем поддержку, которая звучит честно, а не приторно.',
    nextHint: 'Дальше перейдём к избеганию.',
    introText:
      'Поддержка не обязана звучать как «всё прекрасно». Когда тревожно, такие фразы часто раздражают. Хорошая поддержка честная: она признаёт трудность и напоминает о ближайшем шаге.\n\nСегодня мы соберём такую фразу для себя.',
    miniArticle: {
      title: 'Самоподдержка без самообмана',
      body: 'Бережное отношение к себе - это не жалость и не попытка убедить себя, что всё идеально. Это способ говорить с собой так, чтобы не усиливать тревогу дополнительным стыдом.\n\nЖёсткая самокритика часто обещает контроль: «если я буду давить на себя, я соберусь». Но в тревоге давление обычно сужает внимание и отнимает силы. Поддерживающая фраза работает иначе. Она признаёт реальность: «мне сейчас тревожно», и добавляет действие: «я могу сделать один маленький шаг».\n\nХорошая опорная фраза не должна быть сладкой. Она должна быть правдоподобной. Не «я всегда со всем справляюсь», а «мне трудно, но я могу начать с малого».',
    },
    durationMin: 8,
    actions: [
      groundingAction({
        title: 'Опора перед формулировкой',
        estimatedDurationSeconds: 240,
        prompt:
          'Перед тем как искать слова поддержки, важно вернуть внимание в настоящее. По очереди отметь пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус. Тогда формулировка получится спокойной, а не из тревожного потока.',
      }),
      meditationAction({
        title: 'Короткая поддерживающая пауза',
        template: 'kind-observer',
        durationSeconds: 240,
        prompt:
          'Положи руку на грудь или живот. Мысленно скажи себе: «Сейчас непросто. Я рядом с собой». Звучит очень просто, но именно эта короткая фраза часто не даёт скатиться в самокритику в тяжёлый момент.',
      }),
      microReflectionAction({
        idSuffix: 'support-style',
        title: 'Какая поддержка подходит',
        question:
          'Поддержка работает не у всех одинаково. Кому-то нужен сухой факт, кому-то разрешение на паузу, кому-то напоминание о теле. Замечать свой формат полезно: так ты быстрее найдёшь то, что действительно помогает. Что тебе сейчас ближе?',
        chips: [
          'Спокойный факт',
          'Разрешение на паузу',
          'Маленький шаг',
          'Напоминание о теле',
          'Просьба о помощи',
        ],
      }),
      journalAction({
        prompt:
          'Собери для себя одну фразу бережной опоры на трудный момент. Хорошая фраза та, в которую ты {сам|сама} веришь, и которую {готов|готова} сказать себе вслух или мысленно, когда станет тяжело.',
        placeholderText:
          'Например: «Я могу не успевать всё, и я по-прежнему имею право на отдых».',
        journalFormat: 'oneLine',
        maxLength: 160,
      }),
    ],
  },
  {
    title: 'Как работает избегание',
    subtitle: 'Понимаем, почему быстрое облегчение иногда закрепляет тревогу.',
    nextHint: 'Дальше посмотрим на защитное поведение.',
    introText:
      'Избегание часто кажется логичным: если что-то тревожит, лучше не сталкиваться. На короткой дистанции становится легче. На длинной - тревога получает больше власти.\n\nСегодня мы посмотрим на избегание спокойно, без обвинений.',
    miniArticle: {
      title: 'Почему избегание закрепляет тревогу',
      body: 'Когда человек избегает тревожной ситуации, напряжение часто быстро снижается. Это приятное облегчение. Мозг делает вывод: «я {спасся|спаслась}, потому что {избежал|избежала}». В следующий раз тревога перед похожей ситуацией становится сильнее, а желание избежать - убедительнее.\n\nТак постепенно тревога может сужать жизнь. Сначала человек откладывает один звонок, потом избегает сложных разговоров, потом перестаёт пробовать новое или берёт только те задачи, где точно не будет ошибки.\n\nВажно: избегание - не слабость. Это понятная защитная стратегия. Но если она становится главным способом справляться, тревога не получает нового опыта. Чтобы цикл менялся, нужны маленькие безопасные шаги навстречу ситуации. Не резко и не через насилие над собой, а постепенно.',
    },
    durationMin: 12,
    actions: [
      breathingAction({
        title: 'Дыхание перед выбором',
        template: 'pursed-lip',
        durationSeconds: 300,
        prompt:
          'Вдох носом, а выдох через слегка сжатые губы, как сквозь тонкую соломинку. Такой выдох даёт телу ощущение управления, и это особенно полезно, когда хочется срочно что-то решить и убрать тревогу любой ценой.',
      }),
      thoughtDumpAction({
        title: 'Выгрузка ситуаций, которые ты обходишь',
        subtitle: 'Пиши потоком, без оценок и редактуры',
        prompt:
          'Выпиши ситуации, которые ты чаще обходишь, откладываешь или делаешь только с подстраховкой. Ничего страшного, если список будет длинным или короче, чем казалось. Когда такие ситуации увидены и записаны, дальше с ними легче работать по очереди.',
        estimatedDurationSeconds: 240,
      }),
      structuredFormAction({
        idSuffix: 'avoidance-map',
        title: 'Карта избегания',
        formKind: 'avoidance_map',
        prompt:
          'Когда мы избегаем тревожной ситуации, в моменте становится легче, но в долгую тревога обычно усиливается, потому что мозг не получает опыта, что с ситуацией можно справиться. Сейчас разложим одну такую тему: что именно ты обходишь, какое короткое облегчение получаешь, и какую цену это даёт в будущем.',
        helpHint: {
          title: 'Как работает карта избегания',
          description:
            'Это короткий разбор одного защитного поведения. Мы не пытаемся «перестать избегать» немедленно. Цель только увидеть, что именно происходит: какая ситуация, какой быстрый выигрыш, и какая долгая цена. Из этого естественно появится подходящий первый шаг.',
          examples: [
            'Ситуация: важный звонок врачу, который ты переносишь уже две недели.',
            'Короткое облегчение: тревога временно стихает, можно заняться чем-то другим.',
            'Долгая цена: вопрос накапливается, тревога становится фоновой, добавляется самокритика.',
            'Маленький шаг: записать номер врача в контакты и сформулировать один вопрос.',
          ],
        },
        fields: [
          {
            id: 'situation',
            label: 'Какую ситуацию ты чаще всего откладываешь или обходишь?',
            helperText: 'Опиши конкретно, без обобщений «у меня всё трудно».',
            maxLength: 300,
            required: true,
          },
          {
            id: 'short_relief',
            label:
              'Какое облегчение ты получаешь, когда обходишь эту ситуацию?',
            helperText: 'Что становится легче в моменте, даже если ненадолго.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'long_cost',
            label:
              'Что становится труднее в будущем, если продолжать её избегать?',
            helperText:
              'Это не самокритика, а честное наблюдение про долгую цену.',
            maxLength: 400,
            required: true,
          },
          {
            id: 'soft_area',
            label: 'Какой шаг ты {готов|готова} сделать вместо избегания?',
            helperText:
              'Маленькое действие, к которому реально готов прямо сейчас.',
            placeholder:
              'Например: написать одно короткое сообщение с уточняющим вопросом.',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      weeklyCheckAction({
        idSuffix: 'weekly-check-3',
        placement: 'after_completion',
        required: true,
      }),
    ],
  },
  {
    title: 'Быстрое облегчение, которое мешает',
    subtitle:
      'Ищем защитные действия: проверки, заверения, откладывание, контроль.',
    nextHint: 'Дальше построим лестницу маленьких шагов.',
    introText:
      'Иногда тревога не заставляет полностью избегать ситуации, но всё равно управляет поведением. Человек может быть на месте, разговаривать или делать задачу, но при этом постоянно проверять, перестраховываться, искать подтверждения или заранее репетировать каждую фразу.\n\nСегодня мы найдём такие защитные действия без осуждения.',
    miniArticle: {
      title: 'Что такое защитное поведение',
      body: 'Защитное поведение - это действия, которые помогают быстро снизить тревогу, но мешают мозгу получить новый опыт. Например: десять раз перечитать сообщение, постоянно проверять симптомы, заранее готовить каждую фразу, избегать взгляда, просить человека подтвердить, что всё точно нормально.\n\nНа короткой дистанции это облегчает состояние. Но мозг может сделать неверный вывод: «всё прошло нормально только потому, что я {проверял|проверяла}, {контролировал|контролировала} или {перестраховывался|перестраховывалась}». В следующий раз тревога снова потребует тот же ритуал.\n\nЗадача не в том, чтобы сразу убрать все защитные действия. Это было бы слишком резко. Сначала нужно их заметить. Потом можно выбрать одно маленькое действие, которое получится ослабить безопасно и постепенно.',
    },
    durationMin: 9,
    actions: [
      groundingAction({
        title: '5-4-3-2-1 перед разбором',
        estimatedDurationSeconds: 240,
        prompt:
          'Заземление помогает выйти из тревожного потока и спокойнее посмотреть на защитное поведение, не уходя в самокритику. По очереди заметь пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус.',
      }),
      aiChatAction({
        title: 'Защитное поведение',
        topicPrompt:
          'Иногда тревога просит сделать что-то «для спокойствия»: перепроверить, отложить, спросить подтверждение или подготовиться ещё раз. На короткое время становится легче, но тревожный круг может закрепляться. Давай найдём одно такое действие и подумаем, как ослабить его безопасно.',
        goalHint:
          'Выбрать одно действие, которое можно ослабить мягко и безопасно.',
        minDurationSec: 180,
        minQualifyingMessages: 3,
      }),
      journalAction({
        prompt:
          'Выбери одно защитное действие, которое чаще всего помогает быстро снизить тревогу: перепроверка, поиск подтверждения, откладывание или лишняя подготовка. Запиши, как можно ослабить его совсем немного и безопасно. Цель не убрать защиту целиком, а уменьшить её на одну ступеньку.',
        placeholderText:
          'Например: проверить не пять раз, а два; подождать с уточняющим вопросом сутки; сдать черновик «достаточно хорошо», а не идеально.',
        journalFormat: 'short',
        maxLength: 500,
      }),
    ],
  },
  {
    title: 'Лестница маленьких шагов',
    subtitle: 'Готовим постепенное действие от простого к более смелому.',
    nextHint: 'Дальше попробуем первый безопасный эксперимент.',
    introText:
      'Чтобы уменьшать избегание, не нужно бросаться в самое страшное. Лучше двигаться как по лестнице: от простого шага к более сложному.\n\nСегодня мы составим такую лестницу для одной ситуации.',
    miniArticle: {
      title: 'Почему нужны маленькие шаги',
      body: 'Тревога часто предлагает два крайних варианта: полностью избежать ситуации или резко заставить себя пройти через неё. Оба варианта не всегда помогают. Избегание закрепляет страх, а слишком резкий шаг может перегрузить и отбить желание продолжать.\n\nЛестница маленьких шагов работает мягче. Мы выбираем ситуацию, которую тревога заставляет обходить, и делим её на уровни. Первый уровень должен быть достаточно простым, чтобы его реально выполнить. Не впечатляющим, а выполнимым.\n\nНапример, если тревожат звонки, лестница может быть такой: написать короткий текст, потом записать план звонка, потом сделать один короткий звонок. Так мозг получает новый опыт постепенно: тревога неприятна, но я могу действовать.',
    },
    durationMin: 11,
    actions: [
      breathingAction({
        title: 'Дыхание перед планом',
        template: 'diaphragmatic',
        durationSeconds: 300,
        prompt:
          'Дыхание животом, а не грудью. Положи ладонь на живот и дыши так, чтобы поднимался именно живот, а плечи оставались спокойными. Такое дыхание помогает собрать внимание перед тем, как продумывать конкретные шаги.',
      }),
      structuredFormAction({
        idSuffix: 'small-steps-ladder',
        title: 'Лестница из трёх шагов',
        prompt:
          'Выбери одно дело, которое сейчас откладываешь или избегаешь из-за тревоги. Разбей его на три понятных шага. Первый самый простой, второй немного смелее, третий ближе к самому действию. Так к тревожной ситуации проще подходить постепенно, без резкого давления на себя.',
        formKind: 'exposure_ladder',
        helpHint: {
          title: 'Как работает лестница шагов',
          description:
            'Лестница шагов помогает не бросаться сразу в самое трудное. Мы берём одну тревожную ситуацию и делим её на несколько посильных ступеней. Каждая следующая ступень чуть сложнее предыдущей, но всё ещё выполнима. Так мозг постепенно получает новый опыт: к ситуации можно приближаться маленькими действиями, а не через силу.',
          examples: [
            'Ситуация: конкретное действие, которое сейчас трудно сделать. Например: позвонить врачу, выступить на встрече, написать давнему другу.',
            'Шаг 1: самый простой подход. То, что можно сделать уже сегодня. Например: найти номер врача и сохранить его в контакты.',
            'Шаг 2: действие немного смелее. Например: заранее записать три вопроса, которые ты хочешь задать.',
            'Шаг 3: основное действие или ближайший шаг к нему. Например: позвонить в регистратуру и записаться.',
          ],
        },
        fields: [
          {
            id: 'situation',
            label: 'Какое дело ты откладываешь или избегаешь?',
            maxLength: 300,
            required: true,
          },
          {
            id: 'step_1',
            label: 'Шаг 1. Самый простой первый подход',
            maxLength: 300,
            required: true,
          },
          {
            id: 'step_2',
            label: 'Шаг 2. Немного более смелое действие',
            maxLength: 300,
            required: true,
          },
          {
            id: 'step_3',
            label: 'Шаг 3. Основное действие или ближайший шаг к нему',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'first-step',
        title: 'Стартовая ступенька',
        question:
          'Хорошо, когда первая ступень посильна именно сегодня. Если выбираешь сразу второй или третий шаг, проверь, что это не из чувства, что «иначе несерьёзно». С какого шага начнёшь?',
        chips: [
          'Начну с шага 1',
          'Готов сразу к шагу 2',
          'Готов сразу к шагу 3',
          'Нужен ещё меньший подход',
          'Пока отложу',
        ],
      }),
    ],
  },
  {
    title: 'Первый безопасный эксперимент',
    subtitle:
      'Планируем маленькое действие в реальной жизни без требования полного спокойствия.',
    nextHint: 'Дальше сравним прогноз и факт.',
    introText:
      'Сегодня мы попробуем не просто думать о тревоге, а мягко проверить её прогноз действием. Это называется поведенческий эксперимент.\n\nГлавное правило: действие должно быть маленьким и безопасным. Не подвиг, а проверка.',
    miniArticle: null,
    durationMin: 12,
    actions: [
      meditationAction({
        title: 'Опора перед действием',
        template: 'steady-action',
        durationSeconds: 480,
        prompt:
          'Сделай небольшую паузу перед действием. Заметь дыхание, тело и тревогу, если она есть. Ничего не нужно менять сразу.',
      }),
      structuredFormAction({
        idSuffix: 'experiment-plan',
        title: 'Прогноз и граница безопасности',
        formKind: 'behavioral_experiment_plan',
        prompt:
          'Маленький эксперимент это короткое действие в реальной жизни, которое помогает сравнить тревожный прогноз с тем, что произойдёт на самом деле. Цель не в том, чтобы сделать всё идеально, а в том, чтобы собрать наблюдение. Безопасная граница - это заранее выбранное условие, при котором ты можешь остановиться и сделать паузу.',
        helpHint: {
          title: 'Как работает поведенческий эксперимент',
          description:
            'Тревога часто заранее рисует самый пугающий сценарий. Когда ты проверяешь его через маленькое безопасное действие, мозг получает новый опыт: ситуация может оказаться сложной, но не обязательно катастрофической. Так тревожная реакция постепенно становится слабее.',
          examples: [
            'Прогноз лучше записать дословно: «меня осудят», «я не справлюсь».',
            'Безопасную границу стоит определить заранее: при каком сигнале ты сделаешь паузу или уменьшишь шаг.',
            'Если получилось не до конца, это тоже наблюдение, а не провал.',
          ],
        },
        fields: [
          {
            id: 'experiment',
            label: 'Какой маленький эксперимент ты {выбрал|выбрала}?',
            helperText:
              'Конкретное действие, которое можно сделать за 5-30 минут.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'prediction',
            label: 'Что тревога прогнозирует?',
            helperText: 'Запиши прогноз дословно, как звучит в голове.',
            placeholder: 'Например: «я не справлюсь и опозорюсь».',
            maxLength: 300,
            required: true,
          },
          {
            id: 'safety_boundary',
            label: 'Где твоя безопасная граница?',
            helperText:
              'Условие, при котором ты остановишься без чувства провала.',
            placeholder:
              'Например: если тревога станет 8 из 10, сделаю паузу и подышу.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'done_status',
            label: 'Что получилось с экспериментом?',
            type: 'experiment_status',
            mode: 'single',
            helperText:
              'Можно выбрать меньший шаг или перенести эксперимент. Это не провал.',
          },
        ],
      }),
    ],
  },
  {
    title: 'Сравнить прогноз и факт',
    subtitle: 'Проверяем не успех, а разницу между ожиданием и реальностью.',
    nextHint: 'Дальше перейдём к решению одной реальной задачи.',
    introText:
      'После маленького эксперимента важно не просто идти дальше, а заметить результат. Тревога любит забывать факты, которые ей не подходят.\n\nСегодня мы сравним прогноз и реальность.\n\nЕсли эксперимент из прошлого шага пока не был сделан, этот шаг не должен звучать как провал. В таком случае пользователь выбирает: уменьшить эксперимент, сохранить план на позже или разобрать, что помешало.',
    miniArticle: {
      title: 'Почему важно подводить итог',
      body: 'Поведенческий эксперимент работает лучше, если после него остановиться и посмотреть: что тревога предсказывала, что произошло, что я {выдержал|выдержала}, что оказалось легче или сложнее.\n\nБез такого итога мозг может обесценить опыт: «просто повезло», «в следующий раз будет хуже», «это не считается». Поэтому важно фиксировать даже маленькие изменения. Не для отчёта, а чтобы тревожная система получила новые данные.\n\nИногда прогноз не опровергается полностью. Это нормально. Важно не доказать, что тревога всегда ошибается, а увидеть более точную картину: что было сложным, что оказалось терпимым, какой шаг помог и что можно попробовать дальше.',
    },
    durationMin: 13,
    actions: [
      breathingAction({
        title: 'Дыхание перед проверкой',
        template: 'long-exhale-4-6',
        durationSeconds: 300,
        prompt:
          'Удлинённый выдох помогает снизить внутренний шум перед проверкой. Это не условие «сначала успокойся до конца, потом думай», а просто способ войти в разбор спокойнее. Вдох на четыре, выдох на шесть.',
      }),
      aiChatAction({
        title: 'Проверка прогноза',
        topicPrompt:
          'Сравни прогноз и факт по своему поведенческому эксперименту. Если эксперимент пока не сделан, без давления: можно уменьшить шаг, запланировать позже или завершить без чувства провала.',
        goalHint:
          'Сформулировать честный вывод: что ожидалось, что произошло, какой следующий мягкий шаг.',
        minDurationSec: 240,
        minQualifyingMessages: 4,
      }),
      structuredFormAction({
        idSuffix: 'prediction-fact-check',
        title: 'Прогноз и факт',
        formKind: 'prediction_fact_check',
        prompt:
          'Сейчас не нужно оценивать эксперимент как успех или провал. Мы просто сверяем две вещи: что предсказывала тревога и что произошло на самом деле. Даже небольшая разница между прогнозом и фактом помогает мозгу получить новый опыт.',
        helpHint: {
          title: 'Как сравнивать прогноз и факт',
          description:
            'Тревожный прогноз часто звучит жёстко и категорично: «меня осудят», «я не справлюсь», «всё пойдёт плохо». Факт часто оказывается мягче, точнее или просто другим. Иногда тревога частично угадывает, и тогда важно заметить, что ты всё равно {выдержал|выдержала} ситуацию. Вывод лучше записать как спокойное наблюдение, без самокритики и оценки себя.',
          examples: [
            'Прогноз: «я расплачусь и не смогу говорить».',
            'Факт: «голос дрогнул, но я {закончил|закончила} мысль».',
            'Вывод: «я могу говорить даже с волнением, мне не нужна полная уверенность».',
          ],
        },
        fields: [
          {
            id: 'done_status',
            label: 'Как прошёл эксперимент?',
            type: 'experiment_status',
            mode: 'single',
            helperText:
              'Выбери ближайший вариант. Даже если эксперимент пока не состоялся, с этим всё равно можно работать дальше.',
          },
          {
            id: 'prediction',
            label: 'Что ты {ожидал|ожидала}?',
            helperText:
              'Запиши тревожный прогноз так, как он звучал в голове. Без смягчения и исправлений.',
            placeholder: 'Например: «меня будут осуждать после разговора».',
            maxLength: 300,
            required: true,
          },
          {
            id: 'fact',
            label: 'Что произошло на самом деле?',
            helperText:
              'Опиши только то, что заметил в реальности: слова, действия, реакции, результат.',
            maxLength: 400,
            required: false,
          },
          {
            id: 'learning',
            label: 'Какой вывод можно сделать без самокритики?',
            helperText:
              'Запиши короткий вывод, к которому сможешь вернуться в похожей ситуации.',
            placeholder:
              'Например: «я могу действовать, даже если внутри сильно тревожно».',
            maxLength: 500,
            required: true,
          },
        ],
      }),
    ],
  },
  {
    title: 'Решить одну реальную задачу',
    subtitle: 'Переводим тревожную тему в практический первый шаг.',
    nextHint: 'Дальше разберём вечернюю тревогу и сон.',
    introText:
      'Часть тревоги уменьшается не через размышления, а через ясный маленький план. Если перед тобой реальная задача, её полезно разложить на действия.\n\nСегодня мы выберем одну задачу и найдём первый шаг.',
    miniArticle: {
      title: 'Когда тревогу нужно не успокаивать, а решать',
      body: 'Иногда тревога указывает на реальную проблему: долг, срок по задаче, незавершённый разговор, запись к врачу, бытовую задачу, финансовый вопрос. Если только успокаивать себя, проблема может оставаться на месте и снова поднимать тревогу.\n\nВ таких случаях помогает не бесконечный анализ, а простое решение задачи по шагам. Сначала нужно описать проблему конкретно. Потом отделить то, что зависит от тебя, от того, что не зависит. Затем выбрать первый маленький шаг, который можно сделать в ближайшее время.\n\nХороший первый шаг должен быть настолько понятным, чтобы его можно было выполнить без большой подготовки. Не «разобраться с жизнью», а «открыть письмо», «написать один черновик», «выбрать время», «попросить информацию».',
    },
    durationMin: 11,
    actions: [
      meditationAction({
        title: 'Собрать внимание',
        template: 'problem-solving',
        durationSeconds: 480,
        prompt:
          'Сделай паузу перед планом. Не ищи решение прямо сейчас. Заметь дыхание, опору тела и то, что появляется в поле внимания: мысль, образ или ощущение. Если внимание уходит в размышления, мягко возвращайся к дыханию. После практики будет легче выбрать первый реалистичный шаг.',
      }),
      structuredFormAction({
        idSuffix: 'problem-plan',
        title: 'План решения',
        formKind: 'problem_solving_plan',
        prompt:
          'Возьми одну реальную задачу, не самую страшную и не самую огромную. Сейчас задача не решить всё, а перевести тревожную тему в один конкретный первый шаг с понятным временем. Дальше уже легче двигаться, потому что есть точка опоры.',
        helpHint: {
          title: 'Как этот план снижает тревогу',
          description:
            'Когда тревоги много, задача может казаться слишком большой: будто её нужно решить всю сразу и без ошибки. Такой подход быстро перегружает. План помогает сузить фокус: отделить то, на что ты можешь повлиять, выбрать первый посильный шаг и назначить для него конкретное время. Это не идеальное решение всей проблемы, а понятное начало.',
          examples: [
            'Задача: «записаться к врачу».',
            'Что зависит от меня: выбрать клинику, найти свободное время, подготовить короткое описание симптомов.',
            'Первый шаг: открыть сайт клиники и посмотреть ближайшие доступные записи.',
            'Когда: сегодня в 19:30, после ужина.',
          ],
        },
        fields: [
          {
            id: 'problem',
            label: 'Одна реальная задача',
            helperText:
              'Выбери одну тему. Не всё, что навалилось, а что-то конкретное.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'depends_on_me',
            label: 'Что зависит от тебя?',
            helperText:
              'Отдели часть, на которую можешь повлиять, от того, что вне твоего контроля.',
            maxLength: 400,
            required: true,
          },
          {
            id: 'first_step',
            label: 'Первый маленький шаг',
            helperText: 'Действие, которое посильно за 5-15 минут.',
            placeholder:
              'Например: открыть документ и написать первые две строки.',
            maxLength: 300,
            required: true,
          },
          {
            id: 'when',
            label: 'Когда попробовать?',
            helperText:
              'Конкретное время сильно повышает шанс, что шаг случится.',
            placeholder: 'Например: сегодня в 19:30, сразу после ужина.',
            maxLength: 160,
            required: true,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'make-real',
        title: 'Что добавит шансов сделать шаг',
        question:
          'Когда шаг и время записаны, иногда помогает ещё одно маленькое усиление. Выбери то, что для тебя сегодня сработает лучше всего.',
        chips: [
          'Уменьшить шаг',
          'Поставить время',
          'Попросить помощи',
          'Сначала собрать факт',
          'Начать с 5 минут',
        ],
      }),
    ],
  },
  {
    title: 'Вечерняя тревога и сон',
    subtitle: 'Убираем один фактор, который подогревает тревогу вечером.',
    nextHint: 'Дальше соберём личный набор спокойствия.',
    introText:
      'Вечером тревога часто усиливается: меньше дел, больше тишины, усталое тело и больше места для мыслей. Сон при этом может становиться хуже, а плохой сон снова усиливает тревогу.\n\nСегодня мы выберем один мягкий вечерний шаг.',
    miniArticle: {
      title: 'Почему тревога усиливается вечером',
      body: 'К вечеру у многих людей снижается запас сил. То, что днём держалось на контроле и занятости, вечером выходит наружу: незавершённые дела, разговоры, воспоминания, планы на завтра, тревожные прогнозы.\n\nЕсли в этот момент начинать решать всё сразу, читать тревожные новости, проверять сообщения, спорить с собой или прокручивать день, мозг получает сигнал: «сейчас время для опасностей». Заснуть становится труднее.\n\nВечерняя поддержка не должна быть сложной. Лучше выбрать один маленький фактор: снизить информационный шум, записать дела на завтра, сделать короткое дыхание, подготовить спокойный ритуал или перенести беспокойство на конкретное время днём.',
    },
    durationMin: 12,
    actions: [
      breathingAction({
        title: 'Дыхание для замедления',
        template: 'diaphragmatic',
        durationSeconds: 300,
        prompt:
          'Положи ладонь на живот и несколько минут наблюдай за дыханием. Не старайся дышать глубже или правильнее. Просто замечай вдох, выдох и мягкое движение тела под ладонью. С каждым выдохом позволь напряжению немного отпускать.',
      }),
      tensionAction({
        title: 'Снять фоновое напряжение',
        durationSeconds: 240,
        prompt:
          'Это короткая практика по принципу «напрячь и отпустить». По очереди мягко напрягай одну группу мышц, а затем полностью расслабляй её. В теле часто остаётся фоновое напряжение, которое мешает отдыхать и засыпать. Когда тело постепенно отпускает зажим, становится легче переключиться в спокойный режим.',
      }),
      journalAction({
        prompt:
          'Выбери одно небольшое изменение для подготовки ко сну. Что лучше убрать, ограничить или заменить в последний час перед сном? Не нужно перестраивать весь режим. Достаточно одного понятного действия.',
        placeholderText:
          'Например: за час до сна не открываю рабочие чаты, а вместо ленты включаю короткую медитацию.',
        journalFormat: 'short',
        maxLength: 500,
      }),
    ],
  },
  {
    title: 'Мой набор спокойствия',
    subtitle: 'Собираем техники, которые действительно сработали для тебя.',
    nextHint: 'Дальше подготовим план на трудный день.',
    introText:
      'За время программы ты {попробовал|попробовала} разные навыки: дыхание, заземление, запись мысли, проверку прогноза, работу с избеганием и маленькие действия.\n\nТеперь важно выбрать не идеальные техники по учебнику, а то, что реально подходит тебе.',
    miniArticle: null,
    durationMin: 11,
    actions: [
      groundingAction({
        title: 'Проверить опоры',
        estimatedDurationSeconds: 300,
        prompt:
          'Перед тем как собирать личный набор техник, важно вернуться в настоящее. По очереди отметь пять видимых объектов, четыре звука, три ощущения от прикосновения, два запаха и один вкус.',
      }),
      aiChatAction({
        title: 'Собрать личный набор',
        topicPrompt:
          'Выбери техники из программы, к которым тебе хочется возвращаться. Это может быть практика для тела, внимания, мыслей, поведения или разговор с ассистентом.',
        goalHint:
          'Отметить техники, которые уже были полезны и могут стать личными опорами.',
        minDurationSec: 180,
        minQualifyingMessages: 3,
      }),
      structuredFormAction({
        idSuffix: 'calm-toolkit',
        title: 'Личный набор спокойствия',
        formKind: 'calm_toolkit',
        prompt:
          'Отметь техники, которые тебе откликнулись или уже были полезны в этой программе. Можно выбрать несколько вариантов. Здесь нет правильного ответа: важнее заметить, к чему тебе действительно хочется возвращаться.',
        fields: [
          {
            id: 'helped_techniques',
            label: 'Какие техники были для тебя полезны?',
            type: 'choice',
            mode: 'multiple',
            minSelected: 1,
            exclusiveOptionIds: ['not_clear_yet'],
            options: CALM_TOOLKIT_TECHNIQUE_OPTIONS,
            required: true,
          },
        ],
      }),
    ],
  },
  {
    title: 'План на трудный день',
    subtitle: 'Готовим сценарий, если тревога вернётся.',
    nextHint: 'Дальше финальный шаг программы.',
    introText:
      'Тревога может возвращаться. Это не провал и не откат в ноль. Навык не в том, чтобы больше никогда не тревожиться, а в том, чтобы знать, что делать, когда тревога снова приходит.\n\nСегодня мы соберём план на трудный день.',
    miniArticle: {
      title: 'Почему тревога может возвращаться',
      body: 'Даже после хороших шагов тревога может снова усилиться. На неё влияют сон, стресс, здоровье, конфликты, нагрузка, новости, неопределённость и накопленная усталость. Возвращение тревоги не означает, что все старания пропали.\n\nПолезно заранее иметь план. В трудный день сложно думать широко, поэтому план должен быть простым: как я замечу ухудшение, что сделаю сначала, какую технику выберу, к кому обращусь, что временно уменьшу.\n\nТакой план снижает ощущение беспомощности. Он не обещает, что день станет лёгким. Он помогает не остаться без маршрута, когда внутри шумно.',
    },
    durationMin: 13,
    actions: [
      meditationAction({
        title: 'Опора на трудный день',
        template: 'hard-day-plan',
        durationSeconds: 600,
        prompt:
          'Представь, что рядом с тобой есть спокойная опора на трудный день. Это может быть дыхание, жест, короткая фраза или образ безопасного места. Не нужно придумывать подробный план прямо сейчас. Просто заметь, что ощущается поддерживающим, и позволь этому немного закрепиться.',
      }),
      structuredFormAction({
        idSuffix: 'hard-day-plan',
        title: 'План на трудный день',
        formKind: 'relapse_prevention_plan',
        prompt:
          'Этот план готовится заранее, пока относительно спокойно. В трудный момент у нас обычно меньше сил выбирать. Поэтому хорошо иметь готовую короткую инструкцию для себя: по каким признакам узнаю начало, что делаю в первые 5 минут, к кому обращаюсь, и чего стараюсь избежать.',
        helpHint: {
          title: 'Как работает план на трудный день',
          description:
            'Это не план «как избежать тревоги», а план «как себе помочь, когда она вернётся». Тревога будет возвращаться, это нормальная часть жизни. План помогает не пугаться её и не действовать на автомате, а опираться на заранее подобранные шаги.',
          examples: [
            'Ранние признаки: бессонная ночь, желание перепроверять телефон, ком в горле.',
            'Первые 5 минут: дыхание 4-6 две минуты и заземление 5-4-3-2-1.',
            'Поддержка: написать подруге короткое «мне сегодня тяжело», без подробностей.',
            'Что не усиливать: бесконечные новости, ночное скроллинг и кофе после 16:00.',
          ],
        },
        fields: [
          {
            id: 'early_signs',
            label: 'Мои ранние признаки тревожного цикла',
            helperText:
              'То, что я обычно замечаю первым: телесные ощущения, поведение, повторяющиеся мысли.',
            placeholder:
              'Например: просыпаюсь раньше, тянет всё перепроверить, начинаю избегать встреч.',
            maxLength: 500,
            required: true,
          },
          {
            id: 'first_5_minutes',
            label: 'Что я сделаю в первые 5 минут?',
            helperText:
              'Конкретные действия, не «попытаться расслабиться». Лучше техники из твоего личного набора.',
            placeholder:
              'Например: 2 минуты дыхания 4-6, потом 5-4-3-2-1 и стакан воды.',
            maxLength: 400,
            required: true,
          },
          {
            id: 'support',
            label: 'К кому или куда обращусь за поддержкой?',
            helperText:
              'Один-два человека или ресурса, к которым реально готов обратиться.',
            placeholder: 'Например: написать сестре «мне сегодня непросто».',
            maxLength: 300,
            required: true,
          },
          {
            id: 'not_helpful',
            label:
              'Что обычно ухудшает состояние, и я постараюсь это не усиливать?',
            helperText:
              'Привычки, к которым тянет в тревоге, но после которых становится тяжелее.',
            placeholder:
              'Например: ночное чтение новостей, бесконечное гугление симптомов, изоляция от близких.',
            maxLength: 400,
            required: true,
          },
        ],
      }),
    ],
  },
  {
    title: 'Завершение программы',
    subtitle: 'Подводим итог: навыки, прогресс и следующий фокус.',
    nextHint: 'После завершения появится итог программы и следующий маршрут.',
    introText:
      'Ты {прошёл|прошла} первую программу. Здесь не было задачи стать человеком без тревоги. Задача была другой: лучше понять себя, увидеть тревожный цикл и собрать навыки, которые помогают действовать спокойнее.\n\nСегодня мы подведём итог.',
    miniArticle: {
      title: 'Что значит завершить программу',
      body: 'Завершение программы не означает, что тревога больше не появится. Она может возвращаться, особенно в периоды усталости, стресса и неопределённости. Но теперь у тебя есть больше понимания и больше вариантов действия.\n\nТы {познакомился|познакомилась} с циклом тревоги, телесными сигналами, дыханием, заземлением, записью мыслей, проверкой тревожных прогнозов, неопределённостью, самокритикой, избеганием и маленькими поведенческими экспериментами.\n\nГлавное изменение не всегда выглядит как «мне стало идеально спокойно». Часто оно звучит иначе: «я быстрее замечаю тревогу», «я понимаю, что со мной происходит», «я могу сделать паузу», «я не всегда верю первому пугающему прогнозу», «я могу сделать маленький шаг».\n\nЭто и есть рост. Не громкий, зато настоящий.',
    },
    durationMin: 15,
    actions: [
      meditationAction({
        title: 'Финальная интеграция',
        template: 'garden-completion',
        durationSeconds: 600,
        prompt:
          'Сделай спокойную паузу в конце пути. Заметь дыхание, тело и общее ощущение после программы. Если появятся воспоминания, образы или слова, просто отметь их и снова вернись к опоре. Здесь не нужно оценивать себя или подводить итоги. Достаточно почувствовать, что этот путь уже пройден.',
      }),
      aiChatAction({
        title: 'Итог программы',
        topicPrompt:
          'Подведи итог программы «Спокойствие»: какие навыки появились, что стало понятнее, какие трудности остались и какой следующий маршрут будет полезен.',
        goalHint: 'Собрать честный итог и выбрать следующий фокус.',
        minDurationSec: 240,
        minQualifyingMessages: 4,
      }),
      journalAction({
        prompt:
          'Запиши главный навык или несколько практик, к которым хочешь возвращаться дальше. Не нужно брать всё сразу: выбери то, что действительно помогает и может пригодиться в обычной жизни.',
        placeholderText:
          'Например: дыхание 4-6 после обеда, пауза «Стоп» перед быстрым ответом, заземление 5-4-3-2-1 при сильной тревоге.',
        journalFormat: 'short',
        maxLength: 500,
      }),
      guidedStepsAction({
        idSuffix: 'final-assessment',
        title: 'Финальная оценка тревоги',
        subtitle: 'Можно пройти или пропустить',
        formKind: 'assessment_prompt',
        template: 'program_final',
        targetId: 'anxiety_check_v1',
        required: false,
        steps: [
          {
            id: 'assessment-final-intro',
            title: 'Перед итогом сада',
            text: 'Сейчас можно пройти тот же опросник, что был в начале. Это поможет сравнить, как изменились ответы за время сада.',
            required: false,
          },
        ],
      }),
      weeklyCheckAction({
        idSuffix: 'weekly-check-final',
        title: 'Итог перед отчётом',
        subtitle: 'Ответы попадут в финальный отчёт',
        prompt:
          'Сформируем итоговый отчёт по саду «Спокойствие». Ответь на три коротких вопроса: они помогут собрать честный разбор пути, динамики и следующей опоры.',
        placement: 'before_final_completion',
        required: true,
        questions: [
          {
            id: 'anxiety_level_last_days',
            type: 'rating_scale',
            question: 'Насколько тревога мешает тебе сейчас, в конце сада?',
            min: 0,
            max: 10,
            minLabel: 'Почти не мешает',
            maxLabel: 'Очень сильно мешает',
          },
          {
            id: 'main_change',
            type: 'choice',
            question:
              'Что стало заметнее всего за время сада? Можно выбрать несколько.',
            mode: 'multiple',
            minSelected: 1,
            exclusiveOptionIds: ['no_change_yet', 'worse'],
            options: [
              { id: 'less_body_tension', label: 'Меньше напряжения в теле' },
              { id: 'notice_thoughts', label: 'Лучше замечаю мысли' },
              { id: 'more_pause', label: 'Чаще получается делать паузу' },
              { id: 'less_avoidance', label: 'Меньше избегаю' },
              { id: 'no_change_yet', label: 'Пока без заметных изменений' },
              { id: 'worse', label: 'Стало тяжелее' },
            ],
          },
          {
            id: 'support_need',
            type: 'choice',
            question: 'Какое состояние точнее описывает финал сада?',
            mode: 'single',
            minSelected: 1,
            options: [
              { id: 'better', label: 'Стало легче, чем в начале' },
              {
                id: 'usual',
                label: 'Есть опора, но тревога ещё возвращается',
              },
              { id: 'harder', label: 'Сейчас тяжелее, чем хотелось бы' },
            ],
          },
        ],
      }),
    ],
  },
];

// Сад #2 «Доброта к себе» (Peony). Runtime-версия из
// `.docs/content/program_self_kindness_21.md`: explicit actions[], intro-action
// первым экраном, weekly-check после шагов 7/14/21.
const STEP_BLUEPRINTS_SELF_KINDNESS_21: StepBlueprint[] = [
  {
    title: 'Доброта к себе - это навык, а не награда',
    subtitle: 'Начинаем сад с честной рамки самоподдержки.',
    nextHint: 'Дальше заметим, как звучит внутренний критик.',
    introText:
      'В этом саде мы будем тренировать не «любовь к себе по команде», а более спокойный способ обращаться с собой в трудные моменты. Доброта к себе здесь означает: заметить боль, не добавлять лишнюю атаку и выбрать следующий маленький шаг.',
    miniArticle: {
      title: 'Что будет в этом саде',
      body: 'Самокритика часто кажется способом держать себя в форме: если говорить с собой жёстко, будто бы будет меньше ошибок. На практике чрезмерная атака обычно сужает внимание, усиливает стыд и мешает исправлять ситуацию спокойно.\n\nДоброта к себе не равна оправданию всего подряд. В доказательных подходах она включает три простые вещи: заметить, что сейчас трудно; признать, что ошибки и боль бывают у людей; обратиться к себе тоном, который помогает действовать, а не добивает.\n\nВ этом саде ты будешь пробовать короткие телесные практики, карточки мыслей, разговоры с ИИ-помощником и маленькие действия в жизни. Цель не в том, чтобы никогда себя не критиковать. Цель - быстрее замечать жёсткий тон и выбирать более полезный ответ.',
      sourceNotes: [
        'Доброта к себе: внимательное отношение к трудному опыту, общая человечность, доброжелательность к себе.',
        'Neff и Germer: рандомизированное контролируемое исследование программы осознанной доброты к себе.',
        'Рамка безопасности Mentala: без обещаний лечения.',
      ],
    },
    durationMin: 8,
    actions: [
      guidedStepsAction({
        idSuffix: 'baseline-assessment',
        title: 'Стартовая оценка доброты к себе',
        subtitle: 'Можно пройти или пропустить',
        formKind: 'assessment_prompt',
        template: 'program_baseline',
        targetId: 'self_compassion_scs_sf_v1',
        required: false,
        steps: [
          {
            id: 'assessment-intro',
            title: 'Перед началом сада',
            text: 'Короткий опросник поможет понять, с какой точки ты начинаешь, и в конце сравнить динамику. Это не экзамен и не оценка того, насколько хорошо ты умеешь себя поддерживать.',
            required: false,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'starting-tone',
        title: 'С чего ты начинаешь',
        question: 'Как сейчас чаще звучит твой внутренний тон?',
        chips: [
          'строго',
          'устало',
          'обвиняюще',
          'требовательно',
          'безразлично',
          'иногда поддерживающе',
          'по-разному',
        ],
      }),
      breathingAction({
        idSuffix: 'soft-exhale',
        title: 'Мягкий выдох',
        template: 'breathing_4_6',
        durationSeconds: 180,
        prompt:
          'Сделай несколько спокойных выдохов и заметь, как тело постепенно отпускает лишнее напряжение. Сейчас достаточно просто дышать мягче и не торопить себя.',
      }),
      journalAction({
        idSuffix: 'support-phrase',
        title: 'Фраза для трудного момента',
        prompt:
          'Запиши короткую фразу, которую можно сказать себе, когда внутри тяжело. Пусть она будет простой, честной и без лишней строгости.',
        journalFormat: 'oneLine',
        maxLength: 240,
        placeholderText:
          'Например: «Сейчас непросто, но я могу начать с малого».',
      }),
    ],
  },
  {
    title: 'Как звучит внутренний критик',
    subtitle: 'Описываем критика как процесс, а не как правду о себе.',
    nextHint: 'Дальше потренируем паузу между ошибкой и атакой.',
    introText:
      'Чтобы менять тон, его сначала нужно услышать. Сегодня мы не будем спорить с критиком. Мы аккуратно разложим: в каких ситуациях он появляется, какими словами говорит и что пытается предотвратить.',
    miniArticle: {
      title: 'Самокритика часто пытается защищать',
      body: 'Жёсткая самокритика редко появляется «просто так». Часто она пытается снизить риск: не ошибиться, не быть отвергнутым, не потерять контроль, не разочаровать других. Проблема в том, что защита через атаку может ранить сильнее самой ситуации.\n\nКогда критик говорит «ты опять всё {испортил|испортила}», мозг может воспринимать это как факт. Но это всё ещё мысль и тон, а не полная картина. В когнитивно-поведенческой терапии и терапии принятия и ответственности важно заметить форму мысли: кто говорит, что именно утверждает, какие эмоции включает и к какому действию толкает.\n\nСегодня задача простая: не убрать критика, а сделать его заметным. То, что стало заметным, уже меньше управляет автоматически.',
      sourceNotes: [
        'Терапия принятия и ответственности: дефузия, то есть навык замечать мысли как мысли.',
        'Когнитивно-поведенческая терапия: карточка мысли, где отдельно фиксируются ситуация, мысль, эмоция и поведение.',
        'Терапия, сфокусированная на сострадании: самокритика как стратегия системы угрозы.',
      ],
    },
    durationMin: 9,
    actions: [
      ratingScaleAction({
        idSuffix: 'critic-strength',
        title: 'Сила критика сейчас',
        subtitle: 'Оцени влияние внутреннего критика',
        label: 'Насколько сильно внутренний критик влияет на тебя сегодня?',
        scaleMin: 0,
        scaleMax: 10,
      }),
      structuredFormAction({
        idSuffix: 'critic-map',
        title: 'Карта критика',
        formKind: 'inner_critic_map',
        prompt:
          'Опиши один недавний эпизод самокритики без анализа всей жизни.',
        fields: [
          {
            id: 'situation',
            label: 'Где это случилось?',
            type: 'textarea',
            maxLength: 500,
            required: true,
          },
          {
            id: 'critic_words',
            label: 'Какими словами говорил критик?',
            type: 'textarea',
            maxLength: 500,
            required: true,
          },
          {
            id: 'fear_underneath',
            label: 'Чего он, возможно, пытался избежать?',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'ошибки',
              'стыда',
              'отвержения',
              'потери контроля',
              'разочарования других',
              'лень/провал',
              'не знаю',
            ]),
          },
        ],
      }),
      aiChatAction({
        idSuffix: 'first-chat',
        title: 'Поговорить о своём критике',
        topicPrompt:
          'Ты только что {описал|описала} один эпизод, где включился внутренний критик. Давай побудем с ним рядом: что он сказал в тот момент и от чего, может быть, пытался тебя уберечь? Я помогу подобрать слова, которые поддержат.',
        goalHint:
          'Дать пользователю ранний тёплый опыт разговора с ассистентом в саде о доброте к себе. Помочь мягче переформулировать одну самокритичную фразу и заметить, что критик часто пытается защитить. Без диагнозов и клише. При признаках кризиса - направить к живой или экстренной поддержке.',
        minQualifyingMessages: 2,
        minDurationSec: 90,
      }),
    ],
  },
  {
    title: 'Пауза между ошибкой и атакой',
    subtitle: 'Ставим короткую паузу перед автоматической самокритикой.',
    nextHint: 'Дальше посмотрим, как самокритика живёт в теле.',
    introText:
      'Иногда критик включается за секунду: ошибка - вспышка стыда - атака на себя. Сегодня мы тренируем маленькую паузу. Не чтобы всё стало приятно, а чтобы у тебя появился выбор ответа.',
    durationMin: 8,
    actions: [
      groundingAction({
        idSuffix: 'back-to-room',
        title: 'Вернуться в комнату',
        estimatedDurationSeconds: 240,
        prompt:
          'Найди 5 предметов, 4 звука или ощущения, 3 цвета, 2 точки опоры и 1 спокойный выдох. Это нужно не для идеального спокойствия, а для паузы.',
      }),
      guidedStepsAction({
        idSuffix: 'self-compassion-break',
        title: 'Пауза доброты к себе',
        formKind: 'self_compassion_break',
        prompt:
          'Пройди три шага из практики доброты к себе: признай, что момент трудный, вспомни, что ошибки бывают у всех, и выбери слова, которые помогут поддержать себя в этот момент.',
        steps: [
          {
            id: 'name',
            title: 'Признать трудность',
            text: 'Назови происходящее простыми словами: «Мне сейчас трудно», «Мне больно» или «Я {столкнулся|столкнулась} с неприятным моментом».',
          },
          {
            id: 'human',
            title: 'Вспомнить, что ты человек',
            text: 'Напомни себе: «Ошибки, стыд и неловкость бывают у людей».',
          },
          {
            id: 'kind',
            title: 'Ответить себе добрее',
            text: 'Спроси себя: «Что я могу сказать себе сейчас, чтобы поддержать, а не усилить боль?»',
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'break-part',
        title: 'Что сработало лучше',
        question: 'Какая часть паузы была доступнее всего?',
        chips: [
          'назвать трудность',
          'вспомнить, что я не {один|одна}',
          'мягкий тон',
          'заземление',
          'пока ничего',
        ],
      }),
    ],
  },
  {
    title: 'Тело под самокритикой',
    subtitle: 'Замечаем напряжение и мягко отпускаем зажим.',
    nextHint: 'Дальше подберём тёплый тон без притворства.',
    introText:
      'Самокритика живёт не только в словах. Она может сжимать челюсть, плечи, живот, дыхание. Сегодня мы не будем убеждать себя словами. Вместо этого мягко поработаем с телом: заметим напряжение и попробуем немного его отпустить.',
    miniArticle: {
      title: 'Почему тело напрягается, когда мы себя атакуем',
      body: 'Когда внутренний тон становится обвиняющим, нервная система может реагировать так, будто рядом реальная угроза. У кого-то это проявляется в сжатой груди, у кого-то в плечах, животе, челюсти или в желании замереть.\n\nВ терапии, сфокусированной на сострадании, это описывают как включение системы угрозы. Доброта к себе в таком контексте не означает «думай позитивно». Иногда первый шаг - снизить телесный сигнал тревоги настолько, чтобы появилась возможность думать яснее.\n\nМы не будем объяснять все ощущения психологией. Если телесный симптом новый, резкий, необычно сильный или похож на медицинский риск, лучше обратиться за медицинской помощью. При обычном напряжении можно мягко заметить разницу: где тело сжато, а где оно уже немного отпускает.',
      sourceNotes: [
        'Терапия, сфокусированная на сострадании: системы угрозы и успокоения.',
        'Прогрессивная мышечная релаксация: безопасное напряжение и отпускание мышц.',
        'Медицинская оговорка Mentala для новых, резких или необычно сильных телесных симптомов.',
      ],
    },
    durationMin: 9,
    actions: [
      tensionAction({
        idSuffix: 'release-tension',
        title: 'Сжать и отпустить',
        durationSeconds: 300,
        prompt:
          'Мягко напряги и отпусти кисти, плечи, лицо и живот. Не доводи до боли. Задача - заметить разницу.',
      }),
      ratingScaleAction({
        idSuffix: 'body-tension-after',
        title: 'Напряжение после практики',
        subtitle: 'Оцени телесное напряжение',
        label: 'Насколько сейчас заметно напряжение в теле?',
        scaleMin: 0,
        scaleMax: 10,
      }),
      journalAction({
        idSuffix: 'body-softening',
        title: 'Где стало мягче',
        prompt:
          'Запиши одну область тела, где стало хотя бы немного иначе. Если не стало, так и напиши.',
        journalFormat: 'oneLine',
        maxLength: 220,
      }),
    ],
  },
  {
    title: 'Поддерживающий тон без притворства',
    subtitle: 'Ищем честную фразу, которая поможет не усиливать самокритику.',
    nextHint:
      'Дальше посмотрим, почему в ошибке легко почувствовать одиночество.',
    introText:
      'Если фраза «я молодец» вызывает раздражение, это нормально. Поддержка к себе должна звучать правдоподобно, а не как чужая мотивационная открытка. Сегодня мы будем искать тон, который признаёт трудность и помогает не добавлять к ней лишнюю строгость.',
    miniArticle: {
      title: 'Поддержка не обязана звучать сладко',
      body: 'Многим людям трудно говорить с собой мягче обычного. Иногда поддерживающие фразы звучат неубедительно, особенно если внутри много стыда, усталости или привычки разрешать себе отдых только после идеального результата.\n\nВ терапии, сфокусированной на сострадании, и в практиках доброты к себе важна не красивая фраза, а её действие. Хорошая фраза помогает выдержать момент, не унижать себя и сделать следующий шаг. Поэтому спокойная или нейтральная формулировка часто работает лучше чрезмерно позитивной: «мне тяжело, и я могу говорить с собой спокойнее» честнее, чем «я прекрасен во всём».\n\nСегодня мы будем подбирать не лозунг, а рабочую фразу. Её можно менять, сокращать и делать более простой. Если добрые слова сейчас звучат неестественно, начни с нейтрального уважительного тона.',
      sourceNotes: [
        'Практики доброты к себе при самокритике.',
        'Терапия, сфокусированная на сострадании: поддерживающий внутренний голос.',
        'Предосторожность в практиках доброты: мягкий тон сначала может звучать непривычно.',
      ],
    },
    durationMin: 10,
    actions: [
      meditationAction({
        idSuffix: 'kind-tone',
        title: 'Тон к себе',
        template: 'self_kindness_tone',
        durationSeconds: 360,
        prompt:
          'Короткая спокойная практика. Несколько минут замечай дыхание, тело и общий внутренний фон. Позволь вниманию постепенно замедлиться и вернуться к текущему моменту.',
      }),
      structuredFormAction({
        idSuffix: 'phrase-builder',
        title: 'Собрать фразу поддержки',
        formKind: 'compassionate_phrase_builder',
        prompt:
          'Выбери один конкретный момент, где обычно включается самокритика, и сформулируй короткую фразу для себя. Она не должна звучать красиво или идеально. Достаточно, чтобы она помогала остановиться, признать трудность и сделать следующий шаг спокойнее.',
        helpHint: {
          title: 'Как собрать фразу',
          description:
            'Сначала опиши ситуацию, в которой эта фраза может пригодиться. Затем выбери стиль: спокойный, нейтральный, деловой или очень короткий. В последнем поле запиши саму фразу. Это не аффирмация и не попытка убедить себя, что всё хорошо. Это честная опора на трудный момент.',
          examples: [
            'Ситуация: после ошибки на работе я начинаю ругать себя.',
            'Фраза: «Я {ошибся|ошиблась}, и сейчас мне нужен один шаг для исправления, а не новые обвинения».',
            'Нейтральный вариант: «Сейчас трудно. Я могу говорить с собой спокойнее».',
          ],
        },
        fields: [
          {
            id: 'hard_moment',
            label: 'В какой ситуации нужна фраза?',
            type: 'textarea',
            helperText:
              'Опиши конкретный момент: что произошло и когда обычно появляется самокритика.',
            maxLength: 400,
            required: true,
          },
          {
            id: 'tone_level',
            label: 'Какой тон сейчас нужен? Можно выбрать несколько.',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'мягкий',
              'спокойный',
              'нейтральный',
              'деловой',
              'очень короткий',
            ]),
          },
          {
            id: 'phrase',
            label: 'Фраза поддержки',
            type: 'textarea',
            helperText:
              'Напиши одну-две фразы для себя. Лучше просто и честно, чем красиво, но неубедительно.',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      journalAction({
        idSuffix: 'truth-check',
        title: 'Проверка на правду',
        prompt: 'Что в этой фразе звучит для тебя достаточно честно?',
        journalFormat: 'oneLine',
        maxLength: 220,
      }),
    ],
  },
  {
    title: 'Ошибки бывают у всех',
    subtitle: 'Уменьшаем изоляцию, которую создаёт стыд.',
    nextHint: 'Дальше соберём первую проверку бережности.',
    introText:
      'Самокритика часто говорит: «только с тобой такое». Это усиливает стыд и одиночество. Сегодня мы будем тренировать другую перспективу: ошибка или трудный момент не делают тебя хуже других и не говорят о тебе целиком.',
    miniArticle: {
      title: '«Не только я» - это не обесценивание',
      body: 'Когда нам стыдно, мозг часто сужает картину: кажется, что у всех получается лучше, а наша ошибка доказывает что-то плохое о нас. \n\nОдна из опор доброты к себе - общая человечность: понимание, что трудности, ошибки и боль бывают частью человеческого опыта. Это не значит «у всех проблемы, значит твоя не важна». Наоборот: твоя боль важна, и при этом она не делает тебя {одиноким|одинокой} или {сломанным|сломанной}.\n\nВ этом шаге мы попробуем мягко расширить картину. Не нужно сравнивать себя с другими. Достаточно признать: люди ошибаются, устают, путаются, нуждаются в поддержке. Ты тоже человек.',
      sourceNotes: [
        'Доброта к себе: компонент общей человечности.',
        'Подходы, сфокусированные на сострадании: стыд и изоляция.',
        'Терапия принятия и ответственности: расширение перспективы.',
      ],
    },
    durationMin: 11,
    actions: [
      breathingAction({
        idSuffix: 'humanity-breath',
        title: 'Дыхание с фразой',
        template: 'breathing_4_6',
        durationSeconds: 240,
        prompt:
          'На выдохе мягко повтори короткую фразу: «Ошибки и трудности бывают у людей». Если эта фраза не откликается, просто возвращай внимание к дыханию.',
      }),
      microReflectionAction({
        idSuffix: 'isolation-thoughts',
        title: 'Мысли, после которых тяжелее',
        question:
          'Какие мысли чаще всего появляются после ошибки и делают состояние тяжелее?',
        chipMode: 'multi',
        chips: [
          'у других получается лучше',
          'я снова кого-то подвёл',
          'со мной что-то не так',
          'нельзя показывать слабость',
          'я {должен|должна} справиться {сам|сама}',
          'меня не поймут',
        ],
      }),
      guidedStepsAction({
        idSuffix: 'common-humanity-reframe',
        title: 'Посмотреть шире',
        formKind: 'common_humanity_reframe',
        helpHint: {
          title: 'Зачем смотреть шире',
          description:
            'После ошибки легко думать: «только у меня так». Эта практика помогает увидеть ситуацию точнее: проблема важна, но она не делает тебя {плохим|плохой} человеком. Ошибки, усталость, неловкость и растерянность бывают у людей.',
          examples: [
            '«Я ошибся в разговоре» вместо «я всегда всё порчу».',
            '«Такое бывает, когда человек устал, волнуется или не всё успел учесть».',
            '«Мне нужен следующий шаг, а не новые обвинения в свой адрес».',
          ],
        },
        steps: [
          {
            id: 'one',
            title: 'Назови ситуацию',
            text: '«Сейчас я {столкнулся|столкнулась} с...»',
          },
          {
            id: 'two',
            title: 'Вспомни, что так бывает',
            text: '«С людьми такое случается, особенно когда...»',
          },
          {
            id: 'three',
            title: 'Выбери следующий шаг',
            text: '«Что поможет мне сейчас поддержать себя и двигаться дальше?»',
          },
        ],
      }),
      journalAction({
        idSuffix: 'not-alone-phrase',
        title: 'Фраза поддержки',
        prompt:
          'Запиши одну короткую фразу, которая поможет помнить: этот момент трудный, но ошибки и переживания бывают у людей.',
        journalFormat: 'oneLine',
        maxLength: 240,
      }),
    ],
  },
  {
    title: 'Проверить, что уже помогает',
    subtitle: 'Подводим первый итог без экзамена и самокритики.',
    nextHint: 'Дальше научимся отделять самокритичную мысль от факта.',
    introText:
      'За первые шаги сада ты уже {попробовал|попробовала} несколько способов поддержать себя: мягче выдохнуть, заметить внутреннего критика, сделать паузу после ошибки, отпустить напряжение в теле, подобрать честную фразу поддержки и вспомнить, что трудности бывают не только у тебя.\n\nСегодня не нужно доказывать прогресс. Мы просто посмотрим, что оказалось хоть немного доступным, что пока даётся труднее и какие практики стоит взять с собой дальше.',
    durationMin: 12,
    actions: [
      meditationAction({
        idSuffix: 'first-supports',
        title: 'Тёплая пауза',
        template: 'self_kindness_basics_review',
        durationSeconds: 420,
        prompt:
          'Короткая спокойная практика. Несколько минут просто побудь в тишине: замечай дыхание и мягкий фон тела, ничего не оценивая и никуда не торопясь. Позволь вниманию опуститься в текущий момент и отнестись к себе чуть теплее.',
      }),
      structuredFormAction({
        idSuffix: 'first-week-review',
        title: 'Первый итог',
        formKind: 'first_week_support_review',
        prompt:
          'Отметь, что из первых практик оказалось для тебя самым доступным, что пока даётся труднее и какие опоры ты хочешь оставить на следующие шаги сада.',
        helpHint: {
          title: 'Как отвечать без оценки себя',
          description:
            'Здесь не нужно показывать лучший результат. Если что-то не сработало, это тоже полезная информация: значит, практику можно упростить, заменить или вернуться к ней позже. Выбирай не то, что звучит красиво, а то, что было хоть немного применимо в реальности.',
          examples: [
            'Доступнее всего: «мягкий выдох» или «пауза после ошибки».',
            'Труднее всего: «поверить поддерживающей фразе».',
            'Беру дальше: «мягкий выдох», «пауза после ошибки» или «фраза поддержки».',
          ],
        },
        fields: [
          {
            id: 'helped',
            label: 'Что было самым доступным?',
            helperText:
              'Можно выбрать несколько вариантов. Выбирай то, что получилось хотя бы немного.',
            type: 'choice',
            mode: 'multiple',
            exclusiveOptionIds: ['nothing_yet'],
            options: makeChoiceOptions([
              'мягкий выдох',
              'заметить внутреннего критика',
              'пауза после ошибки',
              'снять напряжение в теле',
              'честная фраза поддержки',
              'вспомнить, что ошибки бывают у людей',
              'пока ничего не подошло',
            ]),
          },
          {
            id: 'hardest',
            label: 'Что пока даётся труднее всего?',
            helperText:
              'Это не провал. Так мы понимаем, где нужно больше мягкости, простоты или поддержки.',
            type: 'choice',
            mode: 'multiple',
            // «пока сложно понять» (option_6) - взаимоисключающий: выбор его
            // обнуляет конкретные трудности и наоборот.
            exclusiveOptionIds: ['option_6'],
            options: makeChoiceOptions([
              'верить поддерживающим фразам',
              'замечать критика вовремя',
              'останавливаться после ошибки',
              'чувствовать тело',
              'писать ответы в формах',
              'пока сложно понять',
            ]),
          },
          {
            id: 'supports_to_keep',
            label: 'Что беру дальше',
            helperText:
              'Запиши одну или несколько практик, к которым хочешь вернуться в следующих шагах.',
            placeholder:
              'Например: мягкий выдох, пауза после ошибки, фраза «сейчас мне нужен следующий шаг, а не новые обвинения».',
            type: 'textarea',
            maxLength: 400,
            required: true,
          },
        ],
      }),
      selfKindnessWeeklyCheckAction({
        idSuffix: 'weekly-check-7',
        title: 'Короткая проверка состояния',
        placement: 'after_completion',
        prompt:
          'Отметь, как ты сейчас после первых шагов сада. Это не оценка результата и не тест на прогресс, а короткая фиксация текущего состояния.',
      }),
    ],
  },
  {
    title: 'Мысль - не приговор',
    subtitle: 'Отделяем самокритичную мысль от факта о себе.',
    nextHint: 'Дальше заполним карточку самокритичной мысли.',
    introText:
      'Самокритичная мысль может звучать как окончательный вердикт: «я {слабый|слабая}», «я всё порчу», «меня нельзя любить». Сегодня мы не будем доказывать обратное. Сначала потренируемся видеть мысль как мысль.',
    miniArticle: {
      title: 'Отделить себя от фразы в голове',
      body: 'В терапии принятия и ответственности есть навык дефузии: заметить мысль, не сливаясь с ней полностью. Это не спор и не попытка срочно заменить мысль на позитивную. Это шаг назад: «у меня появилась мысль, что я всё {испортил|испортила}».\n\nТакой поворот кажется маленьким, но он меняет позицию. Если мысль - это приказ, остаётся подчиниться или спорить. Если мысль - это событие в уме, можно проверить, помогает ли она сейчас и какое действие выбрать.\n\nСегодня мы будем выгружать самокритичный шум и добавлять к нему рамку наблюдения. Цель не в том, чтобы мысль исчезла, а в том, чтобы она перестала быть единственным голосом в комнате.',
      sourceNotes: [
        'Терапия принятия и ответственности: когнитивная дефузия.',
        'Психологическая гибкость.',
        'Когнитивно-поведенческая терапия: различение мысли и факта.',
      ],
    },
    durationMin: 13,
    actions: [
      groundingAction({
        idSuffix: 'thought-grounding',
        title: 'Опора перед мыслями',
        estimatedDurationSeconds: 240,
        prompt:
          'Сначала верни внимание к комнате и телу. Так проще смотреть на мысли, не проваливаясь в них.',
      }),
      thoughtDumpAction({
        idSuffix: 'critic-dump',
        title: 'Выгрузить критика',
        estimatedDurationSeconds: 360,
        prompt:
          'Запиши поток самокритичных мыслей как сырой материал. Не редактируй и не доказывай, что они правы или неправы.',
        maxLength: 1800,
      }),
      guidedStepsAction({
        idSuffix: 'defusion',
        title: 'Посмотреть на мысль со стороны',
        formKind: 'defusion_practice',
        helpHint: {
          title: 'Что значит посмотреть на мысль со стороны',
          description:
            'Когда внутри звучит «я {плохой|плохая}», мы верим этому как факту о себе. Но на самом деле это просто фраза, которая мелькнула в голове, а не приговор. Если научиться замечать её как отдельную мысль, ей становится легче не верить.',
          examples: [
            'Сначала так: «Я всё {испортил|испортила}».',
            'А теперь так: «Я {заметил|заметила} у себя мысль, что я всё {испортил|испортила}».',
            'И спокойный вопрос к ней: «Эта мысль мне сейчас помогает или просто делает больно?»',
          ],
        },
        steps: [
          {
            id: 'label',
            title: 'Отдели мысль от себя',
            text: 'Возьми мысль, которая сейчас давит, и мысленно добавь перед ней «Я {заметил|заметила} у себя мысль, что...». Вместо «я {плохой|плохая} {друг|подруга}» получится «я {заметил|заметила} у себя мысль, что я {плохой|плохая} {друг|подруга}». Ты как будто делаешь шаг назад и видишь: это мысль, а не факт о тебе.',
          },
          {
            id: 'voice',
            title: 'Чей это голос внутри',
            text: 'Спроси себя: кто во мне сейчас это говорит? Спокойный голос, который смотрит на факты, или знакомый строгий критик, тревога, обида? Чаще всего это привычный внутренний критик, а не правда о тебе.',
          },
          {
            id: 'useful',
            title: 'Эта мысль помогает или ранит',
            text: 'Задай мысли простой вопрос: она подсказывает, что мне сделать дальше, или просто делает больно и ничего не меняет? Если мысль только бьёт и ничем не помогает, ты не {обязан|обязана} ей верить.',
          },
        ],
      }),
      journalAction({
        idSuffix: 'defused-thought',
        title: 'Запиши эту мысль по-доброму',
        prompt:
          'Возьми мысль, которая давит сильнее всего, и перепиши её спокойнее и честнее, как заметку о ситуации, а не приговор себе. Например, вместо «я неудачник» можно написать «сегодня не получилось, и мне от этого тяжело».',
        journalFormat: 'short',
        maxLength: 400,
      }),
    ],
  },
  {
    title: 'Карточка самокритичной мысли',
    subtitle: 'Проверяем одну мысль через факты и более точный тон.',
    nextHint: 'Дальше отделим ответственность от самонаказания.',
    introText:
      'Иногда добрый тон появляется не через уговоры, а через факты. Сегодня мы возьмём одну самокритичную мысль и проверим её так, чтобы не обесценивать боль и не превращать разбор в суд над собой.',
    miniArticle: {
      title: 'Факты вместо внутреннего суда',
      body: 'Карточка мысли из когнитивно-поведенческой терапии помогает увидеть связь между ситуацией, эмоциями, автоматической мыслью, доказательствами и более реалистичной формулировкой. Это особенно полезно, когда критик говорит обобщениями: «всегда», «никогда», «со мной всё не так».\n\nВажно: задача не в том, чтобы заставить себя думать позитивно. Иногда реалистичная мысль всё равно неприятная: «я {ошибся|ошиблась} и мне нужно исправить часть последствий». Но она отличается от атаки: «я ужасный человек».\n\nСегодня мы проверим одну мысль через факты за и против, а затем добавим бережную переформулировку: фразу, которая остаётся честной и не разрушает тебя.',
      sourceNotes: [
        'Национальная служба здравоохранения Великобритании: карточка мысли как техника самопомощи.',
        'Когнитивно-поведенческая терапия: когнитивная реструктуризация.',
        'Вмешательства доброты к себе при самокритике.',
      ],
    },
    durationMin: 12,
    actions: [
      breathingAction({
        idSuffix: 'before-thought-record',
        title: 'Спокойная пауза',
        template: 'box_breathing',
        durationSeconds: 240,
        prompt:
          'Сделай несколько спокойных вдохов и выдохов. Не нужно добиваться идеального спокойствия. Достаточно чуть замедлиться и дать себе больше места между мыслью и реакцией.',
      }),
      structuredFormAction({
        idSuffix: 'thought-record',
        title: 'Карточка самокритичной мысли',
        formKind: 'self_criticism_thought_record',
        helpHint: {
          title: 'Как работать с карточкой',
          description:
            'Выбери одну конкретную мысль, а не всю тему жизни. Сначала коротко опиши ситуацию и эмоцию, потом слова критика. После этого посмотри на факты с двух сторон и сформулируй более точную мысль. Она не обязана быть радостной. Важно, чтобы она звучала честнее и не била по тебе лишний раз.',
          examples: [
            'Ситуация: я {забыл|забыла} ответить на сообщение.',
            'Мысль критика: «я {ужасный друг|ужасная подруга}».',
            'Более точная мысль: «я {задержал|задержала} ответ и могу написать сейчас, не превращая это в приговор себе».',
          ],
        },
        fields: [
          {
            id: 'situation',
            label: 'Ситуация',
            type: 'textarea',
            maxLength: 400,
            required: true,
          },
          {
            id: 'emotion',
            label: 'Что я чувствую и насколько сильно?',
            type: 'textarea',
            maxLength: 240,
            required: true,
          },
          {
            id: 'automatic_thought',
            label: 'Какая мысль сейчас давит?',
            type: 'textarea',
            maxLength: 400,
            required: true,
          },
          {
            id: 'evidence_for',
            label: 'Что заставляет поверить этой мысли?',
            type: 'textarea',
            maxLength: 500,
          },
          {
            id: 'evidence_against',
            label: 'Что не учитывает критик?',
            type: 'textarea',
            maxLength: 500,
          },
          {
            id: 'balanced_kind_thought',
            label: 'Более точная и бережная мысль',
            type: 'textarea',
            maxLength: 500,
            required: true,
          },
        ],
      }),
      journalAction({
        idSuffix: 'thought-change',
        title: 'Что изменилось',
        prompt:
          'После этого разбора мысль стала сильнее, слабее или просто понятнее?',
        journalFormat: 'oneLine',
        maxLength: 240,
      }),
      aiChatAction({
        idSuffix: 'thought-record-chat',
        title: 'Разобрать, что получилось',
        topicPrompt:
          'Ты только что {прошёл|прошла} через карточку мысли: {разобрал|разобрала} ситуацию, {записал|записала} слова критика и {попробовал|попробовала} сформулировать более точную мысль. Давай посмотрим вместе, что изменилось - что стало чуть понятнее, а что пока остаётся тяжёлым.',
        goalHint:
          'Понять, что именно сдвинулось в восприятии мысли. Найти один маленький следующий шаг.',
        minQualifyingMessages: 3,
        minDurationSec: 120,
      }),
    ],
  },
  {
    title: 'Стыд и вина: что можно исправить',
    subtitle: 'Отделяем полезный шаг от лишней строгости к себе.',
    nextHint: 'Дальше соберём простой шаг после ошибки.',
    introText:
      'После ошибки может появиться вина, стыд или желание спрятаться от всех. Иногда действительно есть что-то, что можно сделать: извиниться, уточнить, исправить ошибку или сделать вывод на будущее. Но ругать себя сильнее не значит брать ответственность. Сегодня попробуем понять, где есть реальный шаг, а где ты просто становишься к себе слишком {жёстким|жёсткой}.',
    miniArticle: {
      title: 'Ответственность без лишней жестокости к себе',
      body: 'Вина обычно говорит о поступке: «я {сделал|сделала} что-то, что хочу исправить». Стыд звучит тяжелее: «со мной что-то не так». В жизни эти чувства часто смешиваются. Тогда становится трудно понять, что делать дальше: извиниться, исправить ошибку, попросить помощи или просто перестать добивать себя.\n\nДоброта к себе не отменяет ответственность. Наоборот, спокойный тон помогает яснее увидеть, что именно можно сделать: извиниться, уточнить, восстановить, сделать вывод или попросить поддержку.\n\nСегодня мы отделим реальный шаг от лишней строгости к себе. Если ситуация связана с насилием, угрозой или риском для безопасности, лучше не оставаться с этим в одиночку и обратиться за живой поддержкой.',
      sourceNotes: [
        'Терапия, сфокусированная на сострадании: стыд и самокритика.',
        'Когнитивно-поведенческая терапия: решение проблем.',
        'Безопасность: при насилии, угрозе или риске нужна живая поддержка.',
      ],
    },
    durationMin: 11,
    actions: [
      groundingAction({
        idSuffix: 'shame-grounding',
        title: 'Вернуться в настоящий момент',
        estimatedDurationSeconds: 240,
        prompt:
          'Сначала мягко верни внимание к комнате и телу. Когда стыда много, взгляд будто сужается до одной мысли. Эта короткая пауза поможет немного замедлиться и заметить, что рядом есть больше опор.',
      }),
      microReflectionAction({
        idSuffix: 'shame-or-guilt',
        title: 'Что сейчас сильнее',
        question: 'Что больше похоже на твой опыт в этой ситуации?',
        chips: [
          'я {сделал|сделала} ошибку',
          'мне кажется, что со мной что-то не так',
          'я боюсь реакции других',
          'я не понимаю, что можно исправить',
          'хочется спрятаться от всех',
          'сложно выбрать',
        ],
      }),
      structuredFormAction({
        idSuffix: 'repair-vs-attack',
        title: 'Что можно сделать',
        formKind: 'repair_vs_attack',
        helpHint: {
          title: 'Как отделить ответственность от самокритики',
          description:
            'Ответственность помогает понять, что можно сделать дальше. Самокритика часто уводит в ярлыки вроде «я всё {испортил|испортила}» или «со мной что-то не так». Здесь важно отделить конкретный следующий шаг от слов, которые только усиливают стыд и не помогают исправить ситуацию.',
          examples: [
            'Ответственность: «я {опоздал|опоздала} и могу предупредить человека».',
            'Самокритика: «я {безнадёжный|безнадёжная} и всегда всё порчу».',
            'Маленький шаг: написать, извиниться или уточнить следующий срок.',
          ],
        },
        fields: [
          {
            id: 'real_repair',
            label: 'Что здесь можно сделать?',
            type: 'textarea',
            maxLength: 400,
          },
          {
            id: 'attack_words',
            label: 'Какие слова только усиливают стыд?',
            type: 'textarea',
            maxLength: 400,
          },
          {
            id: 'small_repair_step',
            label: 'Что я могу сделать сейчас?',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      aiChatAction({
        idSuffix: 'shame-chat',
        title: 'Поговорить о том, что тяжело',
        topicPrompt:
          'Ты {разобрал|разобрала} ситуацию, где появился стыд или вина: что там можно сделать и что только усиливает боль. Давай посмотрим на это вместе - что из записанного ощущается как реальный шаг, а что как лишняя строгость к себе.',
        goalHint:
          'Отделить один реальный следующий шаг от лишней самокритики и назвать его. Если ситуация касается насилия или угрозы безопасности - предложить живую поддержку.',
        minQualifyingMessages: 3,
        minDurationSec: 180,
      }),
    ],
  },
  {
    title: 'Что делать после ошибки',
    subtitle: 'Выбираем один понятный шаг без лишней строгости к себе.',
    nextHint: 'Дальше потренируем внутреннего наставника.',
    introText:
      'Сегодня попробуем простой порядок действий после ошибки: остановиться, назвать факт и выбрать один шаг, который можно сделать дальше. Ошибка всё равно может быть неприятной, но её не нужно превращать в доказательство, что с тобой что-то не так.',
    durationMin: 9,
    actions: [
      breathingAction({
        idSuffix: 'repair-exhale',
        title: 'Выдох перед исправлением',
        template: 'breathing_4_6',
        durationSeconds: 240,
        prompt:
          'Сделай несколько длинных выдохов. Достаточно снизить шум, не нужно ждать полного спокойствия.',
      }),
      guidedStepsAction({
        idSuffix: 'mistake-repair',
        title: 'Разобрать ошибку спокойно',
        formKind: 'mistake_repair_steps',
        steps: [
          {
            id: 'fact',
            title: 'Что произошло',
            text: 'Опиши ситуацию коротко и без оценки себя.',
          },
          {
            id: 'impact',
            title: 'На что это повлияло',
            text: 'Что изменилось из-за этой ошибки: для тебя, другого человека или дела?',
          },
          {
            id: 'repair',
            title: 'Что можно сделать',
            text: 'Выбери один посильный шаг: уточнить, исправить, извиниться, попросить помощи или сделать вывод на будущее.',
          },
          {
            id: 'limit',
            title: 'Что не помогает',
            text: 'Какая самокритичная фраза только усиливает стыд и не помогает исправить ситуацию?',
          },
        ],
      }),
      journalAction({
        idSuffix: 'repair-step',
        title: 'Мой следующий шаг',
        prompt:
          'Запиши один конкретный шаг, который можно сделать дальше. Без фраз «я всегда» и «я никогда».',
        journalFormat: 'short',
        maxLength: 400,
      }),
    ],
  },
  {
    title: 'Внутренний наставник вместо внутреннего прокурора',
    subtitle: 'Создаём голос, который помогает учиться без унижения.',
    nextHint: 'Дальше переведём фокус к ценностям.',
    introText:
      'Критик часто звучит как прокурор: ищет вину и требует наказания. Сегодня мы попробуем другой режим - внутреннего наставника. Он не всё одобряет, но говорит так, чтобы ты {мог|могла} действовать дальше.',
    miniArticle: {
      title: 'Поддерживающий голос не обязан всё одобрять',
      body: 'Есть разница между голосом, который помогает учиться, и голосом, который унижает. Первый может быть честным: «это было неудачно, давай разберём, что улучшить». Второй делает глобальный вывод: «ты {никчёмный|никчёмная}».\n\nВ терапии, сфокусированной на сострадании, тренируют поддерживающий внутренний голос: способность успокаивать себя и сохранять уважение к себе в трудный момент. Это не слабость и не самообман. Это способ регулировать угрозу, чтобы мозг мог видеть варианты.\n\nСегодня мы создадим не идеального «внутреннего друга», а наставника: спокойного, конкретного, уважительного. Его задача - помочь сделать следующий шаг.',
      sourceNotes: [
        'Терапия, сфокусированная на сострадании: поддерживающий внутренний голос и внутреннее успокоение.',
        'Вмешательства доброты к себе.',
        'Терапия принятия и ответственности: позиция наблюдающего себя.',
      ],
    },
    durationMin: 11,
    actions: [
      meditationAction({
        idSuffix: 'inner-mentor',
        title: 'Голос наставника',
        template: 'compassionate_inner_mentor',
        durationSeconds: 420,
        prompt:
          'Короткая практика поддерживающего тона к себе. Ничего не нужно придумывать или решать: просто дыши спокойно и позволь внутреннему голосу стать чуть мягче и теплее.',
      }),
      structuredFormAction({
        idSuffix: 'mentor-profile',
        title: 'Опиши своего наставника',
        formKind: 'inner_mentor_profile',
        helpHint: {
          title: 'Кто такой внутренний наставник',
          description:
            'Это не голос, который всегда поддакивает. Наставник говорит честно и без унижения. Он помогает тебе разобраться и сделать следующий шаг, а не застрять в самокритике.',
          examples: [
            '«Давай разберём один момент, а потом выберем следующий шаг».',
            '«Ошибку можно исправлять без новых обвинений в свой адрес».',
            '«Лучше сделать проще и продолжить, чем бросить совсем».',
          ],
        },
        fields: [
          {
            id: 'tone',
            label: 'Как он разговаривает с тобой?',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'спокойно',
              'коротко',
              'честно',
              'тепло',
              'по делу',
              'без давления',
              'с юмором',
            ]),
          },
          {
            id: 'never_says',
            label: 'Что он никогда не скажет тебе?',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
          {
            id: 'mentor_phrase',
            label: 'Одна фраза, которую он мог бы сказать тебе сейчас',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'mentor-fit',
        title: 'Как это ощущается',
        question: 'Ощущается ли этот голос как твой?',
        chips: [
          'да, ощущается своим',
          'похоже, но не до конца',
          'пока чувствуется чужим',
          'что-то внутри сопротивляется',
          'странно, но интересно',
        ],
      }),
      aiChatAction({
        idSuffix: 'mentor-voice-chat',
        title: 'Проверить голос наставника',
        topicPrompt:
          'Ты {создал|создала} образ внутреннего наставника и {написал|написала} фразу, которую он мог бы сказать тебе сейчас. Давай проверим, насколько этот голос ощущается своим - как звучит эта фраза для тебя: поддерживающе, немного чуждо или как-то иначе.',
        goalHint:
          'Уйти с фразой наставника, которая ощущается своей. Если есть сопротивление - исследовать его с любопытством, не устранять насильно.',
        minQualifyingMessages: 3,
        minDurationSec: 150,
      }),
    ],
  },
  {
    title: 'Ценности вместо самооценки',
    subtitle: 'Переходим от вопроса «какой я» к направлению действия.',
    nextHint: 'Дальше поговорим с критиком в безопасной рамке.',
    introText:
      'Самокритика часто крутит один вопрос: «что со мной не так?» Терапия принятия и ответственности предлагает другой вопрос: «что для меня важно, и какой маленький шаг в эту сторону возможен сейчас?» Сегодня мы потренируем этот поворот.',
    miniArticle: {
      title: 'Ценность - это направление, а не оценка себя',
      body: 'Самооценка может прыгать от успеха к ошибке. Сегодня получилось - «я {нормальный|нормальная}», завтра сорвалось - «я {плохой|плохая}». Такой маятник утомляет и делает внутреннее состояние зависимым от результата.\n\nВ терапии принятия и ответственности ценности описывают направление: каким человеком ты хочешь быть в отношениях, работе, заботе о теле, отдыхе, учёбе, творчестве. Ценность не требует идеального выполнения. К ней можно возвращаться маленькими действиями.\n\nДоброта к себе здесь становится практичной: не «я {должен|должна} чувствовать себя хорошо», а «я могу сделать один шаг в сторону того, что мне важно, даже если внутри шумно».',
      sourceNotes: [
        'Терапия принятия и ответственности: ценности и действия в их сторону.',
        'Психологическая гибкость.',
        'Доброта к себе как поддерживающий контекст для изменения поведения.',
      ],
    },
    durationMin: 10,
    actions: [
      breathingAction({
        idSuffix: 'values-breath',
        title: 'Снизить шум перед выбором',
        template: 'breathing_4_6',
        durationSeconds: 240,
        prompt:
          'Сделай несколько спокойных вдохов и более длинных выдохов. Не нужно дышать идеально или что-то решать прямо сейчас. Просто замедлись и верни внимание к телу.',
      }),
      structuredFormAction({
        idSuffix: 'values-small-action',
        title: 'Ценность и маленькое действие',
        formKind: 'values_small_action',
        helpHint: {
          title: 'Что такое ценность',
          description:
            'Ценность - это направление, а не оценка себя и не задача на сегодня. Например: забота, честность, близость, здоровье, развитие. Маленькое действие - это один посильный шаг в эту сторону, даже если настроение неидеальное.',
          examples: [
            'Ценность: здоровье. Действие: выпить воды и лечь на 20 минут раньше.',
            'Ценность: близость. Действие: написать одному человеку короткое честное сообщение.',
            'Ценность: развитие. Действие: открыть задачу на 5 минут, без требования закончить всё.',
          ],
        },
        fields: [
          {
            id: 'value_area',
            label:
              'Выбери одно направление, которое сейчас важнее поддержать небольшим шагом.',
            type: 'choice',
            mode: 'single',
            options: makeChoiceOptions([
              'здоровье',
              'отношения',
              'работа/учёба',
              'отдых',
              'творчество',
              'дом',
              'развитие',
              'другое',
            ]),
          },
          {
            id: 'critic_hook',
            label: 'Какая мысль мешает сделать этот шаг?',
            type: 'textarea',
            helperText:
              'Например: «не сейчас», «это ничего не изменит», «я всё равно не справлюсь».',
            maxLength: 400,
          },
          {
            id: 'small_action',
            label: 'Какой маленький шаг сделаешь сегодня?',
            type: 'textarea',
            helperText:
              'Подойдёт действие на 5-10 минут. Главное - конкретно и без героизма.',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      journalAction({
        idSuffix: 'direction-phrase',
        title: 'Поддерживающая фраза для шага',
        prompt:
          'Запиши одну поддерживающую фразу, которая поможет сделать выбранный шаг, даже если мешающая мысль ещё остаётся. Например: «Даже с этой мыслью я могу начать с малого».',
        journalFormat: 'oneLine',
        maxLength: 220,
      }),
    ],
  },
  {
    title: 'Разговор с критиком',
    subtitle: 'Коротко разбираем страх под самокритичным голосом.',
    nextHint: 'Дальше превратим поддержку в маленькое действие.',
    introText:
      'Иногда самокритика звучит так спутанно, что в одиночку трудно понять, с чего начать. Сегодня ИИ-помощник поможет спокойно разобрать один момент: какая мысль зацепила, чего ты опасаешься, что в этом можно учесть и как сказать это себе без лишней жёсткости.',
    durationMin: 14,
    actions: [
      groundingAction({
        idSuffix: 'before-critic-chat',
        title: 'Опора перед разговором',
        estimatedDurationSeconds: 240,
        prompt:
          'Перед чатом верни внимание к телу и комнате. Разговор должен помогать формулировать, а не раскручивать самокритику.',
      }),
      aiChatAction({
        idSuffix: 'critic-chat',
        title: 'Разобрать голос критика',
        topicPrompt:
          'Давай разберём один конкретный эпизод самокритики: что именно говорит критик, чего он, возможно, боится, есть ли в его словах полезное зерно и как переформулировать это без атаки на себя.',
        goalHint:
          'Найти одну более точную формулировку вместо самокритичной. Выйти с одним маленьким следующим шагом.',
        minQualifyingMessages: 3,
        minDurationSec: 180,
      }),
      journalAction({
        idSuffix: 'critic-chat-summary',
        title: 'Итог разговора',
        prompt:
          'Запиши один вывод, который стал понятнее после разговора, и один шаг, который можно сделать дальше.',
        journalFormat: 'short',
        maxLength: 500,
      }),
      selfKindnessWeeklyCheckAction({
        idSuffix: 'weekly-check-14',
        title: 'Проверка после 14 шагов',
        placement: 'after_completion',
        prompt:
          'Выбери, что сейчас ближе к твоему состоянию. Здесь не нужно оценивать себя или доказывать прогресс. Если сейчас тяжелее, это не провал: можно просто сделать шаг мягче и не требовать от себя слишком много.',
      }),
    ],
  },
  {
    title: 'Маленький шаг для себя',
    subtitle: 'Выбираем простое действие, которое поможет позаботиться о себе.',
    nextHint: 'Дальше подготовим просьбу о поддержке.',
    introText:
      'Доброта к себе становится понятнее, когда проявляется в обычных действиях: лечь спать чуть раньше, сделать паузу, убрать лишнюю нагрузку, попросить объяснить непонятное или начать задачу с первого простого пункта. Сегодня выберем одно небольшое действие для себя.',
    miniArticle: {
      title: 'Поддержка в обычных действиях',
      body: 'Внутренний тон важен, но одной фразы часто мало. Если поддержка остаётся только в словах, самокритика быстро возвращает старый сценарий: «ты просто себя жалеешь».\n\nВ терапии принятия и ответственности есть идея действия в сторону ценности: можно сделать небольшой шаг к тому, что важно, даже если внутри всё ещё есть дискомфорт. В доброте к себе такой шаг не должен быть наказанием или проверкой силы. Он должен немного снижать нагрузку, добавлять ясность или помогать действовать без лишнего давления на себя.\n\nСегодня мы выберем маленький шаг для себя. Не «исправить всю жизнь», а одно действие, которое можно сделать сегодня или завтра.',
      sourceNotes: [
        'Терапия принятия и ответственности: действие в сторону ценности.',
        'Доброта к себе и изменение поведения.',
        'Структурированная самопомощь с поддержкой: бережный темп.',
      ],
    },
    durationMin: 10,
    actions: [
      breathingAction({
        idSuffix: 'before-support-action',
        title: 'Перед выбором действия',
        template: 'box_breathing',
        durationSeconds: 240,
        prompt:
          'Сделай несколько спокойных циклов дыхания: вдох, пауза, выдох, пауза. Удерживай мягкий ритм и возвращай внимание к дыханию.',
      }),
      structuredFormAction({
        idSuffix: 'support-action-plan',
        title: 'План действия на своей стороне',
        formKind: 'self_support_action_plan',
        helpHint: {
          title: 'Как выбрать маленькое действие',
          description:
            'Действие должно быть достаточно маленьким, чтобы его можно было попробовать спокойно. Если план звучит как наказание, уменьшай его. Если нужна помощь другого человека, это тоже можно записать как часть плана.',
          examples: [
            'Не «разобраться со всей работой», а «выбрать одну задачу и записать первый шаг».',
            'Не «стать спокойным», а «сделать несколько выдохов и взять короткую паузу».',
            'Если действие всё ещё кажется тяжёлым, сделай его меньше и проще.',
          ],
        },
        fields: [
          {
            id: 'need',
            label:
              'Выбери одно направление, которое сейчас важнее поддержать небольшим шагом.',
            type: 'choice',
            mode: 'single',
            options: makeChoiceOptions([
              'тело',
              'отдых',
              'отношения',
              'работа/учёба',
              'дом',
              'эмоции',
              'границы',
            ]),
          },
          {
            id: 'small_action',
            label: 'Маленькое действие',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
          {
            id: 'when',
            label: 'Когда я попробую?',
            type: 'choice',
            mode: 'single',
            options: makeChoiceOptions([
              'сегодня',
              'завтра утром',
              'завтра днём',
              'на выходных',
              'как сделать этот шаг проще?',
            ]),
          },
          {
            id: 'make_smaller',
            label: 'Как ты это упростишь?',
            type: 'textarea',
            maxLength: 300,
            visibleWhen: {
              fieldId: 'when',
              valueIn: ['option_5'],
            },
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'plan-realism',
        title: 'Проверка реалистичности',
        question: 'Насколько план выглядит выполнимым?',
        chips: ['выполним', 'надо уменьшить', 'пока не готов', 'сделаю позже'],
      }),
    ],
  },
  {
    title: 'Просить поддержку без самоунижения',
    subtitle: 'Готовим просьбу, которая уважает и тебя, и другого.',
    nextHint: 'Дальше поставим границу с собственной нагрузкой.',
    introText:
      'Просить поддержку бывает трудно: критик может говорить, что ты «слишком много хочешь» или «{должен|должна} справиться {сам|сама}». Сегодня мы потренируем просьбу, которая уважает и тебя, и другого человека.',
    durationMin: 9,
    actions: [
      meditationAction({
        idSuffix: 'right-to-support',
        title: 'Право на поддержку',
        template: 'support_request_kindness',
        durationSeconds: 360,
        prompt:
          'Короткая спокойная практика. Заметь дыхание, положение тела и точки опоры. Если мысли отвлекают, мягко возвращай внимание к вдоху и выдоху.',
      }),
      guidedStepsAction({
        idSuffix: 'support-request-script',
        title: 'Собрать просьбу',
        formKind: 'support_request_script',
        steps: [
          {
            id: 'context',
            title: 'Что происходит',
            text: 'Опиши ситуацию одним коротким предложением.',
          },
          {
            id: 'need',
            title: 'Какая помощь нужна',
            text: 'Напиши конкретно: выслушать, объяснить, помочь с делом или просто побыть рядом.',
          },
          {
            id: 'boundary',
            title: 'Оставить выбор',
            text: 'Добавь, что человек может отказаться или предложить другой удобный вариант.',
          },
          {
            id: 'no_self_attack',
            title: 'Убрать лишние извинения',
            text: 'Не добавляй фразы вроде «я ужасно мешаю» или «прости, что я {такой|такая}».',
          },
        ],
      }),
      aiChatAction({
        idSuffix: 'support-request-chat',
        title: 'Отрепетировать просьбу',
        topicPrompt:
          'Ты {написал|написала} просьбу о поддержке. Давай произнесём её вместе - скажи мне эту просьбу своими словами, и я отвечу как принимающий человек. Посмотрим, есть ли там лишние извинения или самоунижение, которые можно убрать.',
        goalHint:
          'Пользователь чувствует себя немного увереннее с просьбой о поддержке. Убрать самоунижающие фразы, сохранив честность.',
        minQualifyingMessages: 3,
        minDurationSec: 150,
      }),
    ],
  },
  {
    title: 'Когда пора снизить нагрузку',
    subtitle: 'Учимся снижать давление и не брать на себя лишнее.',
    nextHint: 'Дальше добавим доброту к телу в обычный день.',
    introText:
      'Иногда внутренний критик требует продолжать, даже когда сил уже мало. Доброта к себе может быть простой границей: остановиться, перенести задачу, сделать меньше, попросить уточнить непонятное или не брать лишнюю нагрузку. Сегодня выберем одну такую границу для себя.',
    durationMin: 9,
    actions: [
      tensionAction({
        idSuffix: 'release-effort',
        title: 'Снять лишнее напряжение',
        durationSeconds: 300,
        prompt:
          'Сожми и отпусти плечи, кисти и лицо. Заметь, где тело держит «надо ещё».',
      }),
      structuredFormAction({
        idSuffix: 'self-boundary',
        title: 'Где снизить нагрузку',
        formKind: 'self_boundary_plan',
        helpHint: {
          title: 'Как выбрать границу',
          description:
            'Граница помогает заранее решить, когда пора сделать паузу, перенести задачу или взять меньше. Это не отказ от дела, а способ не доводить себя до истощения.',
          examples: [
            '«Я остановлюсь, если начну перечитывать одно сообщение снова и снова».',
            '«Я сделаю одну часть задачи, а остальное перенесу».',
            '«Если тело уже болит, я выбираю отдых, а не ещё один рывок».',
          ],
        },
        fields: [
          {
            id: 'pressure_area',
            label: 'Где сейчас больше всего давления?',
            type: 'choice',
            mode: 'single',
            options: makeChoiceOptions([
              'работа/учёба',
              'отношения',
              'дом',
              'здоровье',
              'финансы',
              'саморазвитие',
              'другое',
            ]),
          },
          {
            id: 'critic_rule',
            label: 'Какое жёсткое требование сейчас давит?',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
          {
            id: 'kind_boundary',
            label: 'Что я могу сделать мягче?',
            type: 'textarea',
            maxLength: 300,
            required: true,
          },
          {
            id: 'first_signal',
            label: 'Как я пойму, что пора остановиться?',
            type: 'textarea',
            maxLength: 240,
          },
        ],
      }),
      journalAction({
        idSuffix: 'boundary-phrase',
        title: 'Фраза на случай перегруза',
        prompt:
          'Запиши короткую фразу, которая поможет вовремя снизить нагрузку. Например: «Я сделаю только самое важное», «На сегодня хватит» или «Я вернусь к этому позже».',
        journalFormat: 'oneLine',
        maxLength: 240,
      }),
    ],
  },
  {
    title: 'Забота о теле в обычный день',
    subtitle:
      'Проверяем простые потребности: отдых, еду, воду, движение и уход.',
    nextHint: 'Дальше соберём план на трудный день.',
    introText:
      'К телу легко относиться через требования: как оно выглядит, сколько выдерживает и насколько удобно помогает справляться с делами. Сегодня посмотрим иначе: что телу сейчас нужно, чтобы день стал немного легче?',
    durationMin: 9,
    actions: [
      meditationAction({
        idSuffix: 'body-kindness',
        title: 'Спокойное внимание к телу',
        template: 'body_kindness_neutral',
        durationSeconds: 420,
        prompt:
          'Короткая спокойная практика. Заметь дыхание, положение тела и ощущения без оценки. Сейчас достаточно просто отнестись к телу внимательнее и мягче.',
      }),
      guidedStepsAction({
        idSuffix: 'body-care-check',
        title: 'Проверить, что нужно телу',
        formKind: 'body_care_check',
        steps: [
          {
            id: 'water',
            title: 'Вода и еда',
            text: 'Нужна ли сейчас вода, еда или небольшой перекус?',
          },
          {
            id: 'rest',
            title: 'Отдых',
            text: 'Нужна ли короткая пауза, сон или несколько минут в тишине?',
          },
          {
            id: 'movement',
            title: 'Движение',
            text: 'Что телу сейчас полезнее: немного размяться или, наоборот, снизить нагрузку?',
          },
          {
            id: 'care',
            title: 'Уход',
            text: 'Что сейчас может помочь: душ, тепло, удобная одежда, лёгкий уход или запись к врачу?',
          },
        ],
      }),
      microReflectionAction({
        idSuffix: 'body-care-choice',
        title: 'Что выберу',
        question: 'Какая забота о теле сейчас самая реалистичная?',
        chips: [
          'вода/еда',
          'пауза',
          'сон',
          'движение',
          'меньше нагрузки',
          'медицинская забота',
          'пока не знаю',
        ],
      }),
    ],
  },
  {
    title: 'План на трудный день',
    subtitle: 'Заранее выбираем, что поможет, если станет тяжелее.',
    nextHint: 'Дальше соберём личный набор самоподдержки.',
    introText:
      'Даже когда навык самоподдержки развивается, трудные дни всё равно бывают. В такие моменты самокритика может звучать сильнее обычного. Сегодня соберём короткий план: что упростить, какая практика поможет вернуться в опору и к кому обратиться, если {одному|одной} тяжело.',
    miniArticle: {
      title: 'Трудный день - не провал',
      body: 'Если состояние ухудшилось, самокритика может сразу сказать: «ничего не меняется». Но навык редко развивается ровно и без сбоев. Усталость, конфликт, перегрузка, болезнь или недосып могут временно усилить старые реакции.\n\nНа такой день полезно заранее иметь короткий план: снизить нагрузку, выбрать одну простую практику, обратиться за поддержкой и не начинать сложный разбор, если от него становится только тяжелее.\n\nЕсли появляется ощущение, что тебе или кому-то рядом небезопасно, важно не оставаться с этим в одиночку. В такой ситуации нужен не очередной шаг программы, а живая помощь и срочная поддержка.',
      sourceNotes: [
        'Рекомендации Национального института здоровья и совершенствования медицинской помощи Великобритании: маршрутизация риска и проверка динамики.',
        'Кризисная маршрутизация Mentala.',
        'Профилактика отката и план самоподдержки.',
      ],
    },
    durationMin: 12,
    actions: [
      groundingAction({
        idSuffix: 'hard-day-grounding',
        title: 'Сейчас и здесь',
        estimatedDurationSeconds: 240,
        prompt:
          'Сделай короткое заземление. В трудный день не нужно решать всю жизнь - сначала вернуться в ближайший момент.',
      }),
      structuredFormAction({
        idSuffix: 'hard-day-plan',
        title: 'План трудного дня',
        formKind: 'hard_day_self_kindness_plan',
        helpHint: {
          title: 'Зачем нужен план на трудный день',
          description:
            'Этот план нужен не для идеального контроля, а для момента, когда сил меньше обычного и самокритика звучит сильнее. Заполняй его как короткую подсказку для себя: что упростить, к чему вернуться и куда обратиться, если станет небезопасно.',
          examples: [
            'Ранний сигнал: «я перестаю отвечать людям и всё откладываю».',
            'Что упростить: «перенести одну задачу, поесть, сделать заземление».',
            'Куда обратиться: близкий человек, специалист или местная экстренная служба.',
          ],
        },
        fields: [
          {
            id: 'early_signs',
            label: 'Как я понимаю, что стало хуже?',
            type: 'textarea',
            maxLength: 400,
            required: true,
          },
          {
            id: 'reduce_load',
            label: 'Что можно упростить или отложить?',
            type: 'textarea',
            maxLength: 400,
          },
          {
            id: 'one_anchor',
            label:
              'Какая одна практика помогает тебе стабилизироваться в трудный день?',
            type: 'choice',
            mode: 'single',
            options: makeChoiceOptions([
              'дыхание',
              'заземление',
              'снятие напряжения',
              'короткая запись',
              'попросить поддержку',
              'сон/еда/вода',
              'маршрут срочной поддержки',
            ]),
          },
          {
            id: 'support_route',
            label:
              'Куда я обращусь, если станет небезопасно или слишком тяжело?',
            type: 'textarea',
            maxLength: 400,
            required: true,
          },
        ],
      }),
      journalAction({
        idSuffix: 'permission-to-simplify',
        title: 'Фраза на трудный день',
        prompt:
          'Запиши короткую фразу, которая поможет не требовать от себя слишком много. Например: «Сегодня можно сделать меньше» или «Сейчас важнее не перегрузить себя».',
        journalFormat: 'oneLine',
        maxLength: 240,
      }),
    ],
  },
  {
    title: 'Мой набор самоподдержки',
    subtitle: 'Выбираем техники, к которым можно вернуться в обычной жизни.',
    nextHint: 'Дальше завершим сад и подготовим переход.',
    introText:
      'За сад ты {попробовал|попробовала} разные способы поддержать себя: дыхание, паузу, карточку мысли, голос наставника, ценности, просьбу о поддержке и границы. Сегодня соберём не идеальный список, а личный набор на разные ситуации.',
    miniArticle: {
      title: 'Свой набор лучше общего совета',
      body: 'Самоподдержка работает лучше, когда она подходит конкретному человеку и конкретной ситуации. Одному помогает короткая фраза, другому - пауза для тела, третьему - карточка мысли или просьба о помощи. Общий совет может звучать красиво, но не всегда помогает в нужный момент.\n\nПоэтому важно заранее понимать, что делать в разных случаях: когда напряжено тело, когда самокритика стала сильнее, когда нужно перейти к действию или попросить поддержку. Так техника становится не просто упражнением в приложении, а понятным способом помочь себе.\n\nЕсли какая-то техника не подошла, её не нужно брать в набор. Оставляем только то, что выглядит доступным, честным и безопасным для тебя.',
      sourceNotes: [
        'Структурированная самопомощь с поддержкой: закрепление навыков.',
        'Терапия принятия и ответственности: функциональная пригодность навыка к контексту.',
        'Поддержание навыков доброты к себе после программы.',
      ],
    },
    durationMin: 14,
    actions: [
      breathingAction({
        idSuffix: 'toolkit-breath',
        title: 'Опора перед сборкой',
        template: 'breathing_4_6',
        durationSeconds: 240,
        prompt:
          'Сделай несколько спокойных вдохов и более длинных выдохов. Не нужно ничего выбирать или решать во время практики. Просто замедлись и возвращай внимание к дыханию.',
      }),
      structuredFormAction({
        idSuffix: 'self-kindness-toolkit',
        title: 'Набор самоподдержки',
        formKind: 'self_kindness_toolkit',
        helpHint: {
          title: 'Как собрать набор',
          description:
            'Выбирай не самые красивые техники, а те, к которым ты реально можешь вернуться. Набор нужен по ситуациям: что делать с телом, что делать с мыслью, что делать, когда нужен следующий шаг.',
          examples: [
            'Тело напряжено: мягкий выдох или снятие напряжения.',
            'Критик громкий: карточка мысли или фраза наставника.',
            'Нужно действовать: маленький шаг, просьба о поддержке или план трудного дня.',
          ],
        },
        fields: [
          {
            id: 'body_tool',
            label:
              'Что поможет, когда в теле много напряжения? Можно выбрать несколько вариантов.',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'дыхание с длинным выдохом',
              'заземление 5-4-3-2-1',
              'снятие напряжения в теле',
              'короткая пауза перед реакцией',
              'сон, еда или вода',
              'ничего из этого',
            ]),
          },
          {
            id: 'thought_tool',
            label:
              'Что поможет, когда самокритики становится слишком много? Можно выбрать несколько вариантов.',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'посмотреть на мысль со стороны',
              'проверить мысль через факты',
              'фраза внутреннего наставника',
              'поговорить с ИИ-помощником',
              'выгрузить мысли в запись',
              'ничего из этого',
            ]),
          },
          {
            id: 'action_tool',
            label:
              'Что поможет, когда нужно сделать следующий шаг? Можно выбрать несколько вариантов.',
            type: 'choice',
            mode: 'multiple',
            options: makeChoiceOptions([
              'выбрать один маленький шаг',
              'спокойно разобрать ошибку',
              'попросить поддержку',
              'снизить нагрузку',
              'открыть план на трудный день',
              'ничего из этого',
            ]),
          },
          {
            id: 'one_phrase',
            label:
              'Запиши одну фразу, которую хочешь оставить себе после этого сада',
            type: 'textarea',
            helperText:
              'Это может быть короткое напоминание, поддерживающая мысль или фраза на трудный момент.',
            maxLength: 300,
            required: true,
          },
        ],
      }),
      guidedStepsAction({
        idSuffix: 'toolkit-rehearsal',
        title: 'Как я воспользуюсь набором',
        formKind: 'toolkit_rehearsal',
        helpHint: {
          title: 'Зачем это нужно',
          description:
            'Набор полезнее, когда заранее понятно, в какой ситуации к нему вернуться и с чего начать. Здесь нужно выбрать один обычный трудный момент и решить, что поможет первым, а что можно попробовать следующим.',
          examples: [
            'Ситуация: после сложного разговора я начинаю ругать себя.',
            'Сначала: фраза внутреннего наставника и дыхание с длинным выдохом.',
            'Если не стало легче: написать близкому человеку или снизить нагрузку.',
          ],
        },
        steps: [
          {
            id: 'choose',
            title: 'Выбрать ситуацию',
            text: 'Вспомни обычный трудный момент, в котором этот набор может пригодиться.',
          },
          {
            id: 'pick',
            title: 'Выбрать первый шаг',
            text: 'Что из набора ты попробуешь сначала?',
          },
          {
            id: 'fallback',
            title: 'Добавить запасной вариант',
            text: 'Что можно попробовать дальше, если первый шаг не поможет?',
          },
        ],
      }),
    ],
  },
  {
    title: 'Пион расцвёл',
    subtitle: 'Собираем личный вывод и спокойно завершаем программу.',
    nextHint: 'Сад «Доброта к себе» завершён.',
    introText:
      'Этот шаг завершает сад «Доброта к себе». Мы не подводим итог в стиле «теперь всё должно быть хорошо». Мы отметим, что ты {потренировал|потренировала}, что оказалось полезным и к чему стоит возвращаться для закрепления навыка.',
    miniArticle: {
      title: 'Завершение - это не экзамен',
      body: 'Завершение сада не означает, что самокритика исчезла. Скорее, у тебя появился набор способов отвечать ей иначе: пауза, телесная опора, более точная мысль, внутренний наставник, просьба о поддержке, граница и план на трудный день.\n\nНавык доброты к себе растёт через повторение в обычных ситуациях. Иногда он будет доступен быстро, иногда ты вспомнишь о нём уже после того, как самокритика включилась. Это нормально: старые реакции меняются постепенно.\n\nПион в этом саде - метафора такого процесса: не резкий рывок, а постепенное раскрытие. К некоторым шагам и практикам можно возвращаться повторно, чтобы закреплять то, что оказалось полезным именно для тебя.',
      sourceNotes: [
        'Поддержание навыков доброты к себе.',
        'Терапия принятия и ответственности: продолжение действий в сторону ценностей.',
        'Закрепление навыков через повторение практик после завершения программы.',
      ],
    },
    durationMin: 18,
    actions: [
      meditationAction({
        idSuffix: 'peony-completion',
        title: 'Финальная практика пиона',
        template: 'self_kindness_completion',
        durationSeconds: 600,
        prompt:
          'Мягкая завершающая практика. Несколько минут спокойного дыхания и тёплого присутствия с собой.',
      }),
      aiChatAction({
        idSuffix: 'completion-chat',
        title: 'Завершить сад с ассистентом',
        topicPrompt:
          'Ты {прошёл|прошла} сад «Доброта к себе» и уже {собрал|собрала} короткий итог. Давай спокойно обсудим, как использовать его дальше: в каких ситуациях к нему возвращаться, что поддержать в ближайшие дни и что делать, если самокритика снова станет сильнее.',
        goalHint:
          'Помочь пользователю связать итог сада с обычной жизнью: выбрать одну ситуацию для применения, одну опору из набора и один мягкий следующий шаг. Не повторять форму, не оценивать прогресс и не использовать мотивационные клише.',
        minQualifyingMessages: 4,
        minDurationSec: 240,
      }),
      guidedStepsAction({
        idSuffix: 'final-assessment',
        title: 'Финальная оценка доброты к себе',
        subtitle: 'Можно пройти или пропустить',
        formKind: 'assessment_prompt',
        template: 'program_final',
        targetId: 'self_compassion_scs_sf_v1',
        required: false,
        steps: [
          {
            id: 'assessment-final-intro',
            title: 'Перед итогом сада',
            text: 'Пройди короткий опросник и посмотри, как ты отвечаешь на вопросы об отношении к себе сейчас. Это не экзамен и не оценка того, насколько хорошо ты прошёл сад.',
            required: false,
          },
        ],
      }),
      selfKindnessWeeklyCheckAction({
        idSuffix: 'weekly-check-21',
        title: 'Финальная проверка сада',
        placement: 'before_final_completion',
        prompt:
          'Финальная проверка нужна для динамики и безопасности, а не для оценки результата.',
      }),
    ],
  },
];

// Map<slug, blueprints>. Bootstrap новых Садов добавлять сюда + в PROGRAM_BOOTSTRAP ниже.
// Экспортируется для тестов (tests/peony-blueprint.test.ts).
export const STEP_BLUEPRINTS_BY_SLUG: Record<string, StepBlueprint[]> = {
  [DEFAULT_RETENTION_PROGRAM_SLUG]: STEP_BLUEPRINTS_CALM_ANXIETY_30,
  self_kindness_21: STEP_BLUEPRINTS_SELF_KINDNESS_21,
};

function getStepBlueprintsForSlug(slug: string): StepBlueprint[] {
  const list = STEP_BLUEPRINTS_BY_SLUG[slug];
  if (!list || list.length === 0) {
    // Силуэтные программы (см. SILHOUETTE_PROGRAMS) видны в Оранжерее, но не
    // запускаются - у них пока нет контента. Бросаем структурированный error,
    // который endpoint'ы (start.post.ts) переводят в HTTP 503 + user-friendly
    // сообщение, а не в общий 500.
    const error = new Error(
      `No step blueprints registered for program slug: ${slug}`
    );
    (error as Error & { code?: string }).code = 'E_CONTENT_PENDING';
    throw error;
  }
  return list;
}

// Каталог «Мысли дня». Теги определяют, в каком контексте предпочтительно
// показывать текст:
//   anxiety      - сад «Спокойствие» (calm_anxiety_30), CBT/ACT по тревоге
//   self_compassion - сад «Доброта к себе» (self_kindness_21), Self-Compassion/CFT
//   stress       - перегрузка, ресурс, восстановление
//   low_mood     - подавленное настроение, нормализация, движение вперёд
//   universal    - подходит для любого контекста
//
// Алгоритм выбора: сначала кластер текущей программы, fallback на universal.
// При исчерпании показываем по кругу, исключая сохранённые тексты (v2).
// Источники: CBT (Beck), ACT (Hayes), Self-Compassion (Neff), DBT (Linehan).

type ThoughtTag =
  | 'anxiety'
  | 'self_compassion'
  | 'stress'
  | 'low_mood'
  | 'universal';

type ThoughtEntry = { text: string; tags: ThoughtTag[] };

const THOUGHT_CATALOG: ThoughtEntry[] = [
  // ── Тревога (anxiety, 20 текстов) ──────────────────────────────────────
  {
    text: 'Тревога предсказывает катастрофу, но прогнозы сбываются реже, чем кажется. Вспомни: чем закончился прошлый раз, когда тебя так накрывало?',
    tags: ['anxiety'],
  },
  {
    text: 'Когда тело напрягается и мысли несутся, это не сигнал опасности. Тревога появляется там, где тебе что-то небезразлично.',
    tags: ['anxiety'],
  },
  {
    text: 'Мысль «со мной что-то не так» очень убедительна. Но убедительность - это ещё не точность.',
    tags: ['anxiety'],
  },
  {
    text: 'Мозг при тревоге хорошо ищет угрозы и плохо видит то, что в порядке. Иногда стоит намеренно спросить себя: что сейчас идёт нормально?',
    tags: ['anxiety'],
  },
  {
    text: 'Избегание снижает тревогу на пять минут и усиливает её в следующий раз. Тело запоминает, что уйти было единственным способом справиться.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога просит проверить ещё раз, уточнить ещё раз, спросить ещё раз. Каждая проверка говорит мозгу, что угроза реальна. Иногда остановиться раньше - это тоже выбор.',
    tags: ['anxiety'],
  },
  {
    text: 'Ночью мозг переоценивает угрозы. Мысли, которые кажутся катастрофой в три ночи, редко выглядят так же утром.',
    tags: ['anxiety'],
  },
  {
    text: '«Я не справлюсь» - привычная мысль при тревоге, не факт. Ты {справлялся|справлялась} с трудным раньше, даже когда казалось, что нет.',
    tags: ['anxiety'],
  },
  {
    text: 'Неопределённость тяжелее, чем определённо плохое. Мозг не любит ситуации без ответа и начинает придумывать самый пугающий вариант. Это его способ заполнить пробел, а не описание реальности.',
    tags: ['anxiety'],
  },
  {
    text: 'Дышать медленнее при тревоге - не просто совет. Выдох длиннее вдоха напрямую активирует парасимпатическую систему, и тело начинает успокаиваться.',
    tags: ['anxiety'],
  },
  {
    text: 'Когда тревога громкая, с ней не нужно спорить. Можно заметить: вот она. И не следовать за каждой мыслью, которую она подбрасывает.',
    tags: ['anxiety'],
  },
  {
    text: 'Поиск заверений снаружи временно помогает и долгосрочно усиливает тревогу. Она учится, что спокойствие возможно только при чьём-то подтверждении.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога говорит языком «всегда» и «никогда». Реальность почти всегда сложнее и мягче этих слов.',
    tags: ['anxiety'],
  },
  {
    text: 'Откладывать при тревоге кажется облегчением, но дело никуда не уходит, а тревога о нём растёт. Маленький первый шаг работает лучше, чем ожидание правильного настроения.',
    tags: ['anxiety'],
  },
  {
    text: 'Учащённый пульс, напряжение, жар в лице при тревоге - не опасны. Тело готовится к действию, даже если действия не требуется.',
    tags: ['anxiety'],
  },
  {
    text: 'Перфекционизм и тревога часто ходят вместе. За «я {должен|должна} сделать это идеально» почти всегда прячется «я боюсь, что меня осудят».',
    tags: ['anxiety'],
  },
  {
    text: '«А вдруг» - вопрос, на который редко есть ответ прямо сейчас. Переносить неопределённость тяжело. Но это навык - он развивается, если не убегать от него каждый раз.',
    tags: ['anxiety'],
  },
  {
    text: 'Заземление помогает не потому что это магия. Оно переключает внимание с мыслей на ощущения, и мозг получает другой сигнал.',
    tags: ['anxiety'],
  },
  {
    text: 'Тревога требует немедленного ответа. Но большинство вещей, которые кажутся срочными, на самом деле ждут. Пауза перед реакцией - уже навык.',
    tags: ['anxiety'],
  },
  {
    text: 'Принятие неопределённости - не значит смириться с плохим. Это значит не тратить силы на то, что пока нельзя контролировать.',
    tags: ['anxiety'],
  },

  // ── Самосочувствие (self_compassion, 20 текстов) ───────────────────────
  {
    text: 'С другом в трудной ситуации ты бы {говорил|говорила} мягче, чем говоришь с собой. Это не случайность - это паттерн, который можно замечать.',
    tags: ['self_compassion'],
  },
  {
    text: 'Ошибка - это событие, которое произошло. Не определение тебя как человека.',
    tags: ['self_compassion'],
  },
  {
    text: 'Самокритика кажется полезной, как будто без неё расслабишься. На практике она сужает внимание и мешает исправлять ситуацию спокойно.',
    tags: ['self_compassion'],
  },
  {
    text: '«Я {должен был|должна была} знать лучше» - жёсткий стандарт. В тот момент ты {делал|делала} то, что {мог|могла}, с тем, что зна{л|ла} тогда.',
    tags: ['self_compassion'],
  },
  {
    text: 'Стыд говорит: «я плохой». Вина говорит: «я сделал что-то не то». Только второе помогает что-то изменить.',
    tags: ['self_compassion'],
  },
  {
    text: 'Критик внутри иногда пытается защитить: не дать ошибиться снова, не разочаровать других. Его намерение понятно. Но метод не всегда работает.',
    tags: ['self_compassion'],
  },
  {
    text: 'Трудный опыт - не то, что случается только с тобой. Ошибки, боль, растерянность - это часть того, что значит быть человеком.',
    tags: ['self_compassion'],
  },
  {
    text: 'Между ошибкой и самонаказанием можно вставить паузу. Один спокойный вдох. Этого иногда достаточно, чтобы выбрать другой ответ.',
    tags: ['self_compassion'],
  },
  {
    text: 'Требовать от себя большего - нормально. Требовать идеального - рецепт истощения, а не роста.',
    tags: ['self_compassion'],
  },
  {
    text: 'Когда тяжело, иногда самое точное, что можно сказать себе: «сейчас трудно, и это нормально». Не «всё пройдёт», не «соберись» - просто признание.',
    tags: ['self_compassion'],
  },
  {
    text: 'Мысль о том, что ты недостаточно {хорош|хороша}, очень убедительна. Убедительность не равна точности.',
    tags: ['self_compassion'],
  },
  {
    text: 'Доброта к себе - не оправдание всего подряд. Это другой способ отвечать на ошибки: через понимание, а не через атаку.',
    tags: ['self_compassion'],
  },
  {
    text: 'Заботиться о себе не значит быть {слабым|слабой}. Это значит поддерживать ресурс, который позволяет вообще что-то делать.',
    tags: ['self_compassion'],
  },
  {
    text: 'Ты не {обязан|обязана} зарабатывать право на отдых. Усталость - это сигнал, а не наказание за недостаточную продуктивность.',
    tags: ['self_compassion'],
  },
  {
    text: 'Слова, которые ты выбираешь для себя в трудный момент, формируют то, как ты через него проходишь.',
    tags: ['self_compassion'],
  },
  {
    text: 'Возвращаться к себе после трудного дня, ошибки или неприятного разговора - это навык. Не интуиция и не черта характера, а то, что развивается через практику.',
    tags: ['self_compassion'],
  },
  {
    text: 'Рабочая поддержка звучит не идеально. Она честная и достаточно тёплая, чтобы на неё можно было опереться.',
    tags: ['self_compassion'],
  },
  {
    text: 'Тело не обязано заслуживать заботу через продуктивность. Оно просто участвует в твоём дне.',
    tags: ['self_compassion'],
  },
  {
    text: 'Когда критик внутри говорит громко, его не обязательно заглушать. Можно заметить: это опять он. И не идти за каждым его словом.',
    tags: ['self_compassion'],
  },
  {
    text: 'Разрешить себе быть {несовершенным|несовершенной} сегодня - это не сдаться. Это создать условия, в которых возможен реальный рост.',
    tags: ['self_compassion'],
  },

  // ── Стресс (stress, 8 текстов) ─────────────────────────────────────────
  {
    text: 'Перегрузка - это не сигнал о слабости. Это сигнал о том, что нагрузка превышает ресурс. Нагрузку можно изменить.',
    tags: ['stress'],
  },
  {
    text: '«Надо держаться» иногда полезно. Но держаться без восстановления - это расход, который рано или поздно предъявит счёт.',
    tags: ['stress'],
  },
  {
    text: 'Когда всё кажется срочным, ничто не срочно по-настоящему. Выбрать одно важное тяжело, но снижает нагрузку лучше, чем делать всё одновременно.',
    tags: ['stress'],
  },
  {
    text: 'Отдых, который прерывается виной, восстанавливает хуже. Разрешить себе отдыхать - это не лень, это управление ресурсом.',
    tags: ['stress'],
  },
  {
    text: 'Сделать меньше и действительно восстановиться часто эффективнее, чем продолжать на нуле.',
    tags: ['stress'],
  },
  {
    text: 'Тело реагирует на хронический стресс раньше, чем мы это осознаём. Усталость, раздражительность, снижение концентрации - это сигналы, а не слабость.',
    tags: ['stress'],
  },
  {
    text: 'Задачи не исчезают от беспокойства о них. Беспокойство забирает энергию, которая могла пойти на их решение.',
    tags: ['stress'],
  },
  {
    text: 'Восстановление - не награда за хорошую работу. Это часть того, как вообще работает работа.',
    tags: ['stress'],
  },

  // ── Низкое настроение (low_mood, 6 текстов) ───────────────────────────
  {
    text: 'Плохой день не отменяет навык. Он просто показывает, где сейчас нужна более мягкая опора.',
    tags: ['low_mood', 'universal'],
  },
  {
    text: 'Признать, что сейчас тяжело - первый шаг к тому, чтобы стало немного легче. Не сразу, но иногда достаточно назвать то, что есть.',
    tags: ['low_mood'],
  },
  {
    text: 'Настроение меняется. Не по команде, не быстро, но меняется. То, как ты себя чувствуешь прямо сейчас - не приговор.',
    tags: ['low_mood'],
  },
  {
    text: 'Когда сил мало, маленькие действия значат больше. Не потому что они магически меняют ситуацию, а потому что создают хоть какое-то движение.',
    tags: ['low_mood'],
  },
  {
    text: 'Закрытость от других в трудный момент кажется защитой. Но она часто усиливает тяжесть, а не снижает её.',
    tags: ['low_mood'],
  },
  {
    text: 'Иногда настроение снижается без видимой причины. Это не слабость характера и не «что-то со мной не так» - это просто то, как устроена психика.',
    tags: ['low_mood'],
  },

  // ── Универсальный (universal, 36 текстов) ─────────────────────────────
  {
    text: 'Навыки, которые работают в спокойное время, работают и в трудное. Но им нужна практика заранее.',
    tags: ['universal'],
  },
  {
    text: 'Замечать, что происходит внутри, без немедленной оценки - это и есть осознанность. Не ритуал, а внимание к себе.',
    tags: ['universal'],
  },
  {
    text: 'Изменения в поведении обычно предшествуют изменениям в ощущениях. Ждать правильного настроения для начала - долгое ожидание.',
    tags: ['universal'],
  },
  {
    text: 'Иногда самый полезный вопрос не «что я {должен|должна} делать?», а «что мне сейчас нужно?».',
    tags: ['universal'],
  },
  {
    text: 'То, что ты сейчас переживаешь, другие люди переживали тоже. Это не делает твой опыт менее настоящим, но напоминает: ты не {один|одна} в этом.',
    tags: ['universal'],
  },
  {
    text: 'Маленький шаг, который реально сделан, важнее идеального плана, который остался в голове.',
    tags: ['universal'],
  },
  {
    text: 'Поведение меняется не через силу воли, а через изменение среды. Иногда легче убрать соблазн, чем сопротивляться ему снова и снова.',
    tags: ['universal'],
  },
  {
    text: 'Злиться на близких нормально. Злость не отменяет любовь и не означает, что отношения сломаны.',
    tags: ['universal'],
  },
  {
    text: 'Большая часть беспокойства происходит не в настоящем, а в будущем, которого ещё нет. Прямо сейчас всё, как правило, в порядке.',
    tags: ['universal'],
  },
  {
    text: 'Хороший сон не роскошь. Он меняет то, как работает мозг, как мы реагируем на других и как оцениваем ситуацию.',
    tags: ['universal'],
  },
  {
    text: 'Сказать «нет» - это не жёсткость. Это честность о своих возможностях и забота о качестве того, на что ты говоришь «да».',
    tags: ['universal'],
  },
  {
    text: 'Смысл не всегда приходит готовым. Иногда он появляется в процессе, когда ты уже делаешь что-то важное для себя или других.',
    tags: ['universal'],
  },
  {
    text: 'Автопилот помогает экономить силы. Но иногда одна пауза и один осознанный вдох возвращают ощущение, что ты управляешь днём, а не он тобой.',
    tags: ['universal'],
  },
  {
    text: 'Не уметь что-то пока - это не постоянное состояние. Это просто этап.',
    tags: ['universal'],
  },
  {
    text: 'Одно из самых трудных умений - остановиться и спросить, что человек имел в виду, прежде чем принять свою интерпретацию за его слова.',
    tags: ['universal'],
  },
  {
    text: 'К себе часто применяют правила, которые ни к кому другому не применили бы. Это стоит замечать.',
    tags: ['universal'],
  },
  {
    text: 'Откладывать что-то неприятное - это нормально. Но чем дольше откладываешь, тем больше оно занимает место в голове.',
    tags: ['universal'],
  },
  {
    text: 'Чувство одиночества не означает, что ты {один|одна}. Иногда оно означает, что нужен другой тип контакта с людьми, которые уже рядом.',
    tags: ['universal'],
  },
  {
    text: 'Перемены редко ощущаются как прогресс в момент, когда происходят. Это видно только позже, оглядываясь назад.',
    tags: ['universal'],
  },
  {
    text: 'Когда ориентиры расплываются, иногда помогает один простой вопрос: что для меня сейчас важно?',
    tags: ['universal'],
  },
  {
    text: 'Чувства не нужно ни прогонять, ни превращать в действие. Можно просто позволить им быть, пока они не пройдут.',
    tags: ['universal'],
  },
  {
    text: 'Сделанное несовершенно почти всегда лучше несделанного идеально. Это работает для большинства вещей.',
    tags: ['universal'],
  },
  {
    text: 'Понять чужую точку зрения не значит согласиться с ней. Но это меняет то, как проходит разговор.',
    tags: ['universal'],
  },
  {
    text: 'Вчерашний день не определяет сегодняшний. Это не обязательно воспринимать как мотивацию - просто как факт.',
    tags: ['universal'],
  },
  {
    text: 'Принять что-то не значит одобрить. Это значит перестать тратить силы на борьбу с тем, что уже случилось.',
    tags: ['universal'],
  },
  {
    text: 'Мозг заточен замечать проблемы. Специально замечать, что работает, - не наивность, а противовес этой настройке.',
    tags: ['universal'],
  },
  {
    text: 'Прогресс редко выглядит как прямая линия вверх. Чаще это два шага вперёд, шаг назад, и снова вперёд, но уже с другим опытом.',
    tags: ['universal'],
  },
  {
    text: 'Заметить свою реакцию уже после того, как она произошла - это тоже навык. Он развивается в сторону того, чтобы замечать раньше.',
    tags: ['universal'],
  },
  {
    text: 'Потребности не исчезают, если их не называть. Они просто ищут другие выходы.',
    tags: ['universal'],
  },
  {
    text: 'Сравнивать себя с другими - автоматическая реакция мозга, не объективная оценка. У других свой контекст, который ты не видишь полностью.',
    tags: ['universal'],
  },
  {
    text: 'Полное присутствие в простых вещах - еде, прогулке, разговоре - это редкий вид отдыха от постоянного фонового шума мыслей.',
    tags: ['universal'],
  },
  {
    text: 'Просить о помощи - не признание слабости. Это признание того, что задача или момент требуют больше одного человека.',
    tags: ['universal'],
  },
  {
    text: 'Раздражение, усталость, скука - не просто неудобства. Они сигнализируют о чём-то, что стоит замечать.',
    tags: ['universal'],
  },
  {
    text: 'Начать что-то несовершенным образом и потом доделать всегда лучше, чем ждать правильных условий.',
    tags: ['universal'],
  },
  {
    text: 'Стойкость - это не отсутствие трудных моментов. Это то, как ты к ним возвращаешься. И каждый раз, когда возвращаешься, это немного проще.',
    tags: ['universal'],
  },
  {
    text: 'Пытаться соответствовать чужим ожиданиям постоянно - утомительно. Иногда стоит проверить, чьи именно ожидания тебя сейчас двигают.',
    tags: ['universal'],
  },
];

export function getThoughtTemplateForProgramStep(params: {
  programSlug?: string | null;
  step?: number | null;
  entryDate: string;
  userId: number;
}): string {
  // Определяем предпочтительный кластер по текущей программе.
  let preferredTag: ThoughtTag = 'universal';
  if (params.programSlug === 'calm_anxiety_30') preferredTag = 'anxiety';
  else if (params.programSlug === 'self_kindness_21')
    preferredTag = 'self_compassion';

  // Сначала ищем в кластере программы.
  let pool = THOUGHT_CATALOG.filter((t) => t.tags.includes(preferredTag));

  // Fallback на universal если кластер пуст (будущие программы без явного тега).
  if (pool.length === 0) {
    pool = THOUGHT_CATALOG.filter((t) => t.tags.includes('universal'));
  }

  // Абсолютный fallback на весь каталог.
  if (pool.length === 0) pool = THOUGHT_CATALOG;

  // Детерминированная ротация: разные пользователи получают разные тексты
  // в один и тот же день; один пользователь видит повтор не раньше чем
  // через N дней (N = размер пула для его программы: 20-60 дней).
  const hash = Math.abs(
    params.entryDate
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), params.userId)
  );
  const templateIndex = hash % pool.length;

  return (
    pool[templateIndex]?.text ??
    'Спокойствие начинается с одного понятного следующего шага.'
  );
}

// Чистые timezone-функции живут в `retention-timezone.ts` (без БД-зависимостей,
// тестируемы изолированно). Здесь re-export для backward compat и для возможности
// в будущем заменить дефолтную таймзону без правки 30+ вызывающих файлов.
export const getLocalDateKey = getLocalDateKeyPure;
const shiftDateKey = shiftDateKeyPure;

export function chapterForStep(step: number, totalSteps: number = 30) {
  // Orchid calm_anxiety_30 (30 шагов) - исторические границы. Сохраняем
  // explicit-разбивку чтобы не сломать существующую запись программы #1.
  if (totalSteps === 30) {
    if (step <= 3) return 1;
    if (step <= 10) return 2;
    if (step <= 20) return 3;
    if (step <= 28) return 4;
    return 5;
  }
  // Peony self_kindness_21 (21 шаг) - explicit-разбивка из
  // .docs/content/program_self_kindness_21.md.
  if (totalSteps === 21) {
    if (step <= 3) return 1;
    if (step <= 7) return 2;
    if (step <= 14) return 3;
    if (step <= 19) return 4;
    return 5;
  }
  // Fallback для будущих программ - пропорциональное деление по 5 главам.
  const ratio = step / totalSteps;
  if (ratio <= 0.15) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.8) return 3;
  if (ratio <= 0.95) return 4;
  return 5;
}

export function getProgramChaptersForTotalSteps(totalSteps: number) {
  if (totalSteps === 21) return PEONY_CHAPTERS;
  return CHAPTERS;
}

function formatMinutesRu(minutes: number): string {
  const value = Math.max(1, Math.floor(minutes));
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} минут`;
  if (last === 1) return `${value} минуту`;
  if (last >= 2 && last <= 4) return `${value} минуты`;
  return `${value} минут`;
}

function countWords(value?: string | null): number {
  if (!value) return 0;
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimateReadingSeconds(...texts: Array<string | null | undefined>) {
  const words = texts.reduce((sum, text) => sum + countWords(text), 0);
  if (words === 0) return 0;
  return Math.ceil((words / 180) * 60);
}

function getActionSeconds(
  action: ProgramStepAction,
  keys: Array<
    | 'completionDelaySeconds'
    | 'durationSeconds'
    | 'estimatedDurationSeconds'
    | 'minDurationSec'
  >
) {
  const values = keys
    .map((key) => action[key])
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
    );
  return values.length ? Math.max(...values) : 0;
}

function estimateChoiceQuestionSeconds(params: {
  mode?: 'single' | 'multiple';
  minSelected?: number;
  optionsCount?: number;
}) {
  const base = params.mode === 'multiple' ? 45 : 30;
  const minSelected = Math.max(0, params.minSelected ?? 0);
  const optionsCount = Math.max(0, params.optionsCount ?? 0);
  return base + Math.min(30, minSelected * 8 + Math.ceil(optionsCount / 4) * 5);
}

function estimateFormFieldSeconds(
  field: NonNullable<ProgramStepAction['fields']>[number]
) {
  if (field.type === 'rating_scale') return 30;
  if (field.type === 'choice' || field.type === 'experiment_status') {
    return estimateChoiceQuestionSeconds({
      mode: field.mode,
      minSelected: field.minSelected,
      optionsCount: field.options?.length,
    });
  }
  const maxLength = field.maxLength ?? 250;
  if (field.type === 'text' || maxLength <= 180) return 45;
  return maxLength > 700 ? 120 : 75;
}

function estimateWeeklyQuestionSeconds(
  question: NonNullable<ProgramStepAction['questions']>[number]
) {
  if (question.type === 'rating_scale') return 30;
  if (question.type === 'text') return 75;
  return estimateChoiceQuestionSeconds({
    mode: question.mode,
    minSelected: question.minSelected,
    optionsCount: question.options?.length,
  });
}

function estimateActionDurationSeconds(action: ProgramStepAction): number {
  const promptReadingSeconds = estimateReadingSeconds(
    action.title,
    action.subtitle,
    action.prompt,
    action.chipQuestion,
    action.scaleBeforeLabel,
    action.scaleAfterLabel
  );

  if (
    action.type === 'breathing' ||
    action.type === 'quick_help_breathing' ||
    action.type === 'quick_help_tension' ||
    action.type === 'meditation'
  ) {
    return (
      getActionSeconds(action, [
        'completionDelaySeconds',
        'durationSeconds',
        'estimatedDurationSeconds',
      ]) + promptReadingSeconds
    );
  }

  if (action.type === 'quick_help_grounding') {
    return (
      (getActionSeconds(action, [
        'completionDelaySeconds',
        'durationSeconds',
        'estimatedDurationSeconds',
      ]) || 180) + promptReadingSeconds
    );
  }

  if (action.type === 'ai_chat_session') {
    return Math.max(
      180,
      getActionSeconds(action, [
        'minDurationSec',
        'estimatedDurationSeconds',
        'durationSeconds',
      ]) + promptReadingSeconds
    );
  }

  if (action.type === 'structured_form') {
    const fields = action.fields ?? [];
    const fieldsSeconds = fields.reduce(
      (sum, field) => sum + estimateFormFieldSeconds(field),
      0
    );
    return Math.max(90, promptReadingSeconds + fieldsSeconds);
  }

  if (action.type === 'guided_steps') {
    const steps = action.steps ?? [];
    const stepsSeconds = steps.reduce((sum, step) => {
      if (
        typeof step.durationSeconds === 'number' &&
        Number.isFinite(step.durationSeconds)
      ) {
        return sum + Math.max(1, step.durationSeconds);
      }
      return sum + 45 + estimateReadingSeconds(step.title, step.text);
    }, 0);
    return Math.max(90, promptReadingSeconds + stepsSeconds);
  }

  if (action.type === 'weekly_check') {
    const questions = action.questions ?? [];
    const questionsSeconds = questions.reduce(
      (sum, question) =>
        sum +
        estimateReadingSeconds(question.question) +
        estimateWeeklyQuestionSeconds(question),
      0
    );
    return Math.max(120, promptReadingSeconds + questionsSeconds);
  }

  if (action.type === 'journal_entry') {
    const inputSeconds =
      action.journalFormat === 'structured'
        ? 180
        : action.journalFormat === 'oneLine'
          ? 45
          : 90;
    return promptReadingSeconds + inputSeconds;
  }

  if (action.type === 'thought_dump') return promptReadingSeconds + 150;
  if (action.type === 'ai_reflection' || action.type === 'micro_reflection') {
    return promptReadingSeconds + 60;
  }
  if (action.type === 'rating_scale' || action.type === 'next_route_choice') {
    return promptReadingSeconds + 30;
  }
  if (action.type === 'mood_checkin') return 20;
  return promptReadingSeconds;
}

export function estimateProgramStepActionsDurationSeconds(
  actions: ProgramStepAction[],
  readingTexts: Array<string | null | undefined> = []
) {
  const stepReadingSeconds = estimateReadingSeconds(...readingTexts);
  const actionsSeconds = actions.reduce(
    (sum, action) => sum + estimateActionDurationSeconds(action),
    0
  );
  return Math.max(60, stepReadingSeconds + actionsSeconds);
}

export function estimateProgramStepDurationSeconds(
  blueprint: StepBlueprint,
  actions = buildActions(1, blueprint)
) {
  const introIsAction = actions.some(
    (action) =>
      action.type === 'guided_steps' && action.formKind === 'step_intro'
  );
  return estimateProgramStepActionsDurationSeconds(actions, [
    blueprint.title,
    blueprint.subtitle,
    blueprint.nextHint,
    blueprint.prompt,
    blueprint.primarySubtitle,
    introIsAction ? null : blueprint.introText,
    introIsAction ? null : blueprint.miniArticle?.title,
    introIsAction ? null : blueprint.miniArticle?.body,
  ]);
}

function estimateProgramStepDurationMin(
  step: number,
  blueprint: StepBlueprint
) {
  return Math.max(
    1,
    Math.ceil(
      estimateProgramStepDurationSeconds(
        blueprint,
        buildActions(step, blueprint)
      ) / 60
    )
  );
}

function formatProgramStepDurationLabel(durationMin: number) {
  const safeMinutes = Math.max(1, Math.ceil(durationMin));
  if (safeMinutes <= 5) return formatMinutesRu(safeMinutes);
  const upper = Math.ceil((safeMinutes + 2) / 5) * 5;
  const lower = Math.max(5, upper - 5);
  return `${lower}-${upper} минут`;
}

function clampDurationMinutes(minutes: number, min: number, max: number) {
  const safe = Number.isFinite(minutes) ? Math.floor(minutes) : min;
  return Math.min(max, Math.max(min, safe));
}

function buildCompletionDelaySeconds(
  blueprint: StepBlueprint,
  minMinutes: number,
  maxMinutes = 10
) {
  return (
    clampDurationMinutes(blueprint.durationMin, minMinutes, maxMinutes) * 60
  );
}

// Экспортируется для тестов (tests/peony-blueprint.test.ts).
export function buildActions(
  step: number,
  blueprint: StepBlueprint
): ProgramStepAction[] {
  const introAction = stepIntroAction(blueprint);
  if (Array.isArray(blueprint.actions) && blueprint.actions.length > 0) {
    const actions = blueprint.actions.map(({ idSuffix, ...action }) => ({
      ...action,
      id: `step-${step}-${idSuffix}`,
      completionDelaySeconds: action.completionDelaySeconds ?? null,
      required: action.required ?? true,
    }));
    if (!introAction) return actions;
    const { idSuffix, ...action } = introAction;
    return [
      {
        ...action,
        id: `step-${step}-${idSuffix}`,
        completionDelaySeconds: action.completionDelaySeconds ?? null,
        required: action.required ?? true,
      },
      ...actions,
    ];
  }

  const actions: ProgramStepAction[] = [];
  if (introAction) {
    const { idSuffix, ...action } = introAction;
    actions.push({
      ...action,
      id: `step-${step}-${idSuffix}`,
      completionDelaySeconds: action.completionDelaySeconds ?? null,
      required: action.required ?? true,
    });
  }
  actions.push({
    id: `step-${step}-mood`,
    type: 'mood_checkin',
    title: 'Как ты себя чувствуешь?',
    subtitle: 'Отметь настроение перед практикой',
    completionDelaySeconds: null,
    energy: 1,
    required: true,
  });

  const primaryAction = buildPrimaryPracticeAction(step, blueprint);
  if (primaryAction) {
    actions.push(primaryAction);
    // Reflection «Как прошло?» после practice - но НЕ после AI-чата:
    // тот же вопрос уже был частью разговора с ассистентом
    // (см. retention/retention_long_term_strategy.md «Большой разговор»).
    // Для reflection/journal-шагов primary action уже сам по себе reflection -
    // отдельный «Как прошло?» action избыточен.
    const skipReflection =
      blueprint.kind === 'ai_chat_session' ||
      blueprint.kind === 'reflection' ||
      blueprint.kind === 'journal';
    if (!skipReflection) {
      actions.push({
        id: `step-${step}-reflection`,
        type: 'ai_reflection',
        title: 'Как прошло?',
        subtitle:
          blueprint.reflectionSubtitle ??
          'Можно выбрать вариант или добавить пару слов',
        // Если для шага заданы кастомные chips, prompt-текст не передаём:
        // chips + composer и так понятны, а текст «Выбери варианты: …, …, …»
        // дублирует чипы и читается как лишний шум (UX-фидбэк сессии 15).
        prompt: blueprint.reflectionChipOptions
          ? undefined
          : blueprint.reflectionPrompt,
        chipOptions: blueprint.reflectionChipOptions,
        completionDelaySeconds: null,
        energy: 1,
        required: true,
      });
    }
  }

  // Для journal-шагов primary action - это уже сам journal_entry; финальный
  // дневник дублировал бы action и был бы избыточен. Для остальных типов
  // финальный journal остаётся.
  if (blueprint.kind !== 'journal') {
    const journalPrompt = (() => {
      if (blueprint.journalPrompt) return blueprint.journalPrompt;
      if (blueprint.kind === 'reflection') {
        return blueprint.prompt ?? '';
      }
      if (blueprint.kind === 'ai_chat_session') {
        return 'Какую одну мысль из разговора хочешь оставить себе?';
      }
      return 'Что из сегодняшней практики я хочу взять с собой в завтрашний день?';
    })();

    actions.push({
      id: `step-${step}-journal`,
      type: 'journal_entry',
      title: 'Запись в дневнике',
      subtitle:
        blueprint.journalSubtitle ?? 'Что ты {осознал|осознала} сегодня?',
      prompt: journalPrompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    });
  }

  return actions;
}

function buildPrimaryPracticeAction(
  step: number,
  blueprint: StepBlueprint
): ProgramStepAction | null {
  if (blueprint.kind === 'breathing') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-breathing`,
      type: 'breathing',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Выполни практику ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'calm',
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_breathing') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-quick-breathing`,
      type: 'quick_help_breathing',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Стабилизируй дыхание ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'box',
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_grounding') {
    return {
      id: `step-${step}-quick-grounding`,
      type: 'quick_help_grounding',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ?? 'Пройди пять коротких шагов заземления',
      prompt: blueprint.prompt,
      template: '5-4-3-2-1',
      completionDelaySeconds: null,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'quick_help_tension') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 2);
    return {
      id: `step-${step}-quick-tension`,
      type: 'quick_help_tension',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Сними напряжение за ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'thought_dump') {
    return {
      id: `step-${step}-thought-dump`,
      type: 'thought_dump',
      // title = primarySubtitle чтобы не дублировать заголовок шага из header'а.
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  if (blueprint.kind === 'meditation') {
    const completionDelaySeconds = buildCompletionDelaySeconds(blueprint, 3);
    return {
      id: `step-${step}-meditation`,
      type: 'meditation',
      title: blueprint.title,
      subtitle:
        blueprint.primarySubtitle ??
        `Прослушай аудио-практику ${formatMinutesRu(
          Math.round(completionDelaySeconds / 60)
        )}`,
      prompt: blueprint.prompt,
      template: blueprint.template || 'anxiety',
      targetId: blueprint.targetId,
      durationSeconds: completionDelaySeconds,
      completionDelaySeconds,
      energy: 2,
      required: true,
    };
  }

  if (blueprint.kind === 'ai_chat_session') {
    // AI-чат как тип шага Roadmap (retention/retention_long_term_strategy.md).
    // Embedded ChatRoom внутри step runner'а с собственными порогами eligibility.
    return {
      id: `step-${step}-ai-chat`,
      type: 'ai_chat_session',
      title: blueprint.title,
      subtitle: blueprint.subtitle,
      topicPrompt: blueprint.topicPrompt,
      goalHint: blueprint.goalHint,
      minQualifyingMessages: blueprint.minQualifyingMessages,
      minDurationSec: blueprint.minDurationSec,
      completionDelaySeconds: null,
      energy: 3,
      required: true,
    };
  }

  // reflection-шаги - primary action = ai_reflection с CBT-промптом. Этот action
  // и есть сам шаг (выбор вариантов + текстовое поле); отдельный «Как прошло?»
  // не добавляется (см. skipReflection в buildActions).
  //
  // title = primarySubtitle, чтобы не дублировать заголовок шага (blueprint.title
  // показывается в ProgramStepHeader сверху). primarySubtitle описывает «что
  // делаем сейчас» («Что сейчас просит внимания», «Где тревога звучит как факт»),
  // а сам blueprint.prompt идёт в action.prompt и рендерится UI как CBT-вопрос.
  if (blueprint.kind === 'reflection') {
    return {
      id: `step-${step}-reflection`,
      type: 'ai_reflection',
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      chipOptions: blueprint.chipOptions,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  // journal-шаги - primary action = journal_entry. Тот же текст идёт в основную
  // запись дневника благодарности.
  // title = primarySubtitle чтобы не дублировать заголовок шага.
  if (blueprint.kind === 'journal') {
    return {
      id: `step-${step}-journal-primary`,
      type: 'journal_entry',
      title: blueprint.primarySubtitle ?? blueprint.title,
      subtitle: undefined,
      prompt: blueprint.prompt,
      completionDelaySeconds: null,
      energy: 1,
      required: true,
    };
  }

  return null;
}

function normalizeActions(value: unknown): ProgramStepAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ProgramStepActionDto.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function normalizeAttemptActions(value: unknown): ProgramStepActionStateDto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ProgramStepActionStateSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function prepareAttemptActions(params: {
  templateActions: ProgramStepAction[];
  hadMoodToday: boolean;
}): ProgramStepActionStateDto[] {
  // Cast ниже снимает структурное несоответствие между ProgramStepAction
  // (inline-типы в schema.ts) и ProgramStepActionDto (Zod-выведенный тип).
  // Поля совпадают, отличия только в способе типизации nullable/optional.
  // Данные дальше валидируются через ProgramStepActionDto.parse, поэтому
  // приведение безопасно.
  return (
    params.templateActions
      // Если состояние уже отмечено сегодня на главной, не дублируем тот же
      // вопрос внутри ежедневного шага.
      .filter(
        (action) => !(params.hadMoodToday && action.type === 'mood_checkin')
      )
      .map((action) => {
        const isTimedPractice =
          action.type === 'breathing' ||
          action.type === 'quick_help_breathing' ||
          action.type === 'quick_help_tension' ||
          action.type === 'meditation';
        const minDelaySeconds =
          action.type === 'quick_help_tension' ? 120 : 180;
        const rawDelaySeconds =
          typeof action.completionDelaySeconds === 'number'
            ? action.completionDelaySeconds
            : typeof action.durationSeconds === 'number'
              ? action.durationSeconds
              : null;
        // Выделяем явный number для timed-практик, чтобы TS не выводил union
        // `number | null` в durationSeconds ниже (DTO ожидает только number | undefined).
        const timedDurationSeconds = Math.max(
          minDelaySeconds,
          rawDelaySeconds ?? minDelaySeconds
        );
        const completionDelaySeconds = isTimedPractice
          ? timedDurationSeconds
          : (action.completionDelaySeconds ?? null);
        const isRequiredRoadmapAction =
          action.type === 'mood_checkin' ||
          action.type === 'breathing' ||
          action.type === 'quick_help_breathing' ||
          action.type === 'quick_help_grounding' ||
          action.type === 'quick_help_tension' ||
          action.type === 'meditation' ||
          action.type === 'ai_reflection' ||
          action.type === 'micro_reflection' ||
          action.type === 'rating_scale' ||
          action.type === 'next_route_choice' ||
          action.type === 'journal_entry' ||
          action.type === 'thought_dump' ||
          action.type === 'ai_chat_session' ||
          action.type === 'structured_form' ||
          action.type === 'guided_steps' ||
          action.type === 'weekly_check';

        return {
          ...action,
          durationSeconds: isTimedPractice
            ? timedDurationSeconds
            : action.durationSeconds,
          completionDelaySeconds,
          required: action.required ?? isRequiredRoadmapAction,
          status: 'pending' as const,
        };
      }) as ProgramStepActionStateDto[]
  );
}

// Таймерные практики (анти-чит ожидание таймера перед «Продолжить»).
const TIMED_PRACTICE_ACTION_TYPES = new Set([
  'breathing',
  'quick_help_breathing',
  'quick_help_tension',
  'meditation',
]);

/**
 * При replay или повторном открытии уже завершённого шага не заставляем юзера
 * заново высиживать таймерные практики (медитация, дыхание): переносим их
 * completed-статус и output из последнего attempt этого шага. Юзер всё ещё может
 * переслушать практику, но кнопка «Продолжить» не блокируется таймером заново.
 *
 * Переносим только таймерные типы: рефлексии, дневник и формы при повторном
 * прохождении логично заполнять заново.
 */
function carryOverCompletedTimedPractices(params: {
  templateActions: ProgramStepActionStateDto[];
  priorActions: ProgramStepActionStateDto[];
}): ProgramStepActionStateDto[] {
  const completedTimedById = new Map(
    params.priorActions
      .filter(
        (action) =>
          action.status === 'completed' &&
          TIMED_PRACTICE_ACTION_TYPES.has(action.type)
      )
      .map((action) => [action.id, action])
  );
  if (completedTimedById.size === 0) return params.templateActions;
  return params.templateActions.map((action) => {
    const prior = completedTimedById.get(action.id);
    if (!prior) return action;
    return {
      ...action,
      status: 'completed' as const,
      output: prior.output,
    };
  });
}

function comparableAttemptAction(action: ProgramStepActionStateDto) {
  const templateAction = { ...action };
  delete templateAction.status;
  delete templateAction.output;
  return templateAction;
}

function mergeAttemptActionsWithTemplate(params: {
  existingActions: ProgramStepActionStateDto[];
  templateActions: ProgramStepActionStateDto[];
}) {
  const existingById = new Map(
    params.existingActions.map((action) => [action.id, action])
  );

  return params.templateActions.map((templateAction) => {
    const existing = existingById.get(templateAction.id);
    if (!existing) return templateAction;
    return {
      ...templateAction,
      status: existing.status ?? templateAction.status,
      output: existing.output,
    };
  });
}

function attemptActionsNeedTemplateRefresh(params: {
  existingActions: ProgramStepActionStateDto[];
  templateActions: ProgramStepActionStateDto[];
}) {
  return (
    JSON.stringify(params.existingActions.map(comparableAttemptAction)) !==
    JSON.stringify(params.templateActions.map(comparableAttemptAction))
  );
}

function readStepMiniArticle(
  value: unknown
): NonNullable<ProgramStepDto['miniArticle']> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || typeof item.body !== 'string') {
    return null;
  }
  const sourceNotes = Array.isArray(item.sourceNotes)
    ? item.sourceNotes.filter(
        (note): note is string => typeof note === 'string' && note.length > 0
      )
    : undefined;

  return {
    title: item.title,
    body: item.body,
    sourceNotes,
    readingLevel: item.readingLevel === 'simple' ? 'simple' : undefined,
  };
}

function readStepContentMetadata(
  metadata: unknown
): Pick<ProgramStepDto, 'introText' | 'miniArticle'> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      introText: null,
      miniArticle: null,
    };
  }
  const item = metadata as Record<string, unknown>;
  return {
    introText: typeof item.introText === 'string' ? item.introText : null,
    miniArticle: readStepMiniArticle(item.miniArticle),
  };
}

function buildStepTemplateMetadata(blueprint: StepBlueprint) {
  return {
    kind: blueprint.kind ?? 'explicit_actions',
    template: blueprint.template || null,
    introText: blueprint.introText ?? null,
    miniArticle: blueprint.miniArticle ?? null,
  };
}

function stepTemplateNeedsRefresh(
  row: {
    chapter: number;
    title: string;
    subtitle: string | null;
    nextHint: string | null;
    durationMin: number;
    energyReward: number;
    actions: unknown;
    metadata: Record<string, unknown>;
  },
  step: number,
  blueprint: StepBlueprint,
  totalSteps: number = 30
) {
  const expectedActions = buildActions(step, blueprint);
  const expectedMetadata = buildStepTemplateMetadata(blueprint);
  const expectedDurationMin = estimateProgramStepDurationMin(step, blueprint);

  return (
    row.chapter !== chapterForStep(step, totalSteps) ||
    row.title !== blueprint.title ||
    (row.subtitle ?? '') !== blueprint.subtitle ||
    (row.nextHint ?? '') !== blueprint.nextHint ||
    row.durationMin !== expectedDurationMin ||
    row.energyReward !== 5 ||
    JSON.stringify(normalizeActions(row.actions)) !==
      JSON.stringify(expectedActions) ||
    JSON.stringify(row.metadata ?? {}) !== JSON.stringify(expectedMetadata)
  );
}

function moodScore(mood: MoodCheckinMood): number {
  return {
    very_bad: 1,
    sad: 2,
    neutral: 3,
    good: 4,
    great: 5,
  }[mood];
}

function moodFromDb(value: string): MoodCheckinMood {
  const parsed = MoodCheckinMoodEnum.safeParse(value);
  return parsed.success ? parsed.data : 'neutral';
}

function toMoodDto(row: typeof moodCheckins.$inferSelect) {
  return {
    id: row.id,
    mood: moodFromDb(row.mood),
    score: row.score,
    entryDate: row.entryDate,
    source:
      row.source === 'program_step' || row.source === 'roadmap'
        ? row.source
        : 'home',
    createdAt: row.createdAt.toISOString(),
  };
}

function toThoughtDto(
  row: typeof dailyThoughts.$inferSelect
): ThoughtOfTheDayDto {
  return {
    id: row.id,
    entryDate: row.entryDate,
    text: row.text,
    source: row.source,
    saved: Boolean(row.savedAt),
  };
}

function toAttemptDto(row: typeof userProgramStepAttempts.$inferSelect): {
  id: number;
  step: number;
  replay: boolean;
  status: 'started' | 'completed';
  rewardGranted: boolean;
  actions: ProgramStepActionStateDto[];
  startedAt: string;
  completedAt: string | null;
} {
  const actions = Array.isArray(row.actions)
    ? (row.actions as ProgramStepActionStateDto[])
    : [];

  return {
    id: row.id,
    step: row.step,
    replay: row.replay,
    status: row.status === 'completed' ? 'completed' : 'started',
    rewardGranted: row.rewardGranted,
    actions,
    startedAt: row.startedAt.toISOString(),
    completedAt: toIsoString(row.completedAt),
  };
}

// Bootstrap-метаданные для каждого Сада. Используются при ensureProgram() - заводят
// запись в БД, если её ещё нет, и обновляют поля для уже существующих записей.
// При расширении до multi-Сад сюда добавляются новые элементы (см. retention/retention_long_term_strategy.md).
type ProgramBootstrap = {
  slug: string;
  title: string;
  subtitle: string | null;
  plantSetSlug: string;
  difficulty: 'gentle' | 'standard' | 'deep' | null;
  summaryText: string | null;
  totalSteps: number;
  themes: string[];
  requiredPlan: string | null;
  unlockRule: { kind: 'always' } | { kind: 'after_n_completed'; n: number };
};

const PROGRAM_BOOTSTRAP: Record<string, ProgramBootstrap> = {
  [DEFAULT_RETENTION_PROGRAM_SLUG]: {
    slug: DEFAULT_RETENTION_PROGRAM_SLUG,
    title: 'Спокойствие',
    subtitle: '30 шагов для мягкой работы с тревогой и стрессом',
    // На P1.5 первый Сад привязан к набору ассетов orchid (15 кадров готовы
    // в public/retention/plant/states/orchid/). Sunflower-сет будет
    // подключён позже, когда дорисуем его 15 стадий.
    plantSetSlug: 'orchid',
    difficulty: 'gentle',
    summaryText:
      'Сад Спокойствия - стартовый путь о том, как видеть тревогу как сигнал, а не как факт, и о мягких опорах для нервной системы.',
    totalSteps: 30,
    themes: ['anxiety', 'stress', 'calm'],
    requiredPlan: null,
    unlockRule: { kind: 'always' },
  },
  // Сад #2 «Доброта к себе» (Peony) - полноценная программа на 21 шаг
  // (см. STEP_BLUEPRINTS_SELF_KINDNESS_21 и
  // .docs/content/program_self_kindness_21.md). Методическая база:
  // Neff: три компонента доброты к себе; Hayes: терапия принятия и
  // ответственности и дефузия; Salzberg: медитация доброжелательности;
  // Gilbert: терапия, сфокусированная на сострадании.
  // Открывается после завершения 1 регулярного Сада (Orchid).
  self_kindness_21: {
    slug: 'self_kindness_21',
    title: 'Доброта к себе',
    subtitle: '21 шаг о мягком разговоре с собой',
    plantSetSlug: 'peony',
    difficulty: 'gentle',
    summaryText:
      'Сад Доброты к себе помогает мягче разговаривать с собой, замечать внутреннюю критику без лишней жёсткости и находить слова поддержки в трудные моменты.',
    totalSteps: 21,
    themes: ['self_compassion', 'inner_critic', 'kindness'],
    requiredPlan: null,
    unlockRule: { kind: 'after_n_completed', n: 1 },
  },
};

// Тизеры будущих Садов. Контента шагов у них ещё нет - в БД заводится только
// карточка-метаданные со status='coming_soon'. В Оранжерее они показываются под
// замком с пометкой «Скоро»; стартовать их нельзя, пока сад не переведён в
// published (т.е. пока не появится полноценный bootstrap в PROGRAM_BOOTSTRAP).
//
// Чтобы «открыть» тизер: добавляешь его slug в PROGRAM_BOOTSTRAP с blueprints
// шагов - ensureProgramBySlug сам перепишет статус на published. Чтобы убрать
// тизер из витрины - удали запись здесь (sync не удаляет осиротевшие строки
// автоматически, см. примечание в ensureTeaserPrograms).
type ProgramTeaser = {
  slug: string;
  title: string;
  subtitle: string;
  plantSetSlug: string | null;
  totalSteps: number;
  themes: string[];
  unlockRule: { kind: 'after_n_completed'; n: number };
};

// Реальные Сады по дорожной карте retention/retention_long_term_strategy.md
// Порядок совпадает с таблицей (#3–#9). Два первых (calm_anxiety_30 и
// self_kindness_21) уже в PROGRAM_BOOTSTRAP - здесь не дублируем.
const COMING_SOON_TEASERS: ProgramTeaser[] = [
  {
    // Сад #3: ассеты цикламена готовы (public/retention/plant/states/cyclamen/)
    slug: 'relationships_21',
    title: 'Отношения',
    subtitle: 'Границы, близость и умение быть рядом без потери себя',
    plantSetSlug: 'cyclamen',
    totalSteps: 21,
    themes: ['relationships', 'boundaries', 'intimacy'],
    unlockRule: { kind: 'after_n_completed', n: 2 },
  },
  {
    // Сад #4: ассеты азалии в работе
    slug: 'burnout_21',
    title: 'Выгорание',
    subtitle: 'Мягкое восстановление, когда ресурсов больше нет',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['burnout', 'recovery'],
    unlockRule: { kind: 'after_n_completed', n: 3 },
  },
  {
    // Сад #5: тюльпан Queen of Night
    slug: 'gentle_sleep_21',
    title: 'Мягкий сон',
    subtitle: 'Вечерние ритуалы и спокойное засыпание без тревог',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['sleep', 'rest'],
    unlockRule: { kind: 'after_n_completed', n: 4 },
  },
  {
    // Сад #6: георгин Café au Lait
    slug: 'emotion_regulation_21',
    title: 'Эмоции',
    subtitle: 'Понять злость и импульсивные реакции. И выражать их без вреда',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['anger', 'emotions', 'regulation'],
    unlockRule: { kind: 'after_n_completed', n: 5 },
  },
  {
    // Сад #7: ландыш (P2)
    slug: 'sustainable_habits_21',
    title: 'Привычки тела',
    subtitle: 'Базовые ритуалы, которые поддерживают тело мягко и регулярно',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['habits', 'body'],
    unlockRule: { kind: 'after_n_completed', n: 6 },
  },
  {
    // Сад #8: подсолнух (P2)
    slug: 'joy_practice_21',
    title: 'Радость',
    subtitle: 'Замечать маленькое хорошее и возвращать в жизнь удовольствие',
    plantSetSlug: null,
    totalSteps: 21,
    themes: ['joy', 'gratitude', 'pleasure'],
    unlockRule: { kind: 'after_n_completed', n: 7 },
  },
  {
    // Сад #9: Король Протея, 28 шагов (P3)
    slug: 'purpose_28',
    title: 'Смысл',
    subtitle:
      'Найти ориентиры и направление - без давления и поиска «правильного» ответа',
    plantSetSlug: null,
    totalSteps: 28,
    themes: ['purpose', 'meaning', 'direction'],
    unlockRule: { kind: 'after_n_completed', n: 8 },
  },
];

/**
 * Заводит/обновляет тизер-карточки будущих Садов (status='coming_soon').
 *
 * Idempotent: на конфликте по slug обновляет только витринные поля и держит
 * status='coming_soon'. Если slug позже появится в PROGRAM_BOOTSTRAP,
 * ensureProgramBySlug перетрёт status на 'published' - поэтому тизер и готовый
 * Сад с одним slug не конфликтуют. Осиротевшие тизеры (удалённые отсюда) sync
 * не подчищает - это редкая ручная операция.
 */
async function ensureTeaserPrograms(): Promise<void> {
  if (COMING_SOON_TEASERS.length === 0) return;
  await db
    .insert(programs)
    .values(
      COMING_SOON_TEASERS.map((teaser) => ({
        slug: teaser.slug,
        title: teaser.title,
        subtitle: teaser.subtitle,
        totalSteps: teaser.totalSteps,
        themes: teaser.themes,
        requiredPlan: null,
        plantSetSlug: teaser.plantSetSlug,
        difficulty: 'gentle' as const,
        summaryText: teaser.subtitle,
        unlockRule: teaser.unlockRule,
        status: 'coming_soon' as const,
        metadata: { teaser: true },
      }))
    )
    .onConflictDoUpdate({
      target: programs.slug,
      set: {
        title: sql`excluded.title`,
        subtitle: sql`excluded.subtitle`,
        totalSteps: sql`excluded.total_steps`,
        unlockRule: sql`excluded.unlock_rule`,
        updatedAt: new Date(),
      },
      // Не трогаем status у уже published-садов: если slug стал готовым через
      // PROGRAM_BOOTSTRAP, тизер-sync не должен откатить его в coming_soon.
      setWhere: sql`${programs.status} = 'coming_soon'`,
    });
}

// In-process кэш: после первого successful ensure программа не нуждается в повторном UPSERT.
// Сбрасывается только при перезапуске сервера (деплой), что и так запускает bootstrap заново.
type ProgramRow = typeof programs.$inferSelect;
const programCache = new Map<string, ProgramRow>();

async function ensureProgramBySlug(slug: string) {
  if (programCache.has(slug)) return programCache.get(slug)!;

  const bootstrap = PROGRAM_BOOTSTRAP[slug];
  if (!bootstrap) {
    throw new Error(`No bootstrap registered for program slug: ${slug}`);
  }
  const blueprints = getStepBlueprintsForSlug(slug);

  await db
    .insert(programs)
    .values({
      slug: bootstrap.slug,
      title: bootstrap.title,
      subtitle: bootstrap.subtitle,
      totalSteps: blueprints.length,
      themes: bootstrap.themes,
      requiredPlan: bootstrap.requiredPlan,
      plantSetSlug: bootstrap.plantSetSlug,
      difficulty: bootstrap.difficulty,
      summaryText: bootstrap.summaryText,
      unlockRule: bootstrap.unlockRule,
      status: 'published',
      metadata: { bootstrap: true },
    })
    .onConflictDoUpdate({
      target: programs.slug,
      // Bootstrap-программа живёт в коде - при изменении ассетов растения / лора
      // существующая запись подтягивает новые значения без ручной миграции.
      // status='published' проставляем явно: если slug раньше был заведён как
      // тизер (coming_soon), появление blueprints переводит его в готовые.
      set: {
        plantSetSlug: bootstrap.plantSetSlug,
        difficulty: bootstrap.difficulty,
        summaryText: bootstrap.summaryText,
        unlockRule: bootstrap.unlockRule,
        status: 'published',
        updatedAt: new Date(),
      },
    });

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.slug, slug))
    .limit(1);

  if (!program) {
    throw new Error(`Retention program was not created for slug: ${slug}`);
  }

  const existingSteps = await db
    .select({
      step: programStepTemplates.step,
      chapter: programStepTemplates.chapter,
      title: programStepTemplates.title,
      subtitle: programStepTemplates.subtitle,
      nextHint: programStepTemplates.nextHint,
      durationMin: programStepTemplates.durationMin,
      energyReward: programStepTemplates.energyReward,
      actions: programStepTemplates.actions,
      metadata: programStepTemplates.metadata,
    })
    .from(programStepTemplates)
    .where(eq(programStepTemplates.programId, program.id));
  const existingByStep = new Map(
    existingSteps.map((item) => [item.step, item])
  );
  const existing = new Set(existingByStep.keys());
  const desiredSteps = blueprints.map((blueprint, index) => ({
    blueprint,
    step: index + 1,
  }));
  const missing = desiredSteps.filter((item) => !existing.has(item.step));

  const totalSteps = blueprints.length;
  if (missing.length) {
    await db
      .insert(programStepTemplates)
      .values(
        missing.map(({ blueprint, step }) => ({
          programId: program.id,
          step,
          chapter: chapterForStep(step, totalSteps),
          title: blueprint.title,
          subtitle: blueprint.subtitle,
          nextHint: blueprint.nextHint,
          durationMin: estimateProgramStepDurationMin(step, blueprint),
          energyReward: 5,
          actions: buildActions(step, blueprint),
          metadata: buildStepTemplateMetadata(blueprint),
        }))
      )
      .onConflictDoNothing();
  }

  const existingDesiredSteps = desiredSteps.filter(({ blueprint, step }) => {
    const row = existingByStep.get(step);
    return row
      ? stepTemplateNeedsRefresh(row, step, blueprint, totalSteps)
      : false;
  });
  if (existingDesiredSteps.length) {
    // Bootstrap-программа живёт в коде, но лишние update на каждый /api/today не нужны.
    await Promise.all(
      existingDesiredSteps.map(({ blueprint, step }) =>
        db
          .update(programStepTemplates)
          .set({
            chapter: chapterForStep(step, totalSteps),
            title: blueprint.title,
            subtitle: blueprint.subtitle,
            nextHint: blueprint.nextHint,
            durationMin: estimateProgramStepDurationMin(step, blueprint),
            energyReward: 5,
            actions: buildActions(step, blueprint),
            metadata: buildStepTemplateMetadata(blueprint),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(programStepTemplates.programId, program.id),
              eq(programStepTemplates.step, step)
            )
          )
      )
    );
  }

  programCache.set(slug, program);
  return program;
}

// Флаг гарантирует, что syncRetentionProgramBootstraps выполняется один раз за
// жизнь процесса. Nitro plugin вызывает его при старте; повторные вызовы — no-op.
let bootstrapSyncPromise: Promise<void> | null = null;
let bootstrapSyncDone = false;

export async function syncRetentionProgramBootstraps(): Promise<void> {
  if (bootstrapSyncDone) return;
  if (bootstrapSyncPromise) return bootstrapSyncPromise;

  bootstrapSyncPromise = (async () => {
    try {
      // Оранжерея читает список доступных Садов напрямую из `programs`, поэтому
      // перед snapshot синхронизируем кодовые bootstrap-метаданные с БД.
      await Promise.all(
        Object.keys(PROGRAM_BOOTSTRAP).map((slug) => ensureProgramBySlug(slug))
      );
      // Тизеры будущих Садов («Скоро») - лёгкие карточки без шагов.
      await ensureTeaserPrograms();
      bootstrapSyncDone = true;
    } finally {
      // Сброс в любом случае: если промис завис в rejected — следующий запрос
      // должен получить новую попытку, а не ту же зафиксированную ошибку.
      bootstrapSyncPromise = null;
    }
  })();
  return bootstrapSyncPromise;
}

async function ensureUserProgram(userId: number, programId: number) {
  // INSERT RETURNING: при успешной вставке возвращает новую строку (1 round trip).
  // При конфликте (onConflictDoNothing) returning() вернёт пустой массив — тогда
  // делаем SELECT (итого 2 round trips, только для повторных вызовов).
  const [inserted] = await db
    .insert(userPrograms)
    .values({
      userId,
      programId,
      currentStep: 1,
      status: 'active',
      metadata: {},
    })
    .onConflictDoNothing({
      target: [userPrograms.userId, userPrograms.programId],
    })
    .returning();

  if (inserted) return inserted;

  const [existing] = await db
    .select()
    .from(userPrograms)
    .where(
      and(
        eq(userPrograms.userId, userId),
        eq(userPrograms.programId, programId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error('User retention program was not created');
  }

  return existing;
}

export async function getUserTimezone(userId: number): Promise<string> {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Пол пользователя для гендеризации статических текстов программ.
 * При отсутствии (легаси-записи до обязательного онбординга) дефолтит на мужской -
 * см. gendered-text.ts.
 */
export async function getUserGender(userId: number): Promise<UserGender> {
  const [row] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.gender === 'female' ? 'female' : 'male';
}

/**
 * Возвращает slug «текущей» программы пользователя для эндпоинтов вроде
 * `/api/today`. Приоритет:
 *  1. Активная программа (status='active'), последняя начатая.
 *  2. Если активных нет - последняя завершённая (контекст для пользователя
 *     который завершил сад и ещё не стартанул следующий - он увидит свой
 *     завершённый Сад на главной с CTA «Посадить следующий сад»).
 *  3. Если у пользователя ещё ни одной user_program нет - DEFAULT slug.
 */
export async function getCurrentProgramSlugForUser(
  userId: number
): Promise<string> {
  // 1. Активные программы - берём последнюю начатую.
  const [active] = await db
    .select({ programSlug: programs.slug, startedAt: userPrograms.startedAt })
    .from(userPrograms)
    .innerJoin(programs, eq(programs.id, userPrograms.programId))
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'active'))
    )
    .orderBy(desc(userPrograms.startedAt))
    .limit(1);
  if (active) return active.programSlug;

  // 2. Завершённые - последняя по completedAt.
  const [completed] = await db
    .select({ programSlug: programs.slug })
    .from(userPrograms)
    .innerJoin(programs, eq(programs.id, userPrograms.programId))
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'completed'))
    )
    .orderBy(desc(userPrograms.completedAt))
    .limit(1);
  if (completed) return completed.programSlug;

  // 3. Fallback на дефолтный (новый юзер без user_programs).
  return DEFAULT_RETENTION_PROGRAM_SLUG;
}

export async function getOrCreateProgramOverview(
  userId: number,
  slug = DEFAULT_RETENTION_PROGRAM_SLUG
): Promise<ProgramOverviewDto> {
  // gender не зависит от program — запускаем параллельно с ensureProgramBySlug.
  const [program, gender] = await Promise.all([
    ensureProgramBySlug(slug),
    getUserGender(userId),
  ]);
  const userProgram = await ensureUserProgram(userId, program.id);
  // steps и progressRows не зависят друг от друга — запрашиваем параллельно.
  const [steps, progressRows] = await Promise.all([
    db
      .select()
      .from(programStepTemplates)
      .where(eq(programStepTemplates.programId, program.id))
      .orderBy(asc(programStepTemplates.step)),
    db
      .select()
      .from(userProgramStepProgress)
      .where(eq(userProgramStepProgress.userProgramId, userProgram.id)),
  ]);
  const progressByStepId = new Map(
    progressRows.map((progress) => [progress.stepTemplateId, progress])
  );

  const completedSteps = progressRows.filter(
    (progress) => progress.status === 'completed'
  ).length;
  const currentStep = Math.min(
    Math.max(userProgram.currentStep, 1),
    program.totalSteps
  );

  const stepItems: ProgramStepDto[] = steps.map((step) => {
    const progress = progressByStepId.get(step.id);
    const isCompleted = progress?.status === 'completed';
    // Cast actions: schema.ts ProgramStepAction и Zod ProgramStepActionStateDto
    // структурно совместимы, но TS видит расхождение в способе типизации
    // nullable/optional полей. Данные ниже сериализуются через Zod на API-уровне.
    const actions = normalizeActions(
      step.actions
    ) as unknown as ProgramStepActionStateDto[];
    const contentMetadata = readStepContentMetadata(step.metadata);
    const status = isCompleted
      ? 'completed'
      : step.step === currentStep
        ? 'active'
        : step.step === currentStep + 1
          ? 'available'
          : 'locked';

    return {
      id: step.id,
      step: step.step,
      chapter: step.chapter,
      title: step.title,
      subtitle: step.subtitle ?? null,
      nextHint: step.nextHint ?? null,
      introText: contentMetadata.introText,
      miniArticle: contentMetadata.miniArticle,
      durationMin: step.durationMin,
      durationLabel: formatProgramStepDurationLabel(step.durationMin),
      energyReward: step.energyReward,
      actions,
      status,
      completedAt: toIsoString(progress?.completedAt),
    };
  });

  const chapters = getProgramChaptersForTotalSteps(program.totalSteps).map(
    (chapter) => ({
      chapter: chapter.chapter,
      title: chapter.title,
      stepRange: chapter.stepRange,
      accent: chapter.accent as ChapterAccent,
      steps: stepItems.filter((step) => step.chapter === chapter.chapter),
    })
  );

  const currentStepItem =
    stepItems.find((step) => step.step === currentStep) ?? null;

  // Прогресс по под-этапам текущего шага: если есть незавершённая попытка
  // (status='started') с частью пройденных action'ов - фронт покажет
  // «Продолжить». Считаем только required-действия (как в completeProgramStep).
  let currentStepProgress: { doneCount: number; totalCount: number } | null =
    null;
  if (currentStepItem) {
    const [startedAttempt] = await db
      .select()
      .from(userProgramStepAttempts)
      .where(
        and(
          eq(userProgramStepAttempts.userProgramId, userProgram.id),
          eq(userProgramStepAttempts.stepTemplateId, currentStepItem.id),
          eq(userProgramStepAttempts.status, 'started')
        )
      )
      .orderBy(desc(userProgramStepAttempts.updatedAt))
      .limit(1);

    if (startedAttempt) {
      const attemptActions = normalizeAttemptActions(startedAttempt.actions);
      const requiredActions = attemptActions.filter(
        (action) => action.required !== false
      );
      const doneCount = requiredActions.filter(
        (action) => action.status === 'completed'
      ).length;
      currentStepProgress = {
        doneCount,
        totalCount: requiredActions.length,
      };
    }
  }

  const overview: ProgramOverviewDto = {
    id: program.id,
    slug: program.slug,
    title: program.title,
    subtitle: program.subtitle ?? null,
    totalSteps: program.totalSteps,
    currentStep,
    completedSteps,
    progressPercent: Math.round((completedSteps / program.totalSteps) * 100),
    currentStepItem,
    currentStepProgress,
    chapters,
    plantSetSlug: program.plantSetSlug ?? null,
  };

  // Единая точка резолва гендерных форм `{м|ж}` во всех текстовых полях DTO.
  return applyGenderDeep(overview, gender);
}

/**
 * Сколько новых шагов программы пользователь завершил за указанный локальный день.
 * Replay не учитывается - для replay не создаётся energy_event (source='program_step_complete').
 */
export async function countCompletedProgramStepsForDate(
  userId: number,
  entryDate: string
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        eq(energyEvents.source, 'program_step_complete'),
        eq(energyEvents.eventDate, entryDate)
      )
    );
  return Number(row?.count ?? 0);
}

export type ProgramDailyLimitState = {
  dailyStepLimit: number;
  stepsDoneToday: number;
  nextResetAt: Date | null;
};

/**
 * Дневной лимит шагов для пользователя с учётом дня активной программы.
 *
 * День считается от `startedAt` последней активной `user_programs` в локальной
 * таймзоне пользователя: день 0 и 1 → 3 шага, дальше → 2 (см.
 * DAILY_STEP_LIMIT_SCHEDULE). Нет активной программы — считаем это днём 0:
 * программа создаётся при старте первого шага, и новый пользователь должен
 * сразу видеть стартовый лимит.
 *
 * Лимит общий на все программы, но при старте новой программы (новое растение
 * в Саду) onboarding-буст первых дней включается заново — это осознанно.
 */
async function getDailyStepLimitForUser(
  userId: number,
  timezone: string,
  now: Date
): Promise<number> {
  const [active] = await db
    .select({ startedAt: userPrograms.startedAt })
    .from(userPrograms)
    .where(
      and(eq(userPrograms.userId, userId), eq(userPrograms.status, 'active'))
    )
    .orderBy(desc(userPrograms.startedAt))
    .limit(1);

  if (!active?.startedAt) {
    return getDailyStepLimitForProgramDay(0);
  }

  const startKey = getLocalDateKeyPure(active.startedAt, timezone);
  const nowKey = getLocalDateKeyPure(now, timezone);
  return getDailyStepLimitForProgramDay(diffDateKeys(startKey, nowKey));
}

/**
 * Единое состояние daily-limit для Roadmap.
 *
 * Поведение:
 *  - prod (windowMs=0): окно = локальный календарный день пользователя.
 *  - dev (windowMs>0): после каждой нормы завершённых шагов включается короткий
 *    cooldown на N миллисекунд. Это удобнее для проверки, чем rolling-window:
 *    timed-практики часто длятся дольше 60 секунд, и события иначе успевают
 *    выпасть из окна ещё до старта следующего шага.
 */
export async function getProgramDailyLimitState(
  userId: number,
  timezone: string,
  now: Date
): Promise<ProgramDailyLimitState> {
  const windowMs = getDailyLimitWindowMs();
  const entryDate = getLocalDateKeyPure(now, timezone);
  const dailyStepLimit = await getDailyStepLimitForUser(userId, timezone, now);

  if (windowMs > 0) {
    const [row] = await db
      .select({
        count: sql<number>`count(*)::int`,
        latestCompletedAt: sql<Date | null>`max(${energyEvents.createdAt})`,
      })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, userId),
          eq(energyEvents.source, 'program_step_complete'),
          eq(energyEvents.eventDate, entryDate)
        )
      );

    const completedToday = Number(row?.count ?? 0);
    const latestCompletedAt = row?.latestCompletedAt
      ? new Date(row.latestCompletedAt)
      : null;
    const cycleState = getDevDailyLimitCycleState({
      completedCount: completedToday,
      latestCompletedAt,
      now,
      dailyStepLimit,
      windowMs,
    });

    return {
      dailyStepLimit,
      stepsDoneToday: cycleState.stepsDoneToday,
      nextResetAt: cycleState.nextResetAt,
    };
  }

  const stepsDoneToday = await countCompletedProgramStepsForDate(
    userId,
    entryDate
  );

  return {
    dailyStepLimit,
    stepsDoneToday,
    nextResetAt:
      stepsDoneToday >= dailyStepLimit
        ? getNextDailyResetAt(now, timezone)
        : null,
  };
}

/**
 * Backward-compatible счётчик для старых call-sites. Для dev-override теперь
 * возвращает прогресс текущего quota-cycle, а не raw rolling-window count.
 *
 * Используется и в `startProgramStep` (для проверки лимита перед стартом),
 * и в `/api/today` (для отдачи `programDailyLimit.stepsDoneToday`).
 */
export async function countCompletedProgramStepsInLimitWindow(
  userId: number,
  timezone: string,
  now: Date
): Promise<number> {
  const state = await getProgramDailyLimitState(userId, timezone, now);
  return state.stepsDoneToday;
}

/**
 * Локальная полночь следующего дня в timezone пользователя - возвращается клиенту,
 * чтобы корректно показать «Следующий шаг через X часов» в HomeRoadmapCard.
 *
 * Берём YYYY-MM-DD от entryDate (по локальной таймзоне пользователя), прибавляем 1 день
 * и считаем UTC-момент начала следующего локального дня.
 */
export const nextLocalMidnight = nextLocalMidnightPure;

export async function getTodayEnergy(userId: number, entryDate: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${energyEvents.amount}), 0)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        eq(energyEvents.eventDate, entryDate)
      )
    );
  return Number(row?.total ?? 0);
}

export async function getWeeklyEnergy(userId: number, entryDate: string) {
  const dates = Array.from({ length: 7 }, (_, index) =>
    shiftDateKey(entryDate, index - 6)
  );
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${energyEvents.amount}), 0)::int`,
    })
    .from(energyEvents)
    .where(
      and(
        eq(energyEvents.userId, userId),
        inArray(energyEvents.eventDate, dates)
      )
    );
  return Number(row?.total ?? 0);
}

export async function getLatestMoodForDate(userId: number, entryDate: string) {
  const [row] = await db
    .select()
    .from(moodCheckins)
    .where(
      and(
        eq(moodCheckins.userId, userId),
        eq(moodCheckins.entryDate, entryDate)
      )
    )
    .orderBy(desc(moodCheckins.createdAt))
    .limit(1);
  return row ? toMoodDto(row) : null;
}

export async function createMoodCheckin(params: {
  userId: number;
  mood: MoodCheckinMood;
  source: 'home' | 'program_step' | 'roadmap';
  note?: string | null;
  timezone: string;
}) {
  const now = new Date();
  const entryDate = getLocalDateKey(now, params.timezone);
  const existing = await getLatestMoodForDate(params.userId, entryDate);

  let item: typeof moodCheckins.$inferSelect;

  if (existing) {
    // За сегодня уже есть отметка — обновляем её, не создаём дубль
    const [updated] = await db
      .update(moodCheckins)
      .set({
        mood: params.mood,
        score: moodScore(params.mood),
        source: params.source,
        note: params.note ?? null,
      })
      .where(eq(moodCheckins.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error('Mood check-in was not updated');
    }
    item = updated;
  } else {
    const [inserted] = await db
      .insert(moodCheckins)
      .values({
        userId: params.userId,
        mood: params.mood,
        score: moodScore(params.mood),
        entryDate,
        source: params.source,
        note: params.note ?? null,
        metadata: {},
      })
      .returning();

    if (!inserted) {
      throw new Error('Mood check-in was not created');
    }
    item = inserted;

    await db.insert(energyEvents).values({
      userId: params.userId,
      amount: 1,
      source: 'mood_checkin',
      sourceId: String(item.id),
      eventDate: entryDate,
      metadata: { source: params.source },
    });

    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate,
        source: 'mood_checkin',
        sourceId: String(item.id),
        metadata: { moodSource: params.source },
      });
    } catch (error) {
      console.error('[createMoodCheckin] streak update failed:', error);
    }
  }

  return {
    item: toMoodDto(item),
    rewardGranted: !existing,
    energyToday: await getTodayEnergy(params.userId, entryDate),
  };
}

export async function getOrCreateThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  programSlug?: string | null;
  step?: number | null;
  /** Передать гендер снаружи чтобы избежать повторного SELECT (напр. после getOrCreateProgramOverview). */
  gender?: UserGender;
}): Promise<ThoughtOfTheDayDto> {
  // Гендер нужен для резолва {м|ж} разметки в тексте.
  // В БД хранится сырая разметка, резолв происходит при каждом чтении.
  const gender = params.gender ?? (await getUserGender(params.userId));

  const fallbackThoughtText = getThoughtTemplateForProgramStep(params);

  // Upsert-паттерн: сначала INSERT ON CONFLICT DO NOTHING, потом SELECT если конфликт.
  // Это защищает от race condition при параллельных запросах (PWA service worker + вкладка).
  const [inserted] = await db
    .insert(dailyThoughts)
    .values({
      userId: params.userId,
      entryDate: params.entryDate,
      text: fallbackThoughtText,
      source: 'fallback',
      programSlug: params.programSlug ?? DEFAULT_RETENTION_PROGRAM_SLUG,
      step: params.step ?? null,
      metadata: {},
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return {
      id: inserted.id,
      entryDate: inserted.entryDate,
      text: applyGender(inserted.text, gender),
      source: inserted.source,
      saved: false,
    };
  }

  // Запись уже существовала (конкурентная вставка или повторный вызов)
  const [existing] = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.entryDate, params.entryDate)
      )
    )
    .limit(1);

  return {
    id: existing?.id ?? null,
    entryDate: params.entryDate,
    text: applyGender(existing?.text || fallbackThoughtText, gender),
    source: existing?.source || 'fallback',
    saved: Boolean(existing?.savedAt),
  };
}

async function findThoughtForUser(params: {
  userId: number;
  thoughtId?: number;
  entryDate?: string;
}) {
  if (params.thoughtId) {
    const [row] = await db
      .select()
      .from(dailyThoughts)
      .where(
        and(
          eq(dailyThoughts.userId, params.userId),
          eq(dailyThoughts.id, params.thoughtId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  if (!params.entryDate) return null;
  const [row] = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.entryDate, params.entryDate)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function saveThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  programSlug?: string | null;
  step?: number | null;
  thoughtId?: number;
}) {
  if (!params.thoughtId) {
    await getOrCreateThoughtOfTheDay({
      userId: params.userId,
      entryDate: params.entryDate,
      programSlug: params.programSlug,
      step: params.step,
    });
  }

  const thought = await findThoughtForUser({
    userId: params.userId,
    thoughtId: params.thoughtId,
    entryDate: params.entryDate,
  });

  if (!thought) {
    throw new Error('Thought of the day not found');
  }

  const now = new Date();
  const [freshlySaved] = await db
    .update(dailyThoughts)
    .set({ savedAt: now, updatedAt: now })
    .where(and(eq(dailyThoughts.id, thought.id), isNull(dailyThoughts.savedAt)))
    .returning();
  const rewardGranted = Boolean(freshlySaved);

  if (rewardGranted) {
    await db.insert(energyEvents).values({
      userId: params.userId,
      amount: 1,
      source: 'thought_saved',
      sourceId: String(thought.id),
      eventDate: thought.entryDate,
      metadata: {
        programSlug: thought.programSlug,
        step: thought.step,
      },
    });

    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate: thought.entryDate,
        source: 'thought_saved',
        sourceId: String(thought.id),
        metadata: {
          programSlug: thought.programSlug,
          step: thought.step,
        },
      });
    } catch (error) {
      console.error('[saveThoughtOfTheDay] streak update failed:', error);
    }
  }

  const current =
    freshlySaved ||
    (await findThoughtForUser({
      userId: params.userId,
      thoughtId: thought.id,
    }));

  if (!current) {
    throw new Error('Thought of the day not found');
  }

  return {
    item: toThoughtDto(current),
    rewardGranted,
    energyToday: await getTodayEnergy(params.userId, thought.entryDate),
    energyWeekly: await getWeeklyEnergy(params.userId, thought.entryDate),
  };
}

export async function unsaveThoughtOfTheDay(params: {
  userId: number;
  entryDate: string;
  thoughtId?: number;
}) {
  const thought = await findThoughtForUser({
    userId: params.userId,
    thoughtId: params.thoughtId,
    entryDate: params.entryDate,
  });

  if (!thought) {
    throw new Error('Thought of the day not found');
  }

  const [updated] = await db
    .update(dailyThoughts)
    .set({ savedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        eq(dailyThoughts.id, thought.id)
      )
    )
    .returning();

  if (!updated) {
    throw new Error('Thought of the day not found');
  }

  return {
    item: toThoughtDto(updated),
    rewardGranted: false,
    energyToday: await getTodayEnergy(params.userId, thought.entryDate),
    energyWeekly: await getWeeklyEnergy(params.userId, thought.entryDate),
  };
}

export async function getSavedThoughtsCollection(params: {
  userId: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
  const rows = await db
    .select()
    .from(dailyThoughts)
    .where(
      and(
        eq(dailyThoughts.userId, params.userId),
        isNotNull(dailyThoughts.savedAt)
      )
    )
    .orderBy(desc(dailyThoughts.savedAt))
    .limit(limit);

  return {
    items: rows
      .filter((row) => row.savedAt)
      .map((row) => ({
        ...toThoughtDto(row),
        id: row.id,
        savedAt: row.savedAt?.toISOString() ?? row.updatedAt.toISOString(),
      })),
  };
}

export async function getActivityStreak(userId: number, entryDate: string) {
  const dates = Array.from({ length: 30 }, (_, index) =>
    shiftDateKey(entryDate, -index)
  );
  const [energyRows, moodRows] = await Promise.all([
    db
      .select({ eventDate: energyEvents.eventDate })
      .from(energyEvents)
      .where(
        and(
          eq(energyEvents.userId, userId),
          inArray(energyEvents.eventDate, dates)
        )
      ),
    db
      .select({ entryDate: moodCheckins.entryDate })
      .from(moodCheckins)
      .where(
        and(
          eq(moodCheckins.userId, userId),
          inArray(moodCheckins.entryDate, dates)
        )
      ),
  ]);

  const activeDates = new Set([
    ...energyRows.map((row) => row.eventDate),
    ...moodRows.map((row) => row.entryDate),
  ]);
  let current = 0;

  for (const date of dates) {
    if (!activeDates.has(date)) break;
    current += 1;
  }

  let best = 0;
  let running = 0;
  for (const date of [...dates].reverse()) {
    if (activeDates.has(date)) {
      running += 1;
      best = Math.max(best, running);
    } else {
      running = 0;
    }
  }

  const weekDates = Array.from({ length: 7 }, (_, index) =>
    shiftDateKey(entryDate, index - 6)
  );

  return {
    current,
    best,
    week: weekDates.map((date) => activeDates.has(date)),
  };
}

export async function startProgramStep(params: {
  userId: number;
  slug: string;
  step: number;
  replay: boolean;
}) {
  const program = await ensureProgramBySlug(params.slug);
  const userProgram = await ensureUserProgram(params.userId, program.id);
  const [stepTemplate] = await db
    .select()
    .from(programStepTemplates)
    .where(
      and(
        eq(programStepTemplates.programId, program.id),
        eq(programStepTemplates.step, params.step)
      )
    )
    .limit(1);

  if (!stepTemplate) {
    throw new Error('Unknown retention program step');
  }

  if (params.step > userProgram.currentStep) {
    throw new Error('Program step is not available yet');
  }

  const timezone = await getUserTimezone(params.userId);
  const entryDate = getLocalDateKey(new Date(), timezone);
  const hadMoodToday = Boolean(
    await getLatestMoodForDate(params.userId, entryDate)
  );

  // Дневной лимит шагов (3 в первые два дня программы, дальше 2) применяется
  // только к новым шагам.
  // Replay (повтор завершённого) и продолжение начатого, но незавершённого шага
  // ограничениями не блокируются - см. retention/retention_long_term_strategy.md
  const [existingProgressBeforeStart] = await db
    .select()
    .from(userProgramStepProgress)
    .where(
      and(
        eq(userProgramStepProgress.userProgramId, userProgram.id),
        eq(userProgramStepProgress.stepTemplateId, stepTemplate.id)
      )
    )
    .limit(1);
  const isNewStepStart =
    !params.replay && existingProgressBeforeStart?.status !== 'completed';
  if (isNewStepStart) {
    const now = new Date();
    const dailyLimitState = await getProgramDailyLimitState(
      params.userId,
      timezone,
      now
    );
    if (dailyLimitState.stepsDoneToday >= dailyLimitState.dailyStepLimit) {
      trackRetentionEvent('daily_step_limit_hit', {
        userId: params.userId,
        programSlug: params.slug ?? DEFAULT_RETENTION_PROGRAM_SLUG,
        stepsDoneToday: dailyLimitState.stepsDoneToday,
      });
      const error = new Error('Daily step limit reached');
      (error as Error & { code?: string; data?: unknown }).code =
        'E_DAILY_LIMIT';
      (error as Error & { code?: string; data?: unknown }).data = {
        stepsDoneToday: dailyLimitState.stepsDoneToday,
        dailyStepLimit: dailyLimitState.dailyStepLimit,
        nextResetAt: dailyLimitState.nextResetAt?.toISOString() ?? null,
      };
      throw error;
    }
  }

  const attempt = await db.transaction(async (tx) => {
    const [existingProgress] = await tx
      .select()
      .from(userProgramStepProgress)
      .where(
        and(
          eq(userProgramStepProgress.userProgramId, userProgram.id),
          eq(userProgramStepProgress.stepTemplateId, stepTemplate.id)
        )
      )
      .limit(1);

    let progress = existingProgress;
    // Replay имеет смысл только для уже пройденного canonical step.
    // Иначе ручной ?replay=1 мог бы лишить пользователя первой награды.
    const shouldReplay = progress?.status === 'completed';

    if (!progress) {
      const [createdProgress] = await tx
        .insert(userProgramStepProgress)
        .values({
          userProgramId: userProgram.id,
          stepTemplateId: stepTemplate.id,
          status: 'started',
          startedAt: new Date(),
          currentActionIndex: 0,
          metadata: {},
        })
        .returning();
      progress = createdProgress;
    } else if (progress.status !== 'completed') {
      const [updatedProgress] = await tx
        .update(userProgramStepProgress)
        .set({
          status: 'started',
          startedAt: progress.startedAt || new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userProgramStepProgress.id, progress.id))
        .returning();
      progress = updatedProgress || progress;
    }

    // Resume сценарий (retention/retention_long_term_strategy.md):
    // если у пользователя уже есть незавершённый attempt этого шага - переиспользуем
    // его, чтобы сохранить статусы actions[i].status='completed' для тех, что
    // уже пройдены. Без этого resume на «первый pending action» не работает,
    // потому что каждый `start` создавал бы свежий attempt со всеми pending.
    //
    // Создаём новый attempt только если:
    //  - это replay (shouldReplay) - пользователь явно перезаходит после
    //    completion'а через кнопку «Повторить»;
    //  - у шага вообще нет привязанного `progress` (первый заход);
    //  - на progress нет ни одного started-attempt (например, после
    //    нечаянной сериализации без attempt).
    const existingActiveAttempts = progress
      ? await tx
          .select()
          .from(userProgramStepAttempts)
          .where(
            and(
              eq(userProgramStepAttempts.userProgramId, userProgram.id),
              eq(userProgramStepAttempts.stepTemplateId, stepTemplate.id),
              eq(userProgramStepAttempts.status, 'started')
            )
          )
          .orderBy(desc(userProgramStepAttempts.createdAt))
          .limit(1)
      : [];
    const reusableAttempt = !shouldReplay
      ? (existingActiveAttempts[0] ?? null)
      : null;
    const templateAttemptActions = prepareAttemptActions({
      templateActions: normalizeActions(stepTemplate.actions),
      hadMoodToday,
    });

    if (reusableAttempt) {
      const existingActions = normalizeAttemptActions(reusableAttempt.actions);
      if (
        attemptActionsNeedTemplateRefresh({
          existingActions,
          templateActions: templateAttemptActions,
        })
      ) {
        const mergedActions = mergeAttemptActionsWithTemplate({
          existingActions,
          templateActions: templateAttemptActions,
        });
        const [updatedAttempt] = await tx
          .update(userProgramStepAttempts)
          .set({
            actions: mergedActions,
            updatedAt: new Date(),
          })
          .where(eq(userProgramStepAttempts.id, reusableAttempt.id))
          .returning();
        return updatedAttempt ?? reusableAttempt;
      }

      return reusableAttempt;
    }

    // Новый attempt (replay или повторное открытие завершённого шага). Если у
    // шага уже был attempt с пройденными таймерными практиками, переносим их
    // completed-статус, чтобы не заставлять юзера снова ждать таймер медитации
    // или дыхания (он мог нечаянно нажать назад или перезайти в приложение).
    let attemptActionsForInsert = templateAttemptActions;
    const [priorAttempt] = await tx
      .select({ actions: userProgramStepAttempts.actions })
      .from(userProgramStepAttempts)
      .where(
        and(
          eq(userProgramStepAttempts.userProgramId, userProgram.id),
          eq(userProgramStepAttempts.stepTemplateId, stepTemplate.id)
        )
      )
      .orderBy(desc(userProgramStepAttempts.createdAt))
      .limit(1);
    if (priorAttempt) {
      attemptActionsForInsert = carryOverCompletedTimedPractices({
        templateActions: templateAttemptActions,
        priorActions: normalizeAttemptActions(priorAttempt.actions),
      });
    }

    const [createdAttempt] = await tx
      .insert(userProgramStepAttempts)
      .values({
        userId: params.userId,
        userProgramId: userProgram.id,
        stepTemplateId: stepTemplate.id,
        progressId: progress?.id ?? null,
        step: stepTemplate.step,
        status: 'started',
        replay: shouldReplay,
        actions: attemptActionsForInsert,
        rewardGranted: false,
        metadata: {},
      })
      .returning();

    if (!createdAttempt) {
      throw new Error('Program step attempt was not created');
    }

    return createdAttempt;
  });

  const overview = await getOrCreateProgramOverview(params.userId, params.slug);
  const step = overview.chapters
    .flatMap((chapter) => chapter.steps)
    .find((item) => item.step === params.step);

  if (!step) {
    throw new Error('Program step response was not created');
  }

  // Аналитика: фиксируем старт шага. Если у пользователя это первый шаг в
  // программе (currentStep=1, attempts отсутствовали) - заодно эмитим
  // program_started для D7/D30 cohort анализа.
  trackRetentionEvent('program_step_started', {
    userId: params.userId,
    programSlug: program.slug,
    step: step.step,
    isReplay: params.replay === true,
    hasAiChatAction: step.actions.some((a) => a.type === 'ai_chat_session'),
  });
  if (step.step === 1 && !params.replay) {
    trackRetentionEvent('program_started', {
      userId: params.userId,
      programSlug: program.slug,
    });
  }

  // Если пользователь сам пришёл к этому шагу, отменяем запланированный
  // на этот шаг push «завтра тебя ждёт следующий» - иначе ему придёт уже
  // нерелевантное напоминание. Идемпотентно: если push не было,
  // запрос ничего не сделает.
  if (!params.replay) {
    try {
      await cancelPendingNextStepReminder({
        userId: params.userId,
        programSlug: program.slug,
        stepNumber: step.step,
      });
    } catch (error) {
      console.error('[startProgramStep] cancel reminder failed:', error);
    }
  }

  // Резолв гендерных форм `{м|ж}`: `step` приходит из overview (уже резолвлен),
  // но `attempt.actions` копируются из шаблона с сырой разметкой - её надо
  // подставить здесь. applyGenderDeep на уже резолвленных строках - no-op.
  const gender = await getUserGender(params.userId);
  return applyGenderDeep(
    {
      attempt: toAttemptDto(attempt),
      step,
      program: {
        slug: program.slug,
        title: program.title,
        totalSteps: program.totalSteps,
      },
    },
    gender
  );
}

export async function updateProgramStepAction(params: {
  userId: number;
  attemptId: number;
  actionId: string;
  status?: 'pending' | 'completed';
  output?: unknown;
}) {
  const [attempt] = await db
    .select()
    .from(userProgramStepAttempts)
    .where(
      and(
        eq(userProgramStepAttempts.id, params.attemptId),
        eq(userProgramStepAttempts.userId, params.userId)
      )
    )
    .limit(1);

  if (!attempt) {
    throw new Error('Program step attempt not found');
  }

  const actions = Array.isArray(attempt.actions)
    ? (attempt.actions as ProgramStepActionStateDto[])
    : [];
  const actionFound = actions.some((action) => action.id === params.actionId);

  if (!actionFound) {
    throw new Error('Program step action not found');
  }

  const targetIndex = actions.findIndex(
    (action) => action.id === params.actionId
  );
  const output =
    params.output && typeof params.output === 'object'
      ? (params.output as Record<string, unknown>)
      : null;
  const shouldSkipRemaining =
    output?.safeExit === true &&
    output.skipRemainingActionsOnSafeExit === true &&
    params.status === 'completed';

  const nextActions = actions.map((action, index) => {
    if (action.id === params.actionId) {
      return {
        ...action,
        status: params.status ?? action.status ?? 'completed',
        output: params.output ?? action.output,
      };
    }
    if (
      shouldSkipRemaining &&
      index > targetIndex &&
      action.required !== false
    ) {
      return {
        ...action,
        status: 'completed' as const,
        output: action.output ?? {
          skippedBySafeExit: true,
          skippedAfterActionId: params.actionId,
        },
      };
    }
    return action;
  });

  const [updated] = await db
    .update(userProgramStepAttempts)
    .set({ actions: nextActions, updatedAt: new Date() })
    .where(eq(userProgramStepAttempts.id, attempt.id))
    .returning();

  if (!updated) {
    throw new Error('Program step attempt was not updated');
  }

  const gender = await getUserGender(params.userId);
  return applyGenderDeep({ attempt: toAttemptDto(updated) }, gender);
}

// Upsert системного элемента набора (практика/чат) с дедупом по itemKey и
// накоплением источников. Один и тот же элемент из разных садов = одна карточка.
async function upsertSystemToolkitItem(
  userId: number,
  dest: ToolkitDestination,
  source: ToolkitItemSource
) {
  const [existing] = await db
    .select()
    .from(userToolkitItems)
    .where(
      and(
        eq(userToolkitItems.userId, userId),
        eq(userToolkitItems.itemKey, dest.itemKey)
      )
    )
    .limit(1);

  if (existing) {
    const sources = Array.isArray(existing.sources) ? existing.sources : [];
    const alreadyHasSource = sources.some(
      (s) => s.programSlug === source.programSlug && s.stepId === source.stepId
    );
    if (!alreadyHasSource) {
      await db
        .update(userToolkitItems)
        .set({ sources: [...sources, source], updatedAt: new Date() })
        .where(eq(userToolkitItems.id, existing.id));
    }
    return;
  }

  await db
    .insert(userToolkitItems)
    .values({
      userId,
      type: dest.type,
      title: dest.title,
      content: null,
      toolRef: dest.toolRef,
      itemKey: dest.itemKey,
      sources: [source],
      origin: 'roadmap',
    })
    // Защита от гонки: партиальный unique (userId, item_key).
    // Для partial-индекса в ON CONFLICT нужен совпадающий WHERE-предикат.
    .onConflictDoNothing({
      target: [userToolkitItems.userId, userToolkitItems.itemKey],
      where: sql`${userToolkitItems.itemKey} IS NOT NULL`,
    });
}

// Сохраняем личную фразу пользователя. Дедуп по тексту, чтобы повтор/replay шага
// не плодил дубликаты одной и той же фразы.
async function insertPhraseToolkitItem(
  userId: number,
  content: string,
  source: ToolkitItemSource
) {
  const [existing] = await db
    .select({ id: userToolkitItems.id })
    .from(userToolkitItems)
    .where(
      and(
        eq(userToolkitItems.userId, userId),
        eq(userToolkitItems.type, 'phrase'),
        eq(userToolkitItems.content, content)
      )
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(userToolkitItems).values({
    userId,
    type: 'phrase',
    title: content.slice(0, 120),
    content,
    toolRef: null,
    itemKey: null,
    sources: [source],
    origin: 'roadmap',
  });
}

// Материализация «Моего набора» из ответов шага: проходим structured_form-экшены,
// для choice-полей берём только опции с реальным назначением (см. registry), а
// текстовые поля сохраняем как личные фразы. Концептуальные пункты без экрана и
// «ничего из этого» отфильтровываются на уровне реестра.
async function materializeToolkitFromAttempt(params: {
  userId: number;
  programSlug: string;
  gardenTitle: string;
  actions: ProgramStepActionStateDto[];
}) {
  for (const action of params.actions) {
    const output = action.output as
      | { type?: string; formKind?: string; fields?: Record<string, unknown> }
      | undefined;
    if (
      !output ||
      output.type !== 'structured_form' ||
      !output.formKind ||
      !output.fields
    ) {
      continue;
    }

    const formKind = output.formKind;
    const fields = output.fields;
    const source: ToolkitItemSource = {
      programSlug: params.programSlug,
      stepId: action.id,
      gardenTitle: params.gardenTitle,
    };

    // Запускаемые практики/чат из мультивыбора
    for (const [fieldId, value] of Object.entries(fields)) {
      if (!Array.isArray(value)) {
        continue;
      }
      for (const optionId of value) {
        if (typeof optionId !== 'string') {
          continue;
        }
        const dest = resolveToolkitDestination(formKind, fieldId, optionId);
        if (!dest) {
          continue;
        }
        await upsertSystemToolkitItem(params.userId, dest, source);
      }
    }

    // Личные фразы из текстовых полей
    for (const fieldId of getToolkitPhraseFields(formKind)) {
      const raw = fields[fieldId];
      if (typeof raw !== 'string') {
        continue;
      }
      const content = raw.trim();
      if (!content) {
        continue;
      }
      await insertPhraseToolkitItem(params.userId, content, source);
    }
  }
}

export async function completeProgramStep(params: {
  userId: number;
  attemptId: number;
  timezone: string;
}) {
  const [attempt] = await db
    .select()
    .from(userProgramStepAttempts)
    .where(
      and(
        eq(userProgramStepAttempts.id, params.attemptId),
        eq(userProgramStepAttempts.userId, params.userId)
      )
    )
    .limit(1);

  if (!attempt) {
    throw new Error('Program step attempt not found');
  }

  const [stepTemplate] = await db
    .select()
    .from(programStepTemplates)
    .where(eq(programStepTemplates.id, attempt.stepTemplateId))
    .limit(1);

  if (!stepTemplate) {
    throw new Error('Program step template not found');
  }

  // Программа уже создана к моменту completion'а (через startProgramStep / getOrCreateProgramOverview).
  // Достаточно получить запись напрямую по programId шага, без повторного ensure*.
  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, stepTemplate.programId))
    .limit(1);

  if (!program) {
    throw new Error('Retention program not found for attempt');
  }

  const entryDate = getLocalDateKey(new Date(), params.timezone);
  let rewardGranted = false;

  const updatedAttempt = await db.transaction(async (tx) => {
    const [freshAttempt] = await tx
      .select()
      .from(userProgramStepAttempts)
      .where(eq(userProgramStepAttempts.id, attempt.id))
      .limit(1);

    if (!freshAttempt) {
      throw new Error('Program step attempt not found');
    }

    const actions = Array.isArray(freshAttempt.actions)
      ? (freshAttempt.actions as ProgramStepActionStateDto[])
      : [];
    const hasIncompleteRequiredAction = actions.some(
      (action) => action.required !== false && action.status !== 'completed'
    );

    if (hasIncompleteRequiredAction) {
      throw new Error('Program step actions are not completed');
    }

    const alreadyCompleted = freshAttempt.status === 'completed';
    const shouldGrantReward = !freshAttempt.replay && !alreadyCompleted;
    rewardGranted = shouldGrantReward;

    const [completedAttempt] = await tx
      .update(userProgramStepAttempts)
      .set({
        status: 'completed',
        completedAt: freshAttempt.completedAt || new Date(),
        rewardGranted: freshAttempt.rewardGranted || shouldGrantReward,
        updatedAt: new Date(),
      })
      .where(eq(userProgramStepAttempts.id, freshAttempt.id))
      .returning();

    if (shouldGrantReward && freshAttempt.progressId) {
      await tx
        .update(userProgramStepProgress)
        .set({
          status: 'completed',
          completedAt: new Date(),
          bestAttemptId: freshAttempt.id,
          updatedAt: new Date(),
        })
        .where(eq(userProgramStepProgress.id, freshAttempt.progressId));

      const isLastStep = freshAttempt.step >= program.totalSteps;
      const nextStep = Math.min(freshAttempt.step + 1, program.totalSteps);
      await tx
        .update(userPrograms)
        .set({
          currentStep: nextStep,
          status: isLastStep ? 'completed' : 'active',
          completedAt: isLastStep ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(userPrograms.id, freshAttempt.userProgramId));

      await tx.insert(energyEvents).values({
        userId: params.userId,
        amount: stepTemplate.energyReward,
        source: 'program_step_complete',
        sourceId: String(freshAttempt.id),
        eventDate: entryDate,
        metadata: {
          step: freshAttempt.step,
          programSlug: program.slug,
        },
      });

      // Программа завершена - фиксируем растение в Оранжерее. UNIQUE(userId, programId)
      // делает операцию идемпотентной: replay/повтор завершения не создаст дубликат.
      if (isLastStep) {
        // Подтягиваем последние 3 сохранённые мысли пользователя за период
        // программы - они будут показаны на лор-карточке растения как «след»
        // прохождения Сада (см. retention/retention_long_term_strategy.md).
        // userProgram уже определён в startProgramStep'е выше (через freshAttempt.userProgramId).
        const [userProgramRow] = await tx
          .select({ startedAt: userPrograms.startedAt })
          .from(userPrograms)
          .where(eq(userPrograms.id, freshAttempt.userProgramId))
          .limit(1);

        const savedThoughtRows = userProgramRow?.startedAt
          ? await tx
              .select({ id: dailyThoughts.id })
              .from(dailyThoughts)
              .where(
                and(
                  eq(dailyThoughts.userId, params.userId),
                  isNotNull(dailyThoughts.savedAt),
                  gte(dailyThoughts.savedAt, userProgramRow.startedAt)
                )
              )
              .orderBy(desc(dailyThoughts.savedAt))
              .limit(3)
          : [];

        await tx
          .insert(userPlants)
          .values({
            userId: params.userId,
            programId: program.id,
            programSlug: program.slug,
            plantSetSlug: program.plantSetSlug ?? 'orchid',
            // Финальная стадия = последний state в `public/retention/plant/<set>/states`.
            // 15 - последний state из retention/retention_long_term_strategy.md (стадии 1..15,
            // семя/росток убраны, первая стадия - уже зелёные листья).
            stateIndex: 15,
            completedAt: new Date(),
            // ВАЖНО: НЕ сохраняем `program.summaryText` (preset из таблицы programs).
            // Раньше так делалось - и getOrGeneratePlantSummary видел непустой текст,
            // отдавал его как кеш, и AI-генерация НИКОГДА не запускалась. Пользователь
            // видел статичный preset из БД вместо клинического разбора. Теперь оставляем
            // null - сигнал «отчёт ещё не сгенерирован». Fire-and-forget вызов ниже
            // (после транзакции) запускает LLM и кэширует результат в user_summary.
            userSummary: null,
            savedThoughts: { ids: savedThoughtRows.map((r) => r.id) },
            metadata: {
              completedAtStep: freshAttempt.step,
              attemptId: freshAttempt.id,
            },
          })
          .onConflictDoNothing({
            target: [userPlants.userId, userPlants.programId],
          });
      }
    }

    if (!completedAttempt) {
      throw new Error('Program step attempt was not completed');
    }

    return completedAttempt;
  });

  // ВАЖНО: запускаем AI-генерацию клинического отчёта в фоне, ВНЕ транзакции
  // (LLM-вызовы идут 5-15 сек, держать транзакцию открытой нельзя). Эндпоинт
  // GET /api/garden/plants/:id/summary-status делает polling - фронт показывает
  // пользователю full-screen overlay «Готовится клинический разбор…».
  //
  // Идемпотентность: getOrGeneratePlantSummary при force=true пересоздаёт
  // summary. При повторных complete (replay) summary НЕ перегенерируется -
  // здесь мы проверяем что это первое завершение (rewardGranted=true) и
  // что шаг последний. UNIQUE(userId, programId) на user_plants гарантирует,
  // что plant создан один раз.
  if (rewardGranted && updatedAttempt.step >= program.totalSteps) {
    void (async () => {
      try {
        const [plant] = await db
          .select({ id: userPlants.id })
          .from(userPlants)
          .where(
            and(
              eq(userPlants.userId, params.userId),
              eq(userPlants.programId, program.id)
            )
          )
          .limit(1);
        if (!plant) return;
        await getOrGeneratePlantSummary({
          userId: params.userId,
          plantId: plant.id,
          // force=true - даже если userSummary случайно непустой (legacy данные),
          // перегенерируем именно при первом завершении программы. Это единственный
          // момент, когда такая регенерация безопасна (преобразует preset → AI).
          force: true,
        });
      } catch (error) {
        // НЕ throw - это фоновая задача, основной ответ пользователю уже
        // отправлен. Фронт сделает polling и получит fallback (preset)
        // через 10-20 сек если LLM упал. Лог критичен для мониторинга.
        console.error(
          '[completeProgramStep] async plant summary generation failed:',
          error
        );
      }
    })();
  }

  // Материализуем «Мой набор»: запускаемые практики и личные фразы, выбранные в шаге.
  // Идемпотентно (дедуп по itemKey/тексту), поэтому безопасно при replay. Не критично
  // для завершения шага — ошибки логируем, но не пробрасываем.
  try {
    await materializeToolkitFromAttempt({
      userId: params.userId,
      programSlug: program.slug,
      gardenTitle: program.title,
      actions:
        (updatedAttempt.actions as ProgramStepActionStateDto[] | null) || [],
    });
  } catch (error) {
    console.error(
      '[completeProgramStep] toolkit materialization failed:',
      error
    );
  }

  // Аналитика: фиксируем завершение шага, отдельно - завершение программы.
  // ai_chat_step_completed эмитим, если шаг содержал ai_chat_session action,
  // чтобы считать AI-chat completion rate vs остальные типы (стратегия §10).
  trackRetentionEvent('program_step_completed', {
    userId: params.userId,
    programSlug: program.slug,
    step: updatedAttempt.step,
    rewardGranted,
  });
  const hadAiChat = (
    (updatedAttempt.actions as Array<{ type?: string }> | null) || []
  ).some((a) => a?.type === 'ai_chat_session');
  if (hadAiChat) {
    trackRetentionEvent('ai_chat_step_completed', {
      userId: params.userId,
      programSlug: program.slug,
      step: updatedAttempt.step,
    });
  }
  if (rewardGranted) {
    try {
      await recordStreakActivityForDate({
        userId: params.userId,
        entryDate,
        source: 'program_step_complete',
        sourceId: String(updatedAttempt.id),
        metadata: {
          programSlug: program.slug,
          step: updatedAttempt.step,
        },
      });
    } catch (error) {
      console.error('[completeProgramStep] streak update failed:', error);
    }
  }
  if (rewardGranted && updatedAttempt.step >= program.totalSteps) {
    trackRetentionEvent('program_completed', {
      userId: params.userId,
      programSlug: program.slug,
      totalSteps: program.totalSteps,
    });
  }

  // Утренний push про следующий шаг — в 10:00 следующего дня по локальному
  // времени пользователя. Планируется только если reward засчитан и программа
  // ещё не завершена. Идемпотентно через entityKey.
  if (rewardGranted && updatedAttempt.step < program.totalSteps) {
    try {
      const timezone = await getUserTimezone(params.userId);
      await scheduleNextStepReminder({
        userId: params.userId,
        programSlug: program.slug,
        programTitle: program.title,
        nextStepNumber: updatedAttempt.step + 1,
        timezone,
      });
    } catch (error) {
      console.error('[completeProgramStep] schedule reminder failed:', error);
    }
  }

  const gender = await getUserGender(params.userId);
  // Промо-paywall привязки карты в триале считаем только при реальном завершении
  // нового шага (не replay). Ошибки промо не должны ломать завершение шага.
  const trialUpsell = rewardGranted
    ? await resolveTrialUpsellAfterStep({ userId: params.userId }).catch(
        (error) => {
          console.error(
            '[completeProgramStep] trial upsell resolve failed:',
            error
          );
          return null;
        }
      )
    : null;

  return applyGenderDeep(
    {
      attempt: toAttemptDto(updatedAttempt),
      program: await getOrCreateProgramOverview(params.userId, program.slug),
      rewardGranted,
      ...(trialUpsell ? { trialUpsell } : {}),
    },
    gender
  );
}
