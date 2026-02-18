import { eq, and } from 'drizzle-orm';
import { breathPracticesCustom } from '@/server/infrastructure/db/schema';
import { db } from '@/server/infrastructure/db/client';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import type {
  BreathCustomPractice,
  BreathPhase,
} from '@/app/lib/breathPracticesCatalog';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';

interface UpdateBreathPracticeDto {
  name?: string;
  phases?: BreathPhase[];
}

/**
 * PUT /api/breath-practices/custom/:id
 * Обновить кастомную дыхательную практику
 */
export default defineEventHandler(
  async (event): Promise<BreathCustomPractice> => {
    const sessionUser = await getSessionUserWithRole(event);
    if (!sessionUser?.id) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }
    const userId = sessionUser.id;

    const featureKey = 'breath.custom.manage';
    const billing = await getBillingSnapshot(userId, sessionUser.role);
    const access = getFeatureAccessOrDefault(billing, featureKey);

    if (!access.available) {
      throw createError({
        statusCode: 402,
        statusMessage: 'Feature requires higher plan',
        data: toFeaturePlanRequiredPayload({ featureKey, access }),
      });
    }

    const id = getRouterParam(event, 'id');
    if (!id) {
      throw createError({
        statusCode: 400,
        message: 'ID практики обязателен',
      });
    }

    // Проверяем, существует ли практика и принадлежит ли она пользователю
    const [existing] = await db
      .select()
      .from(breathPracticesCustom)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      )
      .limit(1);

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Практика не найдена',
      });
    }

    const body = await readBody<UpdateBreathPracticeDto>(event);

    // Валидация
    if (body.name !== undefined && body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Название практики не может быть пустым',
      });
    }

    if (body.phases !== undefined) {
      if (!Array.isArray(body.phases) || body.phases.length === 0) {
        throw createError({
          statusCode: 400,
          message: 'Необходимо указать хотя бы одну фазу',
        });
      }

      if (body.phases.length < 2 || body.phases.length > 4) {
        throw createError({
          statusCode: 400,
          message: 'Количество фаз должно быть от 2 до 4',
        });
      }
    }

    // Формируем объект для обновления
    const updateData: {
      name?: string;
      phases?: BreathPhase[];
      updatedAt?: Date;
    } = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      updateData.name = body.name.trim();
    }

    if (body.phases !== undefined) {
      updateData.phases = body.phases;
    }

    const [updated] = await db
      .update(breathPracticesCustom)
      .set(updateData)
      .where(
        and(
          eq(breathPracticesCustom.id, id),
          eq(breathPracticesCustom.userId, userId)
        )
      )
      .returning();

    return {
      id: updated.id,
      name: updated.name,
      phases: updated.phases as BreathCustomPractice['phases'],
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
);
