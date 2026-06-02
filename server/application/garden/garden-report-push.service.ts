import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { userProgramCheckpointSummaries } from '@/server/infrastructure/db/schema';
import { sendToUser } from '@/server/application/notifications/delivery.service';
import type { NotificationPayload } from '@/shared/dto/notifications';

/**
 * Отправка push-уведомления о готовом отчёте по программе (Сад).
 *
 * Условия отправки:
 *   1. generationStatus = 'ready' (отчёт реально готов, не failed);
 *   2. viewedAt = null (юзер ещё не смотрел отчёт через UI на момент готовности);
 *   3. pushSentAt = null (push для этой записи ещё не отправлялся).
 *
 * Идемпотентно: даже при гонке двух генераций (например, force-refresh)
 * UPDATE pushSentAt=NOW() WHERE pushSentAt IS NULL вернёт rowcount=0 на
 * втором вызове, и второй push не уйдёт.
 *
 * Foreground vs background:
 *   - Если приложение у юзера в foreground — нативный fcm не покажет
 *     notification (это поведение по умолчанию foreground-listener'а).
 *     Юзер увидит in-app модалку через usePendingReportNotification,
 *     которая опрашивает /api/garden/reports/pending.
 *   - Если в background — нативное уведомление покажется в шторке.
 *
 * Fire-and-forget: вызывающий код не ждёт результата. Сбой push не должен
 * ломать поток генерации.
 */
export async function dispatchReportReadyPush(params: {
  userId: number;
  reportId: number;
  programTitle: string;
  programSlug: string;
  checkpointStep: number;
  kind: 'weekly' | 'final';
}): Promise<void> {
  try {
    // Атомарный «захват»: только если pushSentAt был null + status ready
    // + не viewed. RETURNING чтобы понять реально ли мы захватили право.
    const claimed = await db
      .update(userProgramCheckpointSummaries)
      .set({ pushSentAt: new Date() })
      .where(
        and(
          eq(userProgramCheckpointSummaries.id, params.reportId),
          eq(userProgramCheckpointSummaries.userId, params.userId),
          eq(userProgramCheckpointSummaries.generationStatus, 'ready'),
          isNull(userProgramCheckpointSummaries.pushSentAt),
          isNull(userProgramCheckpointSummaries.viewedAt)
        )
      )
      .returning({ id: userProgramCheckpointSummaries.id });

    if (claimed.length === 0) {
      // Уже отправлен / уже просмотрен / status=failed — ничего не делаем.
      return;
    }

    const stage = Math.ceil(params.checkpointStep / 7);
    const title =
      params.kind === 'final'
        ? `Сад «${params.programTitle}» завершён`
        : `Готова сводка по пройденному отрезку · Этап ${stage}`;
    const body =
      params.kind === 'final'
        ? 'Я собрал всё, что произошло за программу, в один разбор. Загляни в Оранжерею.'
        : 'Я собрал короткий итог по пройденному отрезку. Загляни на минуту.';

    const deepLink = `mentala://garden?openReport=${params.reportId}&step=${params.checkpointStep}&slug=${encodeURIComponent(params.programSlug)}`;

    const payload: NotificationPayload = {
      title,
      body,
      action: 'open',
      deepLink,
      data: {
        type: 'garden_report_ready',
        reportId: params.reportId,
        programSlug: params.programSlug,
        checkpointStep: params.checkpointStep,
        kind: params.kind,
      },
    };

    const result = await sendToUser(params.userId, payload);
    if (result.sentCount === 0 && result.deviceCount === 0) {
      // У юзера нет зарегистрированных устройств. In-app модалка всё равно
      // отработает, когда юзер откроет приложение.
      console.log(
        `[garden-report-push] no devices for user ${params.userId} — relying on in-app modal`
      );
    }
  } catch (error) {
    // Не критично — основной поток генерации не должен падать из-за push.
    console.error('[garden-report-push] dispatch failed:', error);
  }
}
