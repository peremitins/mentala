import { eq } from 'drizzle-orm';
import { setResponseStatus } from 'h3';
import { nanoid } from 'nanoid';
import {
  notificationInteractions,
  notificationSlots,
} from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import type {
  NotificationInteractionDto,
  CreateInteractionDto,
} from '@/shared/dto/notifications';
import { getSessionUser } from '@/server/application/auth/session';

/**
 * POST /api/notifications/interaction
 * Зафиксировать реакцию на push-уведомление
 */
export default defineEventHandler(
  async (event): Promise<NotificationInteractionDto> => {
    const sessionResult = await getSessionUser(event);
    if (!sessionResult?.user?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionResult.user.id;

    const body = await readBody<CreateInteractionDto>(event);

    // Валидация
    if (!body.slotId) {
      throw createError({
        statusCode: 400,
        message: 'slotId is required',
      });
    }

    if (
      !body.action ||
      !['yes', 'no', 'later', 'open', 'dismissed', 'unanswered'].includes(
        body.action
      )
    ) {
      throw createError({
        statusCode: 400,
        message: 'Invalid action',
      });
    }

    // Проверяем что слот существует и принадлежит пользователю
    const [slot] = await db
      .select()
      .from(notificationSlots)
      .where(eq(notificationSlots.id, body.slotId))
      .limit(1);

    if (!slot) {
      // Не падаем, если слот не найден: пуш мог прийти из другого окружения
      // или слот уже удалён. В этом случае просто игнорируем взаимодействие.
      console.warn('[Notifications] Slot not found for interaction', {
        slotId: body.slotId,
        userId,
        action: body.action,
      });
      setResponseStatus(event, 204);
      return null as unknown as NotificationInteractionDto;
    }

    if (slot.userId !== userId) {
      throw createError({
        statusCode: 403,
        message: 'Forbidden',
      });
    }

    // Создаём запись взаимодействия
    const actionAt = body.at ? new Date(body.at) : new Date();
    const payload = slot.payload as { templateId?: string } | null;
    const [created] = await db
      .insert(notificationInteractions)
      .values({
        id: nanoid(),
        slotId: body.slotId,
        userId,
        action: body.action,
        actionAt,
        meta: body.meta ?? null,
        kind: slot.kind,
        type: payload?.templateId ?? null, // из payload берём тип
        metric: null, // TODO: добавить для habits
      })
      .returning();

    return {
      id: created.id,
      slotId: created.slotId,
      userId: created.userId,
      action: created.action as
        | 'yes'
        | 'no'
        | 'later'
        | 'open'
        | 'dismissed'
        | 'unanswered',
      actionAt: created.actionAt?.toISOString() ?? new Date().toISOString(),
      meta: created.meta as Record<string, any> | null,
      kind: created.kind as NotificationInteractionDto['kind'],
      type: created.type ?? null,
      metric: created.metric ?? null,
      createdAt: created.createdAt.toISOString(),
    };
  }
);
