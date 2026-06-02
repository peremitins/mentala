import { z } from 'zod';

export const MoodCheckinMoodEnum = z.enum([
  'very_bad',
  'sad',
  'neutral',
  'good',
  'great',
]);

export const MoodCheckinSourceEnum = z.enum([
  'home',
  'program_step',
  'roadmap',
]);

export const MoodCheckinRequestDto = z.object({
  mood: MoodCheckinMoodEnum,
  source: MoodCheckinSourceEnum.default('home'),
  note: z.string().trim().max(500).nullable().optional(),
});

export const MoodCheckinDto = z.object({
  id: z.number(),
  mood: MoodCheckinMoodEnum,
  score: z.number().int().min(1).max(5),
  entryDate: z.string(),
  source: MoodCheckinSourceEnum,
  createdAt: z.string(),
});

export const MoodCheckinResponseDto = z.object({
  item: MoodCheckinDto,
  rewardGranted: z.boolean(),
  energyToday: z.number().int().min(0),
});

export const ProgramStepActionTypeEnum = z.enum([
  'mood_checkin',
  'breathing',
  'meditation',
  'quick_help_grounding',
  'quick_help_breathing',
  'quick_help_tension',
  'thought_dump',
  'ai_reflection',
  'journal_entry',
  'micro_reflection',
  'rating_scale',
  'next_route_choice',
  // AI-чат как тип action внутри Roadmap-шага (retention/retention_long_term_strategy.md).
  // Embedded-обёртка над ChatRoom.vue; завершается по eligibility + manual_summary.
  'ai_chat_session',
  // UI-ориентированное расширение v5: формы, пошаговые практики и недельные проверки.
  'structured_form',
  'guided_steps',
  'weekly_check',
]);

export const ProgramChoiceOptionDto = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  helperText: z.string().max(240).optional(),
});

export const ProgramStructuredFormFieldDto = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(180),
  type: z
    .enum(['text', 'textarea', 'choice', 'rating_scale', 'experiment_status'])
    .optional()
    .default('textarea'),
  placeholder: z.string().max(240).optional(),
  helperText: z.string().max(300).optional(),
  required: z.boolean().optional(),
  maxLength: z.number().int().positive().max(4000).optional(),
  mode: z.enum(['single', 'multiple']).optional(),
  minSelected: z.number().int().min(0).max(20).optional(),
  maxSelected: z.number().int().min(1).max(20).optional(),
  exclusiveOptionIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  options: z.array(ProgramChoiceOptionDto).max(20).optional(),
  min: z.number().int().min(-1000).max(1000).optional(),
  max: z.number().int().min(-1000).max(1000).optional(),
  minLabel: z.string().max(120).optional(),
  maxLabel: z.string().max(120).optional(),
  visibleWhen: z
    .object({
      fieldId: z.string().min(1).max(80),
      valueIn: z.array(z.string().min(1).max(80)).max(10),
    })
    .optional(),
});

export const ProgramGuidedStepDto = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(180),
  text: z.string().max(700).optional(),
  helperText: z.string().max(300).optional(),
  required: z.boolean().optional(),
  durationSeconds: z.number().int().positive().max(3600).optional(),
});

export const ProgramWeeklyCheckQuestionDto = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(['rating_scale', 'choice', 'text']).optional(),
  question: z.string().min(1).max(240),
  placeholder: z.string().max(240).optional(),
  required: z.boolean().optional(),
  mode: z.enum(['single', 'multiple']).optional(),
  minSelected: z.number().int().min(0).max(20).optional(),
  maxSelected: z.number().int().min(1).max(20).optional(),
  exclusiveOptionIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  options: z.array(ProgramChoiceOptionDto).max(20).optional(),
  min: z.number().int().min(-1000).max(1000).optional(),
  max: z.number().int().min(-1000).max(1000).optional(),
  minLabel: z.string().max(120).optional(),
  maxLabel: z.string().max(120).optional(),
});

export const ProgramStepActionDto = z.object({
  id: z.string().min(1).max(80),
  type: ProgramStepActionTypeEnum,
  title: z.string().min(1).max(160),
  subtitle: z.string().max(240).optional(),
  template: z.string().max(80).optional(),
  targetId: z.string().max(120).optional(),
  prompt: z.string().max(1000).optional(),
  durationSeconds: z.number().int().positive().max(3600).optional(),
  estimatedDurationSeconds: z.number().int().positive().max(3600).optional(),
  // Время, после которого CTA Roadmap можно нажать. Null означает, что
  // action завершается по вводу пользователя/внутренней логике, а не по таймеру.
  completionDelaySeconds: z
    .number()
    .int()
    .positive()
    .max(3600)
    .nullable()
    .optional(),
  energy: z.number().int().min(0).max(20).optional(),
  required: z.boolean().optional(),
  // Поля специфичные для ai_chat_session (retention/retention_long_term_strategy.md).
  // Игнорируются для других типов action.
  topicPrompt: z.string().max(1000).optional(),
  goalHint: z.string().max(500).optional(),
  minQualifyingMessages: z.number().int().min(0).max(20).optional(),
  minDurationSec: z.number().int().min(0).max(3600).optional(),
  stopCondition: z
    .object({
      text: z.string().max(500),
      allowCompleteWithoutChat: z.boolean().optional(),
      safeExitQuestion: z.string().max(240).optional(),
      safeExitChipOptions: z.array(z.string().min(1).max(80)).max(8).optional(),
      skipRemainingActionsOnSafeExit: z.boolean().optional(),
    })
    .optional(),
  journalFormat: z.enum(['oneLine', 'short', 'structured']).optional(),
  maxLength: z.number().int().positive().max(4000).optional(),
  // Кастомный placeholder для textarea журнала. Если задан — используется
  // вместо дефолтного «Запиши коротко...». Полезен, когда формулировка
  // вопроса абстрактная и нужен живой пример в самом поле ввода.
  placeholderText: z.string().max(240).optional(),
  preparedAnswers: z.array(z.string().min(1).max(240)).max(8).optional(),
  chipQuestion: z.string().max(240).optional(),
  chipMode: z.enum(['single', 'multi']).optional(),
  scaleBeforeLabel: z.string().max(120).optional(),
  scaleAfterLabel: z.string().max(120).optional(),
  scaleMin: z.number().int().min(-1000).max(1000).optional(),
  scaleMax: z.number().int().min(-1000).max(1000).optional(),
  splitAroundActionIdSuffix: z.string().max(80).optional(),
  // Варианты для chipset reflection-action'ов. Если заданы — рендерим именно
  // их (например, для primary CBT-вопроса в шаге 1: «тревога», «усталость», ...).
  // Если не заданы — UI fallback'нется на универсальные «Стало спокойнее / ...».
  chipOptions: z.array(z.string().min(1).max(48)).max(8).optional(),
  formKind: z.string().min(1).max(80).optional(),
  fields: z.array(ProgramStructuredFormFieldDto).max(20).optional(),
  steps: z.array(ProgramGuidedStepDto).max(20).optional(),
  questions: z.array(ProgramWeeklyCheckQuestionDto).max(20).optional(),
  placement: z
    .enum(['inline', 'after_completion', 'before_final_completion'])
    .optional(),
  // Пояснение «что нужно сделать» для сложных action'ов. Рендерится как
  // иконка «?» рядом с заголовком/prompt'ом. Без него юзер-новичок может
  // не понять формулировку (например, «триггер, тело, мысль, действие»
  // в журнале шага 4). Поле опционально — задают только там, где нужно.
  helpHint: z
    .object({
      title: z.string().max(120).optional(),
      description: z.string().max(800).optional(),
      examples: z.array(z.string().min(1).max(240)).max(6).optional(),
    })
    .optional(),
});

export const ProgramStepActionStateDto = ProgramStepActionDto.extend({
  status: z.enum(['pending', 'completed']).optional(),
  output: z.unknown().optional(),
});

export const ProgramStepStatusEnum = z.enum([
  'completed',
  'active',
  'available',
  'locked',
]);

export const ProgramStepMiniArticleDto = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(5000),
  sourceNotes: z.array(z.string().min(1).max(300)).max(10).optional(),
  readingLevel: z.enum(['simple']).optional(),
});

export const ProgramStepDto = z.object({
  id: z.number(),
  step: z.number().int().positive(),
  chapter: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().nullable(),
  nextHint: z.string().nullable(),
  introText: z.string().max(3000).nullable().optional(),
  miniArticle: ProgramStepMiniArticleDto.nullable().optional(),
  durationMin: z.number().int().positive(),
  durationLabel: z.string().min(1).max(40).optional(),
  energyReward: z.number().int().min(0),
  actions: z.array(ProgramStepActionDto),
  status: ProgramStepStatusEnum,
  completedAt: z.string().nullable(),
});

export const ProgramChapterDto = z.object({
  chapter: z.number().int().positive(),
  title: z.string(),
  stepRange: z.string(),
  accent: z.enum(['teal', 'violet', 'slate', 'amber', 'rose']),
  steps: z.array(ProgramStepDto),
});

export const ProgramOverviewDto = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  totalSteps: z.number().int().positive(),
  currentStep: z.number().int().positive(),
  completedSteps: z.number().int().min(0),
  progressPercent: z.number().min(0).max(100),
  currentStepItem: ProgramStepDto.nullable(),
  // Прогресс по под-этапам (actions) текущего активного шага. Нужен фронту,
  // чтобы показать «Продолжить» вместо «Начать», когда шаг уже начат, но не
  // завершён. Optional/nullable для обратной совместимости — старые серверы
  // это поле не возвращают, клиент тогда показывает «Начать».
  currentStepProgress: z
    .object({
      doneCount: z.number().int().min(0),
      totalCount: z.number().int().min(0),
    })
    .nullable()
    .optional(),
  chapters: z.array(ProgramChapterDto),
  // Slug набора ассетов растения для этого Сада (`orchid`, `peony`, `cyclamen`).
  // Используется фронтом для построения путей к картинкам. Optional для
  // backward compat — старые серверы это поле не возвращают, клиент falls back
  // на дефолтный путь без подпапки.
  plantSetSlug: z.string().min(1).max(40).nullable().optional(),
});

export const ThoughtOfTheDayDto = z.object({
  id: z.number().nullable(),
  entryDate: z.string(),
  text: z.string(),
  source: z.string(),
  saved: z.boolean(),
});

export const ThoughtOfTheDaySaveRequestDto = z
  .object({
    id: z.number().int().positive().optional(),
  })
  .default({});

export const ThoughtOfTheDaySaveResponseDto = z.object({
  item: ThoughtOfTheDayDto,
  rewardGranted: z.boolean(),
  energyToday: z.number().int().min(0),
  energyWeekly: z.number().int().min(0),
});

export const ThoughtCollectionItemDto = ThoughtOfTheDayDto.extend({
  id: z.number(),
  savedAt: z.string(),
});

export const ThoughtCollectionResponseDto = z.object({
  items: z.array(ThoughtCollectionItemDto),
});

// Запрос/ответ на начисление капли за свободную практику.
// См. retention/retention_long_term_strategy.md и server/application/energy/free-practice-energy.service.ts.
export const FreePracticeSourceEnum = z.enum([
  'breath_practice_completed',
  'meditation_completed',
  'gratitude_entry_saved',
  'thought_dump_saved',
]);

export const AwardFreePracticeEnergyRequestDto = z.object({
  source: FreePracticeSourceEnum,
  sourceId: z.string().trim().min(1).max(120),
});

export const AwardFreePracticeEnergyResponseDto = z.object({
  rewardGranted: z.boolean(),
  awardedAmount: z.number().int().min(0),
  freePracticeDropsToday: z.number().int().min(0),
  freePracticeDailyLimit: z.number().int().positive(),
  energyToday: z.number().int().min(0),
  energyWeekly: z.number().int().min(0),
});

// Информация о daily-лимите шагов программы (retention/retention_long_term_strategy.md).
// nextResetAt = ISO-момент локальной полуночи следующего дня; null если лимит ещё не достигнут.
// Поле optional — старые клиенты, не знающие о лимите, парсят TodayResponseDto без падения.
export const ProgramDailyLimitDto = z.object({
  dailyStepLimit: z.number().int().positive(),
  stepsDoneToday: z.number().int().min(0),
  nextResetAt: z.string().nullable(),
});

export const StreakEventTypeEnum = z.enum([
  'started',
  'extended',
  'repaired',
  'paused_auto',
  'paused_manual',
  'resumed',
]);

export const StreakDayStatusEnum = z.enum([
  'active',
  'repaired',
  'paused',
  'missed',
  'today',
]);

export const StreakDayDto = z.object({
  date: z.string(),
  status: StreakDayStatusEnum,
  active: z.boolean(),
});

export const StreakRepairDto = z.object({
  limit: z.number().int().positive(),
  used: z.number().int().min(0),
  remaining: z.number().int().min(0),
  period: z.string(),
});

export const StreakNoticeDto = z
  .object({
    type: z.enum(['repaired', 'paused_auto', 'paused_manual', 'resumed']),
    title: z.string(),
    text: z.string(),
  })
  .nullable();

export const StreakSummaryDto = z.object({
  current: z.number().int().min(0),
  best: z.number().int().min(0),
  week: z.array(z.boolean()).length(7),
  status: z.enum(['active', 'paused']),
  repair: StreakRepairDto,
  pausedSince: z.string().nullable(),
  notice: StreakNoticeDto,
  weekDetails: z.array(StreakDayDto).length(7).optional(),
});

export const StreakHistoryEventDto = z.object({
  id: z.number(),
  type: StreakEventTypeEnum,
  eventDate: z.string(),
  createdAt: z.string(),
  metadata: z.record(z.unknown()),
});

export const StreakHistoryResponseDto = z.object({
  summary: StreakSummaryDto,
  calendarDays: z.array(StreakDayDto),
  events: z.array(StreakHistoryEventDto),
});

export const TodayResponseDto = z.object({
  timezone: z.string(),
  entryDate: z.string(),
  mood: MoodCheckinDto.nullable(),
  streak: StreakSummaryDto.pick({
    current: true,
    best: true,
    week: true,
  }).extend({
    status: StreakSummaryDto.shape.status.optional(),
    repair: StreakSummaryDto.shape.repair.optional(),
    pausedSince: StreakSummaryDto.shape.pausedSince.optional(),
    notice: StreakSummaryDto.shape.notice.optional(),
    weekDetails: StreakSummaryDto.shape.weekDetails,
  }),
  energy: z.object({
    today: z.number().int().min(0),
    weekly: z.number().int().min(0),
    weeklyGoal: z.number().int().positive(),
  }),
  program: ProgramOverviewDto,
  thought: ThoughtOfTheDayDto,
  programDailyLimit: ProgramDailyLimitDto.optional(),
});

export const ProgramStepStartRequestDto = z.object({
  replay: z.boolean().optional().default(false),
});

export const ProgramStepAttemptDto = z.object({
  id: z.number(),
  step: z.number().int().positive(),
  replay: z.boolean(),
  status: z.enum(['started', 'completed']),
  rewardGranted: z.boolean(),
  actions: z.array(ProgramStepActionStateDto),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const ProgramStepStartResponseDto = z.object({
  attempt: ProgramStepAttemptDto,
  step: ProgramStepDto,
  program: z.object({
    slug: z.string(),
    title: z.string(),
    totalSteps: z.number().int().positive(),
  }),
});

export const ProgramStepActionPatchDto = z.object({
  status: z.enum(['pending', 'completed']).optional(),
  output: z.unknown().optional(),
});

export const ProgramStepActionPatchResponseDto = z.object({
  attempt: ProgramStepAttemptDto,
});

export const ProgramStepCompleteResponseDto = z.object({
  attempt: ProgramStepAttemptDto,
  program: ProgramOverviewDto,
  rewardGranted: z.boolean(),
});

export type MoodCheckinMood = z.infer<typeof MoodCheckinMoodEnum>;
export type MoodCheckinRequestDto = z.infer<typeof MoodCheckinRequestDto>;
export type MoodCheckinDto = z.infer<typeof MoodCheckinDto>;
export type MoodCheckinResponseDto = z.infer<typeof MoodCheckinResponseDto>;
export type ProgramStepActionType = z.infer<typeof ProgramStepActionTypeEnum>;
export type ProgramChoiceOptionDto = z.infer<typeof ProgramChoiceOptionDto>;
export type ProgramStructuredFormFieldDto = z.infer<
  typeof ProgramStructuredFormFieldDto
>;
export type ProgramGuidedStepDto = z.infer<typeof ProgramGuidedStepDto>;
export type ProgramWeeklyCheckQuestionDto = z.infer<
  typeof ProgramWeeklyCheckQuestionDto
>;
export type ProgramStepActionDto = z.infer<typeof ProgramStepActionDto>;
export type ProgramStepActionStateDto = z.infer<
  typeof ProgramStepActionStateDto
>;
export type ProgramStepStatus = z.infer<typeof ProgramStepStatusEnum>;
export type ProgramStepMiniArticleDto = z.infer<
  typeof ProgramStepMiniArticleDto
>;
export type ProgramStepDto = z.infer<typeof ProgramStepDto>;
export type ProgramChapterDto = z.infer<typeof ProgramChapterDto>;
export type ProgramOverviewDto = z.infer<typeof ProgramOverviewDto>;
export type ProgramDailyLimitDto = z.infer<typeof ProgramDailyLimitDto>;
export type StreakEventType = z.infer<typeof StreakEventTypeEnum>;
export type StreakDayStatus = z.infer<typeof StreakDayStatusEnum>;
export type StreakDayDto = z.infer<typeof StreakDayDto>;
export type StreakRepairDto = z.infer<typeof StreakRepairDto>;
export type StreakNoticeDto = z.infer<typeof StreakNoticeDto>;
export type StreakSummaryDto = z.infer<typeof StreakSummaryDto>;
export type StreakHistoryEventDto = z.infer<typeof StreakHistoryEventDto>;
export type StreakHistoryResponseDto = z.infer<typeof StreakHistoryResponseDto>;
export type TodayResponseDto = z.infer<typeof TodayResponseDto>;
export type ThoughtOfTheDayDto = z.infer<typeof ThoughtOfTheDayDto>;
export type ThoughtOfTheDaySaveRequestDto = z.infer<
  typeof ThoughtOfTheDaySaveRequestDto
>;
export type ThoughtOfTheDaySaveResponseDto = z.infer<
  typeof ThoughtOfTheDaySaveResponseDto
>;
export type ThoughtCollectionItemDto = z.infer<typeof ThoughtCollectionItemDto>;
export type ThoughtCollectionResponseDto = z.infer<
  typeof ThoughtCollectionResponseDto
>;
export type FreePracticeSource = z.infer<typeof FreePracticeSourceEnum>;
export type AwardFreePracticeEnergyRequestDto = z.infer<
  typeof AwardFreePracticeEnergyRequestDto
>;
export type AwardFreePracticeEnergyResponseDto = z.infer<
  typeof AwardFreePracticeEnergyResponseDto
>;
export type ProgramStepStartRequestDto = z.infer<
  typeof ProgramStepStartRequestDto
>;
export type ProgramStepAttemptDto = z.infer<typeof ProgramStepAttemptDto>;
export type ProgramStepStartResponseDto = z.infer<
  typeof ProgramStepStartResponseDto
>;
export type ProgramStepActionPatchDto = z.infer<
  typeof ProgramStepActionPatchDto
>;
export type ProgramStepActionPatchResponseDto = z.infer<
  typeof ProgramStepActionPatchResponseDto
>;
export type ProgramStepCompleteResponseDto = z.infer<
  typeof ProgramStepCompleteResponseDto
>;
