import { defineEventHandler, readBody, createError } from 'h3';
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  notificationPreferences,
  users,
  userPreferences,
} from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import {
  OnboardingCompleteRequestDto,
  areOnboardingReasonListsEqual,
  mapOnboardingTopicsToLegacyReasons,
  resolveOnboardingReasons,
  resolveOnboardingTopics,
} from '@/shared/dto/onboarding';
import type { OnboardingSelectedTopic } from '@/shared/constants/onboardingTopics';
import { enqueueAiRegenerationForUser } from '@/server/application/notifications/ai-text-regeneration.service';
import { DEFAULT_ASSISTANT_TONE } from '@/shared/constants/assistantTone';
import {
  DEFAULT_NOTIFICATION_TIMES_PER_DAY,
  clampNotificationTimesPerDay,
} from '@/server/application/notifications/preferences-limits.utils';
import {
  DEFAULT_NOTIFICATION_TIME_RANGE_END,
  DEFAULT_NOTIFICATION_TIME_RANGE_START,
  DEFAULT_NOTIFICATION_TIMEZONE,
} from '@/server/application/notifications/slots-scaling.config';
import { ensureAiNotificationAccessConsistency } from '@/server/application/notifications/notification-source-access.service';
import { getDefaultNotificationTextSource } from '@/shared/utils/notificationTextSource';
import { generateAllSlotsForUser } from '@/server/application/notifications/scheduler.service';

type OnboardingNotificationPreferenceResult = {
  touchedCount: number;
  hasImmediateSlotSource: boolean;
};

async function ensureOnboardingNotificationPreferences(params: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: number;
  selectedTopics: readonly OnboardingSelectedTopic[];
  canUseAiNotifications: boolean;
}): Promise<OnboardingNotificationPreferenceResult> {
  const textSource = getDefaultNotificationTextSource(
    params.canUseAiNotifications
  );
  let touchedCount = 0;
  let hasImmediateSlotSource = false;

  for (const topic of params.selectedTopics) {
    const [existing] = await params.tx
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, params.userId),
          eq(notificationPreferences.kind, topic.kind),
          eq(notificationPreferences.entityKey, topic.entityKey)
        )
      )
      .limit(1);

    if (existing) {
      if (!existing.enabled) {
        const existingTextSource =
          (existing.meta as { textSource?: string } | null)?.textSource === 'ai'
            ? 'ai'
            : 'templates';
        await params.tx
          .update(notificationPreferences)
          .set({
            enabled: true,
            updatedAt: new Date(),
          })
          .where(eq(notificationPreferences.id, existing.id));
        touchedCount++;
        if (existingTextSource === 'templates') {
          hasImmediateSlotSource = true;
        }
      }
      continue;
    }

    await params.tx.insert(notificationPreferences).values({
      id: nanoid(),
      userId: params.userId,
      kind: topic.kind,
      entityKey: topic.entityKey,
      enabled: true,
      timesPerDay: clampNotificationTimesPerDay(
        DEFAULT_NOTIFICATION_TIMES_PER_DAY
      ),
      directness: 'moderate',
      timezone: DEFAULT_NOTIFICATION_TIMEZONE,
      subtype: 'mixed',
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      timeRangeStart: DEFAULT_NOTIFICATION_TIME_RANGE_START,
      timeRangeEnd: DEFAULT_NOTIFICATION_TIME_RANGE_END,
      customSlotTimes: null,
      meta: { textSource },
    });
    touchedCount++;
    if (textSource === 'templates') {
      hasImmediateSlotSource = true;
    }
  }

  return {
    touchedCount,
    hasImmediateSlotSource,
  };
}

export default defineEventHandler(async (event) => {
  const sessionResult = await getSessionUser(event);
  if (!sessionResult?.user?.id) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized',
    });
  }

  const body = await readBody(event);
  const parsed = OnboardingCompleteRequestDto.parse(body);

  if (parsed.flow !== 'welcome_setup') {
    throw createError({
      statusCode: 400,
      message: 'Unsupported onboarding flow',
    });
  }

  const name = parsed.data.name.trim();
  if (name.length < 1 || name.length > 40) {
    throw createError({
      statusCode: 400,
      message: 'Invalid name length',
    });
  }

  const gender = parsed.data.gender;
  const ageRange = parsed.data.ageRange ?? 'unknown';
  const tone = parsed.data.tone ?? 'unknown';
  const storedTone = tone === 'unknown' ? DEFAULT_ASSISTANT_TONE : tone;
  const selectedTopics = resolveOnboardingTopics({
    selectedTopics: parsed.data.selectedTopics,
  });
  const onboardingReasons =
    selectedTopics.length > 0
      ? mapOnboardingTopicsToLegacyReasons(selectedTopics)
      : resolveOnboardingReasons({
          reasons: parsed.data.reasons,
          reason: parsed.data.reason,
        });
  const userId = Number(sessionResult.user.id);

  if (onboardingReasons.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'At least one onboarding reason is required',
    });
  }

  let toneChanged = false;
  let genderChanged = false;
  let onboardingReasonsChanged = false;
  let notificationPreferencesTouched = false;
  let hasImmediateSlotNotificationSource = false;

  const { canUseAiNotifications } = await ensureAiNotificationAccessConsistency(
    {
      userId,
      userRole: (sessionResult.user as any)?.roleId ?? null,
    }
  );

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        onboarding: users.onboarding,
        gender: users.gender,
        ageRange: users.ageRange,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Возраст больше не собирается в онбординге. Чтобы не затирать уже
    // указанный возраст у существующих пользователей, перезаписываем колонку
    // только когда пришёл конкретный диапазон (не 'unknown').
    const nextAgeRange =
      ageRange !== 'unknown' ? ageRange : (current?.ageRange ?? 'unknown');

    const onboarding =
      current?.onboarding && typeof current.onboarding === 'object'
        ? { ...(current.onboarding as Record<string, unknown>) }
        : {};

    onboarding.welcome = true;
    if (selectedTopics.length > 0) {
      onboarding.selectedTopics = selectedTopics;
    }

    if (current?.gender !== gender) {
      genderChanged = true;
    }

    await tx
      .update(users)
      .set({
        name,
        gender,
        ageRange: nextAgeRange,
        onboarding,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const [prefs] = await tx
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    if (prefs) {
      if (prefs.tone !== storedTone) {
        toneChanged = true;
      }
      if (
        !areOnboardingReasonListsEqual(
          resolveOnboardingReasons({
            reasons: prefs.onboardingReasons,
            reason: prefs.onboardingReason,
          }),
          onboardingReasons
        )
      ) {
        onboardingReasonsChanged = true;
      }
      await tx
        .update(userPreferences)
        .set({
          tone: storedTone,
          onboardingReason: onboardingReasons[0] ?? null,
          onboardingReasons,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    } else {
      // Если prefs не было, считаем персонализацию изменившейся,
      // чтобы при наличии AI настроек обновить пул.
      toneChanged = true;
      onboardingReasonsChanged = true;
      await tx.insert(userPreferences).values({
        id: nanoid(),
        userId,
        addressing: 'informal',
        tone: storedTone,
        onboardingReason: onboardingReasons[0] ?? null,
        onboardingReasons,
      });
    }

    if (selectedTopics.length > 0) {
      const result = await ensureOnboardingNotificationPreferences({
        tx,
        userId,
        selectedTopics,
        canUseAiNotifications,
      });
      notificationPreferencesTouched = result.touchedCount > 0;
      hasImmediateSlotNotificationSource = result.hasImmediateSlotSource;
    }
  });

  if (
    toneChanged ||
    genderChanged ||
    onboardingReasonsChanged ||
    notificationPreferencesTouched
  ) {
    // Запускаем асинхронно, чтобы не блокировать ответ онбординга
    void enqueueAiRegenerationForUser({
      userId,
      reason: 'onboarding_complete',
      onlyEnabled: true,
    }).catch((error) => {
      console.error(
        `[Onboarding] ❌ Не удалось поставить регенерацию AI-текстов:`,
        error
      );
    });
  }

  if (notificationPreferencesTouched && hasImmediateSlotNotificationSource) {
    void generateAllSlotsForUser(userId, {
      forceTodaySlots: true,
      reason: 'prefs_changed',
    }).catch((error) => {
      console.error(
        `[Onboarding] ❌ Не удалось пересоздать слоты уведомлений:`,
        error
      );
    });
  }

  return {
    ok: true,
    onboarding: {
      welcome: true,
    },
  };
});
