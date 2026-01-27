import { defineEventHandler, setResponseStatus } from 'h3';
import {
  getSessionUser,
  revokeAllUserSessions,
} from '@@/server/application/auth/session';
import { db } from '@@/server/infrastructure/db/client';
import {
  aiGeneratedNotificationTexts,
  aiMessages,
  aiSessions,
  chatSettings,
  dailyAdherence,
  habits,
  idempotencyKeys,
  meditationFavorites,
  notificationInteractions,
  notificationPreferences,
  notificationSlots,
  notificationTexts,
  oauthAccounts,
  payments,
  profiles,
  securityEvents,
  sessionSummaries,
  sessions,
  subscriptionEvents,
  trialUsageTracking,
  therapySessions,
  therapyTopicsCustom,
  telegramAccounts,
  userDevices,
  userPrompts,
  userResponseIds,
  userSubscriptions,
  userPreferences,
  users,
  welcomePrompts,
} from '@@/server/infrastructure/db/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { userDeletionQueue } from '@@/server/application/users/queues/userDeletion.queue';
import { deleteAll } from '../../utils/storage';
import {
  hashEmail,
  normalizeEmail,
} from '@@/server/application/auth/verification';

/**
 * 2-фазное удаление пользователя
 * Фаза A: Мгновенное отключение (синхронно, <300ms)
 * - Soft-delete пользователя
 * - Ревокнуть все сессии
 * - Остановить пуши (удалить devices, slots, выключить preferences)
 * - Поставить задачу в BullMQ с delay 7 days
 */
export default defineEventHandler(async (event) => {
  const cfg = useRuntimeConfig(event);
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    setResponseStatus(event, 401);
    return { error: true, message: 'Unauthorized' } as const;
  }

  const userId = sessionResult.user.id;
  const now = new Date();
  const graceDaysRaw =
    cfg.AUTH_DELETE_GRACE_DAYS || process.env.AUTH_DELETE_GRACE_DAYS;
  const graceDays = Number(graceDaysRaw || 0);
  const restoreEnabled = Number.isFinite(graceDays) && graceDays > 0;

  const trialSnapshot = await db
    .select({
      email: users.email,
      trialStartedAt: users.trialStartedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (trialSnapshot.length && trialSnapshot[0].email) {
    const trialStartedAt = trialSnapshot[0].trialStartedAt;
    if (trialStartedAt) {
      try {
        const emailNormalized = normalizeEmail(trialSnapshot[0].email);
        const emailHash = hashEmail(emailNormalized);
        const diffMs = now.getTime() - trialStartedAt.getTime();
        const usedDaysRaw = Math.max(
          1,
          Math.floor(diffMs / (24 * 60 * 60 * 1000))
        );
        const usedDays = Math.min(7, usedDaysRaw);

        await db
          .insert(trialUsageTracking)
          .values({
            emailNormalized,
            emailHash,
            firstTrialStartedAt: trialStartedAt,
            lastTrialStartedAt: trialStartedAt,
            totalDaysUsed: usedDays,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: trialUsageTracking.emailHash,
            set: {
              totalDaysUsed: sql`LEAST(${trialUsageTracking.totalDaysUsed} + ${usedDays}, 7)`,
              updatedAt: now,
            },
          });
      } catch (error) {
        console.error(
          `[Trial] Failed to record trial usage for user ${userId}:`,
          error
        );
      }
    }
  }

  try {
    if (!restoreEnabled) {
      await db.transaction(async (tx) => {
        const aiSessionRows = await tx
          .select({ id: aiSessions.id })
          .from(aiSessions)
          .where(eq(aiSessions.userId, userId));
        const aiSessionIds = aiSessionRows.map((row) => row.id);
        if (aiSessionIds.length) {
          await tx
            .delete(aiMessages)
            .where(inArray(aiMessages.sessionId, aiSessionIds));
        }

        await Promise.all([
          tx
            .delete(notificationInteractions)
            .where(eq(notificationInteractions.userId, userId)),
          tx.delete(dailyAdherence).where(eq(dailyAdherence.userId, userId)),
          tx
            .delete(aiGeneratedNotificationTexts)
            .where(eq(aiGeneratedNotificationTexts.userId, userId)),
          tx
            .delete(notificationTexts)
            .where(eq(notificationTexts.userId, userId)),
          tx
            .delete(notificationPreferences)
            .where(eq(notificationPreferences.userId, userId)),
          tx
            .delete(notificationSlots)
            .where(eq(notificationSlots.userId, userId)),
          tx.delete(userDevices).where(eq(userDevices.userId, userId)),
          tx.delete(userPrompts).where(eq(userPrompts.userId, userId)),
          tx.delete(welcomePrompts).where(eq(welcomePrompts.userId, userId)),
          tx.delete(habits).where(eq(habits.userId, userId)),
          tx
            .delete(meditationFavorites)
            .where(eq(meditationFavorites.userId, userId)),
          tx
            .delete(therapyTopicsCustom)
            .where(eq(therapyTopicsCustom.userId, userId)),
          tx.delete(userPreferences).where(eq(userPreferences.userId, userId)),
          tx.delete(chatSettings).where(eq(chatSettings.userId, userId)),
          tx.delete(aiSessions).where(eq(aiSessions.userId, userId)),
          tx
            .delete(sessionSummaries)
            .where(eq(sessionSummaries.userId, String(userId))),
          tx
            .delete(userResponseIds)
            .where(eq(userResponseIds.userId, String(userId))),
          tx.delete(payments).where(eq(payments.userId, userId)),
          tx
            .delete(subscriptionEvents)
            .where(eq(subscriptionEvents.userId, userId)),
          tx
            .delete(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId)),
          tx.delete(therapySessions).where(eq(therapySessions.userId, userId)),
          tx.delete(idempotencyKeys).where(eq(idempotencyKeys.userId, userId)),
          tx.delete(securityEvents).where(eq(securityEvents.userId, userId)),
          tx.delete(oauthAccounts).where(eq(oauthAccounts.userId, userId)),
          tx
            .delete(telegramAccounts)
            .where(eq(telegramAccounts.userId, userId)),
          tx.delete(sessions).where(eq(sessions.userId, userId)),
          tx.delete(profiles).where(eq(profiles.userId, userId)),
        ]);

        await tx.delete(users).where(eq(users.id, userId));
      });

      try {
        deleteAll(String(userId));
      } catch (error) {
        console.error('[UserDeletion] Failed to delete user files:', error);
      }

      setResponseStatus(event, 200);
      return {
        ok: true,
        loggedOut: true,
        canRestore: false,
        message: 'Аккаунт удалён сразу. Все данные пользователя очищены.',
      };
    }

    // 1. Soft-delete пользователя
    await db
      .update(users)
      .set({
        deletionRequestedAt: now,
        deletedAt: now,
      })
      .where(eq(users.id, userId));

    // 2. Ревокнуть все сессии
    await revokeAllUserSessions(userId);

    // 3. Остановить пуши
    // Удалить user_devices
    await db.delete(userDevices).where(eq(userDevices.userId, userId));

    // Удалить notification_slots со статусами planned и queued
    await db
      .delete(notificationSlots)
      .where(
        and(
          eq(notificationSlots.userId, userId),
          sql`${notificationSlots.status} IN ('planned', 'queued')`
        )
      );

    // НЕ трогаем notification_preferences.enabled - сохраняем предыдущее состояние
    // Вместо этого исключаем deleted users в планировщиках/генерации

    // 4. Поставить задачу в BullMQ с delay 7 days
    const jobId = `user-delete-${userId}`;
    const delayMs = graceDays * 24 * 60 * 60 * 1000;

    try {
      await userDeletionQueue.add(
        'user-deletion',
        { userId },
        {
          jobId,
          delay: delayMs,
          removeOnComplete: true,
        }
      );
    } catch (error) {
      console.error(
        '[UserDeletion] Failed to enqueue deletion job, will continue:',
        error
      );
    }

    // 5. Удалить файлы пользователя (chat_settings)
    try {
      deleteAll(String(userId));
    } catch (error) {
      console.error('[UserDeletion] Failed to delete user files:', error);
    }

    // 6. Вернуть ответ
    setResponseStatus(event, 202);
    return {
      ok: true,
      jobId,
      loggedOut: true,
      canRestore: true,
      message: `Запрос на удаление принят. Аккаунт будет удалён.`,
    };
  } catch (error: any) {
    console.error('[UserDeletion] Error in phase A:', error);
    setResponseStatus(event, 500);
    return {
      error: true,
      message: error?.message || 'Failed to delete account',
    } as const;
  }
});
