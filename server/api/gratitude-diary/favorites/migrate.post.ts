import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { desc, eq } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryFavoritePrompts } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import { GratitudeDiaryFavoriteMigrateDto } from '@/shared/dto';
import { GRATITUDE_PROMPT_CATEGORIES } from '@/shared/gratitude-diary/catalog';

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
  await assertGratitudeDiaryAccess({
    userId,
    roleId: sessionResult.user.roleId,
  });
  const body = await readBody(event);
  const parsed = GratitudeDiaryFavoriteMigrateDto.safeParse(body);

  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const { catalogPromptIds, customPrompts } = parsed.data;

  // Фильтруем только актуальные ID каталога (игнорируем устаревшие)
  const validCatalogIds = catalogPromptIds.filter((id) =>
    CATALOG_PROMPT_IDS.has(id)
  );

  let imported = 0;

  // INSERT ... ON CONFLICT DO NOTHING для каталожных — идемпотентно.
  // Если пользователь открыл 2 вкладки и оба запроса пришли одновременно,
  // дубликаты не создадутся благодаря partial unique index.
  if (validCatalogIds.length > 0) {
    const catalogValues = validCatalogIds.map((catalogPromptId) => ({
      userId,
      promptType: 'catalog' as const,
      catalogPromptId,
      customText: null,
      sortOrder: 0,
    }));

    const result = await db
      .insert(gratitudeDiaryFavoritePrompts)
      .values(catalogValues)
      .onConflictDoNothing()
      .returning({ id: gratitudeDiaryFavoritePrompts.id });

    imported += result.length;
  }

  // INSERT для кастомных с ON CONFLICT DO NOTHING — дедупликация по тексту.
  // Ограничиваем до 50 кастомных (берём первые 50 из входящих данных).
  const customToInsert = customPrompts.slice(0, 50);
  if (customToInsert.length > 0) {
    const customValues = customToInsert.map(({ text }) => ({
      userId,
      promptType: 'custom' as const,
      catalogPromptId: null,
      customText: text,
      sortOrder: 0,
    }));

    const result = await db
      .insert(gratitudeDiaryFavoritePrompts)
      .values(customValues)
      .onConflictDoNothing()
      .returning({ id: gratitudeDiaryFavoritePrompts.id });

    imported += result.length;
  }

  // Возвращаем полный актуальный список для обновления состояния на клиенте
  const rows = await db
    .select()
    .from(gratitudeDiaryFavoritePrompts)
    .where(eq(gratitudeDiaryFavoritePrompts.userId, userId))
    .orderBy(desc(gratitudeDiaryFavoritePrompts.createdAt));

  const items = rows.map((row) => ({
    id: row.id,
    promptType: row.promptType as 'catalog' | 'custom',
    catalogPromptId: row.catalogPromptId,
    customText: row.customText,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }));

  return { imported, items };
});
