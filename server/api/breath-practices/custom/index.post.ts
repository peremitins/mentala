import { nanoid } from 'nanoid';
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

interface CreateBreathPracticeDto {
  name: string;
  phases: BreathPhase[];
}

/**
 * POST /api/breath-practices/custom
 * Создать новую кастомную дыхательную практику
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

    const featureKey = 'breath.custom.create';
    const billing = await getBillingSnapshot(userId, sessionUser.role);
    const access = getFeatureAccessOrDefault(billing, featureKey);

    if (!access.available) {
      throw createError({
        statusCode: 402,
        statusMessage: 'Feature requires higher plan',
        data: toFeaturePlanRequiredPayload({ featureKey, access }),
      });
    }

    const body = await readBody<CreateBreathPracticeDto>(event);

    // Валидация
    if (!body.name || body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        message: 'Название практики обязательно',
      });
    }

    if (
      !body.phases ||
      !Array.isArray(body.phases) ||
      body.phases.length === 0
    ) {
      throw createError({
        statusCode: 400,
        message: 'Необходимо указать хотя бы одну фазу',
      });
    }

    // Валидация фаз
    if (body.phases.length < 2 || body.phases.length > 4) {
      throw createError({
        statusCode: 400,
        message: 'Количество фаз должно быть от 2 до 4',
      });
    }

    const [created] = await db
      .insert(breathPracticesCustom)
      .values({
        id: nanoid(),
        userId,
        name: body.name.trim(),
        phases: body.phases,
      })
      .returning();

    return {
      id: created.id,
      name: created.name,
      phases: created.phases as BreathCustomPractice['phases'],
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }
);
