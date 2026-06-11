import { z } from 'zod';

export const AssessmentStatusDto = z.enum([
  'active',
  'locked_by_program_progress',
  'coming_soon',
  'disabled',
]);

export const AssessmentCategoryDto = z.enum([
  'anxiety',
  'self_kindness',
  'relationships',
  'stress',
  'sleep',
  'emotions',
  'flexibility',
  'habits',
  'resilience',
]);

export const AssessmentScoreDirectionDto = z.enum([
  'higher_is_worse',
  'higher_is_better',
  'custom',
]);

export const AssessmentSafetyLevelDto = z.enum(['none', 'watch', 'support']);

export const AssessmentOptionDto = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number().int(),
});

export const AssessmentQuestionDto = z.object({
  id: z.string(),
  text: z.string(),
  required: z.boolean(),
  reverseScored: z.boolean().optional(),
});

export const AssessmentNextActionDto = z.object({
  type: z.enum(['program', 'practice', 'sos']),
  slug: z.string(),
  label: z.string(),
});

export const AssessmentResultBandDto = z.object({
  id: z.string(),
  minScore: z.number().int(),
  maxScore: z.number().int(),
  title: z.string(),
  shortText: z.string(),
  description: z.string(),
  recommendationText: z.string(),
  programReportText: z.string(),
  comparisonImprovedText: z.string(),
  comparisonWorseText: z.string(),
  comparisonStableText: z.string(),
  safetyLevel: AssessmentSafetyLevelDto,
  nextAction: AssessmentNextActionDto,
});

export const AssessmentLockedCopyDto = z.object({
  title: z.string(),
  description: z.string(),
  ctaText: z.string(),
});

export const AssessmentChartPointDto = z.object({
  attemptId: z.number().int().positive(),
  userDate: z.string(),
  totalScore: z.number().int(),
  bandId: z.string(),
  completedAt: z.string(),
});

export const AssessmentDefinitionDto = z.object({
  slug: z.string(),
  version: z.number().int().positive(),
  status: AssessmentStatusDto,
  title: z.string(),
  shortTitle: z.string(),
  description: z.string(),
  category: AssessmentCategoryDto,
  linkedProgramSlug: z.string(),
  linkedProgramTitle: z.string(),
  estimatedMinutes: z.number().int().positive(),
  timeframeLabel: z.string(),
  isValidatedScale: z.boolean(),
  sourceName: z.string().nullable(),
  licenseNote: z.string().nullable(),
  scoreDirection: AssessmentScoreDirectionDto,
  questions: z.array(AssessmentQuestionDto),
  options: z.array(AssessmentOptionDto),
  scoring: z.object({
    method: z.enum(['sum', 'sum_with_reverse']),
    minScore: z.number().int(),
    maxScore: z.number().int(),
  }),
  resultBands: z.array(AssessmentResultBandDto),
  lockedCopy: AssessmentLockedCopyDto,
});

export const AssessmentListItemDto = AssessmentDefinitionDto.pick({
  slug: true,
  version: true,
  status: true,
  title: true,
  shortTitle: true,
  description: true,
  category: true,
  linkedProgramSlug: true,
  linkedProgramTitle: true,
  estimatedMinutes: true,
  timeframeLabel: true,
  scoreDirection: true,
  lockedCopy: true,
}).extend({
  questionsCount: z.number().int().nonnegative(),
  lastAttempt: AssessmentChartPointDto.nullable().optional(),
});

export const AssessmentListResponseDto = z.object({
  items: z.array(AssessmentListItemDto),
});

export const AssessmentDetailResponseDto = z.object({
  item: AssessmentDefinitionDto.omit({
    questions: true,
    options: true,
    resultBands: true,
  }).extend({
    questionsCount: z.number().int().nonnegative(),
    lastAttempt: AssessmentChartPointDto.nullable().optional(),
  }),
});

export const AssessmentRunResponseDto = z.object({
  item: AssessmentDefinitionDto,
});

export const AssessmentAttemptSourceDto = z.enum([
  'practice_page',
  'program_baseline',
  'program_final',
]);

export const AssessmentAnswerInputDto = z.object({
  questionId: z.string().min(1).max(120),
  optionId: z.string().min(1).max(120),
});

export const AssessmentAttemptSubmitDto = z.object({
  source: AssessmentAttemptSourceDto.optional().default('practice_page'),
  linkedProgramSlug: z.string().min(1).max(80).nullable().optional(),
  linkedProgramAttemptId: z.number().int().positive().nullable().optional(),
  timezone: z.string().min(1).max(100).nullable().optional(),
  answers: z.array(AssessmentAnswerInputDto).min(1).max(40),
});

export const AssessmentAttemptAnswerDto = AssessmentAnswerInputDto.extend({
  value: z.number().int(),
});

export const AssessmentAttemptResultSnapshotDto = z.object({
  bandId: z.string(),
  title: z.string(),
  shortText: z.string(),
  scoreDirection: AssessmentScoreDirectionDto,
});

export const AssessmentAttemptDto = z.object({
  id: z.number().int().positive(),
  userId: z.number().int().positive(),
  assessmentSlug: z.string(),
  assessmentVersion: z.number().int().positive(),
  source: AssessmentAttemptSourceDto,
  linkedProgramSlug: z.string().nullable(),
  linkedProgramAttemptId: z.number().int().positive().nullable(),
  totalScore: z.number().int(),
  bandId: z.string(),
  resultSnapshot: AssessmentAttemptResultSnapshotDto,
  answers: z.array(AssessmentAttemptAnswerDto),
  userDate: z.string(),
  timezone: z.string(),
  completedAt: z.string(),
});

export const AssessmentAttemptResponseDto = z.object({
  item: AssessmentAttemptDto,
});

export const AssessmentResultResponseDto = z.object({
  item: AssessmentAttemptDto,
  previous: AssessmentAttemptDto.nullable(),
  comparison: z
    .object({
      delta: z.number().int(),
      direction: z.enum(['improved', 'worse', 'stable']),
      text: z.string(),
    })
    .nullable(),
});

export const AssessmentHistoryResponseDto = z.object({
  items: z.array(AssessmentAttemptDto),
});

// Недавний результат, который сад может переиспользовать как стартовую точку,
// чтобы не заставлять проходить оценку заново. См. ТЗ §14.
export const ProgramAssessmentBaselineResponseDto = z.object({
  assessmentSlug: z.string(),
  reuseWindowDays: z.number().int().positive(),
  reusable: AssessmentAttemptDto.nullable(),
});

export const AssessmentChartResponseDto = z.object({
  assessmentSlug: z.string(),
  assessmentVersion: z.number().int().positive(),
  scoreDirection: AssessmentScoreDirectionDto,
  points: z.array(AssessmentChartPointDto),
});

export type AssessmentDefinition = z.infer<typeof AssessmentDefinitionDto>;
export type AssessmentListItem = z.infer<typeof AssessmentListItemDto>;
export type AssessmentListResponse = z.infer<typeof AssessmentListResponseDto>;
export type AssessmentDetailResponse = z.infer<
  typeof AssessmentDetailResponseDto
>;
export type AssessmentRunResponse = z.infer<typeof AssessmentRunResponseDto>;
export type AssessmentAttemptSource = z.infer<
  typeof AssessmentAttemptSourceDto
>;
export type AssessmentAnswerInput = z.infer<typeof AssessmentAnswerInputDto>;
export type AssessmentAttemptAnswer = z.infer<
  typeof AssessmentAttemptAnswerDto
>;
export type AssessmentAttemptResultSnapshot = z.infer<
  typeof AssessmentAttemptResultSnapshotDto
>;
export type AssessmentAttempt = z.infer<typeof AssessmentAttemptDto>;
export type AssessmentAttemptResponse = z.infer<
  typeof AssessmentAttemptResponseDto
>;
export type AssessmentResultResponse = z.infer<
  typeof AssessmentResultResponseDto
>;
export type AssessmentHistoryResponse = z.infer<
  typeof AssessmentHistoryResponseDto
>;
export type ProgramAssessmentBaselineResponse = z.infer<
  typeof ProgramAssessmentBaselineResponseDto
>;
export type AssessmentChartPoint = z.infer<typeof AssessmentChartPointDto>;
export type AssessmentChartResponse = z.infer<
  typeof AssessmentChartResponseDto
>;
export type AssessmentOption = z.infer<typeof AssessmentOptionDto>;
export type AssessmentQuestion = z.infer<typeof AssessmentQuestionDto>;
export type AssessmentResultBand = z.infer<typeof AssessmentResultBandDto>;
export type AssessmentSafetyLevel = z.infer<typeof AssessmentSafetyLevelDto>;
export type AssessmentScoreDirection = z.infer<
  typeof AssessmentScoreDirectionDto
>;
export type AssessmentStatus = z.infer<typeof AssessmentStatusDto>;
