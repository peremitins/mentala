import * as Sentry from '@sentry/node';

/**
 * Retention analytics events (см. `.docs/retention/retention_long_term_strategy.md`).
 *
 * Цель — собирать сырые события для расчёта продуктовых метрик:
 *  - D7 / D30 retention cohort,
 *  - average programs completed per user,
 *  - garden visit rate,
 *  - AI-chat step completion rate,
 *  - chat finalization integrity (целевое 99.5%+),
 *  - median steps per active day,
 *  - daily-limit hit rate.
 *
 * Текущая реализация: события идут как Sentry breadcrumbs (по аналогии с
 * `phobias-analytics.service.ts`) — это даёт нам сырой поток без новой
 * инфраструктуры. Агрегацию в Postgres-таблицу `retention_metrics_daily`
 * можно добавить позже как BullMQ-job, когда станет нужно собрать когорты.
 *
 * Принципы:
 *  - вся аналитика обёрнута в try/catch: фейл трекинга не должен ломать
 *    основной flow (старт шага / завершение программы);
 *  - userId обязателен в каждом событии (для cohort'ов);
 *  - timestamp фиксируется на стороне Sentry автоматически.
 */

type RetentionEventName =
  // Программы и шаги
  | 'program_started'
  | 'program_step_started'
  | 'program_step_completed'
  | 'program_completed'
  | 'daily_step_limit_hit'
  // Оранжерея
  | 'garden_visited'
  | 'garden_plant_viewed'
  // AI-чат как шаг roadmap
  | 'ai_chat_step_started'
  | 'ai_chat_step_completed'
  | 'chat_session_finalized'
  // Свободные практики
  | 'free_practice_drop_awarded'
  | 'free_practice_drop_rate_limited';

type RetentionEventParams = Record<
  string,
  string | number | boolean | null | undefined
>;

export function trackRetentionEvent(
  eventName: RetentionEventName,
  params: RetentionEventParams & { userId: number }
): void {
  try {
    Sentry.addBreadcrumb({
      category: 'retention',
      message: eventName,
      data: params,
      level: 'info',
    });
  } catch {
    // Аналитика не должна ломать основной сценарий.
  }
}
