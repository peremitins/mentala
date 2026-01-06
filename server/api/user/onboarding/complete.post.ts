import { defineEventHandler, readBody, createError } from 'h3';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { users, userPreferences } from '@/server/infrastructure/db/schema';
import { getSessionUser } from '@/server/application/auth/session';
import { OnboardingCompleteRequestDto } from '@/shared/dto/onboarding';

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
  const userId = Number(sessionResult.user.id);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ onboarding: users.onboarding })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const onboarding =
      current?.onboarding && typeof current.onboarding === 'object'
        ? { ...(current.onboarding as Record<string, unknown>) }
        : {};

    onboarding.welcome = true;

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
      await tx
        .update(userPreferences)
        .set({
          tone,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId));
    } else {
      await tx.insert(userPreferences).values({
        id: nanoid(),
        userId,
        addressing: 'informal',
        tone,
      });
    }
  });

  return {
    ok: true,
    onboarding: {
      welcome: true,
    },
  };
});
