import { createError, defineEventHandler } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getAssessmentListItems } from '@/server/application/assessments/assessment-catalog';
import { dbAssessmentAttemptsRepository } from '@/server/application/assessments/assessment-attempts.repository';
import {
  getLatestAssessmentAttempt,
  toAssessmentAttemptDto,
} from '@/server/application/assessments/assessment-attempts.service';
import { AssessmentListResponseDto } from '@/shared/dto/assessments';

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const items = await Promise.all(
    getAssessmentListItems().map(async (item) => {
      if (item.status !== 'active') {
        return { ...item, lastAttempt: null };
      }

      const attempt = await getLatestAssessmentAttempt({
        repository: dbAssessmentAttemptsRepository,
        userId: sessionUser.id,
        assessmentSlug: item.slug,
        assessmentVersion: item.version,
      });

      return {
        ...item,
        lastAttempt: attempt
          ? {
              attemptId: attempt.id,
              userDate: attempt.userDate,
              totalScore: attempt.totalScore,
              bandId: attempt.bandId,
              completedAt: toAssessmentAttemptDto(attempt).completedAt,
            }
          : null,
      };
    })
  );

  return AssessmentListResponseDto.parse({ items });
});
