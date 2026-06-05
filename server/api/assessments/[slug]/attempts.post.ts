import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  AssessmentAttemptResponseDto,
  AssessmentAttemptSubmitDto,
} from '@/shared/dto/assessments';
import {
  ASSESSMENTS_FEATURE_KEY,
  assertAssessmentsAccess,
} from '@/server/application/assessments/access';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  AssessmentAttemptServiceError,
  createAssessmentAttempt,
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

  const parsed = AssessmentAttemptSubmitDto.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Validation error',
      data: { issues: parsed.error.issues },
    });
  }

  let attempt;
  try {
    attempt = await createAssessmentAttempt({
      repository: dbAssessmentAttemptsRepository,
      userId: Number(sessionUser.id),
      assessmentSlug: slug,
      source: parsed.data.source,
      linkedProgramSlug: parsed.data.linkedProgramSlug ?? null,
      linkedProgramAttemptId: parsed.data.linkedProgramAttemptId ?? null,
      timezone: parsed.data.timezone ?? null,
      answers: parsed.data.answers,
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

  return AssessmentAttemptResponseDto.parse({
    item: toAssessmentAttemptDto(attempt),
    featureKey: ASSESSMENTS_FEATURE_KEY,
  });
});
