import { createError } from 'h3';
import {
  getBillingSnapshot,
  getFeatureAccessOrDefault,
  toFeaturePlanRequiredPayload,
} from './entitlements.service';

export async function assertFeatureAccess(params: {
  userId: number;
  userRole?: string | null;
  featureKey: string;
}): Promise<void> {
  const billing = await getBillingSnapshot(
    params.userId,
    params.userRole || undefined
  );
  const access = getFeatureAccessOrDefault(billing, params.featureKey);
  if (access.available) return;

  throw createError({
    statusCode: 402,
    statusMessage: 'Feature requires a paid plan',
    data: toFeaturePlanRequiredPayload({
      featureKey: params.featureKey,
      access,
    }),
  });
}
