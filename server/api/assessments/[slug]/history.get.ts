import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { AssessmentHistoryResponseDto } from '@/shared/dto/assessments';
import {
  ASSESSMENTS_FEATURE_KEY,
  assertAssessmentsAccess,
} from '@/server/application/assessments/access';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  AssessmentAttemptServiceError,
  getAssessmentHistory,
  toAssessmentAttemptDto,
} from '@/server/application/assessments/assessment-attempts.service';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  await assertAssessmentsAccess({
    userId: Number(sessionUser.id),
    roleId: sessionUser.role,
  });

  const slug = getRouterParam(event, 'slug');
  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Assessment slug is required',
    });
  }

  let items;
  try {
    items = await getAssessmentHistory({
      repository: dbAssessmentAttemptsRepository,
      userId: Number(sessionUser.id),
      assessmentSlug: slug,
    });
  } catch (error) {
    if (error instanceof AssessmentAttemptServiceError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
      });
    }
    throw error;
  }

  return AssessmentHistoryResponseDto.parse({
    items: items.map(toAssessmentAttemptDto),
    featureKey: ASSESSMENTS_FEATURE_KEY,
  });
});
