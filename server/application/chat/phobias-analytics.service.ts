import * as Sentry from '@sentry/node';

type PhobiasAnalyticsParams = Record<string, string | number | boolean | null>;

export function trackPhobiasEvent(
  eventName: string,
  params?: PhobiasAnalyticsParams
) {
  try {
    Sentry.addBreadcrumb({
      category: 'phobias',
      message: eventName,
      data: params,
      level: 'info',
    });
  } catch {
    // Аналитика не должна ломать основной сценарий.
  }
}
