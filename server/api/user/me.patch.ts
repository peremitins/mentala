import { getHeader, readBody } from 'h3';
import { eq } from 'drizzle-orm';
import { getSessionUserWithRole } from '@/server/utils/require-role';
import { db } from '@/server/infrastructure/db/client';
import { users } from '@/server/infrastructure/db/schema';
import { UserMePatchDto, UserMeDto } from '@/shared/dto/user';
import { toIsoString } from '@/server/utils/serialize';
import { getBillingSnapshot } from '@/server/application/subscriptions/entitlements.service';

function detectMarketingSource(event: any): 'web' | 'ios' | 'android' {
  const userAgent = getHeader(event, 'user-agent') || '';
  if (/Android/i.test(userAgent)) return 'android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  return 'web';
}

type SceneSettingsPayload = Partial<{
  sceneId: string | null;
  volume: number | null;
  backgroundPlayMinutes: number | null;
  animateBackground: boolean | null;
}>;

type Payload = Partial<{
  sceneSettings: SceneSettingsPayload;
  marketingConsent: boolean;
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

  const body = UserMePatchDto.parse(await readBody<Payload>(event));
  const patch = sanitizeSceneSettings(body?.sceneSettings ?? null);
  const currentSettings = (user as any)?.sceneSettings || {};
  const nextSettings = { ...currentSettings, ...patch };
  const hasMarketingUpdate = typeof body.marketingConsent === 'boolean';
  const marketingConsentAt = body.marketingConsent ? new Date() : null;
  const marketingConsentSource = body.marketingConsent
    ? detectMarketingSource(event)
    : null;

  await db
    .update(users)
    .set({
      sceneSettings: nextSettings,
      ...(hasMarketingUpdate
        ? {
            marketingConsentAt,
            marketingConsentSource,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  const onboarding = (user as any)?.onboarding || {};
  const billing = await getBillingSnapshot(user.id, (user as any)?.role);
  const response = {
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
      emailVerifiedAt: toIsoString(user.emailVerifiedAt),
      hasPassword: !!user.passwordHash,
      sceneSettings: nextSettings,
      marketingConsent: hasMarketingUpdate
        ? body.marketingConsent
        : Boolean((user as any)?.marketingConsentAt),
      billing,
    },
  };

  return UserMeDto.parse(response);
});
