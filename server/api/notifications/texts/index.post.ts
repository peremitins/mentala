import { eq, and, or, isNull, asc } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationTexts,
  userPreferences,
  habits,
  therapyTopicsCustom,
} from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import { ensureUserTextsInitialized } from '@/server/application/notifications/initialize-texts.service';
import type {
  NotificationTextIntent,
  NotificationSubtype,
  NotificationActionHint,
} from '@/shared/dto/notifications';

/**
 * POST /api/notifications/texts
 * Получить тексты для сущности с фильтрами
 *
 * Body:
 * - kind: 'habits' | 'therapy' (обязательно)
 * - entityKey: string (обязательно)
 * - subtype?: 'reminder' | 'informational' | 'motivational' | 'mixed'
 * - directness?: 'soft' | 'moderate' | 'hard' | 'universal'
 * - includeDeleted?: boolean (по умолчанию false) - включить удаленные тексты
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }
  const userId = sessionResult.user.id;

  const body = await readBody(event);
  const kind = body.kind as string | undefined;
  const entityKey = body.entityKey as string | undefined;
  const subtype = body.subtype as string | undefined;
  const directness = body.directness as string | undefined;
  const includeDeleted = body.includeDeleted === true;

  // Валидация
  if (!kind || !['habits', 'therapy'].includes(kind)) {
    throw createError({
      statusCode: 400,
      message: 'kind must be "habits" or "therapy"',
    });
  }

  if (!entityKey || entityKey.trim() === '') {
    throw createError({
      statusCode: 400,
      message: 'entityKey is required',
    });
  }

  // Валидация фильтров
  if (
    subtype &&
    !['reminder', 'informational', 'motivational', 'mixed'].includes(subtype)
  ) {
    throw createError({
      statusCode: 400,
      message: 'Invalid subtype value',
    });
  }

  if (
    directness &&
    !['soft', 'moderate', 'hard', 'universal'].includes(directness)
  ) {
    throw createError({
      statusCode: 400,
      message: 'Invalid directness value',
    });
  }

  // Политика доступа: тексты полностью независимы от notificationPreferences
  // Проверяем только принадлежность кастомных сущностей пользователю
  // Для готовых шаблонов (templates) проверка не требуется - они доступны всем
  let normalizedEntityKey = entityKey;

  if (kind === 'habits') {
    // Проверяем, является ли entityKey кастомной привычкой пользователя
    const [habit] = await db
      .select({ id: habits.id })
      .from(habits)
      .where(and(eq(habits.id, entityKey), eq(habits.userId, userId)))
      .limit(1);

    if (habit) {
      normalizedEntityKey = habit.id;
    }
    // Если не найдена - считаем template entityKey, используем как есть
  } else if (kind === 'therapy') {
    // Проверяем, является ли entityKey кастомной темой пользователя
    const [topic] = await db
      .select({ id: therapyTopicsCustom.id })
      .from(therapyTopicsCustom)
      .where(
        and(
          eq(therapyTopicsCustom.id, entityKey),
          eq(therapyTopicsCustom.userId, userId)
        )
      )
      .limit(1);

    if (topic) {
      normalizedEntityKey = topic.id;
    }
    // Если не найдена - считаем template entityKey, используем как есть
  }

  // Получаем addressing из глобальных настроек пользователя
  const userPrefs = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const userAddressing =
    (userPrefs[0]?.addressing as 'informal' | 'formal') || 'informal';

  // Инициализируем тексты, если их еще нет (lazy init)
  // Тексты существуют независимо от notificationPreferences
  //
  // ВАЖНО: Freeze-модель пресетов
  // После первой инициализации текстов для сущности, ensureUserTextsInitialized
  // больше не будет добавлять новые пресеты из notificationTextPresets.
  // Это означает, что:
  // - Новые пресеты, добавленные в БД после инициализации, НЕ попадут к существующим пользователям
  // - Для обновления текстов существующих пользователей нужно использовать:
  //   * reset-эндпоинт (восстановление из пресетов)
  //   * Специальные миграции (массовое обновление)
  // - Новые пользователи получат все актуальные пресеты при первой инициализации
  await ensureUserTextsInitialized(
    userId,
    kind as 'habits' | 'therapy',
    normalizedEntityKey
  );

  // Загружаем только тексты пользователя (userId = userId)
  const conditions = [
    eq(notificationTexts.kind, kind),
    eq(notificationTexts.entityKey, normalizedEntityKey),
    eq(notificationTexts.userId, userId), // ТОЛЬКО тексты пользователя
    eq(notificationTexts.locale, 'ru'), // Пока только русская локаль
  ];

  // Фильтр по isDeleted
  if (!includeDeleted) {
    conditions.push(eq(notificationTexts.isDeleted, false));
  }

  // Добавляем фильтры
  // Для subtype: показываем тексты с указанным subtype ИЛИ с null (для пользовательских текстов)
  if (subtype) {
    const subtypeCondition = or(
      eq(notificationTexts.subtype, subtype),
      isNull(notificationTexts.subtype)
    );
    if (subtypeCondition) {
      conditions.push(subtypeCondition);
    }
  }
  // Для directness: показываем тексты с указанным directness ИЛИ с 'universal'
  if (directness) {
    const directnessCondition = or(
      eq(notificationTexts.directness, directness),
      eq(notificationTexts.directness, 'universal')
    );
    if (directnessCondition) {
      conditions.push(directnessCondition);
    }
  }

  // Фильтруем по addressing: показываем тексты с addressing пользователя ИЛИ с 'universal'
  const addressingCondition = or(
    eq(notificationTexts.addressing, userAddressing),
    eq(notificationTexts.addressing, 'universal')
  );
  if (addressingCondition) {
    conditions.push(addressingCondition);
  }

  const texts = await db
    .select()
    .from(notificationTexts)
    .where(and(...conditions))
    .orderBy(
      // Сначала default (source='default'), потом custom (source='user')
      // Внутри каждой группы: живые выше удалённых, потом по sortOrder, потом по дате создания
      asc(notificationTexts.source),
      asc(notificationTexts.isDeleted), // Живые (false) всегда выше удалённых (true)
      asc(notificationTexts.sortOrder),
      asc(notificationTexts.createdAt)
    );

  // Преобразуем в формат ответа
  const items = texts.map((text) => ({
    id: text.id,
    kind: text.kind as 'habits' | 'therapy',
    entityKey: text.entityKey,
    userId: text.userId,
    source: text.source as 'default' | 'user',
    intent: text.intent as NotificationTextIntent | null,
    subtype: text.subtype as NotificationSubtype | null,
    imageTag: text.imageTag ?? null,
    actionHint: (text.actionHint as NotificationActionHint | null) ?? null,
    directness: text.directness as 'soft' | 'moderate' | 'hard' | 'universal',
    addressing: text.addressing as 'informal' | 'formal' | 'universal',
    locale: text.locale,
    text: text.text,
    sortOrder: text.sortOrder,
    isDeleted: text.isDeleted,
    createdAt: text.createdAt.toISOString(),
    updatedAt: text.updatedAt.toISOString(),
  }));

  return { items };
});
