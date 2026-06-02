import { abortNavigation, navigateTo } from '#app';
import { useEntitlements } from '@/app/composables/useEntitlements';
import {
  buildBlockedNavigationFallbackRoute,
  resolveAppNavigationTargetFromRoute,
  resolveNavigationFeatureKey,
} from '@/app/lib/navigation';
import { useAuthStore } from '@/app/stores/auth';
import { useAppNavigationStore } from '@/app/stores/appNavigation';

export default defineNuxtRouteMiddleware(async (to, from) => {
  if (process.server) return;

  const target = resolveAppNavigationTargetFromRoute(to);
  if (!target) {
    return;
  }

  const featureKey = resolveNavigationFeatureKey(target);
  const navigationStore = useAppNavigationStore();
  if (!featureKey) {
    // Разрешённые preview-разделы не должны удерживать paywall,
    // который мог быть открыт предыдущим route-level guard.
    if (navigationStore.request?.source === 'route_guard') {
      navigationStore.clearPaywall();
    }
    return;
  }

  const auth = useAuthStore();
  if (!auth.user || !auth.isLoggedIn) {
    return;
  }

  const { getFeatureAccess, refreshEntitlements } = useEntitlements();
  try {
    // Перед route-проверкой подтягиваем свежий snapshot доступов.
    await refreshEntitlements();
  } catch (error) {
    console.warn(
      '[FeatureAccessMiddleware] refresh entitlements failed:',
      error
    );
  }

  const access = getFeatureAccess(featureKey);
  if (access.available) {
    return;
  }

  navigationStore.openPaywall(featureKey, {
    target,
    source: 'route_guard',
    entryPoint: 'feature_access.global',
    sourceMeta: {
      blockedPath: to.fullPath,
    },
  });

  const hasPreviousRoute =
    typeof from.fullPath === 'string' &&
    from.fullPath.length > 0 &&
    from.fullPath !== to.fullPath;

  if (hasPreviousRoute) {
    return abortNavigation();
  }

  return navigateTo(buildBlockedNavigationFallbackRoute(target), {
    replace: true,
  });
});
