import { navigateTo } from '#app';
import {
  buildAppNavigationRoute,
  type AppNavigationRequest,
  type AppNavigationResult,
  type AppNavigationSource,
  type AppNavigationTarget,
} from '@/shared/navigation';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useAppNavigationAnalytics } from '@/app/composables/useAppNavigationAnalytics';
import { resolveNavigationFeatureKey } from '@/app/lib/navigation';
import { useAppNavigationStore } from '@/app/stores/appNavigation';

type NavigateToTargetOptions = {
  replace?: boolean;
  source?: AppNavigationSource;
  entryPoint?: string;
  rawQuery?: string;
  sourceMeta?: Record<string, string | number | boolean | null>;
};

function normalizeRequest(
  input: AppNavigationTarget | AppNavigationRequest,
  options?: NavigateToTargetOptions
): AppNavigationRequest {
  if ('target' in input && 'source' in input) {
    return input;
  }

  return {
    target: input,
    source: options?.source ?? 'system_recommendation',
    entryPoint: options?.entryPoint,
    rawQuery: options?.rawQuery,
    sourceMeta: options?.sourceMeta,
  };
}

export function useAppNavigation() {
  const store = useAppNavigationStore();
  const { getFeatureAccess } = useEntitlements();
  const { trackNavigationAttempt, trackNavigationResult } =
    useAppNavigationAnalytics();

  async function navigateToTarget(
    input: AppNavigationTarget | AppNavigationRequest,
    options?: NavigateToTargetOptions
  ): Promise<AppNavigationResult> {
    const request = normalizeRequest(input, options);
    trackNavigationAttempt(request);

    const featureKey = resolveNavigationFeatureKey(request.target);
    if (featureKey) {
      const access = getFeatureAccess(featureKey);
      if (!access.available) {
        store.openPaywall(featureKey, request);
        const result: AppNavigationResult = {
          status: 'paywall',
          request,
          target: request.target,
          featureKey,
          requiredPlan: access.requiredPlan,
        };
        trackNavigationResult(result);
        return result;
      }
    }

    try {
      await navigateTo(buildAppNavigationRoute(request.target), {
        replace: options?.replace ?? false,
      });

      const result: AppNavigationResult = {
        status: 'opened',
        request,
        target: request.target,
      };
      trackNavigationResult(result);
      return result;
    } catch (error) {
      const result: AppNavigationResult = {
        status: 'error',
        request,
        message:
          error instanceof Error
            ? error.message
            : 'Navigation execution failed',
      };
      trackNavigationResult(result);
      return result;
    }
  }

  function openPaywallForTarget(
    target: AppNavigationTarget,
    options?: NavigateToTargetOptions
  ): AppNavigationResult {
    const request = normalizeRequest(target, options);
    const featureKey = resolveNavigationFeatureKey(target);

    if (!featureKey) {
      return {
        status: 'blocked',
        request,
        target,
        reason: 'paywall_target_has_no_feature_key',
      };
    }

    const access = getFeatureAccess(featureKey);
    store.openPaywall(featureKey, request);

    return {
      status: 'paywall',
      request,
      target,
      featureKey,
      requiredPlan: access.requiredPlan,
    };
  }

  return {
    navigateToTarget,
    openPaywallForTarget,
  };
}
