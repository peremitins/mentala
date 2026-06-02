import { defineEventHandler, setResponseStatus } from 'h3';
import { desc, eq } from 'drizzle-orm';
import { getSessionUser } from '@@/server/application/auth/session';
import { db } from '@@/server/infrastructure/db/client';
import {
  gratitudeDiaryWorksheetTemplates,
  gratitudeDiaryFavoritePrompts,
  userPreferences,
} from '@@/server/infrastructure/db/schema';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
} from '@/server/application/subscriptions/entitlements.service';
import {
  GRATITUDE_PROMPT_CATEGORIES,
  GRATITUDE_WORKSHEET_TEMPLATE,
  getGratitudePromptCategories,
  type GratitudeWorksheetItem,
} from '@/shared/gratitude-diary/catalog';
import { resolveAddressing } from '@/shared/utils/addressing';

// Набор всех актуальных ID промптов из каталога для фильтрации "мёртвых" ссылок
const CATALOG_PROMPT_IDS = new Set(
  GRATITUDE_PROMPT_CATEGORIES.flatMap((cat) => cat.prompts.map((p) => p.id))
);

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const userId = Number(sessionResult.user.id);
  const userPrefs = await db
    .select({ addressing: userPreferences.addressing })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  const addressing = resolveAddressing(userPrefs[0]?.addressing);
  const billingSnapshot = await getBillingSnapshot(
    userId,
    sessionResult.user.roleId
  );
  const worksheetFeatureKey = 'gratitude.worksheet.customize';
  const worksheetAccess = getFeatureAccessOrDefault(
    billingSnapshot,
    worksheetFeatureKey
  );

  let worksheet: readonly GratitudeWorksheetItem[] =
    GRATITUDE_WORKSHEET_TEMPLATE;

  // Пользовательский шаблон отдаем только при наличии premium-доступа.
  if (worksheetAccess.available) {
    const rows = await db
      .select({ items: gratitudeDiaryWorksheetTemplates.items })
      .from(gratitudeDiaryWorksheetTemplates)
      .where(eq(gratitudeDiaryWorksheetTemplates.userId, userId))
      .limit(1);

    const rawItems = rows[0]?.items;
    if (Array.isArray(rawItems) && rawItems.length) {
      worksheet = rawItems
        .map((item: any, index) => ({
          id: String(item?.id || `custom-${index + 1}`),
          emoji: String(item?.emoji || '')
            .trim()
            .slice(0, 16),
          text: String(item?.text || '')
            .trim()
            .slice(0, 180),
        }))
        .filter((item) => item.text.length > 0)
        .slice(0, 10);
    }
  }

  // Загружаем избранные промпты пользователя, сортируем новые сначала
  const favoriteRows = await db
    .select()
    .from(gratitudeDiaryFavoritePrompts)
    .where(eq(gratitudeDiaryFavoritePrompts.userId, userId))
    .orderBy(desc(gratitudeDiaryFavoritePrompts.createdAt));

  // Фильтруем "мёртвые" ссылки на удалённые/переименованные промпты каталога.
  // Кастомные промпты всегда включаем.
  const favoritePrompts = favoriteRows
    .filter((row) => {
      if (row.promptType === 'catalog') {
        return (
          row.catalogPromptId !== null &&
          CATALOG_PROMPT_IDS.has(row.catalogPromptId)
        );
      }
      return true;
    })
    .map((row) => ({
      id: row.id,
      promptType: row.promptType as 'catalog' | 'custom',
      catalogPromptId: row.catalogPromptId,
      customText: row.customText,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    }));

  return {
    categories: getGratitudePromptCategories(addressing),
    worksheet: worksheet.length ? worksheet : GRATITUDE_WORKSHEET_TEMPLATE,
    canEditWorksheet: worksheetAccess.available,
    worksheetFeatureKey,
    favoritePrompts,
  };
});
