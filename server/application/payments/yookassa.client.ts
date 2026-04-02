import { createError } from 'h3';

export interface YooKassaPaymentAmount {
  value: string;
  currency: string;
}

export interface YooKassaPaymentMethodCard {
  first6?: string;
  last4?: string;
  expiry_month?: string;
  expiry_year?: string;
  card_type?: string;
}

export interface YooKassaPaymentMethodResponse {
  id: string;
  type: string;
  saved: boolean;
  status: 'pending' | 'active' | 'inactive' | string;
  title?: string;
  card?: YooKassaPaymentMethodCard;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
}

export interface YooKassaPaymentResponse {
  id: string;
  status: string;
  paid: boolean;
  amount: YooKassaPaymentAmount;
  confirmation?: {
    type?: string;
    confirmation_token?: string;
    confirmation_url?: string;
  };
  payment_method?: {
    id?: string;
    type?: string;
    saved?: boolean;
    title?: string;
    card?: YooKassaPaymentMethodCard;
  };
  metadata?: Record<string, string>;
}

function getAuthHeader(shopId: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
}

/**
 * Формирует чек (receipt) для 54-ФЗ.
 * YooKassa требует receipt для recurring-платежей (server-to-server).
 */
export function buildYooKassaReceipt(params: {
  email: string;
  amount: number;
  description: string;
}): YooKassaReceipt {
  return {
    customer: { email: params.email },
    items: [
      {
        description: params.description.slice(0, 128),
        quantity: '1.00',
        amount: {
          value: formatAmount(params.amount),
          currency: 'RUB',
        },
        vat_code: 1,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      },
    ],
  };
}

function formatAmount(value: number): string {
  return Number(value).toFixed(2);
}

export interface YooKassaReceiptItem {
  description: string;
  quantity: string;
  amount: YooKassaPaymentAmount;
  vat_code: number;
  payment_mode?: string;
  payment_subject?: string;
}

export interface YooKassaReceipt {
  customer: { email: string };
  items: YooKassaReceiptItem[];
}

export async function createYooKassaPayment(params: {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  amount: number;
  description: string;
  metadata?: Record<string, string>;
  paymentMode: 'widget' | 'redirect' | 'recurring';
  paymentMethodId?: string;
  returnUrl?: string;
  savePaymentMethod?: boolean;
  merchantCustomerId?: string;
  receipt?: YooKassaReceipt;
}): Promise<YooKassaPaymentResponse> {
  const auth = getAuthHeader(params.shopId, params.secretKey);

  const body: Record<string, any> = {
    amount: {
      value: formatAmount(params.amount),
      currency: 'RUB',
    },
    capture: true,
    description: params.description,
    metadata: params.metadata ?? {},
  };

  if (params.receipt) {
    body.receipt = params.receipt;
  }

  if (params.paymentMode === 'recurring') {
    if (!params.paymentMethodId) {
      throw createError({
        statusCode: 500,
        statusMessage: 'payment_method_id is required for recurring payment',
      });
    }

    body.payment_method_id = params.paymentMethodId;
  } else {
    body.confirmation =
      params.paymentMode === 'widget'
        ? {
            type: 'embedded',
            locale: 'ru_RU',
          }
        : {
            type: 'redirect',
            return_url: params.returnUrl,
            locale: 'ru_RU',
          };

    if (typeof params.savePaymentMethod === 'boolean') {
      body.save_payment_method = params.savePaymentMethod;
    }

    if (params.merchantCustomerId) {
      body.merchant_customer_id = params.merchantCustomerId;
    }
  }

  try {
    return await $fetch<YooKassaPaymentResponse>(
      'https://api.yookassa.ru/v3/payments',
      {
        method: 'POST',
        timeout: 15_000,
        headers: {
          Authorization: auth,
          'Idempotence-Key': params.idempotenceKey,
        },
        body,
      }
    );
  } catch (error: any) {
    // Логируем тело ответа от YooKassa для диагностики.
    const responseBody = error?.data ?? error?.response?._data ?? null;
    if (responseBody) {
      console.error('[YooKassa] createPayment error response', {
        status: error?.statusCode ?? error?.status,
        body: responseBody,
        paymentMode: params.paymentMode,
        idempotenceKey: params.idempotenceKey,
      });
    }
    throw error;
  }
}

export interface YooKassaRefundResponse {
  id: string;
  status: string;
  amount: YooKassaPaymentAmount;
  payment_id: string;
  created_at?: string;
  description?: string;
  metadata?: Record<string, string>;
}

export async function getYooKassaRefund(params: {
  shopId: string;
  secretKey: string;
  refundId: string;
}): Promise<YooKassaRefundResponse> {
  return await $fetch<YooKassaRefundResponse>(
    `https://api.yookassa.ru/v3/refunds/${params.refundId}`,
    {
      method: 'GET',
      timeout: 10_000,
      headers: {
        Authorization: getAuthHeader(params.shopId, params.secretKey),
      },
    }
  );
}

export async function getYooKassaPayment(params: {
  shopId: string;
  secretKey: string;
  paymentId: string;
}): Promise<YooKassaPaymentResponse> {
  return await $fetch<YooKassaPaymentResponse>(
    `https://api.yookassa.ru/v3/payments/${params.paymentId}`,
    {
      method: 'GET',
      timeout: 10_000,
      headers: {
        Authorization: getAuthHeader(params.shopId, params.secretKey),
      },
    }
  );
}

export async function cancelYooKassaPayment(params: {
  shopId: string;
  secretKey: string;
  paymentId: string;
  idempotenceKey: string;
}): Promise<YooKassaPaymentResponse> {
  return await $fetch<YooKassaPaymentResponse>(
    `https://api.yookassa.ru/v3/payments/${params.paymentId}/cancel`,
    {
      method: 'POST',
      timeout: 10_000,
      headers: {
        Authorization: getAuthHeader(params.shopId, params.secretKey),
        'Idempotence-Key': params.idempotenceKey,
        'Content-Type': 'application/json',
      },
      body: {},
    }
  );
}

export async function createYooKassaPaymentMethodBinding(params: {
  shopId: string;
  secretKey: string;
  idempotenceKey: string;
  returnUrl: string;
}): Promise<YooKassaPaymentMethodResponse> {
  return await $fetch<YooKassaPaymentMethodResponse>(
    'https://api.yookassa.ru/v3/payment_methods',
    {
      method: 'POST',
      timeout: 15_000,
      headers: {
        Authorization: getAuthHeader(params.shopId, params.secretKey),
        'Idempotence-Key': params.idempotenceKey,
      },
      body: {
        type: 'bank_card',
        confirmation: {
          type: 'redirect',
          return_url: params.returnUrl,
        },
      },
    }
  );
}

export async function getYooKassaPaymentMethod(params: {
  shopId: string;
  secretKey: string;
  paymentMethodId: string;
}): Promise<YooKassaPaymentMethodResponse> {
  return await $fetch<YooKassaPaymentMethodResponse>(
    `https://api.yookassa.ru/v3/payment_methods/${params.paymentMethodId}`,
    {
      method: 'GET',
      timeout: 10_000,
      headers: {
        Authorization: getAuthHeader(params.shopId, params.secretKey),
      },
    }
  );
}

export function extractPaymentMethodPresentation(
  paymentMethod:
    | YooKassaPaymentMethodResponse
    | YooKassaPaymentResponse['payment_method']
): {
  paymentMethodType: string | null;
  paymentMethodTitle: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpiryMonth: string | null;
  cardExpiryYear: string | null;
} {
  const type = String(paymentMethod?.type || '').trim();
  const title = String(paymentMethod?.title || '').trim();
  const cardBrand = String(paymentMethod?.card?.card_type || '').trim();
  const cardLast4 = String(paymentMethod?.card?.last4 || '').trim();
  const cardExpiryMonth = String(
    paymentMethod?.card?.expiry_month || ''
  ).trim();
  const cardExpiryYear = String(paymentMethod?.card?.expiry_year || '').trim();

  return {
    paymentMethodType: type || null,
    paymentMethodTitle: title || null,
    cardBrand: cardBrand || null,
    cardLast4: cardLast4 || null,
    cardExpiryMonth: cardExpiryMonth || null,
    cardExpiryYear: cardExpiryYear || null,
  };
}
