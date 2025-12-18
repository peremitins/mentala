import { getSessionUser } from '@/server/application/auth/session';
import { setHeader } from 'h3';
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

/**
 * GET /api/subscriptions/current
 * Получить текущую подписку пользователя
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
        eq(userSubscriptions.userId, sessionResult.user.id),
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
      .where(eq(userSubscriptions.userId, sessionResult.user.id))
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
        .where(eq(users.id, sessionResult.user.id))
        .limit(1);

      const userRecord = userData[0];
      const trialActive = userRecord ? isTrialActive(userRecord) : false;

      // Преобразуем subscription для getFeatures (customConfig может быть null)
      const subscriptionForFeatures = {
        planId: subscription.planId,
        customConfig: subscription.customConfig || undefined,
      };

      const features = userRecord
        ? await getFeatures(userRecord, subscriptionForFeatures, plan)
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
        customConfig: subscription.customConfig,
        createdAt: subscription.createdAt,
        updatedAt: subscription.updatedAt,
        plan: {
          id: plan.id,
          name: plan.name,
          basePrice: Number(plan.basePrice),
          weeklyMinutesLimit: plan.weeklyMinutesLimit,
          avatarEnabled: plan.avatarEnabled,
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
    .where(eq(users.id, sessionResult.user.id))
    .limit(1);

  const userRecord = userData[0];
  const trialActive = userRecord ? isTrialActive(userRecord) : false;

  // Преобразуем subscription для getFeatures (customConfig может быть null)
  const subscriptionForFeatures = {
    planId: subscription.planId,
    customConfig: subscription.customConfig || undefined,
  };

  const features = userRecord
    ? await getFeatures(userRecord, subscriptionForFeatures, plan)
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
    customConfig: subscription.customConfig,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
    plan: {
      id: plan.id,
      name: plan.name,
      basePrice: Number(plan.basePrice),
      weeklyMinutesLimit: plan.weeklyMinutesLimit,
      avatarEnabled: plan.avatarEnabled,
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
