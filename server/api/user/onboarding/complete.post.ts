import { defineEventHandler, readBody, createError } from 'h3';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users, userPreferences } from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import {
  OnboardingCompleteRequestDto,
  areOnboardingReasonListsEqual,
  resolveOnboardingReasons,
} from '@/shared/dto/onboarding';
import { enqueueAiRegenerationForUser } from '@/server/application/notifications/ai-text-regeneration.service';
import { DEFAULT_ASSISTANT_TONE } from '@/shared/constants/assistantTone';

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
  const onboardingReasons = resolveOnboardingReasons({
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

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ onboarding: users.onboarding, gender: users.gender })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const onboarding =
      current?.onboarding && typeof current.onboarding === 'object'
        ? { ...(current.onboarding as Record<string, unknown>) }
        : {};

    onboarding.welcome = true;

    if (current?.gender !== gender) {
      genderChanged = true;
    }

    await tx
      .update(users)
      .set({
        name,
        gender,
        ageRange,
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
  });

  if (toneChanged || genderChanged || onboardingReasonsChanged) {
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

  return {
    ok: true,
    onboarding: {
      welcome: true,
    },
  };
});
