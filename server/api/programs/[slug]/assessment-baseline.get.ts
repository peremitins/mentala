import { createError, defineEventHandler, getRouterParam, getQuery } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { ProgramAssessmentBaselineResponseDto } from '@/shared/dto/assessments';
import { assertAssessmentsAccess } from '@/server/application/assessments/access';
import { getAssessmentDefinition } from '@/server/application/assessments/assessment-catalog';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  DEFAULT_BASELINE_REUSE_WINDOW_DAYS,
  getReusableProgramBaseline,
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

  const programSlug = getRouterParam(event, 'slug');
  if (!programSlug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Program slug is required',
    });
  }

  // assessmentSlug приходит из roadmap-action (targetId). Подстраховка: опросник
  // должен быть привязан именно к этому саду, иначе baseline не отдаём.
  const assessmentSlug = String(getQuery(event).assessmentSlug || '').trim();
  if (!assessmentSlug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'assessmentSlug query is required',
    });
  }

  const assessment = getAssessmentDefinition(assessmentSlug);
  if (
    !assessment ||
    assessment.status !== 'active' ||
    assessment.linkedProgramSlug !== programSlug
  ) {
    return ProgramAssessmentBaselineResponseDto.parse({
      assessmentSlug,
      reuseWindowDays: DEFAULT_BASELINE_REUSE_WINDOW_DAYS,
      reusable: null,
    });
  }

  const reusable = await getReusableProgramBaseline({
    repository: dbAssessmentAttemptsRepository,
    userId: Number(sessionUser.id),
    assessmentSlug,
  });

  return ProgramAssessmentBaselineResponseDto.parse({
    assessmentSlug,
    reuseWindowDays: DEFAULT_BASELINE_REUSE_WINDOW_DAYS,
    reusable: reusable ? toAssessmentAttemptDto(reusable) : null,
  });
});
