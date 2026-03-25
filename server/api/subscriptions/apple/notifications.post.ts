import { createError } from 'h3';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/server/infrastructure/db/client';
import { appleNotificationEvents } from '@/server/infrastructure/db/schema';
import {
  decodeAppleJwsPayload,
  decodeSignedTransactionInfo,
  type AppleIapEnvironment,
} from '@/server/application/payments/apple-iap.client';
import { resolveAppleIapRuntimeConfig } from '@/server/application/payments/apple-iap.config';
import {
  resolveAppleTransactionOwner,
  syncAppleIapTransactionForUser,
} from '@/server/application/subscriptions/apple-iap.service';

const appleNotificationSchema = z.object({
  signedPayload: z.string().trim().min(20),
});

type AppleNotificationResponse = {
  ok: true;
  deduplicated: boolean;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getPgErrorCode(error: any): string | null {
  const code = normalizeString(error?.code || error?.cause?.code);
  return code || null;
}

function normalizeEnvironment(value: unknown): AppleIapEnvironment | null {
  const text = normalizeString(value).toLowerCase();
  if (!text) return null;
  return text.includes('sandbox') ? 'sandbox' : 'production';
}

/**
 * POST /api/subscriptions/apple/notifications
 * ASN v2 ingest endpoint: дедуп по notificationUUID и идемпотентная обработка.
 */
export default defineEventHandler(
  async (event): Promise<AppleNotificationResponse> => {
    const body = await readBody(event);
    const parsed = appleNotificationSchema.safeParse(body ?? {});

    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid body for Apple notifications endpoint',
      });
    }

    const signedPayload = parsed.data.signedPayload;

    const payload = decodeAppleJwsPayload(signedPayload);
    const notificationUUID = normalizeString(payload.notificationUUID);
    const notificationType = normalizeString(payload.notificationType) || null;
    const notificationSubtype = normalizeString(payload.subtype) || null;

    if (!notificationUUID) {
      throw createError({
        statusCode: 400,
        statusMessage: 'notificationUUID is missing in Apple signedPayload',
      });
    }

    let eventId: number | null = null;

    try {
      const inserted = await db
        .insert(appleNotificationEvents)
        .values({
          notificationUUID,
          notificationType,
          notificationSubtype,
          processingStatus: 'received',
          signedPayload,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: appleNotificationEvents.id });

      eventId = inserted[0]?.id ?? null;
    } catch (error: any) {
      if (getPgErrorCode(error) === '23505') {
        return {
          ok: true,
          deduplicated: true,
        };
      }

      throw error;
    }

    const runtime = resolveAppleIapRuntimeConfig(event);

    try {
      const data =
        payload.data &&
        typeof payload.data === 'object' &&
        !Array.isArray(payload.data)
          ? (payload.data as Record<string, unknown>)
          : null;

      const signedTransactionInfo = normalizeString(
        data?.signedTransactionInfo
      );

      if (!signedTransactionInfo) {
        if (eventId != null) {
          await db
            .update(appleNotificationEvents)
            .set({
              processingStatus: 'ignored',
              lastError: 'signedTransactionInfo is missing in ASN payload',
              updatedAt: new Date(),
            })
            .where(eq(appleNotificationEvents.id, eventId));
        }

        return {
          ok: true,
          deduplicated: false,
        };
      }

      const transaction = decodeSignedTransactionInfo(signedTransactionInfo);

      const userId = await resolveAppleTransactionOwner({
        transactionId: transaction.transactionId,
        originalTransactionId: transaction.originalTransactionId,
        environment: normalizeEnvironment(transaction.environment),
      });

      if (!userId) {
        if (eventId != null) {
          await db
            .update(appleNotificationEvents)
            .set({
              processingStatus: 'ignored',
              transactionId: transaction.transactionId,
              originalTransactionId: transaction.originalTransactionId,
              lastError:
                'No linked Mentala user for this App Store subscription',
              updatedAt: new Date(),
            })
            .where(eq(appleNotificationEvents.id, eventId));
        }

        return {
          ok: true,
          deduplicated: false,
        };
      }

      await syncAppleIapTransactionForUser({
        userId,
        transactionId: transaction.transactionId,
        signedTransactionInfo,
        appAccountToken: transaction.appAccountToken,
        storefrontCountryCode: transaction.storefront,
        allowedBundleIds: runtime.allowedBundleIds,
        issuerId: runtime.issuerId,
        keyId: runtime.keyId,
        privateKeyBase64: runtime.privateKeyBase64,
        source: 'asn_v2',
      });

      if (eventId != null) {
        await db
          .update(appleNotificationEvents)
          .set({
            userId,
            transactionId: transaction.transactionId,
            originalTransactionId: transaction.originalTransactionId,
            processingStatus: 'processed',
            updatedAt: new Date(),
          })
          .where(eq(appleNotificationEvents.id, eventId));
      }

      return {
        ok: true,
        deduplicated: false,
      };
    } catch (error: any) {
      const message =
        normalizeString(error?.statusMessage) ||
        normalizeString(error?.message) ||
        'Failed to process Apple ASN notification';

      event.context.logger?.error(
        {
          err: error,
          notificationUUID,
          eventId,
        },
        'Apple ASN processing failed'
      );

      if (eventId != null) {
        await db
          .update(appleNotificationEvents)
          .set({
            processingStatus: 'failed',
            lastError: message.slice(0, 1000),
            updatedAt: new Date(),
          })
          .where(eq(appleNotificationEvents.id, eventId));
      }

      // Для Apple всегда возвращаем 200, чтобы не создавать бесконечные retries.
      return {
        ok: true,
        deduplicated: false,
      };
    }
  }
);
