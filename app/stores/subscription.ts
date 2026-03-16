import { defineStore } from 'pinia';
import { useAPI } from '@/app/composables/useAPI';
import {
  buildUsageCacheContextKey,
  hasSubscriptionStateTransitionPassed,
} from '@/app/utils/subscription-cache';

interface Plan {
  id: string;
  name: string;
  basePrice: number;
  weeklyMinutesLimit: number;
  isVisibleInUI?: boolean;
}

interface Subscription {
  id: number;
  planId: string;
  startDate: string;
  endDate: string;
  paymentStatus: string;
  autoRenew?: boolean;
  billingPeriod?: 'month' | 'year';
  plan: {
    id: string;
    name: string;
    basePrice: number;
    weeklyMinutesLimit: number;
  };
}

interface SubscriptionResponse {
  plan: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  currentEntitlementsPlan?: 'basic' | 'pro' | 'premium';
  billingPlan?: 'pro' | 'premium' | null;
  billingPeriod?: 'month' | 'year' | null;
  nextChargeAt?: string | null;
  paymentMethodBound?: boolean;
  paymentMethod?: {
    id: string;
    type: string | null;
    title: string | null;
    cardBrand: string | null;
    last4: string | null;
    expiryMonth: string | null;
    expiryYear: string | null;
  } | null;
  billingCollectionStatus?: 'none' | 'scheduled' | 'past_due';
  graceEndsAt?: string | null;
  features: {
    ai: boolean;
    avatar: boolean;
    aiChatMode: 'disabled' | 'limited' | 'unlimited_fair_use';
    weeklyMinutesLimit: number | null;
    fairUseGuardMinutesPerWeek: number | null;
  };
  subscription: Subscription | null;
  noActiveSubscription: boolean;
  paymentStatus?: string;
  scheduledChange?: {
    planId: string;
    billingPeriod: 'month' | 'year';
    effectiveAt: string;
  } | null;
  user?: {
    billingCredit: number;
    hasUsedTrial: boolean;
    timezone: string;
  };
}

interface Usage {
  usedMinutes: number;
  weeklyLimit: number;
  overdraftUsed: number;
  availableMinutes: number;
}

export const useSubscriptionStore = defineStore('subscription', {
  state: () => ({
    plans: [] as Plan[],
    currentSubscription: null as Subscription | null,
    subscriptionData: null as SubscriptionResponse | null,
    usage: null as Usage | null,
    loading: {
      plans: false,
      subscription: false,
      usage: false,
    },
    lastFetched: {
      plans: null as number | null,
      subscription: null as number | null,
      usage: null as number | null,
    },
    // Кэш на 5 минут
    cacheTimeout: 5 * 60 * 1000, // 5 минут
  }),

  getters: {
    visiblePlans: (state) => {
      // Фильтруем планы (Basic всегда показывается)
      const filtered = state.plans.filter((p) => {
        if (p.name === 'basic') return true;
        return p.isVisibleInUI !== false;
      });

      // Сортируем по фиксированному порядку: Basic, Pro, Premium
      const order = ['basic', 'pro', 'premium'];
      const sorted = filtered.sort((a, b) => {
        const aIndex = order.indexOf(a.name);
        const bIndex = order.indexOf(b.name);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return 0;
      });

      return sorted;
    },

    trialActive: (state) => {
      return state.subscriptionData?.trialActive || false;
    },

    weeklyMinutesLimit: (state): number | null => {
      return state.subscriptionData?.features?.weeklyMinutesLimit ?? 0;
    },

    aiChatMode: (state): 'disabled' | 'limited' | 'unlimited_fair_use' => {
      return state.subscriptionData?.features?.aiChatMode || 'disabled';
    },
  },

  actions: {
    /**
     * Проверяет, нужно ли обновлять данные (прошло больше cacheTimeout)
     */
    shouldRefetch(key: 'plans' | 'subscription' | 'usage'): boolean {
      const lastFetched = this.lastFetched[key];
      if (!lastFetched) return true;

      // Для подписки и usage нельзя полагаться только на TTL:
      // часть переходов наступает ровно по времени (конец trial, scheduled apply).
      if (
        key !== 'plans' &&
        hasSubscriptionStateTransitionPassed(this.subscriptionData)
      ) {
        return true;
      }

      return Date.now() - lastFetched > this.cacheTimeout;
    },

    /**
     * Загружает планы подписок (с кэшированием)
     */
    async fetchPlans(force = false) {
      if (!force && !this.shouldRefetch('plans') && this.plans.length > 0) {
        return this.plans;
      }

      this.loading.plans = true;
      try {
        const response = await useAPI<{ plans: Plan[] }>(
          '/api/subscriptions/plans',
          {
            method: 'GET',
          }
        );

        const data = (response as any)?.data || response;
        this.plans = data.plans || [];
        this.lastFetched.plans = Date.now();
        return this.plans;
      } catch (error) {
        console.error('Failed to fetch plans:', error);
        throw error;
      } finally {
        this.loading.plans = false;
      }
    },

    /**
     * Загружает текущую подписку (с кэшированием)
     */
    async fetchCurrentSubscription(force = false) {
      if (
        !force &&
        !this.shouldRefetch('subscription') &&
        this.subscriptionData !== null
      ) {
        return this.subscriptionData;
      }

      this.loading.subscription = true;
      try {
        const previousUsageContextKey = buildUsageCacheContextKey(
          this.subscriptionData
        );
        const query = force ? { _ts: Date.now() } : undefined;
        const response = await useAPI<SubscriptionResponse>(
          '/api/subscriptions/current',
          {
            method: 'GET',
            query,
          }
        );

        const data = (response as any)?.data || response;
        this.subscriptionData = data;
        this.currentSubscription = data?.subscription || null;
        this.lastFetched.subscription = Date.now();

        const nextUsageContextKey = buildUsageCacheContextKey(data);
        if (previousUsageContextKey !== nextUsageContextKey) {
          // При смене access-period usage нужно запрашивать заново,
          // иначе фронт может показать минуты из предыдущего тарифа/trial.
          this.usage = null;
          this.lastFetched.usage = null;

          if (!this.loading.usage) {
            await this.fetchUsage(true).catch((error) => {
              console.warn(
                '[SubscriptionStore] Failed to refresh usage after subscription transition:',
                error
              );
            });
          }
        }

        return this.subscriptionData;
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
        throw error;
      } finally {
        this.loading.subscription = false;
      }
    },

    /**
     * Загружает использование минут (с кэшированием)
     */
    async fetchUsage(force = false) {
      if (!force && !this.shouldRefetch('usage') && this.usage !== null) {
        return this.usage;
      }

      this.loading.usage = true;
      try {
        const response = await useAPI<Usage>('/api/subscriptions/usage', {
          method: 'GET',
        });

        const data = (response as any)?.data || response;
        this.usage = data;
        this.lastFetched.usage = Date.now();
        return this.usage;
      } catch (error: any) {
        // Если ошибка 401 или 404 - это нормально
        if (error?.statusCode === 401 || error?.statusCode === 404) {
          this.usage = null;
          return null;
        }
        console.error('Failed to fetch usage:', error);
        throw error;
      } finally {
        this.loading.usage = false;
      }
    },

    /**
     * Сбрасывает кэш (например, после изменения подписки)
     */
    invalidateCache() {
      this.lastFetched.plans = null;
      this.lastFetched.subscription = null;
      this.lastFetched.usage = null;
    },

    /**
     * Обновляет данные подписки после изменений
     */
    async refreshSubscription() {
      this.invalidateCache();
      await Promise.all([
        this.fetchCurrentSubscription(true),
        this.fetchUsage(true),
      ]);
    },
  },
});
