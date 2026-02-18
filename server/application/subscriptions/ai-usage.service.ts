import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  subscriptionPlans,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { getFeatures, isTrialActive, type AiChatMode } from './access.service';
import { getUsageForCurrentWeek } from './session-time.service';
import { WEEKLY_OVERDRAFT_MINUTES } from '@/server/config/subscription';

export type AiUsageGateStatus = 'ok' | 'no_ai_access' | 'weekly_limit_reached';

export const AI_LIMIT_REACHED_CODE = 'premium_fair_use_limit_reached';

function getNextWeekResetAt(timezone: string, now: Date = new Date()): Date {
  const zonedNow = toZonedTime(now, timezone);
  const dayOfWeek = zonedNow.getDay(); // 0=вс, 1=пн
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  const nextMondayLocal = new Date(zonedNow);

  nextMondayLocal.setDate(zonedNow.getDate() + daysUntilNextMonday);
  nextMondayLocal.setHours(0, 0, 0, 0);

  return fromZonedTime(nextMondayLocal, timezone);
}

function formatResetAt(resetAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(resetAt);
  } catch {
    return resetAt.toISOString();
  }
}

function buildLimitMessage(nextResetAt: Date, timezone: string): string {
  const readableResetAt = formatResetAt(nextResetAt, timezone);
  return `Вы используете возможности ИИ на максимум! Чтобы поддерживать высокую скорость и качество ответов для всех участников, мы взяли небольшую техническую паузу. Чат снова станет доступен ${readableResetAt}`;
}

export function toUnifiedAiLimitPayload(gate: {
  weeklyLimit: number;
  usedMinutes: number;
  overdraftUsed: number;
  aiChatMode: AiChatMode;
  nextResetAt: string | null;
  limitMessage: string | null;
}) {
  return {
    code: AI_LIMIT_REACHED_CODE,
    message:
      gate.limitMessage ||
      'Лимит ИИ-чата временно достигнут. Доступ будет восстановлен автоматически.',
    nextResetAt: gate.nextResetAt,
    weeklyLimit: gate.weeklyLimit,
    usedMinutes: gate.usedMinutes,
    overdraftUsed: gate.overdraftUsed,
    aiChatMode: gate.aiChatMode,
  };
}

/**
 * Серверная проверка доступа к AI + лимита минут.
 * Использовать в критичных местах (start therapy session, chat endpoints).
 */
export async function getAiUsageGate(
  userId: number,
  userRole?: string
): Promise<{
  status: AiUsageGateStatus;
  trialActive: boolean;
  timezone: string;
  aiChatMode: AiChatMode;
  weeklyLimit: number;
  usedMinutes: number;
  availableMinutes: number;
  overdraftUsed: number;
  limitCode: string | null;
  nextResetAt: string | null;
  limitMessage: string | null;
}> {
  const now = new Date();

  const userRows = await db
    .select({
      timezone: users.timezone,
      trialEndedAt: users.trialEndedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const user = userRows[0];
  const timezone = user?.timezone || 'Europe/Moscow';
  const trialActive = user ? isTrialActive(user) : false;

  // Берём только реально активную и не истёкшую подписку (endDate > now),
  // чтобы доступ/лимиты не подтягивались из просроченных записей.
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
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.paymentStatus, 'active'),
        gt(userSubscriptions.endDate, now)
      )
    )
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  const sub = activeSubscription[0]?.subscription;
  const plan = activeSubscription[0]?.plan;
  const subscriptionForFeatures = sub ? { planId: sub.planId } : null;

  const features = user
    ? await getFeatures(
        { id: userId, trialEndedAt: user.trialEndedAt },
        subscriptionForFeatures,
        plan,
        userRole
      )
    : {
        ai: false,
        avatar: false,
        aiChatMode: 'disabled' as const,
        weeklyMinutesLimit: 0,
        fairUseGuardMinutesPerWeek: null,
      };

  const aiChatMode = features.aiChatMode;

  if (!features.ai) {
    return {
      status: 'no_ai_access',
      trialActive,
      timezone,
      aiChatMode,
      weeklyLimit: 0,
      usedMinutes: 0,
      availableMinutes: 0,
      overdraftUsed: 0,
      limitCode: null,
      nextResetAt: null,
      limitMessage: null,
    };
  }

  const weeklyLimit =
    aiChatMode === 'unlimited_fair_use'
      ? features.fairUseGuardMinutesPerWeek || 0
      : features.weeklyMinutesLimit || 0;
  const usage = await getUsageForCurrentWeek(userId, timezone);
  const usedMinutes = usage.usedMinutes;

  const allowOverdraft = aiChatMode === 'limited';
  let availableMinutes: number;

  if (usedMinutes <= weeklyLimit) {
    availableMinutes =
      weeklyLimit -
      usedMinutes +
      (allowOverdraft ? WEEKLY_OVERDRAFT_MINUTES : 0);
  } else if (allowOverdraft) {
    const overdraft = usedMinutes - weeklyLimit;
    availableMinutes = Math.max(0, WEEKLY_OVERDRAFT_MINUTES - overdraft);
  } else {
    availableMinutes = 0;
  }

  const overdraftUsed = allowOverdraft
    ? Math.max(0, Math.min(usedMinutes - weeklyLimit, WEEKLY_OVERDRAFT_MINUTES))
    : 0;

  if (availableMinutes <= 0) {
    const resetAt = getNextWeekResetAt(timezone, now);

    return {
      status: 'weekly_limit_reached',
      trialActive,
      timezone,
      aiChatMode,
      weeklyLimit,
      usedMinutes,
      availableMinutes,
      overdraftUsed,
      limitCode: AI_LIMIT_REACHED_CODE,
      nextResetAt: resetAt.toISOString(),
      limitMessage: buildLimitMessage(resetAt, timezone),
    };
  }

  return {
    status: 'ok',
    trialActive,
    timezone,
    aiChatMode,
    weeklyLimit,
    usedMinutes,
    availableMinutes,
    overdraftUsed,
    limitCode: null,
    nextResetAt: null,
    limitMessage: null,
  };
}
