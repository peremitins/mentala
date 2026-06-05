import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { AssessmentResultResponseDto } from '@/shared/dto/assessments';
import {
  ASSESSMENTS_FEATURE_KEY,
  assertAssessmentsAccess,
} from '@/server/application/assessments/access';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  getAssessmentResultForUser,
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
  const attemptId = Number(getRouterParam(event, 'attemptId'));
  if (!slug || !Number.isInteger(attemptId) || attemptId <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid assessment result request',
    });
  }

  const result = await getAssessmentResultForUser({
    repository: dbAssessmentAttemptsRepository,
    userId: Number(sessionUser.id),
    assessmentSlug: slug,
    attemptId,
  });

  if (!result) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Assessment attempt not found',
    });
  }

  return AssessmentResultResponseDto.parse({
    item: toAssessmentAttemptDto(result.item),
    previous: result.previous ? toAssessmentAttemptDto(result.previous) : null,
    comparison: result.comparison,
    featureKey: ASSESSMENTS_FEATURE_KEY,
  });
});
