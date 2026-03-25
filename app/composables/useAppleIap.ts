import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { computed, ref } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import {
  APPLE_IAP_PRODUCT_IDS,
  type AppleIapProductId,
} from '@/shared/constants/appleIap';
import { getIosStorefrontCountryCode } from '@/app/lib/iosStorefront';

type AppleIapProductPricing = {
  productId: AppleIapProductId;
  title: string;
  description: string;
  price: string;
  currency: string | null;
  priceMicros: number | null;
  billingPeriodIso: string | null;
};

type AppleIapProductsMap = Partial<
  Record<AppleIapProductId, AppleIapProductPricing>
>;

type AppleIapConfirmResponse = {
  status: 'active' | 'none';
  planId: 'pro' | 'premium' | null;
  billingPeriod: 'month' | 'year' | null;
  expiresAt: string | null;
  environment: 'production' | 'sandbox';
};

type NativeAppleIapProduct = {
  productId: string;
  title: string;
  description: string;
  displayPrice: string;
  currencyCode: string | null;
  billingPeriod: 'month' | 'year' | null;
};

type NativeAppleTransaction = {
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  signedTransactionInfo: string;
  environment: 'production' | 'sandbox';
  purchaseDate: string | null;
  expiresDate: string | null;
  storefront: string | null;
  isUpgraded: boolean;
  appAccountToken: string | null;
};

type NativeTransactionsResponse = {
  transactions: NativeAppleTransaction[];
};

type NativePurchaseResponse = {
  transaction: NativeAppleTransaction;
};

type NativeProductsResponse = {
  products: NativeAppleIapProduct[];
};

type AppleIapPlugin = {
  getProducts(options: { productIds: string[] }): Promise<NativeProductsResponse>;
  purchase(options: {
    productId: string;
    appAccountToken?: string;
  }): Promise<NativePurchaseResponse>;
  restore(): Promise<NativeTransactionsResponse>;
  getCurrentEntitlements(): Promise<NativeTransactionsResponse>;
  finishTransaction(options: { transactionId: string }): Promise<void>;
  showManageSubscriptions(): Promise<void>;
  addListener(
    eventName: 'transactionUpdated',
    listenerFunc: (event: { transaction: NativeAppleTransaction }) => void
  ): Promise<PluginListenerHandle>;
};

type PendingConfirmQueueItem = {
  transaction: NativeAppleTransaction;
  appAccountToken: string | null;
  storefrontCountryCode: string | null;
  idempotencyKey: string;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
  createdAt: number;
};

const AppleIap = registerPlugin<AppleIapPlugin>('AppleIap');

const productsMapRef = ref<AppleIapProductsMap>({});
const loadingProductsRef = ref(false);

const PENDING_CONFIRMS_STORAGE_KEY = 'mentai.apple_iap.pending_confirms.v1';
const APP_ACCOUNT_TOKEN_STORAGE_PREFIX = 'mentai.apple_iap.app_account_token';
const MAX_RETRY_BACKOFF_MS = 6 * 60 * 60 * 1000; // 6 часов
const PENDING_CONFIRM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

let listenerInstallPromise: Promise<void> | null = null;
let updatesListener: PluginListenerHandle | null = null;
let pendingQueueDrainPromise: Promise<AppleIapConfirmResponse | null> | null =
  null;
let pendingDrainTimer: ReturnType<typeof setTimeout> | null = null;

let apiClient: (<T = unknown>(url: string, options: any) => Promise<T>) | null =
  null;
let authStore: ReturnType<typeof useAuthStore> | null = null;

function isNativeIos(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

function buildIdempotencyKey(transactionId: string): string {
  const base = `apple-iap:${String(transactionId || '').trim()}`;
  if (base.length <= 128) return base;

  // Компактный детерминированный хеш, чтобы уложиться в лимит заголовка.
  let hash = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `apple-iap:${(hash >>> 0).toString(36)}`;
}

function normalizeBillingPeriodIso(
  billingPeriod: 'month' | 'year' | null
): string | null {
  if (billingPeriod === 'month') return 'P1M';
  if (billingPeriod === 'year') return 'P1Y';
  return null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCountryCode(value: unknown): string | null {
  const text = normalizeString(value).toUpperCase();
  if (!text) return null;
  return /^[A-Z]{2}$/.test(text) ? text : null;
}

function normalizeUuid(value: unknown): string | null {
  const text = normalizeString(value);
  if (!text) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    text
  )
    ? text.toLowerCase()
    : null;
}

function normalizeNativeTransaction(
  value: NativeAppleTransaction | null | undefined
): NativeAppleTransaction | null {
  if (!value || typeof value !== 'object') return null;

  const transactionId = normalizeString(value.transactionId);
  const productId = normalizeString(value.productId);
  const signedTransactionInfo = normalizeString(value.signedTransactionInfo);

  if (!transactionId || !productId || !signedTransactionInfo) {
    return null;
  }

  const environmentRaw = normalizeString(value.environment).toLowerCase();
  const environment =
    environmentRaw === 'sandbox' ? 'sandbox' : 'production';

  return {
    transactionId,
    originalTransactionId: normalizeString(value.originalTransactionId) || null,
    productId,
    signedTransactionInfo,
    environment,
    purchaseDate: normalizeString(value.purchaseDate) || null,
    expiresDate: normalizeString(value.expiresDate) || null,
    storefront: normalizeCountryCode(value.storefront),
    isUpgraded: Boolean((value as any).isUpgraded),
    appAccountToken: normalizeUuid(value.appAccountToken),
  };
}

function normalizeProducts(
  products: NativeAppleIapProduct[] | null | undefined
): AppleIapProductsMap {
  const next: AppleIapProductsMap = {};
  if (!Array.isArray(products)) return next;

  for (const product of products) {
    const productId = normalizeString(product?.productId) as AppleIapProductId;
    if (!productId || !APPLE_IAP_PRODUCT_IDS.includes(productId)) continue;

    const displayPrice = normalizeString(product?.displayPrice);
    if (!displayPrice) continue;

    const billingPeriod =
      product?.billingPeriod === 'month' || product?.billingPeriod === 'year'
        ? product.billingPeriod
        : null;

    next[productId] = {
      productId,
      title: normalizeString(product?.title),
      description: normalizeString(product?.description),
      price: displayPrice,
      currency: normalizeString(product?.currencyCode) || null,
      priceMicros: null,
      billingPeriodIso: normalizeBillingPeriodIso(billingPeriod),
    };
  }

  return next;
}

function parseApiErrorMessage(error: any): string {
  const candidates = [
    error?.data?.error?.message,
    error?.data?.message,
    error?.response?._data?.error?.message,
    error?.response?._data?.message,
    error?.message,
  ];

  for (const candidate of candidates) {
    const text = normalizeString(candidate);
    if (text) return text;
  }

  return 'Не удалось подтвердить покупку на сервере';
}

function createUuidV4Fallback(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function resolveAppAccountToken(userId: string | number | null | undefined): string | null {
  if (typeof window === 'undefined') return null;

  const normalizedUserId = String(userId ?? '').trim();
  if (!normalizedUserId) return null;

  const storageKey = `${APP_ACCOUNT_TOKEN_STORAGE_PREFIX}:${normalizedUserId}`;

  try {
    const existing = normalizeUuid(localStorage.getItem(storageKey));
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createUuidV4Fallback();

    const normalizedGenerated = normalizeUuid(generated);
    if (!normalizedGenerated) return null;

    localStorage.setItem(storageKey, normalizedGenerated);
    return normalizedGenerated;
  } catch {
    return null;
  }
}

function readPendingConfirmQueue(): PendingConfirmQueueItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(PENDING_CONFIRMS_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const normalized: PendingConfirmQueueItem[] = [];
    const now = Date.now();

    for (const item of parsed) {
      const transaction = normalizeNativeTransaction(item?.transaction);
      if (!transaction) continue;

      const idempotencyKey = normalizeString(item?.idempotencyKey);
      if (!idempotencyKey) continue;

      const createdAt =
        typeof item?.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? Math.max(0, Math.floor(item.createdAt))
          : now;

      // Удаляем записи старше 7 дней — они уже не будут подтверждены.
      if (now - createdAt > PENDING_CONFIRM_MAX_AGE_MS) continue;

      normalized.push({
        transaction,
        appAccountToken:
          normalizeUuid(item?.appAccountToken) || transaction.appAccountToken,
        storefrontCountryCode: normalizeCountryCode(item?.storefrontCountryCode),
        idempotencyKey,
        retryCount:
          typeof item?.retryCount === 'number' && Number.isFinite(item.retryCount)
            ? Math.max(0, Math.floor(item.retryCount))
            : 0,
        nextRetryAt:
          typeof item?.nextRetryAt === 'number' && Number.isFinite(item.nextRetryAt)
            ? Math.max(0, Math.floor(item.nextRetryAt))
            : 0,
        lastError: normalizeString(item?.lastError) || null,
        createdAt,
      });
    }

    return normalized;
  } catch {
    return [];
  }
}

function writePendingConfirmQueue(queue: PendingConfirmQueueItem[]) {
  if (typeof window === 'undefined') return;

  if (!queue.length) {
    try {
      localStorage.removeItem(PENDING_CONFIRMS_STORAGE_KEY);
    } catch {
      // ignore
    }
    return;
  }

  try {
    localStorage.setItem(PENDING_CONFIRMS_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

function scheduleQueueDrain(delayMs: number) {
  if (typeof window === 'undefined') return;

  if (pendingDrainTimer) {
    clearTimeout(pendingDrainTimer);
  }

  pendingDrainTimer = setTimeout(() => {
    pendingDrainTimer = null;
    void drainPendingConfirmQueue();
  }, Math.max(100, delayMs));
}

function calculateNextRetryDelayMs(retryCount: number): number {
  const baseDelayMs = 5_000;
  const factor = 2 ** Math.max(0, retryCount);
  return Math.min(baseDelayMs * factor, MAX_RETRY_BACKOFF_MS);
}

function enqueuePendingConfirm(item: PendingConfirmQueueItem) {
  const queue = readPendingConfirmQueue();
  const existingIndex = queue.findIndex(
    (entry) => entry.transaction.transactionId === item.transaction.transactionId
  );

  if (existingIndex >= 0) {
    queue[existingIndex] = {
      ...queue[existingIndex],
      ...item,
      retryCount: Math.min(queue[existingIndex]!.retryCount, item.retryCount),
      nextRetryAt: Math.min(queue[existingIndex]!.nextRetryAt, item.nextRetryAt),
    };
  } else {
    queue.push(item);
  }

  writePendingConfirmQueue(queue);
  scheduleQueueDrain(500);
}

async function confirmOnBackend(params: {
  transaction: NativeAppleTransaction;
  appAccountToken: string | null;
  storefrontCountryCode: string | null;
  idempotencyKey: string;
}): Promise<AppleIapConfirmResponse> {
  if (!apiClient) {
    throw new Error('API client is not initialized');
  }

  return await apiClient<AppleIapConfirmResponse>(
    '/api/subscriptions/apple/confirm',
    {
      method: 'POST',
      headers: {
        'Idempotency-Key': params.idempotencyKey,
      },
      body: {
        transactionId: params.transaction.transactionId,
        signedTransactionInfo: params.transaction.signedTransactionInfo,
        appAccountToken: params.appAccountToken || undefined,
        storefrontCountryCode: params.storefrontCountryCode || undefined,
      },
    }
  );
}

async function finishTransaction(transactionId: string) {
  try {
    await AppleIap.finishTransaction({ transactionId });
  } catch (error) {
    // Не блокируем UX из-за ошибки finish, но лог сохраняем для диагностики.
    console.warn('[AppleIap] Failed to finish transaction:', {
      transactionId,
      error,
    });
  }
}

async function confirmTransactionWithPolicy(params: {
  transaction: NativeAppleTransaction;
  appAccountToken: string | null;
  storefrontCountryCode: string | null;
  idempotencyKey?: string;
  strict: boolean;
}): Promise<AppleIapConfirmResponse | null> {
  const idempotencyKey =
    normalizeString(params.idempotencyKey) ||
    buildIdempotencyKey(params.transaction.transactionId);

  try {
    const response = await confirmOnBackend({
      transaction: params.transaction,
      appAccountToken: params.appAccountToken,
      storefrontCountryCode: params.storefrontCountryCode,
      idempotencyKey,
    });

    await finishTransaction(params.transaction.transactionId);

    const queue = readPendingConfirmQueue().filter(
      (item) => item.transaction.transactionId !== params.transaction.transactionId
    );
    writePendingConfirmQueue(queue);

    return response;
  } catch (error) {
    enqueuePendingConfirm({
      transaction: params.transaction,
      appAccountToken: params.appAccountToken,
      storefrontCountryCode: params.storefrontCountryCode,
      idempotencyKey,
      retryCount: 1,
      nextRetryAt: Date.now() + calculateNextRetryDelayMs(1),
      lastError: parseApiErrorMessage(error),
      createdAt: Date.now(),
    });

    if (params.strict) {
      throw new Error(parseApiErrorMessage(error));
    }

    return null;
  }
}

async function drainPendingConfirmQueue(): Promise<AppleIapConfirmResponse | null> {
  if (pendingQueueDrainPromise) {
    return await pendingQueueDrainPromise;
  }

  pendingQueueDrainPromise = (async () => {
    if (!authStore?.isLoggedIn || !apiClient) {
      return null;
    }

    const queue = readPendingConfirmQueue();
    if (!queue.length) {
      return null;
    }

    let latestSuccess: AppleIapConfirmResponse | null = null;
    const now = Date.now();
    const nextQueue: PendingConfirmQueueItem[] = [];

    for (const item of queue) {
      if (item.nextRetryAt > now) {
        nextQueue.push(item);
        continue;
      }

      try {
        const response = await confirmOnBackend({
          transaction: item.transaction,
          appAccountToken: item.appAccountToken,
          storefrontCountryCode: item.storefrontCountryCode,
          idempotencyKey: item.idempotencyKey,
        });

        await finishTransaction(item.transaction.transactionId);
        latestSuccess = response;
      } catch (error) {
        const retryCount = item.retryCount + 1;
        nextQueue.push({
          ...item,
          retryCount,
          nextRetryAt: Date.now() + calculateNextRetryDelayMs(retryCount),
          lastError: parseApiErrorMessage(error),
        });
      }
    }

    writePendingConfirmQueue(nextQueue);

    if (nextQueue.length) {
      const nearestRetryAt = Math.min(
        ...nextQueue.map((item) => item.nextRetryAt || Date.now())
      );
      scheduleQueueDrain(Math.max(1_000, nearestRetryAt - Date.now()));
    }

    return latestSuccess;
  })().finally(() => {
    pendingQueueDrainPromise = null;
  });

  return await pendingQueueDrainPromise;
}

async function ensureUpdatesListenerInstalled() {
  if (!isNativeIos()) return;

  if (updatesListener) return;

  if (!listenerInstallPromise) {
    listenerInstallPromise = (async () => {
      updatesListener = await AppleIap.addListener(
        'transactionUpdated',
        (payload) => {
          const transaction = normalizeNativeTransaction(payload?.transaction);
          if (!transaction) return;

          if (!authStore?.isLoggedIn) {
            enqueuePendingConfirm({
              transaction,
              appAccountToken: transaction.appAccountToken,
              storefrontCountryCode: transaction.storefront,
              idempotencyKey: buildIdempotencyKey(transaction.transactionId),
              retryCount: 0,
              nextRetryAt: Date.now(),
              lastError: 'user_not_logged_in',
              createdAt: Date.now(),
            });
            return;
          }

          void confirmTransactionWithPolicy({
            transaction,
            appAccountToken: transaction.appAccountToken,
            storefrontCountryCode: transaction.storefront,
            strict: false,
          });
        }
      );
    })().finally(() => {
      listenerInstallPromise = null;
    });
  }

  await listenerInstallPromise;
}

function pickBestResponse(
  current: AppleIapConfirmResponse | null,
  next: AppleIapConfirmResponse
): AppleIapConfirmResponse {
  if (!current) return next;

  if (next.status === 'active' && current.status !== 'active') return next;
  if (next.status !== 'active' && current.status === 'active') return current;

  const currentExpiresAt = current.expiresAt ? Date.parse(current.expiresAt) : 0;
  const nextExpiresAt = next.expiresAt ? Date.parse(next.expiresAt) : 0;
  return nextExpiresAt >= currentExpiresAt ? next : current;
}

export function useAppleIap() {
  const auth = useAuthStore();
  const nuxtApp = useNuxtApp();

  apiClient = nuxtApp.$api as any;
  authStore = auth;

  const available = computed(() => {
    return isNativeIos();
  });

  const products = computed(() => productsMapRef.value);
  const loadingProducts = computed(() => loadingProductsRef.value);

  const loadProducts = async (): Promise<AppleIapProductsMap> => {
    if (!isNativeIos()) {
      throw new Error('Apple IAP доступен только на native iOS');
    }

    loadingProductsRef.value = true;
    try {
      await ensureUpdatesListenerInstalled();

      const response = await AppleIap.getProducts({
        productIds: [...APPLE_IAP_PRODUCT_IDS],
      });
      const normalized = normalizeProducts(response?.products);
      productsMapRef.value = normalized;

      if (!Object.keys(normalized).length) {
        throw new Error('StoreKit не вернул цены для продуктов подписки');
      }

      return normalized;
    } finally {
      loadingProductsRef.value = false;
    }
  };

  const purchase = async (productId: AppleIapProductId) => {
    if (!isNativeIos()) {
      throw new Error('Apple IAP доступен только на native iOS');
    }

    if (!auth.isLoggedIn) {
      throw new Error('Нужна авторизация для покупки');
    }

    await ensureUpdatesListenerInstalled();

    const appAccountToken = resolveAppAccountToken(auth.user?.id);

    const purchaseResult = await AppleIap.purchase({
      productId,
      appAccountToken: appAccountToken || undefined,
    });

    const transaction = normalizeNativeTransaction(purchaseResult?.transaction);
    if (!transaction) {
      throw new Error('StoreKit не вернул данные транзакции');
    }

    const storefrontCountryCode = await getIosStorefrontCountryCode();

    const response = await confirmTransactionWithPolicy({
      transaction,
      appAccountToken: transaction.appAccountToken || appAccountToken,
      storefrontCountryCode,
      strict: true,
    });

    if (!response) {
      throw new Error('Не удалось подтвердить покупку');
    }

    return response;
  };

  const restorePurchases = async (): Promise<AppleIapConfirmResponse> => {
    if (!isNativeIos()) {
      throw new Error('Apple IAP доступен только на native iOS');
    }

    if (!auth.isLoggedIn) {
      throw new Error('Нужна авторизация для восстановления покупок');
    }

    await ensureUpdatesListenerInstalled();

    const response = await AppleIap.restore();
    const transactions = Array.isArray(response?.transactions)
      ? response.transactions
          .map((item) => normalizeNativeTransaction(item))
          .filter(Boolean) as NativeAppleTransaction[]
      : [];

    if (!transactions.length) {
      return {
        status: 'none',
        planId: null,
        billingPeriod: null,
        expiresAt: null,
        environment: 'production',
      };
    }

    const appAccountToken = resolveAppAccountToken(auth.user?.id);
    const storefrontCountryCode = await getIosStorefrontCountryCode();
    let latestResponse: AppleIapConfirmResponse | null = null;

    for (const transaction of transactions) {
      const result = await confirmTransactionWithPolicy({
        transaction,
        appAccountToken: transaction.appAccountToken || appAccountToken,
        storefrontCountryCode,
        strict: false,
      });

      if (result) {
        latestResponse = pickBestResponse(latestResponse, result);
      }
    }

    if (latestResponse) {
      return latestResponse;
    }

    throw new Error(
      'Транзакции найдены, но подтверждение на сервере не прошло. Попробуйте позже.'
    );
  };

  const syncReceipt = async (): Promise<AppleIapConfirmResponse | null> => {
    if (!isNativeIos()) return null;
    if (!auth.isLoggedIn) return null;

    await ensureUpdatesListenerInstalled();

    const response = await AppleIap.getCurrentEntitlements();
    const transactions = Array.isArray(response?.transactions)
      ? response.transactions
          .map((item) => normalizeNativeTransaction(item))
          .filter(Boolean) as NativeAppleTransaction[]
      : [];

    const appAccountToken = resolveAppAccountToken(auth.user?.id);
    const storefrontCountryCode = await getIosStorefrontCountryCode();
    let latestResponse: AppleIapConfirmResponse | null = null;

    for (const transaction of transactions) {
      const result = await confirmTransactionWithPolicy({
        transaction,
        appAccountToken: transaction.appAccountToken || appAccountToken,
        storefrontCountryCode,
        strict: false,
      });

      if (result) {
        latestResponse = pickBestResponse(latestResponse, result);
      }
    }

    const queuedResult = await drainPendingConfirmQueue();
    if (queuedResult) {
      latestResponse = pickBestResponse(latestResponse, queuedResult);
    }

    return latestResponse;
  };

  const openManageSubscriptions = async (): Promise<void> => {
    if (!isNativeIos()) {
      throw new Error('Apple IAP доступен только на native iOS');
    }

    await AppleIap.showManageSubscriptions();
  };

  // Запускаем очередь подтверждений при первом использовании composable.
  void drainPendingConfirmQueue();

  return {
    available,
    products,
    loadingProducts,
    loadProducts,
    purchase,
    restorePurchases,
    syncReceipt,
    openManageSubscriptions,
  };
}
