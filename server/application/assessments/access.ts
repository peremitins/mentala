import { createError } from 'h3';
import { ASSESSMENTS_FEATURE_KEY } from '@/shared/constants/assessments';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
  type BillingSnapshot,
} from '@/server/application/subscriptions/entitlements.service';

export { ASSESSMENTS_FEATURE_KEY };

export async function assertAssessmentsAccess(params: {
  userId: number;
  roleId?: string | null;
  billing?: BillingSnapshot;
}): Promise<BillingSnapshot> {
  const billing =
    params.billing ??
    (await getBillingSnapshot(params.userId, params.roleId || undefined));
  const access = getFeatureAccessOrDefault(billing, ASSESSMENTS_FEATURE_KEY);

  if (access.available) {
    return billing;
  }

  throw createError({
    statusCode: 402,
    statusMessage: 'Feature requires higher plan',
    data: toFeaturePlanRequiredPayload({
      featureKey: ASSESSMENTS_FEATURE_KEY,
      access,
    }),
  });
}
