import { defineEventHandler, readBody, createError } from 'h3';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { appVersionPolicy } from '@/server/infrastructure/db/schema';
import { UpdatePolicyAdminPatchDto } from '@/shared/dto/update-policy';

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin');

  const body = await readBody(event);
  const parsed = UpdatePolicyAdminPatchDto.safeParse(body);

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues.map((i) => i.message).join('; '),
    });
  }

  const { platform, ...updates } = parsed.data;

  // Проверяем что запись существует
  const existing = await db
    .select()
    .from(appVersionPolicy)
    .where(eq(appVersionPolicy.platform, platform));

  if (existing.length === 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `Политика для платформы "${platform}" не найдена`,
    });
  }

  // Собираем поля для обновления
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: user.email || `admin:${user.id}`,
  };

  if (updates.minimumSupportedBuild !== undefined) {
    updateData.minimumSupportedBuild = updates.minimumSupportedBuild;
  }
  if (updates.storeUrl !== undefined) {
    updateData.storeUrl = updates.storeUrl;
  }
  if (updates.blockerTitle !== undefined) {
    updateData.blockerTitle = updates.blockerTitle;
  }
  if (updates.blockerMessage !== undefined) {
    updateData.blockerMessage = updates.blockerMessage;
  }

  const [updated] = await db
    .update(appVersionPolicy)
    .set(updateData)
    .where(eq(appVersionPolicy.platform, platform))
    .returning();

  return { ok: true, policy: updated };
});
