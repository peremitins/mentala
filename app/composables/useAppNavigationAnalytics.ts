import * as Sentry from '@sentry/vue';
import type {
  AppNavigationRequest,
  AppNavigationResult,
  AppNavigationTarget,
} from '@/shared/navigation';

function resolveTargetId(target: AppNavigationTarget): string | null {
  switch (target.type) {
    case 'meditation_collection':
      return target.topicKey;
    case 'meditation_track':
      return target.trackId;
    case 'breath_practice_group':
      return target.groupKey;
    case 'breath_practice':
      return target.slug;
    case 'quick_help_entry':
      return target.entry;
    case 'therapy_topic':
      return target.topicKey;
    case 'habit':
      return target.habitKey;
    default:
      return null;
  }
}

export function useAppNavigationAnalytics() {
  function trackNavigationAttempt(request: AppNavigationRequest) {
    try {
      Sentry.addBreadcrumb({
        category: 'navigation',
        message: 'app_navigation_attempt',
        data: {
          source: request.source,
          entryPoint: request.entryPoint ?? null,
          targetType: request.target.type,
          targetId: resolveTargetId(request.target),
        },
        level: 'info',
      });
    } catch {
      // Аналитика не должна влиять на UX.
    }
  }

  function trackNavigationResult(result: AppNavigationResult) {
    try {
      const target = 'target' in result ? result.target : result.request.target;

      Sentry.addBreadcrumb({
        category: 'navigation',
        message: `app_navigation_${result.status}`,
        data: {
          source: result.request.source,
          entryPoint: result.request.entryPoint ?? null,
          targetType: target.type,
          targetId: resolveTargetId(target),
          featureKey:
            result.status === 'paywall' || result.status === 'blocked'
              ? (result.featureKey ?? null)
              : null,
        },
        level: result.status === 'error' ? 'error' : 'info',
      });
    } catch {
      // Игнорируем ошибки аналитики.
    }
  }

  return {
    trackNavigationAttempt,
    trackNavigationResult,
  };
}
