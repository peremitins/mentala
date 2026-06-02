import { createError, defineEventHandler, getRouterParam } from 'h3';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { getOrGeneratePlantSummary } from '@/server/application/garden/garden-summary.service';

/**
 * POST /api/garden/plants/:id/refresh-summary
 *
 * Возвращает (или генерирует, если ещё не было) AI-цитату для лор-карточки
 * растения завершённого Сада. Идемпотентно: первый вызов запускает LLM
 * и кэширует результат в `user_plants.user_summary`, последующие отдают
 * кэш без обращения к провайдеру.
 *
 * При query `?force=1` — пересоздаёт summary (если пользователь хочет
 * получить «свежий» вариант). В P1.5 кнопка ?force намеренно скрыта в UI,
 * чтобы не давать дёргать LLM слишком часто, но endpoint поддерживает.
 *
 * См. retention/retention_long_term_strategy.md «Лор-карточка растения».
 */
export default defineEventHandler(async (event) => {
  const sessionUser = await getSessionUserWithRole(event);
  if (!sessionUser?.id) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const userId = Number(sessionUser.id);
  const plantIdParam = getRouterParam(event, 'id');
  const plantId = Number(plantIdParam);
  if (!Number.isInteger(plantId) || plantId <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'E_VALIDATION' });
  }

  const url = new URL(event.node.req.url || '', 'http://x');
  const force = url.searchParams.get('force') === '1';

  try {
    const result = await getOrGeneratePlantSummary({
      userId,
      plantId,
      force,
    });
    return {
      summaryText: result.summaryText,
      generated: result.generated,
    };
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === 'E_NOT_FOUND') {
      throw createError({ statusCode: 404, statusMessage: 'E_NOT_FOUND' });
    }
    throw error;
  }
});
