import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getAssessmentDefinition } from '@/server/application/assessments/assessment-catalog';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  getLatestAssessmentAttempt,
  toAssessmentAttemptDto,
} from '@/server/application/assessments/assessment-attempts.service';
import { AssessmentDetailResponseDto } from '@/shared/dto/assessments';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw createError({
      statusCode: 400,
      message: 'Assessment slug is required',
    });
  }

  const assessment = getAssessmentDefinition(slug);
  if (!assessment || assessment.status === 'disabled') {
    throw createError({
      statusCode: 404,
      message: 'Assessment not found',
    });
  }

  const attempt =
    assessment.status === 'active'
      ? await getLatestAssessmentAttempt({
          repository: dbAssessmentAttemptsRepository,
          userId: sessionUser.id,
          assessmentSlug: assessment.slug,
          assessmentVersion: assessment.version,
        })
      : null;

  return AssessmentDetailResponseDto.parse({
    item: {
      slug: assessment.slug,
      version: assessment.version,
      status: assessment.status,
      title: assessment.title,
      shortTitle: assessment.shortTitle,
      description: assessment.description,
      category: assessment.category,
      linkedProgramSlug: assessment.linkedProgramSlug,
      linkedProgramTitle: assessment.linkedProgramTitle,
      estimatedMinutes: assessment.estimatedMinutes,
      timeframeLabel: assessment.timeframeLabel,
      isValidatedScale: assessment.isValidatedScale,
      sourceName: assessment.sourceName,
      licenseNote: assessment.licenseNote,
      scoreDirection: assessment.scoreDirection,
      scoring: assessment.scoring,
      lockedCopy: assessment.lockedCopy,
      questionsCount: assessment.questions.length,
      lastAttempt: attempt
        ? {
            attemptId: attempt.id,
            userDate: attempt.userDate,
            totalScore: attempt.totalScore,
            bandId: attempt.bandId,
            completedAt: toAssessmentAttemptDto(attempt).completedAt,
          }
        : null,
    },
  });
});
