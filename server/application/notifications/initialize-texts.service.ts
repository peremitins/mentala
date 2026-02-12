/**
 * Сервис для ленивой инициализации текстов уведомлений для пользователя
 * Копирует тексты из notificationTextPresets в notificationTexts при первом обращении
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationTexts,
  notificationTextPresets,
} from '@/server/infrastructure/db/schema';
import { nanoid } from 'nanoid';
import type { NotificationKind } from '@/shared/dto/notifications';

/**
 * Инициализирует тексты пользователя из presets, если их еще нет
 * Идемпотентная операция - можно вызывать многократно безопасно
 *
 * @param userId - ID пользователя
 * @param kind - тип уведомлений ('habits' | 'therapy')
 * @param entityKey - ключ сущности
 * @returns true если была инициализация, false если тексты уже существовали
 */
export async function ensureUserTextsInitialized(
  userId: number,
  kind: NotificationKind,
  entityKey: string
): Promise<boolean> {
  if (!entityKey) {
    return false;
  }

  return await db.transaction(async (tx) => {
    // 1. Проверяем, есть ли уже тексты с source='default' для этого пользователя и сущности
    const existing = await tx
      .select()
      .from(notificationTexts)
      .where(
        and(
          eq(notificationTexts.userId, userId),
          eq(notificationTexts.kind, kind),
          eq(notificationTexts.entityKey, entityKey),
          eq(notificationTexts.source, 'default'),
          eq(notificationTexts.isDeleted, false)
        )
      )
      .limit(1);

    // 2. Если уже есть - выходим (идемпотентность)
    if (existing.length > 0) {
      return false;
    }

    // 3. Загружаем все presets для этой сущности
    const presets = await tx
      .select()
      .from(notificationTextPresets)
      .where(
        and(
          eq(notificationTextPresets.kind, kind),
          eq(notificationTextPresets.entityKey, entityKey)
        )
      );

    // 4. Если пресетов нет - ничего не делаем
    if (presets.length === 0) {
      return false;
    }

    // 5. Копируем все пресеты в тексты пользователя (bulk insert для производительности)
    // Используем onConflictDoNothing для защиты от дублей при гонках
    const now = new Date();
    if (presets.length > 0) {
      await tx
        .insert(notificationTexts)
        .values(
          presets.map((preset) => ({
            id: nanoid(),
            kind: preset.kind,
            entityKey: preset.entityKey,
            userId: userId, // НЕ null! Персональная копия пользователя
            source: 'default' as const, // Помечаем как дефолтные тексты
            intent: preset.intent,
            subtype: preset.subtype,
            imageTag: preset.imageTag ?? null,
            actionHint: preset.actionHint ?? null,
            directness: preset.directness,
            addressing: preset.addressing,
            locale: preset.locale,
            text: preset.text,
            sortOrder: preset.sortOrder,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .onConflictDoNothing();
    }

    return true;
  });
}
