import { getSessionUser } from '@/server/application/auth/session';
import { setHeader, getQuery } from 'h3';
import { db } from '@/server/infrastructure/db/client';
import {
  userSubscriptions,
  subscriptionPlans,
  users,
} from '@/server/infrastructure/db/schema';
import { eq, and, desc, gt } from 'drizzle-orm';
import {
  isTrialActive,
  getFeatures,
} from '@/server/application/subscriptions/access.service';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { createError } from 'h3';

/**
 * GET /api/subscriptions/current
 * Получить текущую подписку пользователя
 * Поддерживает query параметр ?userId=123 для admin/support
 */
export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    // HTTP-кэширование для неавторизованных пользователей (меньше времени)
    setHeader(event, 'Cache-Control', 'private, max-age=60'); // 1 минута
    return {
      subscription: null,
      noActiveSubscription: true,
    };
  }

  const query = getQuery(event);
  let targetUserId = sessionResult.user.id;

  // Если запрашивается другой пользователь - проверяем права (только admin/support)
  if (query.userId) {
    const requestedUserId = Number(query.userId);
    if (
      Number.isFinite(requestedUserId) &&
      requestedUserId !== sessionResult.user.id
    ) {
      // Проверяем, что смотрящий - admin или support (не moderator)
      const viewer = await getSessionUserWithRole(event);
      if (!viewer || !['admin', 'support'].includes(viewer.role)) {
        throw createError({
          statusCode: 403,
          statusMessage:
            'Forbidden: Only admin and support can view other users subscriptions',
        });
      }
      targetUserId = requestedUserId;
    }
  }

  // Получаем активную подписку (не истекшую)
  const now = new Date();
  const activeSubscription = await db
    .select({
      subscription: userSubscriptions,
      plan: subscriptionPlans,
    })
    .from(userSubscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(userSubscriptions.planId, subscriptionPlans.id)
    )
    .where(
      and(
        eq(userSubscriptions.userId, targetUserId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now) // подписка не истекла
      )
    )
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  if (!activeSubscription.length) {
    // Проверяем, есть ли подписка со статусом pending, expired или canceled
    const anySubscription = await db
      .select({
        subscription: userSubscriptions,
        plan: subscriptionPlans,
      })
      .from(userSubscriptions)
      .innerJoin(
        subscriptionPlans,
        eq(userSubscriptions.planId, subscriptionPlans.id)
      )
      .where(eq(userSubscriptions.userId, targetUserId))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (anySubscription.length) {
      const { subscription, plan } = anySubscription[0];

      // Получаем данные пользователя для billingCredit и Trial
      const userData = await db
        .select({
          billingCredit: users.billingCredit,
          hasUsedTrial: users.hasUsedTrial,
          timezone: users.timezone,
          trialEndedAt: users.trialEndedAt,
        })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      const userRecord = userData[0];
      const trialActive = userRecord ? isTrialActive(userRecord) : false;

      const subscriptionForFeatures = {
        planId: subscription.planId,
      };

      // Получаем роль целевого пользователя для premium доступа (не смотрящего!)
      const targetUserData = await db
        .select({ roleId: users.roleId })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      const targetUserRole = targetUserData[0]?.roleId || 'user';

      const features = userRecord
        ? await getFeatures(
            { id: targetUserId, trialEndedAt: userRecord.trialEndedAt },
            subscriptionForFeatures,
            plan,
            targetUserRole
          )
        : { ai: false, avatar: false, weeklyMinutesLimit: 0 };

      // Не отдаём внутренние поля checkout/billing, только публичные данные подписки
      const subscriptionDto = {
        id: subscription.id,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        paymentStatus: subscription.paymentStatus,
        autoRenew: subscription.autoRenew,
        sourcePlatform: subscription.sourcePlatform,
        billingPeriod: subscription.billingPeriod,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        plan: {
          id: plan.id,
          name: plan.name,
          basePrice: Number(plan.basePrice),
          weeklyMinutesLimit: plan.weeklyMinutesLimit,
          avatarEnabled: false,
        },
      };

      const response = {
        plan: subscription.planId,
        trialActive,
        trialExpiresAt: userRecord?.trialEndedAt?.toISOString() || null,
        features,
        subscription: subscriptionDto,
        user: userRecord
          ? {
              billingCredit: Number(userRecord.billingCredit),
              hasUsedTrial: userRecord.hasUsedTrial,
              timezone: userRecord.timezone,
            }
          : null,
        noActiveSubscription: false,
        paymentStatus: subscription.paymentStatus,
      };

      // HTTP-кэширование для подписок со статусом pending/expired (меньше времени)
      setHeader(event, 'Cache-Control', 'private, max-age=60'); // 1 минута для pending
      if (subscription.updatedAt) {
        const etag = `"${subscription.id}-${subscription.updatedAt.getTime()}"`;
        setHeader(event, 'ETag', etag);
      }

      return response;
    }

    // HTTP-кэширование для пользователей без подписки
    setHeader(event, 'Cache-Control', 'private, max-age=300'); // 5 минут
    return {
      subscription: null,
      noActiveSubscription: true,
    };
  }

  const { subscription, plan } = activeSubscription[0];

  // Получаем данные пользователя для billingCredit и Trial
  const userData = await db
    .select({
      billingCredit: users.billingCredit,
      hasUsedTrial: users.hasUsedTrial,
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);

  const userRecord = userData[0];
  const trialActive = userRecord ? isTrialActive(userRecord) : false;

  const subscriptionForFeatures = {
    planId: subscription.planId,
  };

  // Получаем роль целевого пользователя для premium доступа (не смотрящего!)
  const targetUserData = await db
    .select({ roleId: users.roleId })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  const targetUserRole = targetUserData[0]?.roleId || 'user';

  const features = userRecord
    ? await getFeatures(
        { id: targetUserId, trialEndedAt: userRecord.trialEndedAt },
        subscriptionForFeatures,
        plan,
        targetUserRole
      )
    : { ai: false, avatar: false, weeklyMinutesLimit: 0 };

  // Не отдаём внутренние поля checkout/billing, только публичные данные подписки
  const subscriptionDto = {
    id: subscription.id,
    planId: subscription.planId,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    paymentStatus: subscription.paymentStatus,
    autoRenew: subscription.autoRenew,
    sourcePlatform: subscription.sourcePlatform,
    billingPeriod: subscription.billingPeriod,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    plan: {
      id: plan.id,
      name: plan.name,
      basePrice: Number(plan.basePrice),
      weeklyMinutesLimit: plan.weeklyMinutesLimit,
      avatarEnabled: false,
    },
  };

  const response = {
    plan: subscription.planId,
    trialActive,
    trialExpiresAt: userRecord?.trialEndedAt?.toISOString() || null,
    features,
    subscription: subscriptionDto,
    user: userRecord
      ? {
          billingCredit: Number(userRecord.billingCredit),
          hasUsedTrial: userRecord.hasUsedTrial,
          timezone: userRecord.timezone,
        }
      : null,
    noActiveSubscription: false,
  };

  // HTTP-кэширование: 5 минут (соответствует кэшу на клиенте)
  setHeader(event, 'Cache-Control', 'private, max-age=300');
  // ETag для оптимизации (на основе ID подписки и времени обновления)
  if (subscription.updatedAt) {
    const etag = `"${subscription.id}-${subscription.updatedAt.getTime()}"`;
    setHeader(event, 'ETag', etag);
  }

  return response;
});
