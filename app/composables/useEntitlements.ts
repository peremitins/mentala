import { computed, ref } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { useAPI } from '@/app/composables/useAPI';
import type { BillingFeatureAccess, UserBilling } from '@/shared/dto/user';

export type PlanId = 'basic' | 'pro' | 'premium';

export type FeaturePlanRequiredPayload = {
  code: 'feature_plan_required';
  featureKey: string;
  requiredPlan: PlanId;
  paywall: BillingFeatureAccess['paywall'];
};

function getErrorData(error: any): any {
  return (
    error?.data ||
    error?.response?._data?.data ||
    error?.response?._data ||
    null
  );
}

/**
 * Пытаемся вытащить payload server-side paywall из ошибки API.
 */
export function extractFeaturePlanRequiredError(
  error: any
): FeaturePlanRequiredPayload | null {
  const data = getErrorData(error);
  const code = data?.code || error?.data?.code;

  if (code !== 'feature_plan_required') {
    return null;
  }

  const featureKey = String(data?.featureKey || '');
  const requiredPlan = data?.requiredPlan;
  if (!featureKey) {
    return null;
  }

  if (
    requiredPlan !== 'basic' &&
    requiredPlan !== 'pro' &&
    requiredPlan !== 'premium'
  ) {
    return null;
  }

  return {
    code: 'feature_plan_required',
    featureKey,
    requiredPlan,
    paywall: data?.paywall ?? null,
  };
}

const DEFAULT_ACCESS: BillingFeatureAccess = {
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

export function useEntitlements() {
  const auth = useAuthStore();
  const loading = ref(false);

  const billing = computed<UserBilling | null>(
    () => auth.user?.billing ?? null
  );
  const features = computed<Record<string, BillingFeatureAccess>>(
    () => billing.value?.features ?? {}
  );

  function getFeatureAccess(featureKey: string): BillingFeatureAccess {
    return features.value[featureKey] ?? DEFAULT_ACCESS;
  }

  async function refreshEntitlements(): Promise<UserBilling | null> {
    if (!auth.isLoggedIn) {
      return null;
    }

    loading.value = true;
    try {
      const snapshot = await useAPI<UserBilling>(
        '/api/subscriptions/entitlements',
        {
          method: 'GET',
        }
      );
      auth.setBillingSnapshot(snapshot);
      return snapshot;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    billing,
    features,
    getFeatureAccess,
    refreshEntitlements,
  };
}
