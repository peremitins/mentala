import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { notificationPreferences } from '@/server/infrastructure/db/schema';
import { hasAiNotificationsAccess } from '@/server/application/subscriptions/access.service';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
} from '@/server/application/subscriptions/entitlements.service';
import { getCurrentActiveSubscription } from '@/server/application/subscriptions/current-subscription.service';

type SubscriptionRef = { planId: string } | null;

type EnsureAiNotificationAccessParams = {
  userId: number;
  trialEndedAt: Date | string | null | undefined;
  userRole?: string | null;
};

type EnsureAiNotificationAccessResult = {
  canUseAiNotifications: boolean;
  switchedToTemplatesCount: number;
};

function normalizeTrialEndedAt(
  value: Date | string | null | undefined
): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getCurrentSubscription(
  userId: number
): Promise<SubscriptionRef> {
  const active = await getCurrentActiveSubscription({
    userId,
    now: new Date(),
  });
  return active ? { planId: active.planId } : null;
}

/**
 * Проверяет entitlement на AI-уведомления и при необходимости
 * автоматически переключает все AI-источники пользователя на шаблоны.
 *
 * Это защищает от сценария, когда Trial истёк, а в БД остался `textSource=ai`,
 * из-за чего уведомления могли перестать стабильно наполняться.
 */
export async function ensureAiNotificationAccessConsistency(
  params: EnsureAiNotificationAccessParams
): Promise<EnsureAiNotificationAccessResult> {
  const subscription = await getCurrentSubscription(params.userId);
  const canUseAiNotifications = hasAiNotificationsAccess(
    {
      trialEndedAt: normalizeTrialEndedAt(params.trialEndedAt),
    },
    subscription,
    params.userRole || undefined
  );

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
      // Принудительно фиксируем source как templates, чтобы новые AI-генерации
      // больше не запускались без доступа.
      meta: sql`jsonb_set(COALESCE(${notificationPreferences.meta}, '{}'::jsonb), '{textSource}', '"templates"', true)`,
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
      `[NotificationAccess] AI source disabled for user ${params.userId}: switched ${updated.length} preference(s) to templates`
    );
  }

  return {
    canUseAiNotifications: false,
    switchedToTemplatesCount: updated.length,
  };
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
