// Общие типы и билдеры action'ов для blueprint'ов Садов.
// Вынесено из retention-program.service.ts: чистые функции без БД и сайд-эффектов.
// Один Сад = один файл в server/application/programs/blueprints/.
import type { ProgramStepAction } from '@/server/infrastructure/db/schema';
import type { ProgramStepDto } from '@/shared/dto/retention';

/** Акцентный цвет главы в roadmap UI. */
export type ChapterAccent = 'teal' | 'violet' | 'slate' | 'amber' | 'rose';

/** Описание главы Сада для прогресс-карты. */
export type ProgramChapter = {
  chapter: number;
  title: string;
  stepRange: string;
  accent: ChapterAccent;
};

export type StepBlueprintAction = Omit<ProgramStepAction, 'id'> & {
  idSuffix: string;
};

export type StepBlueprint = {
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

export function actionWithId(
  idSuffix: string,
  action: Omit<StepBlueprintAction, 'idSuffix'>
): StepBlueprintAction {
  return {
    idSuffix,
    ...action,
  };
}

export function breathingAction(params: {
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

export function meditationAction(params: {
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

export function tensionAction(params: {
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

export function timedAction(params: {
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

export function groundingAction(params: {
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

export function thoughtDumpAction(params: {
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

export function microReflectionAction(params: {
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

export function aiReflectionAction(params: {
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

export function journalAction(params: {
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

export function aiChatAction(params: {
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

export function ratingScaleAction(params: {
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

export function structuredFormAction(params: {
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

export function guidedStepsAction(params: {
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

export function splitReadingParagraphs(value: string | null | undefined) {
  return (value ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function stepIntroAction(
  blueprint: StepBlueprint
): StepBlueprintAction | null {
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

export function weeklyCheckAction(params: {
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
      'Это не экзамен и не показатель успеха. Нужна честная отметка, чтобы лучше заметить, как прошли последние дни.',
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

export function makeChoiceOptions(labels: string[]) {
  return labels.map((label, index) => ({
    id: `option_${index + 1}`,
    label,
  }));
}
