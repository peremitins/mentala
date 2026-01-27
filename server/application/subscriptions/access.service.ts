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
 * - Пользователь имеет служебную роль (admin, moderator, support)
 * - ИЛИ Trial активен (trialActive = true)
 * - ИЛИ план pro, premium
 */
export async function hasAIAccess(
  user: { id: number; trialEndedAt: Date | null },
  subscription: { planId: string } | null,
  userRole?: string // Передавать роль из сессии
): Promise<boolean> {
  // Служебные роли получают полный доступ
  if (userRole && ['admin', 'moderator', 'support'].includes(userRole)) {
    return true;
  }

  if (!subscription) return false;

  const trialActive = isTrialActive(user);
  if (trialActive) return true;

  return ['pro', 'premium'].includes(subscription.planId);
}

/**
 * Получает лимит минут в неделю для пользователя
 * - Служебные роли: неограниченный лимит (999999)
 * - Basic с Trial: DEFAULT_WEEKLY_MINUTES_LIMIT минут (как Premium)
 * - Basic без Trial: 0 минут
 * - PRO/Premium: из плана или DEFAULT_WEEKLY_MINUTES_LIMIT
 */
export async function getWeeklyMinutesLimit(
  user: { id: number; trialEndedAt: Date | null },
  subscription: {
    planId: string;
  } | null,
  plan?: { weeklyMinutesLimit: number } | null,
  userRole?: string // Передавать роль из сессии
): Promise<number> {
  // Служебные роли получают неограниченный лимит
  if (userRole && ['admin', 'moderator', 'support'].includes(userRole)) {
    return 999999; // Практически неограниченно
  }

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

  // PRO/Premium: из плана
  return plan?.weeklyMinutesLimit || DEFAULT_WEEKLY_MINUTES_LIMIT;
}

/**
 * Получает объект с информацией о доступных функциях
 */
export async function getFeatures(
  user: { id: number; trialEndedAt: Date | null },
  subscription: {
    planId: string;
  } | null,
  plan?: { weeklyMinutesLimit: number } | null,
  userRole?: string // Добавить параметр роли
): Promise<{
  ai: boolean;
  avatar: boolean;
  weeklyMinutesLimit: number;
}> {
  return {
    ai: await hasAIAccess(user, subscription, userRole),
    avatar: false,
    weeklyMinutesLimit: await getWeeklyMinutesLimit(
      user,
      subscription,
      plan,
      userRole
    ),
  };
}
