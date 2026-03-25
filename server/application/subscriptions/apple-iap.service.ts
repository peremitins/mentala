import { createError } from 'h3';
import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import {
  appleTransactions,
  subscriptionEvents,
  userSubscriptions,
} from '@/server/infrastructure/db/schema';
import {
  APPLE_IAP_PRODUCTS,
  isAppleIapProductId,
  type AppleIapProductId,
} from '@/shared/constants/appleIap';
import {
  decodeSignedTransactionInfo,
  fetchAppleTransactionFromServerApi,
  type AppleIapEnvironment,
  type AppleSignedTransactionInfo,
} from '@/server/application/payments/apple-iap.client';

type AppleIapSyncSource = 'confirm' | 'asn_v2' | 'manual_sync';

type AppleIapSyncResult =
  | {
      kind: 'active';
      environment: AppleIapEnvironment;
      productId: AppleIapProductId;
      planId: 'pro' | 'premium';
      billingPeriod: 'month' | 'year';
      transactionId: string;
      originalTransactionId: string;
      purchaseDate: Date | null;
      expiresAt: Date;
      storefront: string | null;
    }
  | {
      kind: 'none';
      environment: AppleIapEnvironment;
      transactionId: string;
      originalTransactionId: string;
      storefront: string | null;
      paymentStatus: 'expired' | 'canceled';
      expiresAt: Date | null;
    };

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCountryCode(value: unknown): string | null {
  const text = normalizeString(value).toUpperCase();
  if (!text) return null;
  return /^[A-Z]{2}$/.test(text) ? text : null;
}

function normalizeUuid(value: unknown): string | null {
  const text = normalizeString(value).toLowerCase();
  if (!text) return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
    ? text
    : null;
}

function resolvePaymentStatus(params: {
  transaction: AppleSignedTransactionInfo;
  now: Date;
}): {
  kind: 'active' | 'none';
  paymentStatus: 'active' | 'expired' | 'canceled';
} {
  if (params.transaction.revocationDate) {
    return {
      kind: 'none',
      paymentStatus: 'canceled',
    };
  }

  if (!params.transaction.expiresDate) {
    return {
      kind: 'none',
      paymentStatus: 'expired',
    };
  }

  if (params.transaction.expiresDate.getTime() <= params.now.getTime()) {
    return {
      kind: 'none',
      paymentStatus: 'expired',
    };
  }

  return {
    kind: 'active',
    paymentStatus: 'active',
  };
}

async function ensureOriginalTransactionOwnership(params: {
  userId: number;
  originalTransactionId: string;
  environment: AppleIapEnvironment;
}) {
  const transactionOwnerRows = await db
    .select({
      userId: appleTransactions.userId,
    })
    .from(appleTransactions)
    .where(
      and(
        eq(
          appleTransactions.originalTransactionId,
          params.originalTransactionId
        ),
        eq(appleTransactions.environment, params.environment)
      )
    )
    .orderBy(desc(appleTransactions.createdAt))
    .limit(1);

  const transactionOwner = transactionOwnerRows[0];
  if (transactionOwner && transactionOwner.userId !== params.userId) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'This App Store subscription is already linked to another account',
    });
  }

  const subscriptionOwnerRows = await db
    .select({
      userId: userSubscriptions.userId,
    })
    .from(userSubscriptions)
    .where(
      and(
        eq(
          userSubscriptions.appleOriginalTransactionId,
          params.originalTransactionId
        ),
        eq(userSubscriptions.appleEnvironment, params.environment)
      )
    )
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);

  const subscriptionOwner = subscriptionOwnerRows[0];
  if (subscriptionOwner && subscriptionOwner.userId !== params.userId) {
    throw createError({
      statusCode: 409,
      statusMessage:
        'This App Store subscription is already linked to another account',
    });
  }
}

function resolveEventType(params: {
  source: AppleIapSyncSource;
  paymentStatus: 'active' | 'expired' | 'canceled';
}): string {
  if (params.paymentStatus === 'active') {
    return params.source === 'asn_v2'
      ? 'apple_iap_renewed'
      : 'purchase_success';
  }

  if (params.paymentStatus === 'canceled') {
    return 'subscription_canceled';
  }

  return 'subscription_expired';
}

async function applyAppleTransactionForUser(params: {
  userId: number;
  transaction: AppleSignedTransactionInfo;
  signedTransactionInfo: string;
  appAccountToken: string | null;
  storefrontCountryCode: string | null;
  source: AppleIapSyncSource;
  now: Date;
}): Promise<AppleIapSyncResult> {
  const { userId, transaction, signedTransactionInfo, now } = params;

  if (!isAppleIapProductId(transaction.productId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown Apple productId',
    });
  }

  const productMeta = APPLE_IAP_PRODUCTS[transaction.productId];
  if (!productMeta) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Unknown Apple productId',
    });
  }

  const resolvedStorefront =
    transaction.storefront ||
    normalizeCountryCode(params.storefrontCountryCode);

  const statusResolution = resolvePaymentStatus({
    transaction,
    now,
  });

  const normalizedAppAccountToken =
    transaction.appAccountToken || normalizeUuid(params.appAccountToken);

  await db.transaction(async (tx) => {
    await tx
      .insert(appleTransactions)
      .values({
        userId,
        originalTransactionId: transaction.originalTransactionId,
        transactionId: transaction.transactionId,
        productId: transaction.productId,
        environment: transaction.environment,
        purchaseDate: transaction.purchaseDate,
        expiresDate: transaction.expiresDate,
        revocationDate: transaction.revocationDate,
        storefront: resolvedStorefront,
        appAccountToken: normalizedAppAccountToken,
        signedPayload: signedTransactionInfo,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: appleTransactions.transactionId,
        set: {
          userId,
          originalTransactionId: transaction.originalTransactionId,
          productId: transaction.productId,
          environment: transaction.environment,
          purchaseDate: transaction.purchaseDate,
          expiresDate: transaction.expiresDate,
          revocationDate: transaction.revocationDate,
          storefront: resolvedStorefront,
          appAccountToken: normalizedAppAccountToken,
          signedPayload: signedTransactionInfo,
          updatedAt: now,
        },
      });

    if (statusResolution.kind === 'active' && transaction.expiresDate) {
      await tx
        .insert(userSubscriptions)
        .values({
          userId,
          planId: productMeta.planId,
          billingPeriod: productMeta.billingPeriod,
          startDate: transaction.purchaseDate ?? now,
          endDate: transaction.expiresDate,
          paymentStatus: 'active',
          autoRenew: true,
          sourcePlatform: 'ios',
          paymentProvider: 'apple_iap',
          appleTransactionId: transaction.transactionId,
          appleOriginalTransactionId: transaction.originalTransactionId,
          appleProductId: transaction.productId,
          appleEnvironment: transaction.environment,
          updatedAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: userSubscriptions.appleTransactionId,
          set: {
            planId: productMeta.planId,
            billingPeriod: productMeta.billingPeriod,
            startDate: transaction.purchaseDate ?? now,
            endDate: transaction.expiresDate,
            paymentStatus: 'active',
            autoRenew: true,
            sourcePlatform: 'ios',
            paymentProvider: 'apple_iap',
            appleOriginalTransactionId: transaction.originalTransactionId,
            appleProductId: transaction.productId,
            appleEnvironment: transaction.environment,
            updatedAt: now,
          },
        });

      // Внутри одной originalTransactionId цепочки держим только одну активную запись.
      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: 'expired',
          autoRenew: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.paymentProvider, 'apple_iap'),
            eq(userSubscriptions.paymentStatus, 'active'),
            eq(
              userSubscriptions.appleOriginalTransactionId,
              transaction.originalTransactionId
            ),
            ne(userSubscriptions.appleTransactionId, transaction.transactionId)
          )
        );
    } else {
      await tx
        .update(userSubscriptions)
        .set({
          paymentStatus: statusResolution.paymentStatus,
          autoRenew: false,
          updatedAt: now,
        })
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            eq(userSubscriptions.paymentProvider, 'apple_iap'),
            eq(userSubscriptions.paymentStatus, 'active'),
            eq(
              userSubscriptions.appleOriginalTransactionId,
              transaction.originalTransactionId
            ),
            eq(userSubscriptions.appleEnvironment, transaction.environment)
          )
        );
    }

    await tx.insert(subscriptionEvents).values({
      userId,
      eventType: resolveEventType({
        source: params.source,
        paymentStatus: statusResolution.paymentStatus,
      }),
      planId: productMeta.planId,
      metadata: {
        provider: 'apple_iap',
        source: params.source,
        productId: transaction.productId,
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        environment: transaction.environment,
        storefront: resolvedStorefront,
        purchaseDate: transaction.purchaseDate
          ? transaction.purchaseDate.toISOString()
          : null,
        expiresAt: transaction.expiresDate
          ? transaction.expiresDate.toISOString()
          : null,
        revocationDate: transaction.revocationDate
          ? transaction.revocationDate.toISOString()
          : null,
        isUpgraded: transaction.isUpgraded,
      },
      createdAt: now,
    });
  });

  if (statusResolution.kind === 'active' && transaction.expiresDate) {
    return {
      kind: 'active',
      environment: transaction.environment,
      productId: transaction.productId,
      planId: productMeta.planId,
      billingPeriod: productMeta.billingPeriod,
      transactionId: transaction.transactionId,
      originalTransactionId: transaction.originalTransactionId,
      purchaseDate: transaction.purchaseDate,
      expiresAt: transaction.expiresDate,
      storefront: resolvedStorefront,
    };
  }

  const inactivePaymentStatus: 'expired' | 'canceled' =
    statusResolution.paymentStatus === 'canceled' ? 'canceled' : 'expired';

  return {
    kind: 'none',
    environment: transaction.environment,
    transactionId: transaction.transactionId,
    originalTransactionId: transaction.originalTransactionId,
    storefront: resolvedStorefront,
    paymentStatus: inactivePaymentStatus,
    expiresAt: transaction.expiresDate,
  };
}

export async function syncAppleIapTransactionForUser(params: {
  userId: number;
  transactionId: string;
  signedTransactionInfo: string;
  appAccountToken?: string | null;
  storefrontCountryCode?: string | null;
  allowedBundleIds: string[];
  issuerId: string;
  keyId: string;
  privateKeyBase64: string;
  source?: AppleIapSyncSource;
  now?: Date;
}): Promise<AppleIapSyncResult> {
  const now = params.now ?? new Date();
  const source = params.source ?? 'confirm';

  const clientTransaction = decodeSignedTransactionInfo(
    params.signedTransactionInfo
  );

  if (clientTransaction.transactionId !== params.transactionId) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'transactionId mismatch with signedTransactionInfo payload',
    });
  }

  const authoritative = await fetchAppleTransactionFromServerApi({
    transactionId: params.transactionId,
    signedTransactionInfo: params.signedTransactionInfo,
    allowedBundleIds: params.allowedBundleIds,
    issuerId: params.issuerId,
    keyId: params.keyId,
    privateKeyBase64: params.privateKeyBase64,
    preferredEnvironment: clientTransaction.environment,
  });

  const transaction = authoritative.transaction;

  await ensureOriginalTransactionOwnership({
    userId: params.userId,
    originalTransactionId: transaction.originalTransactionId,
    environment: transaction.environment,
  });

  return await applyAppleTransactionForUser({
    userId: params.userId,
    transaction,
    signedTransactionInfo: authoritative.signedTransactionInfo,
    appAccountToken: params.appAccountToken ?? null,
    storefrontCountryCode: params.storefrontCountryCode ?? null,
    source,
    now,
  });
}

export async function resolveAppleTransactionOwner(params: {
  transactionId?: string | null;
  originalTransactionId?: string | null;
  environment?: AppleIapEnvironment | null;
}): Promise<number | null> {
  const transactionId = normalizeString(params.transactionId);
  const originalTransactionId = normalizeString(params.originalTransactionId);
  const environment =
    params.environment === 'sandbox' || params.environment === 'production'
      ? params.environment
      : null;

  if (transactionId) {
    const txRows = await db
      .select({ userId: appleTransactions.userId })
      .from(appleTransactions)
      .where(eq(appleTransactions.transactionId, transactionId))
      .limit(1);

    const txOwner = txRows[0]?.userId;
    if (typeof txOwner === 'number') {
      return txOwner;
    }
  }

  if (!originalTransactionId) {
    return null;
  }

  if (environment) {
    const txRows = await db
      .select({ userId: appleTransactions.userId })
      .from(appleTransactions)
      .where(
        and(
          eq(appleTransactions.originalTransactionId, originalTransactionId),
          eq(appleTransactions.environment, environment)
        )
      )
      .orderBy(desc(appleTransactions.createdAt))
      .limit(1);

    const txOwner = txRows[0]?.userId;
    if (typeof txOwner === 'number') {
      return txOwner;
    }
  }

  const subscriptionRows = environment
    ? await db
        .select({ userId: userSubscriptions.userId })
        .from(userSubscriptions)
        .where(
          and(
            eq(
              userSubscriptions.appleOriginalTransactionId,
              originalTransactionId
            ),
            eq(userSubscriptions.appleEnvironment, environment)
          )
        )
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(1)
    : await db
        .select({ userId: userSubscriptions.userId })
        .from(userSubscriptions)
        .where(
          eq(
            userSubscriptions.appleOriginalTransactionId,
            originalTransactionId
          )
        )
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(1);

  const subscriptionOwner = subscriptionRows[0]?.userId;
  return typeof subscriptionOwner === 'number' ? subscriptionOwner : null;
}
