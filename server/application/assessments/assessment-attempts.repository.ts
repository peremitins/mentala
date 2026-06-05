import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { assessmentAttempts } from '@/server/infrastructure/db/schema';
import type {
  AssessmentAttemptRecord,
  AssessmentAttemptsRepository,
} from './assessment-attempts.service';

function toRecord(
  row: typeof assessmentAttempts.$inferSelect
): AssessmentAttemptRecord {
  return {
    id: row.id,
    userId: row.userId,
    assessmentSlug: row.assessmentSlug,
    assessmentVersion: row.assessmentVersion,
    source: row.source,
    linkedProgramSlug: row.linkedProgramSlug,
    linkedProgramAttemptId: row.linkedProgramAttemptId,
    totalScore: row.totalScore,
    bandId: row.bandId,
    resultSnapshot: row.resultSnapshot,
    answers: row.answers,
    userDate: row.userDate,
    timezone: row.timezone,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const dbAssessmentAttemptsRepository: AssessmentAttemptsRepository = {
  async createAttempt(input) {
    const now = new Date();
    const [row] = await db
      .insert(assessmentAttempts)
      .values({
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      throw new Error('Assessment attempt was not created');
    }

    return toRecord(row);
  },

  async findAttemptById(attemptId) {
    const [row] = await db
      .select()
      .from(assessmentAttempts)
      .where(eq(assessmentAttempts.id, attemptId))
      .limit(1);

    return row ? toRecord(row) : null;
  },

  async listAttempts(params) {
    const rows = await db
      .select()
      .from(assessmentAttempts)
      .where(
        and(
          eq(assessmentAttempts.userId, params.userId),
          eq(assessmentAttempts.assessmentSlug, params.assessmentSlug)
        )
      )
      .orderBy(desc(assessmentAttempts.completedAt));

    return rows.map(toRecord);
  },
};
