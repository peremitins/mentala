import { getQuery } from 'h3';
import { requireRole } from '@/server/utils/require-role';
import { getAccessCodeAvailability } from '@/server/application/promo-codes/access-code.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');

  const query = getQuery(event);
  const code = String(query.code || '').trim();
  const excludeIdRaw = String(query.excludeId || '').trim();
  const excludePromoCampaignId = excludeIdRaw ? Number(excludeIdRaw) : null;

  if (!code) {
    return {
      available: false,
      conflictType: null,
    };
  }

  return await getAccessCodeAvailability({
    code,
    excludePromoCampaignId:
      Number.isFinite(excludePromoCampaignId) && excludePromoCampaignId
        ? excludePromoCampaignId
        : null,
  });
});
