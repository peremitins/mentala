import { readBody } from 'h3';
import { eq } from 'drizzle-orm';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';

type SceneSettingsPayload = Partial<{
  sceneId: string | null;
  volume: number | null;
  backgroundPlayMinutes: number | null;
  animateBackground: boolean | null;
}>;

type Payload = Partial<{
  sceneSettings: SceneSettingsPayload;
}>;

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

function sanitizeSceneSettings(input?: SceneSettingsPayload | null) {
  const sanitized: SceneSettingsPayload = {};
  if (!input) return sanitized;

  if (input.sceneId !== undefined) {
    sanitized.sceneId = input.sceneId ? String(input.sceneId) : null;
  }
  if (input.volume !== undefined && input.volume !== null) {
    sanitized.volume = clampNumber(Number(input.volume), 0, 100);
  }
  if (
    input.backgroundPlayMinutes !== undefined &&
    input.backgroundPlayMinutes !== null
  ) {
    sanitized.backgroundPlayMinutes = clampNumber(
      Number(input.backgroundPlayMinutes),
      0,
      60
    );
  }
  if (input.animateBackground !== undefined) {
    sanitized.animateBackground = Boolean(input.animateBackground);
  }

  return sanitized;
}

export default defineEventHandler(async (event) => {
  const user = await getSessionUserWithRole(event);
  if (!user?.id) {
    return { error: true, message: 'Unauthorized' } as const;
  }

  const body = await readBody<Payload>(event);
  const patch = sanitizeSceneSettings(body?.sceneSettings ?? null);
  const currentSettings = (user as any)?.sceneSettings || {};
  const nextSettings = { ...currentSettings, ...patch };

  await db
    .update(users)
    .set({
      sceneSettings: nextSettings,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  const onboarding = (user as any)?.onboarding || {};
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      gender: (user as any)?.gender || null,
      ageRange: (user as any)?.ageRange || null,
      onboarding: {
        welcome: Boolean(onboarding?.welcome),
      },
      locale: user.locale,
      role: (user as any)?.role || 'user',
      isBlocked: user.isBlocked,
      emailVerifiedAt: user.emailVerifiedAt,
      hasPassword: !!user.passwordHash,
      sceneSettings: nextSettings,
    },
  };
});
