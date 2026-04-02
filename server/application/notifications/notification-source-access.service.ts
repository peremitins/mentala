import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
} from '@/server/application/subscriptions/entitlements.service';

type EnsureAiNotificationAccessParams = {
  userId: number;
  userRole?: string | null;
};

type EnsureAiNotificationAccessResult = {
  canUseAiNotifications: boolean;
  switchedToTemplatesCount: number;
};

/**
 * Проверяет entitlement на AI-уведомления и при необходимости
 * автоматически переключает все AI-источники пользователя на шаблоны.
 *
 * Использует getBillingSnapshot для корректного учёта grace period
 * при неуспешной оплате (billingCollectionStatus='past_due').
 *
 * При автоматическом переключении сохраняет маркер textSourceBeforeAutoDowngrade,
 * чтобы при последующей успешной оплате можно было восстановить AI-режим.
 */
export async function ensureAiNotificationAccessConsistency(
  params: EnsureAiNotificationAccessParams
): Promise<EnsureAiNotificationAccessResult> {
  const billing = await getBillingSnapshot(
    params.userId,
    params.userRole || undefined
  );
  const canUseAiNotifications = getFeatureAccessOrDefault(
    billing,
    'notifications.text_source_ai'
  ).available;

  if (canUseAiNotifications) {
    return {
      canUseAiNotifications: true,
      switchedToTemplatesCount: 0,
    };
  }

  const now = new Date();
  const updated = await db
    .update(notificationPreferences)
    .set({
      // Принудительно фиксируем source как templates + сохраняем маркер
      // для автовосстановления при повторной оплате.
      meta: sql`jsonb_set(
        jsonb_set(COALESCE(${notificationPreferences.meta}, '{}'::jsonb), '{textSource}', '"templates"', true),
        '{textSourceBeforeAutoDowngrade}', '"ai"', true
      )`,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationPreferences.userId, params.userId),
        eq(notificationPreferences.textSourceNormalized, 'ai')
      )
    )
    .returning({
      id: notificationPreferences.id,
    });

  if (updated.length > 0) {
    console.warn(
      `[NotificationAccess] AI source disabled for user ${params.userId}: switched ${updated.length} preference(s) to templates (marker saved for auto-restore)`
    );
  }

  return {
    canUseAiNotifications: false,
    switchedToTemplatesCount: updated.length,
  };
}

type RestoreAiNotificationResult = {
  restoredCount: number;
};

/**
 * Восстанавливает AI-уведомления, которые были автоматически переключены
 * на шаблоны при потере доступа (маркер textSourceBeforeAutoDowngrade).
 *
 * Вызывается при успешной оплате (billing.purchase_success).
 */
export async function restoreAutoDowngradedAiNotifications(
  userId: number,
  userRole?: string | null
): Promise<RestoreAiNotificationResult> {
  const billing = await getBillingSnapshot(userId, userRole || undefined);
  const canUseAiNotifications = getFeatureAccessOrDefault(
    billing,
    'notifications.text_source_ai'
  ).available;

  if (!canUseAiNotifications) {
    return { restoredCount: 0 };
  }

  const now = new Date();
  const restored = await db
    .update(notificationPreferences)
    .set({
      // Восстанавливаем textSource = 'ai' и удаляем маркер.
      meta: sql`(COALESCE(${notificationPreferences.meta}, '{}'::jsonb) - 'textSourceBeforeAutoDowngrade') || '{"textSource": "ai"}'::jsonb`,
      updatedAt: now,
    })
    .where(
      and(
        eq(notificationPreferences.userId, userId),
        sql`${notificationPreferences.meta}->>'textSourceBeforeAutoDowngrade' = 'ai'`,
        sql`${notificationPreferences.meta}->>'textSource' = 'templates'`
      )
    )
    .returning({
      id: notificationPreferences.id,
    });

  if (restored.length > 0) {
    console.log(
      `[NotificationAccess] Restored ${restored.length} AI notification preference(s) for user ${userId} after access regained`
    );
  }

  return { restoredCount: restored.length };
}

export type CustomNotificationSourceAccessByKind = {
  habits: boolean;
  therapy: boolean;
};

/**
 * Возвращает доступ к кастомным источникам уведомлений по видам.
 * Используется для блокировки генерации/доставки custom-слотов после окончания Trial
 * или при плане без Premium.
 */
export async function getCustomNotificationSourceAccessByKind(params: {
  userId: number;
  userRole?: string | null;
}): Promise<CustomNotificationSourceAccessByKind> {
  const billing = await getBillingSnapshot(
    params.userId,
    params.userRole || undefined
  );

  return {
    habits: getFeatureAccessOrDefault(billing, 'habits.custom.create')
      .available,
    therapy: getFeatureAccessOrDefault(billing, 'therapy.custom.create')
      .available,
  };
}
