import { z } from 'zod';

/**
 * DTO промежуточных и финального отчётов по программе (Сад).
 *
 * См. план golden-sleeping-dolphin.md и серверный сервис
 * garden-checkpoint-summary.service.ts. Используются эндпойнтами:
 *   - POST /api/programs/:slug/checkpoint-summary — генерация
 *   - GET  /api/programs/:slug/checkpoint-summary/:step — получение
 *   - GET  /api/garden/plants/:id/timeline — все отчёты программы
 *
 * Backward compat: новые поля добавляются как optional/nullable.
 */

// Метрики периода для KPI-карточек.
export const CheckpointMetricsDto = z.object({
  stepsCompleted: z.number().int().min(0),
  journalEntries: z.number().int().min(0),
  aiChatSessions: z.number().int().min(0),
  practicesCompleted: z.number().int().min(0),
});

// Анкета-точка для графика тревоги.
export const AnxietyTimelinePointDto = z.object({
  stepNumber: z.number().int().min(1),
  label: z.string().nullable(),
  value: z.number(),
  min: z.number(),
  max: z.number(),
  createdAt: z.string(),
});

// Mood-точка для графика настроения.
export const MoodTimelinePointDto = z.object({
  date: z.string(),
  mood: z.string(),
  score: z.number().int().min(-2).max(2),
});

// Ответы пользователя на конкретный weekly_check.
// `mainChange` — для обратной совместимости со старыми клиентами (первая
// выбранная опция). Новые клиенты должны читать `mainChangeIds` (массив).
export const WeeklyCheckAnswerDto = z
  .object({
    anxiety: z.number().int().nullable(),
    mainChange: z.string().nullable(),
    mainChangeIds: z.array(z.string()).nullable().optional(),
    supportNeed: z.string().nullable(),
  })
  .nullable();

// Короткий фрагмент ответа из structured_form. Поле `quote` оставляем для
// обратной совместимости старых клиентов и сохранённых отчётов.
export const StructuredFormHighlightDto = z.object({
  stepNumber: z.number().int().min(1),
  formKind: z.string(),
  fieldId: z.string(),
  quote: z.string(),
});

export const TopChipDto = z.object({
  label: z.string(),
  count: z.number().int().min(0),
});

// Структурированные данные одного чекпоинт-отчёта (для UI).
export const CheckpointStructuredDataDto = z.object({
  anxietyTimeline: z.array(AnxietyTimelinePointDto).default([]),
  moodTimeline: z.array(MoodTimelinePointDto).default([]),
  weeklyCheckAnswer: WeeklyCheckAnswerDto,
  topChips: z.array(TopChipDto).default([]),
  structuredFormHighlights: z.array(StructuredFormHighlightDto).default([]),
  metrics: CheckpointMetricsDto,
  periodStart: z.string(),
  periodEnd: z.string(),
});

// Один чекпоинт-отчёт в timeline.
export const CheckpointItemDto = z.object({
  // ID записи в user_program_checkpoint_summaries — нужен для mark-viewed.
  // Опциональный для обратной совместимости старых клиентов.
  id: z.number().int().positive().optional(),
  checkpointStep: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(21),
    z.literal(30),
  ]),
  kind: z.union([z.literal('weekly'), z.literal('final')]),
  summaryText: z.string(),
  structuredData: CheckpointStructuredDataDto,
  status: z.union([
    z.literal('pending'),
    z.literal('ready'),
    z.literal('failed'),
  ]),
  generatedAt: z.string(),
  viewedAt: z.string().nullable().optional(),
});

// POST /api/programs/:slug/checkpoint-summary body.
export const CheckpointGenerateRequestDto = z.object({
  checkpointStep: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(21),
    z.literal(30),
  ]),
  force: z.boolean().optional().default(false),
});

// POST/GET response — конкретный чекпоинт-отчёт + статус.
export const CheckpointSummaryResponseDto = z.object({
  // ID записи в БД — нужен для mark-viewed. Optional для GET-status, где
  // запись может ещё не существовать (pending).
  id: z.number().int().positive().optional(),
  checkpointStep: z.union([
    z.literal(7),
    z.literal(14),
    z.literal(21),
    z.literal(30),
  ]),
  status: z.union([
    z.literal('pending'),
    z.literal('ready'),
    z.literal('failed'),
  ]),
  summaryText: z.string().nullable(),
  structuredData: CheckpointStructuredDataDto.nullable(),
});

// GET /api/garden/plants/:id/timeline response.
export const ProgramTimelineResponseDto = z.object({
  programSlug: z.string(),
  userProgramId: z.number().int().positive(),
  items: z.array(CheckpointItemDto),
});

export type CheckpointMetricsDto = z.infer<typeof CheckpointMetricsDto>;
export type AnxietyTimelinePointDto = z.infer<typeof AnxietyTimelinePointDto>;
export type MoodTimelinePointDto = z.infer<typeof MoodTimelinePointDto>;
export type WeeklyCheckAnswerDto = z.infer<typeof WeeklyCheckAnswerDto>;
export type StructuredFormHighlightDto = z.infer<
  typeof StructuredFormHighlightDto
>;
export type TopChipDto = z.infer<typeof TopChipDto>;
export type CheckpointStructuredDataDto = z.infer<
  typeof CheckpointStructuredDataDto
>;
export type CheckpointItemDto = z.infer<typeof CheckpointItemDto>;
export type CheckpointGenerateRequestDto = z.infer<
  typeof CheckpointGenerateRequestDto
>;
export type CheckpointSummaryResponseDto = z.infer<
  typeof CheckpointSummaryResponseDto
>;
export type ProgramTimelineResponseDto = z.infer<
  typeof ProgramTimelineResponseDto
>;
