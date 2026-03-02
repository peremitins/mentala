/**
 * Аналитика настроек (MVP).
 * События: settings_notifications_push_toggle, settings_notifications_marketing_toggle,
 * settings_notifications_open_system_settings.
 */
import * as Sentry from '@sentry/vue';

export function useSettingsAnalytics() {
  function trackSettingsEvent(
    eventName: string,
    params?: Record<string, string | number | boolean>
  ) {
    try {
      Sentry.addBreadcrumb({
        category: 'settings',
        message: eventName,
        data: params,
        level: 'info',
      });
    } catch {
      // Игнорируем ошибки аналитики
    }
  }

  function trackPushToggle(on: boolean, permissionResult?: 'granted' | 'denied') {
    trackSettingsEvent('settings_notifications_push_toggle', {
      on,
      ...(permissionResult && { permissionResult }),
    });
  }

  function trackMarketingToggle(on: boolean) {
    trackSettingsEvent('settings_notifications_marketing_toggle', { on });
  }

  function trackOpenSystemSettings() {
    trackSettingsEvent('settings_notifications_open_system_settings');
  }

  return {
    trackPushToggle,
    trackMarketingToggle,
    trackOpenSystemSettings,
  };
}
