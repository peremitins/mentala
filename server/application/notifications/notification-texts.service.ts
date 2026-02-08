/**
 * Сервис для загрузки текстов уведомлений из БД
 * Объединяет дефолтные и кастомные тексты в единый массив
 */

import { and, eq, inArray, isNull, or, asc } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationTexts } from '@/server/infrastructure/db/schema';
import type { NotificationKind } from '@/shared/dto/notifications';
import type {
  Directness,
  Addressing,
  NotificationSubtype,
  NotificationActionHint,
} from '@/shared/dto/notifications';
import { ensureUserTextsInitialized } from './initialize-texts.service';
import { normalizeNotificationItems } from './ai-generation.service';

export interface LoadTextsParams {
  userId: number;
  kind: NotificationKind;
  entityKey: string | null;
  directness: Directness;
  addressing: Addressing;
  intent?: 'build' | 'quit' | null;
  subtype?: NotificationSubtype | null;
}

export interface LoadedText {
  text: string;
  imageTag: string | null;
  actionHint: NotificationActionHint;
}

export interface LoadedTexts {
  texts: LoadedText[];
  hasUserTexts: boolean;
  hasDefaultTexts: boolean;
}

/**
 * Загружает тексты уведомлений из БД для заданных параметров
 * Объединяет дефолтные и кастомные тексты в единый массив
 *
 * @param params - Параметры загрузки текстов
 * @returns Объект с массивом текстов и метаданными
 */
export async function loadTextsForPreference(
  params: LoadTextsParams
): Promise<LoadedTexts> {
  const { userId, kind, entityKey, directness, addressing, intent, subtype } =
    params;

  // Если entityKey не указан, возвращаем пустой результат
  if (!entityKey) {
    return {
      texts: [],
      hasUserTexts: false,
      hasDefaultTexts: false,
    };
  }

  // 1. Инициализируем тексты, если их еще нет (lazy init)
  await ensureUserTextsInitialized(userId, kind, entityKey);

  // Базовые условия для всех запросов
  const baseConditions: Array<
    | ReturnType<typeof eq>
    | ReturnType<typeof inArray>
    | ReturnType<typeof or>
    | ReturnType<typeof isNull>
  > = [
    eq(notificationTexts.kind, kind),
    eq(notificationTexts.entityKey, entityKey),
    eq(notificationTexts.locale, 'ru'),
    eq(notificationTexts.isDeleted, false),
    // directness: совпадает или 'universal'
    inArray(notificationTexts.directness, [directness, 'universal']),
    // addressing: совпадает или 'universal'
    inArray(notificationTexts.addressing, [addressing, 'universal']),
  ];

  // Intent-фильтр: симметричный с subtype
  // Без intent → только базовые тексты (без специфики)
  // С intent → базовые + конкретные
  const intentCondition = intent
    ? or(eq(notificationTexts.intent, intent), isNull(notificationTexts.intent))
    : isNull(notificationTexts.intent); // Без intent → только базовые

  baseConditions.push(intentCondition);

  // Subtype-фильтр: показываем тексты с указанным subtype ИЛИ с null
  const subtypeCondition = subtype
    ? or(
        eq(notificationTexts.subtype, subtype),
        isNull(notificationTexts.subtype)
      )
    : isNull(notificationTexts.subtype);

  baseConditions.push(subtypeCondition);

  // Загружаем только тексты пользователя (включая source='default' и source='user')
  const allUserTexts = await db
    .select({
      id: notificationTexts.id,
      text: notificationTexts.text,
      imageTag: notificationTexts.imageTag,
      actionHint: notificationTexts.actionHint,
      source: notificationTexts.source,
    })
    .from(notificationTexts)
    .where(
      and(
        ...baseConditions,
        eq(notificationTexts.userId, userId) // ТОЛЬКО тексты пользователя
      )
    )
    .orderBy(
      asc(notificationTexts.source),
      asc(notificationTexts.sortOrder),
      asc(notificationTexts.createdAt)
    );

  // Разделяем на дефолтные и пользовательские тексты
  const defaultTexts = allUserTexts.filter((t) => t.source === 'default');
  const userTexts = allUserTexts.filter((t) => t.source === 'user');

  // Объединяем дефолтные и кастомные тексты
  // Дефолтные идут первыми, затем кастомные
  // Единая нормализация шаблонов через общий пайплайн NotificationItem
  const normalizeLoadedText = (raw: {
    text: string;
    imageTag: string | null;
    actionHint: NotificationActionHint | null;
  }) =>
    normalizeNotificationItems([raw], 1, {
      isMixed: false,
      allowedImageTags: null,
      fallbackImageTag: null,
      disallowHarmForPositive: false,
      // Для шаблонов эмодзи не добавляем, только для AI-генерации
      addEmojiPrefix: false,
    })[0] ?? null;

  const allTexts: LoadedText[] = [];
  for (const raw of [...defaultTexts, ...userTexts]) {
    const normalized = normalizeLoadedText({
      text: raw.text,
      imageTag: raw.imageTag ?? null,
      actionHint: (raw.actionHint as NotificationActionHint | null) ?? null,
    });
    if (!normalized) continue;
    allTexts.push({
      text: normalized.text,
      imageTag: normalized.imageTag ?? null,
      actionHint: normalized.actionHint ?? 'none',
    });
  }

  return {
    texts: allTexts,
    hasUserTexts: userTexts.length > 0,
    hasDefaultTexts: defaultTexts.length > 0,
  };
}
