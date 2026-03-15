import { defineEventHandler, readBody, setResponseStatus } from 'h3';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '@@/server/infrastructure/db/client';
import { gratitudeDiaryFavoritePrompts } from '@@/server/infrastructure/db/schema';
import { getSessionUser } from '@@/server/application/auth/session';
import { assertGratitudeDiaryAccess } from '@/server/application/gratitude-diary/access';
import { GratitudeDiaryFavoriteCreateDto } from '@/shared/dto';
import { GRATITUDE_PROMPT_CATEGORIES } from '@/shared/gratitude-diary/catalog';

const MAX_CUSTOM_PROMPTS = 50;

// Набор всех актуальных ID промптов каталога для валидации входящих данных
const CATALOG_PROMPT_IDS = new Set(
  GRATITUDE_PROMPT_CATEGORIES.flatMap((cat) => cat.prompts.map((p) => p.id))
);

// Возвращает полный актуальный список избранных пользователя (новые сначала)
async function getFavoriteItems(userId: number) {
  const rows = await db
    .select()
    .from(gratitudeDiaryFavoritePrompts)
    .where(eq(gratitudeDiaryFavoritePrompts.userId, userId))
    .orderBy(desc(gratitudeDiaryFavoritePrompts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    promptType: row.promptType as 'catalog' | 'custom',
    catalogPromptId: row.catalogPromptId,
    customText: row.customText,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }));
}

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
  const parsed = GratitudeDiaryFavoriteCreateDto.safeParse(body);

  if (!parsed.success) {
    setResponseStatus(event, 400);
    return {
      error: true,
      message: 'Validation error',
      issues: parsed.error.issues,
    } as const;
  }

  const data = parsed.data;

  if (data.promptType === 'catalog') {
    // Проверяем что промпт существует в актуальном каталоге
    if (!CATALOG_PROMPT_IDS.has(data.catalogPromptId)) {
      setResponseStatus(event, 404);
      return { error: true, message: 'Catalog prompt not found' } as const;
    }

    // INSERT с ON CONFLICT DO NOTHING — идемпотентно, не создаёт дубликаты
    await db
      .insert(gratitudeDiaryFavoritePrompts)
      .values({
        userId,
        promptType: 'catalog',
        catalogPromptId: data.catalogPromptId,
        customText: null,
        sortOrder: 0,
      })
      .onConflictDoNothing();
  } else {
    // Проверяем лимит: не более MAX_CUSTOM_PROMPTS кастомных на пользователя
    const [{ value: customCount }] = await db
      .select({ value: count() })
      .from(gratitudeDiaryFavoritePrompts)
      .where(
        and(
          eq(gratitudeDiaryFavoritePrompts.userId, userId),
          sql`${gratitudeDiaryFavoritePrompts.promptType} = 'custom'`
        )
      );

    if (customCount >= MAX_CUSTOM_PROMPTS) {
      setResponseStatus(event, 422);
      return {
        error: true,
        message: `Custom prompts limit reached (max ${MAX_CUSTOM_PROMPTS})`,
      } as const;
    }

    await db
      .insert(gratitudeDiaryFavoritePrompts)
      .values({
        userId,
        promptType: 'custom',
        catalogPromptId: null,
        customText: data.customText,
        sortOrder: 0,
      })
      .onConflictDoNothing();
  }

  setResponseStatus(event, 201);
  const items = await getFavoriteItems(userId);
  return { items };
});
