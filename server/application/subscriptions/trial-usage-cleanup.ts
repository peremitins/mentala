/**
 * Очистка trial_usage_tracking по сроку хранения (1 год)
 */

import { lt } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { trialUsageTracking } from '@/server/infrastructure/db/schema';

const RETENTION_DAYS = 365;

export async function cleanupTrialUsageTracking() {
  const cutoff = new Date(
    Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const deleted = await db
    .delete(trialUsageTracking)
    .where(lt(trialUsageTracking.updatedAt, cutoff))
    .returning({ id: trialUsageTracking.id });

  return { removed: deleted.length };
}
