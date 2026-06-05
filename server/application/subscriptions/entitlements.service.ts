import { createHash } from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  featureAccessPolicies,
  subscriptionPlans,
  userSubscriptions,
  users,
} from '@/server/infrastructure/db/schema';
import { getFeatures, type AiChatMode } from './access.service';
import {
  isTrialActiveAt,
  resolveCurrentEntitlementsPlan,
  normalizeBillingCollectionStatus,
} from './trial-billing.service';
import { resolveEffectiveEntitlementsPlanWithAccessGrant } from '@/server/application/promo-codes/promo-access-grants.service';

export type PlanId = 'basic' | 'pro' | 'premium';
export type LockIcon = 'pro' | 'premium';
export type PaywallTargetPlan = 'pro' | 'premium';

export type BillingFeaturePaywall = {
  title: string;
  description: string;
  ctaText: string;
  targetPlan: PaywallTargetPlan;
  lockIcon: LockIcon;
};

export type BillingFeatureAccess = {
  available: boolean;
  requiredPlan: PlanId;
  paywall: BillingFeaturePaywall | null;
};

export type BillingSnapshot = {
  planId: PlanId;
  trialActive: boolean;
  trialEndsAt: string | null;
  aiChatMode: AiChatMode;
  weeklyMinutesLimit: number | null;
  fairUseGuardMinutesPerWeek: number | null;
  entitlementsVersion: string;
  features: Record<string, BillingFeatureAccess>;
};

export type FeatureAccessPolicy = {
  featureKey: string;
  requiredPlan: PlanId;
  trialUnlocked: boolean;
  lockIcon: LockIcon;
  paywallTitle: string;
  paywallDescription: string;
  paywallCtaText: string;
  paywallTargetPlan: PaywallTargetPlan;
};

const SERVICE_ROLES = new Set(['admin', 'moderator']);
const PREMIUM_EQUIVALENT_ROLES = new Set(['support']);
const PLAN_RANK: Record<PlanId, number> = {
  basic: 0,
  pro: 1,
  premium: 2,
};

const DEFAULT_LOCKED_FEATURE_ACCESS: BillingFeatureAccess = {
  available: false,
  requiredPlan: 'pro',
  paywall: {
    title: 'Функция доступна в PRO и Premium',
    description: 'Подключи PRO или Premium, чтобы открыть эту возможность.',
    ctaText: 'Выбрать тариф',
    targetPlan: 'pro',
    lockIcon: 'pro',
  },
};

export const DEFAULT_FEATURE_ACCESS_POLICIES: FeatureAccessPolicy[] = [
  {
    featureKey: 'meditations.library.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Полная библиотека медитаций в PRO и Premium',
    paywallDescription:
      'Открой полный каталог медитаций на тарифе PRO или Premium и подбирай практики под состояние.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'breath.catalog.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Полный каталог дыхательных практик в PRO и Premium',
    paywallDescription:
      'На текущем тарифе доступны только базовые практики. Подключи PRO или Premium, чтобы открыть весь каталог.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'quick_help.practice',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Быстрые практики доступны в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы использовать быстрые техники поддержки после пробного периода.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'breath.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Создание своих практик в Premium',
    paywallDescription:
      'Создавай персональные дыхательные практики и сохраняй их в свой список на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'breath.custom.manage',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Управление своими практиками в Premium',
    paywallDescription:
      'Редактирование и удаление персональных практик доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'habits.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Свои темы привычек в Premium',
    paywallDescription:
      'Создавай и настраивай персональные привычки с собственными текстами и расписанием на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'therapy.custom.create',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Свои темы терапии в Premium',
    paywallDescription:
      'Создавай личные темы терапии и управляй напоминаниями под свой запрос на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'gratitude.diary.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Дневник благодарности в PRO и Premium',
    paywallDescription:
      'Открой дневник благодарности на тарифе PRO или Premium, чтобы вести записи, сохранять streak и возвращаться к своим опорам.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'assessments.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Оценка состояния доступна в PRO',
    paywallDescription:
      'Пройди короткий опросник, сохрани результат и сравни динамику после сада.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'gratitude.worksheet.customize',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Кастомный шаблон дневника в Premium',
    paywallDescription:
      'Редактирование личного шаблона записи в дневнике благодарности доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'gratitude.photo.upload',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Фото в записях дневника в Premium',
    paywallDescription:
      'Добавление фото к записям в дневнике благодарности доступно на тарифе Premium.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'sos.chat_handoff',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Продолжение в ИИ-чате в PRO и Premium',
    paywallDescription:
      'После SOS-техники можно продолжить поддержку в ИИ-чате на тарифе PRO или Premium.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'chat.assistant',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'ИИ-чат доступен в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы общаться с ассистентом в чате.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'chat.realtime_voice',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Realtime voice доступен в Premium',
    paywallDescription:
      'Подключи Premium, чтобы вести живой голосовой диалог с ассистентом в реальном времени.',
    paywallCtaText: 'Открыть Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'notifications.text_source_ai',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'ИИ-напоминания в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы получать персональные напоминания, сгенерированные ИИ.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
  {
    featureKey: 'notifications.custom_prompt_ai',
    requiredPlan: 'premium',
    trialUnlocked: true,
    lockIcon: 'premium',
    paywallTitle: 'Кастомный ИИ-промпт в Premium',
    paywallDescription:
      'Настраивай стиль и содержание ИИ-напоминаний под себя на тарифе Premium.',
    paywallCtaText: 'Перейти на Premium',
    paywallTargetPlan: 'premium',
  },
  {
    featureKey: 'programs.roadmap.full',
    requiredPlan: 'pro',
    trialUnlocked: true,
    lockIcon: 'pro',
    paywallTitle: 'Программы и сады доступны в PRO и Premium',
    paywallDescription:
      'Подключи PRO или Premium, чтобы проходить шаги программ и растить сады.',
    paywallCtaText: 'Выбрать тариф',
    paywallTargetPlan: 'pro',
  },
];

function isServiceRole(userRole?: string): boolean {
  return Boolean(userRole && SERVICE_ROLES.has(userRole));
}

function isPremiumEquivalentRole(userRole?: string): boolean {
  return Boolean(userRole && PREMIUM_EQUIVALENT_ROLES.has(userRole));
}

function normalizePlanId(planId?: string | null): PlanId {
  if (planId === 'pro' || planId === 'premium' || planId === 'basic') {
    return planId;
  }
  return 'basic';
}

function normalizeLockIcon(lockIcon?: string | null): LockIcon {
  return lockIcon === 'pro' ? 'pro' : 'premium';
}

function normalizeTargetPlan(
  requiredPlan: PlanId,
  targetPlan?: string | null
): PaywallTargetPlan {
  if (targetPlan === 'pro' || targetPlan === 'premium') {
    return targetPlan;
  }
  return requiredPlan === 'premium' ? 'premium' : 'pro';
}

function buildEntitlementsVersion(policies: FeatureAccessPolicy[]): string {
  const normalized = policies
    .slice()
    .sort((a, b) => a.featureKey.localeCompare(b.featureKey))
    .map((policy) => ({
      featureKey: policy.featureKey,
      requiredPlan: policy.requiredPlan,
      trialUnlocked: policy.trialUnlocked,
      lockIcon: policy.lockIcon,
      paywallTitle: policy.paywallTitle,
      paywallDescription: policy.paywallDescription,
      paywallCtaText: policy.paywallCtaText,
      paywallTargetPlan: policy.paywallTargetPlan,
    }));

  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 16);
}

async function loadFeaturePolicies(): Promise<FeatureAccessPolicy[]> {
  const merged = new Map<string, FeatureAccessPolicy>();

  DEFAULT_FEATURE_ACCESS_POLICIES.forEach((policy) => {
    merged.set(policy.featureKey, policy);
  });

  try {
    const rows = await db
      .select({
        featureKey: featureAccessPolicies.featureKey,
        requiredPlan: featureAccessPolicies.requiredPlan,
        trialUnlocked: featureAccessPolicies.trialUnlocked,
        lockIcon: featureAccessPolicies.lockIcon,
        paywallTitle: featureAccessPolicies.paywallTitle,
        paywallDescription: featureAccessPolicies.paywallDescription,
        paywallCtaText: featureAccessPolicies.paywallCtaText,
        paywallTargetPlan: featureAccessPolicies.paywallTargetPlan,
      })
      .from(featureAccessPolicies);

    rows.forEach((row) => {
      const requiredPlan = normalizePlanId(row.requiredPlan);
      const policy: FeatureAccessPolicy = {
        featureKey: row.featureKey,
        requiredPlan,
        trialUnlocked: Boolean(row.trialUnlocked),
        lockIcon: normalizeLockIcon(row.lockIcon),
        paywallTitle: row.paywallTitle,
        paywallDescription: row.paywallDescription,
        paywallCtaText: row.paywallCtaText,
        paywallTargetPlan: normalizeTargetPlan(
          requiredPlan,
          row.paywallTargetPlan
        ),
      };
      merged.set(policy.featureKey, policy);
    });
  } catch (error) {
    // Важно не падать, если таблица ещё не мигрирована или временно недоступна.
    console.warn(
      '[Entitlements] Failed to load feature_access_policies, fallback to defaults:',
      error
    );
  }

  return Array.from(merged.values());
}

function canAccessByPlan(
  planId: PlanId,
  requiredPlan: PlanId,
  trialActive: boolean,
  trialUnlocked: boolean,
  serviceRole: boolean
): boolean {
  if (serviceRole) return true;
  if (PLAN_RANK[planId] >= PLAN_RANK[requiredPlan]) return true;
  // Trial-override работает только для базового плана.
  // Основной план в trial вычисляется отдельно (через resolveCurrentEntitlementsPlan).
  if (trialActive && trialUnlocked && planId === 'basic') return true;
  return false;
}

function buildFeatureMap(params: {
  planId: PlanId;
  trialActive: boolean;
  serviceRole: boolean;
  policies: FeatureAccessPolicy[];
}): Record<string, BillingFeatureAccess> {
  const map: Record<string, BillingFeatureAccess> = {};

  params.policies.forEach((policy) => {
    const available = canAccessByPlan(
      params.planId,
      policy.requiredPlan,
      params.trialActive,
      policy.trialUnlocked,
      params.serviceRole
    );

    map[policy.featureKey] = {
      available,
      requiredPlan: policy.requiredPlan,
      paywall: available
        ? null
        : {
            title: policy.paywallTitle,
            description: policy.paywallDescription,
            ctaText: policy.paywallCtaText,
            targetPlan: policy.paywallTargetPlan,
            lockIcon: policy.lockIcon,
          },
    };
  });

  return map;
}

export async function getBillingSnapshot(
  userId: number,
  userRole?: string
): Promise<BillingSnapshot> {
  const now = new Date();

  const userRows = await db
    .select({
      id: users.id,
      roleId: users.roleId,
      trialEndedAt: users.trialEndedAt,
      billingPlanId: users.billingPlanId,
      billingCollectionStatus: users.billingCollectionStatus,
      graceEndsAt: users.graceEndsAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!userRows.length) {
    throw new Error(`User ${userId} not found`);
  }

  const user = userRows[0]!;
  const effectiveUserRole = userRole || user.roleId || 'user';
  const trialActive = isTrialActiveAt(user.trialEndedAt, now);

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

  const active = activeSubscription[0];
  const basePlanId = normalizePlanId(
    resolveCurrentEntitlementsPlan({
      now,
      trialActive,
      billingPlanId: user.billingPlanId,
      billingCollectionStatus: normalizeBillingCollectionStatus(
        user.billingCollectionStatus
      ),
      graceEndsAt: user.graceEndsAt,
      activePaidPlanId: active?.subscription?.planId || null,
    })
  );
  const effectivePlan = await resolveEffectiveEntitlementsPlanWithAccessGrant({
    userId,
    basePlanId,
    now,
  });
  // support-роль видим как Premium для review/QA, но без service-role bypass.
  const planId = isPremiumEquivalentRole(effectiveUserRole)
    ? 'premium'
    : normalizePlanId(effectivePlan.planId);

  const features = await getFeatures(
    {
      id: user.id,
      trialEndedAt: user.trialEndedAt,
    },
    { planId },
    active?.plan?.id === planId ? active.plan : null,
    effectiveUserRole
  );

  const policies = await loadFeaturePolicies();
  const entitlementsVersion = buildEntitlementsVersion(policies);
  const serviceRole = isServiceRole(effectiveUserRole);

  return {
    planId,
    trialActive,
    trialEndsAt:
      trialActive && user.trialEndedAt ? user.trialEndedAt.toISOString() : null,
    aiChatMode: features.aiChatMode,
    weeklyMinutesLimit: features.weeklyMinutesLimit,
    fairUseGuardMinutesPerWeek: features.fairUseGuardMinutesPerWeek,
    entitlementsVersion,
    features: buildFeatureMap({
      planId,
      trialActive,
      serviceRole,
      policies,
    }),
  };
}

export function getFeatureAccessOrDefault(
  snapshot: BillingSnapshot,
  featureKey: string
): BillingFeatureAccess {
  return snapshot.features[featureKey] || DEFAULT_LOCKED_FEATURE_ACCESS;
}

export function toFeaturePlanRequiredPayload(params: {
  featureKey: string;
  access: BillingFeatureAccess;
}) {
  return {
    code: 'feature_plan_required',
    featureKey: params.featureKey,
    requiredPlan: params.access.requiredPlan,
    paywall: params.access.paywall,
  };
}
