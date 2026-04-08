import { createError } from 'h3';
import { and, eq } from 'drizzle-orm';
import { getRouterParam } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { promoCampaigns } from '@/server/infrastructure/db/schema';
import { AdminPromoCampaignUpdateDto } from '@/shared/dto/promo-code';
import { normalizePromoCode } from '@/server/application/promo-codes/promo.shared';
import { assertAccessCodeAvailable } from '@/server/application/promo-codes/access-code.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');
  const session = await getSessionUser(event);
  const id = Number(getRouterParam(event, 'id'));
  const body = AdminPromoCampaignUpdateDto.parse(await readBody(event));
  const now = new Date();

  const patch: Record<string, unknown> = {
    updatedBy: session?.user?.id ?? null,
    updatedAt: now,
  };

  if (body.code) {
    const normalizedCode = normalizePromoCode(body.code);
    // H3-ошибка 409 выбрасывается прямо в assertAccessCodeAvailable.
    await assertAccessCodeAvailable({
      code: normalizedCode,
      excludePromoCampaignId: id,
    });
    patch.code = normalizedCode;
  }
  if (body.status) patch.status = body.status;
  if (body.campaignType) patch.campaignType = body.campaignType;
  if (body.bindingMode) patch.bindingMode = body.bindingMode;
  if (body.targetUserId !== undefined) patch.targetUserId = body.targetUserId;
  if (body.targetEmail !== undefined) {
    patch.targetEmail = body.targetEmail?.trim().toLowerCase() || null;
  }
  if (body.startsAt !== undefined) {
    patch.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  }
  if (body.endsAt !== undefined) {
    patch.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  }
  if (body.adminComment !== undefined) patch.adminComment = body.adminComment;
  if (body.benefitPayload) patch.benefitPayload = body.benefitPayload;

  let updated;
  try {
    [updated] = await db
      .update(promoCampaigns)
      .set(patch)
      .where(and(eq(promoCampaigns.id, id)))
      .returning();
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage:
          'Такой код уже существует. Выберите другой или сгенерируйте новый.',
        data: { code: 'code_already_exists', conflictType: 'promo_campaign' },
      });
    }
    throw error;
  }

  return { campaign: updated };
});
