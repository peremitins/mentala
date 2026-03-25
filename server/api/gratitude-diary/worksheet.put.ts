import {
  createError,
  defineEventHandler,
  readBody,
  setResponseStatus,
} from 'h3';
import { eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryWorksheetTemplates } from '@@/server/infrastructure/db/schema';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import {
  GratitudeDiaryWorksheetUpdateDto,
  type GratitudeDiaryWorksheetItemDto,
} from '@/shared/dto';
import { GRATITUDE_WORKSHEET_TEMPLATE } from '@/shared/gratitude-diary/catalog';

function normalizeWorksheetItems(items: GratitudeDiaryWorksheetItemDto[]) {
  // Пустые строки считаем удаленными: пользователь может очистить emoji+text.
  return items
    .map((item, index) => ({
      id:
        String(item.id || '')
          .trim()
          .slice(0, 60) ||
        GRATITUDE_WORKSHEET_TEMPLATE[index]?.id ||
        `item-${index + 1}`,
      emoji: String(item.emoji || '')
        .trim()
        .slice(0, 16),
      text: String(item.text || '')
        .trim()
        .slice(0, 180),
    }))
    .filter((item) => item.text.length > 0)
    .slice(0, 5);
}

export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const featureKey = 'gratitude.worksheet.customize';
  const billingSnapshot = await getBillingSnapshot(
    sessionUser.id,
    sessionUser.role
  );
  const billing = await assertGratitudeDiaryAccess({
    userId: sessionUser.id,
    roleId: sessionUser.role,
    billing: billingSnapshot,
  });
  const access = getFeatureAccessOrDefault(billing, featureKey);
  if (!access.available) {
    throw createError({
      statusCode: 402,
      statusMessage: 'Feature requires higher plan',
      data: toFeaturePlanRequiredPayload({ featureKey, access }),
    });
  }

  const body = await readBody(event);
  const parsed = GratitudeDiaryWorksheetUpdateDto.safeParse(body);
  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const normalizedItems = normalizeWorksheetItems(parsed.data.worksheet);
  if (!normalizedItems.length) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Worksheet must contain at least one non-empty row',
    } as const;
  }

  const now = new Date();

  await db
    .insert(gratitudeDiaryWorksheetTemplates)
    .values({
      userId: sessionUser.id,
      items: normalizedItems,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: gratitudeDiaryWorksheetTemplates.userId,
      set: {
        items: normalizedItems,
        updatedAt: now,
      },
    });

  const rows = await db
    .select({ items: gratitudeDiaryWorksheetTemplates.items })
    .from(gratitudeDiaryWorksheetTemplates)
    .where(eq(gratitudeDiaryWorksheetTemplates.userId, sessionUser.id))
    .limit(1);

  return {
    worksheet: Array.isArray(rows[0]?.items) ? rows[0]?.items : normalizedItems,
  };
});
