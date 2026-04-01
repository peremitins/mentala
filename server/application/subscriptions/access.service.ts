import {
  PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK,
  PRO_WEEKLY_MINUTES_LIMIT,
} from '@/server/config/subscription';

/**
 * Централизованный сервис для проверки доступа к функциям подписки.
 */

export type AiChatMode = 'disabled' | 'limited' | 'unlimited_fair_use';

const SERVICE_ROLES = new Set(['admin', 'moderator']);
const PREMIUM_EQUIVALENT_ROLES = new Set(['support']);

type UserSubscriptionRef = {
  planId: string;
} | null;

function isServiceRole(userRole?: string): boolean {
  return Boolean(userRole && SERVICE_ROLES.has(userRole));
}

function isPremiumEquivalentRole(userRole?: string): boolean {
  return Boolean(userRole && PREMIUM_EQUIVALENT_ROLES.has(userRole));
}

function getEffectiveSubscription(
  subscription: UserSubscriptionRef,
  userRole?: string
): UserSubscriptionRef {
  if (subscription) return subscription;
  // review/support-роль должна вести себя как Premium без админских прав.
  if (isPremiumEquivalentRole(userRole)) {
    return { planId: 'premium' };
  }
  return null;
}

/**
 * Проверяет, активен ли Trial для пользователя.
 * Trial активен, если trialEndedAt существует и больше текущей даты.
 */
export function isTrialActive(user: { trialEndedAt: Date | null }): boolean {
  if (!user.trialEndedAt) return false;
  return new Date(user.trialEndedAt) > new Date();
}

/**
 * Возвращает режим доступа к AI-чату для пользователя.
 */
export function getAiChatMode(
  user: { trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  userRole?: string
): AiChatMode {
  // Служебные роли всегда имеют полный доступ.
  if (isServiceRole(userRole)) {
    return 'unlimited_fair_use';
  }

  const effectiveSubscription = getEffectiveSubscription(
    subscription,
    userRole
  );

  if (!effectiveSubscription) {
    return 'disabled';
  }

  // Trial для Basic трактуем как Premium-level доступ.
  if (effectiveSubscription.planId === 'basic') {
    return isTrialActive(user) ? 'unlimited_fair_use' : 'disabled';
  }

  if (effectiveSubscription.planId === 'pro') {
    return 'limited';
  }

  if (effectiveSubscription.planId === 'premium') {
    return 'unlimited_fair_use';
  }

  return 'disabled';
}

/**
 * Проверяет доступ к AI (AI-чат).
 */
export async function hasAIAccess(
  user: { id: number; trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  userRole?: string
): Promise<boolean> {
  return getAiChatMode(user, subscription, userRole) !== 'disabled';
}

/**
 * Проверяет доступ к AI-уведомлениям (`textSource=ai`).
 * По продуктовой политике доступ есть:
 * - у служебных ролей;
 * - у PRO и Premium;
 * - у Basic в активном Trial (Trial = premium-level доступ).
 */
export function hasAiNotificationsAccess(
  user: { trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  userRole?: string
): boolean {
  if (isServiceRole(userRole)) {
    return true;
  }

  const effectiveSubscription = getEffectiveSubscription(
    subscription,
    userRole
  );

  if (!effectiveSubscription) {
    return false;
  }

  if (
    effectiveSubscription.planId === 'pro' ||
    effectiveSubscription.planId === 'premium'
  ) {
    return true;
  }

  if (effectiveSubscription.planId === 'basic' && isTrialActive(user)) {
    return true;
  }

  return false;
}

/**
 * Операционный лимит минут для расчёта usage/gate.
 *
 * Важно:
 * - Для `unlimited_fair_use` возвращается server-side guard (900 мин/нед),
 *   а не `null`, т.к. это вычислительный лимит для защиты экономики.
 * - UI-ограничение для Premium задаётся отдельным полем (`weeklyMinutesLimit=null`).
 */
export async function getWeeklyMinutesLimit(
  user: { id: number; trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  plan?: { weeklyMinutesLimit: number } | null,
  userRole?: string
): Promise<number> {
  const mode = getAiChatMode(user, subscription, userRole);

  if (mode === 'disabled') {
    return 0;
  }

  if (mode === 'unlimited_fair_use') {
    return PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK;
  }

  if (subscription?.planId === 'pro') {
    return plan?.weeklyMinutesLimit || PRO_WEEKLY_MINUTES_LIMIT;
  }

  return PRO_WEEKLY_MINUTES_LIMIT;
}

/**
 * Лимит, который показываем клиенту:
 * - `number` для limited,
 * - `null` для unlimited_fair_use.
 */
function getWeeklyMinutesLimitForFeatures(
  user: { trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  plan?: { weeklyMinutesLimit: number } | null,
  userRole?: string
): number | null {
  const mode = getAiChatMode(user, subscription, userRole);
  const effectiveSubscription = getEffectiveSubscription(
    subscription,
    userRole
  );

  if (mode === 'disabled') {
    return 0;
  }

  if (mode === 'unlimited_fair_use') {
    return null;
  }

  if (effectiveSubscription?.planId === 'pro') {
    return plan?.weeklyMinutesLimit || PRO_WEEKLY_MINUTES_LIMIT;
  }

  return PRO_WEEKLY_MINUTES_LIMIT;
}

function getFairUseGuardMinutesPerWeek(
  user: { trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  userRole?: string
): number | null {
  const mode = getAiChatMode(user, subscription, userRole);
  return mode === 'unlimited_fair_use'
    ? PREMIUM_FAIR_USE_GUARD_MINUTES_PER_WEEK
    : null;
}

/**
 * Получает объект с информацией о доступных функциях подписки.
 */
export async function getFeatures(
  user: { id: number; trialEndedAt: Date | null },
  subscription: UserSubscriptionRef,
  plan?: { weeklyMinutesLimit: number } | null,
  userRole?: string
): Promise<{
  ai: boolean;
  avatar: boolean;
  aiChatMode: AiChatMode;
  weeklyMinutesLimit: number | null;
  fairUseGuardMinutesPerWeek: number | null;
}> {
  const aiChatMode = getAiChatMode(user, subscription, userRole);

  return {
    ai: aiChatMode !== 'disabled',
    avatar: false,
    aiChatMode,
    weeklyMinutesLimit: getWeeklyMinutesLimitForFeatures(
      user,
      subscription,
      plan,
      userRole
    ),
    fairUseGuardMinutesPerWeek: getFairUseGuardMinutesPerWeek(
      user,
      subscription,
      userRole
    ),
  };
}
