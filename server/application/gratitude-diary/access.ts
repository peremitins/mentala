import { createError } from 'h3';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
  type BillingSnapshot,
} from '@/server/application/subscriptions/entitlements.service';

export const GRATITUDE_DIARY_FEATURE_KEY = 'gratitude.diary.full';

export async function assertGratitudeDiaryAccess(params: {
  userId: number;
  roleId?: string;
  billing?: BillingSnapshot;
}): Promise<BillingSnapshot> {
  const billing =
    params.billing ?? (await getBillingSnapshot(params.userId, params.roleId));
  const access = getFeatureAccessOrDefault(
    billing,
    GRATITUDE_DIARY_FEATURE_KEY
  );

  if (access.available) {
    return billing;
  }

  throw createError({
    statusCode: 402,
    statusMessage: 'Feature requires higher plan',
    data: toFeaturePlanRequiredPayload({
      featureKey: GRATITUDE_DIARY_FEATURE_KEY,
      access,
    }),
  });
}
