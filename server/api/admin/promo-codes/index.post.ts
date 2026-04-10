import { createError } from 'h3';
import { getSessionUser } from '@/server/application/auth/session';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { promoCampaigns } from '@/server/infrastructure/db/schema';
import { AdminPromoCampaignCreateDto } from '@/shared/dto/promo-code';
import { normalizePromoCode } from '@/server/application/promo-codes/promo.shared';
import { assertAccessCodeAvailable } from '@/server/application/promo-codes/access-code.service';

export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin');
  const session = await getSessionUser(event);
  const body = AdminPromoCampaignCreateDto.parse(await readBody(event));
  const now = new Date();
  const normalizedCode = normalizePromoCode(body.code);

  // Предварительная проверка: cross-table уникальность (promo vs referral).
  // H3-ошибка 409 выбрасывается прямо в assertAccessCodeAvailable.
  await assertAccessCodeAvailable({ code: normalizedCode });

  let created;
  try {
    [created] = await db
      .insert(promoCampaigns)
      .values({
        code: normalizedCode,
        status: 'active',
        campaignType: body.campaignType,
        bindingMode: body.bindingMode,
        targetUserId: body.targetUserId ?? null,
        targetEmail: body.targetEmail?.trim().toLowerCase() || null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        benefitPayload: body.benefitPayload,
        adminComment: body.adminComment || null,
        createdBy: session?.user?.id ?? null,
        updatedBy: session?.user?.id ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  } catch (error: any) {
    // Конкурентная гонка: оба запроса прошли assertAccessCodeAvailable,
    // но первый коммитнул INSERT → второй получает 23505.
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

  return { campaign: created };
});
