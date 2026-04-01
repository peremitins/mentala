import * as Sentry from '@sentry/vue';

export function useTherapyAnalytics() {
  function trackTherapyEvent(
    eventName: string,
    params?: Record<string, string | number | boolean>
  ) {
    try {
      Sentry.addBreadcrumb({
        category: 'therapy',
        message: eventName,
        data: params,
        level: 'info',
      });
    } catch {
      // Аналитика не должна влиять на UX.
    }
  }

  function trackTopicOpen(topicKey: string) {
    trackTherapyEvent('therapy_topic_open', { topicKey });
  }

  function trackQuickChatClick(topicKey: string) {
    trackTherapyEvent('therapy_quick_chat_click', { topicKey });
  }

  return {
    trackTopicOpen,
    trackQuickChatClick,
  };
}
