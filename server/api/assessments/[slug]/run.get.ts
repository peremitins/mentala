import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getAssessmentDefinition } from '@/server/application/assessments/assessment-catalog';
import {
  ASSESSMENTS_FEATURE_KEY,
  assertAssessmentsAccess,
} from '@/server/application/assessments/access';
import { AssessmentRunResponseDto } from '@/shared/dto/assessments';

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

  const item = getAssessmentDefinition(slug);
  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Assessment not found',
    });
  }
  if (item.status !== 'active') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Assessment is not active',
    });
  }

  return AssessmentRunResponseDto.parse({
    item,
    featureKey: ASSESSMENTS_FEATURE_KEY,
  });
});
