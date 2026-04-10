import { getRouterParam } from 'h3';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { promoCampaigns } from '@/server/infrastructure/db/schema';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');
  const id = Number(getRouterParam(event, 'id'));

  const [updated] = await db
    .update(promoCampaigns)
    .set({
      status: 'paused',
      updatedAt: new Date(),
    })
    .where(eq(promoCampaigns.id, id))
    .returning();

  return { campaign: updated };
});
