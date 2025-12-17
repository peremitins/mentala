/**
 * Централизованный сервис для проверки доступа к функциям подписки
 */

/**
 * Проверяет, активен ли Trial для пользователя
 * Trial активен, если trialEndedAt существует и больше текущей даты
 */
export function isTrialActive(user: { trialEndedAt: Date | null }): boolean {
  if (!user.trialEndedAt) return false;
  return new Date(user.trialEndedAt) > new Date();
}

/**
 * Проверяет доступ к ИИ (AI-чат)
 * Доступ есть если:
 * - Trial активен (trialActive = true)
 * - ИЛИ план pro, premium, custom
 */
export function hasAIAccess(
  user: { trialEndedAt: Date | null },
  subscription: { planId: string } | null
): boolean {
  if (!subscription) return false;

  const trialActive = isTrialActive(user);
  if (trialActive) return true;

  return ['pro', 'premium', 'custom'].includes(subscription.planId);
}

/**
 * Проверяет доступ к аватару
 * Доступ есть если:
 * - Trial активен (trialActive = true)
 * - ИЛИ план premium, custom (с avatarEnabled = true)
 */
export function hasAvatarAccess(
  user: { trialEndedAt: Date | null },
  subscription: {
    planId: string;
    customConfig?: { avatarEnabled?: boolean };
  } | null
): boolean {
  if (!subscription) return false;

  const trialActive = isTrialActive(user);
  if (trialActive) return true;

  if (subscription.planId === 'premium') return true;
  if (subscription.planId === 'custom') {
    return subscription.customConfig?.avatarEnabled === true;
  }

  return false;
}

/**
 * Получает лимит минут в неделю для пользователя
 * - Basic с Trial: DEFAULT_WEEKLY_MINUTES_LIMIT минут (как Premium)
 * - Basic без Trial: 0 минут
 * - PRO/Premium: из плана или DEFAULT_WEEKLY_MINUTES_LIMIT
 * - Custom: из customConfig.weeklyMinutes
 */
export async function getWeeklyMinutesLimit(
  user: { trialEndedAt: Date | null },
  subscription: {
    planId: string;
    customConfig?: { weeklyMinutes?: number };
  } | null,
  plan?: { weeklyMinutesLimit: number } | null
): Promise<number> {
  if (!subscription) return 0;

  const { DEFAULT_WEEKLY_MINUTES_LIMIT } = await import(
    '@/server/config/subscription'
  );
  const trialActive = isTrialActive(user);

  // Basic с Trial = DEFAULT_WEEKLY_MINUTES_LIMIT минут (как Premium)
  if (subscription.planId === 'basic' && trialActive) {
    return DEFAULT_WEEKLY_MINUTES_LIMIT;
  }

  // Basic без Trial = 0 минут
  if (subscription.planId === 'basic' && !trialActive) {
    return 0;
  }

  // Custom: из конфигурации
  if (subscription.planId === 'custom') {
    return (
      subscription.customConfig?.weeklyMinutes || DEFAULT_WEEKLY_MINUTES_LIMIT
    );
  }

  // PRO/Premium: из плана
  return plan?.weeklyMinutesLimit || DEFAULT_WEEKLY_MINUTES_LIMIT;
}

/**
 * Получает объект с информацией о доступных функциях
 */
export async function getFeatures(
  user: { trialEndedAt: Date | null },
  subscription: {
    planId: string;
    customConfig?: { avatarEnabled?: boolean; weeklyMinutes?: number };
  } | null,
  plan?: { weeklyMinutesLimit: number; avatarEnabled: boolean } | null
): Promise<{
  ai: boolean;
  avatar: boolean;
  weeklyMinutesLimit: number;
}> {
  return {
    ai: hasAIAccess(user, subscription),
    avatar: hasAvatarAccess(user, subscription),
    weeklyMinutesLimit: await getWeeklyMinutesLimit(user, subscription, plan),
  };
}
