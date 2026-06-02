import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRouterParam } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import { programs } from '@/server/infrastructure/db/schema';

/**
 * GET /api/share/garden/:slug
 *
 * Публичный endpoint без авторизации: отдаёт метаданные программы (slug, title,
 * subtitle, summaryText, plantSetSlug) для landing-страницы по шеренной ссылке.
 *
 * Что НЕ отдаём:
 *   - Личные отчёты пользователя (это privacy);
 *   - Содержимое шагов программы;
 *   - Метрики или эффективность.
 *
 * Endpoint может быть кеширован (Cache-Control), потому что данные программы
 * глобальные и обновляются редко. Сейчас без кеша для простоты.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug');
  if (!slug || slug.length === 0 || slug.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
  }

  const [row] = await db
    .select({
      slug: programs.slug,
      title: programs.title,
      subtitle: programs.subtitle,
      summaryText: programs.summaryText,
      plantSetSlug: programs.plantSetSlug,
    })
    .from(programs)
    .where(eq(programs.slug, slug))
    .limit(1);

  if (!row) {
    return { program: null };
  }

  return {
    program: {
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      summaryText: row.summaryText,
      plantSetSlug: row.plantSetSlug,
    },
  };
});
