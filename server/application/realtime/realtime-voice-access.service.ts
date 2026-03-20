import { createError } from 'h3';
import { FEATURE_REALTIME_VOICE_ENABLED } from '@/server/config/features';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from '@/server/application/subscriptions/entitlements.service';
import {
  getAiUsageGate,
  toUnifiedAiLimitPayload,
} from '@/server/application/subscriptions/ai-usage.service';
import { getRealtimeVoiceQuotaSnapshot } from './realtime-voice-quota.service';

export async function assertRealtimeVoiceAccess(params: {
  userId: number;
  userRole?: string;
}) {
  if (!FEATURE_REALTIME_VOICE_ENABLED) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Realtime voice is temporarily disabled',
      data: {
        code: 'realtime_voice_disabled',
      },
    });
  }

  const billing = await getBillingSnapshot(params.userId, params.userRole);
  const featureKey = 'chat.realtime_voice';
  const access = getFeatureAccessOrDefault(billing, featureKey);

  if (!access.available) {
    throw createError({
      statusCode: 402,
      statusMessage: 'Feature requires higher plan',
      data: toFeaturePlanRequiredPayload({ featureKey, access }),
    });
  }

  const weeklyAi = await getAiUsageGate(params.userId, params.userRole);
  if (weeklyAi.status === 'no_ai_access') {
    throw createError({
      statusCode: 403,
      statusMessage: 'AI access is not available for your plan',
      data: {
        code: 'no_ai_access',
      },
    });
  }

  if (weeklyAi.status === 'weekly_limit_reached') {
    const payload = toUnifiedAiLimitPayload(weeklyAi);
    throw createError({
      statusCode: 402,
      statusMessage: payload.message,
      data: payload,
    });
  }

  const quota = await getRealtimeVoiceQuotaSnapshot({
    userId: params.userId,
  });

  if (quota.remainingSeconds <= 0) {
    throw createError({
      statusCode: 402,
      statusMessage:
        'Ежемесячный лимит realtime voice исчерпан. Доступ восстановится в следующем периоде.',
      data: {
        code: 'realtime_voice_monthly_limit_reached',
        limitSeconds: quota.limitSeconds,
        usedSeconds: quota.usedSeconds,
        remainingSeconds: quota.remainingSeconds,
        resetsAt: quota.resetsAt.toISOString(),
      },
    });
  }

  return {
    billing,
    access,
    weeklyAi,
    quota,
  };
}
