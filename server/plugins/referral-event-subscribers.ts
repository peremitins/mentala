import { subscribeToAppEvent } from '@/server/application/events/app-events.dispatchers';
import { processReferralRewardsAfterPurchase } from '@/server/application/referral/referral-rewards.service';

type GlobalReferralSubscribersState = typeof globalThis & {
  __mentaiReferralAppEventSubscribersRegistered?: boolean;
};

export default defineNitroPlugin(() => {
  // Защита от повторной регистрации в HMR-режиме: при горячей замене Nitro
  // может загрузить плагин повторно, и без этой проверки на одно событие
  // навешивалось бы несколько одинаковых подписчиков.
  const globalScope = globalThis as GlobalReferralSubscribersState;
  if (globalScope.__mentaiReferralAppEventSubscribersRegistered) {
    return;
  }
  globalScope.__mentaiReferralAppEventSubscribersRegistered = true;

  subscribeToAppEvent('billing.purchase_success', async (payload) => {
    if (!payload.userId || !payload.planId) return;
    if (payload.planId !== 'pro' && payload.planId !== 'premium') return;

    try {
      await processReferralRewardsAfterPurchase({
        userId: payload.userId,
        paymentId: payload.paymentId,
        qualifyingCapturedAmount: Number(payload.amount || 0),
        now:
          payload.occurredAt instanceof Date ? payload.occurredAt : new Date(),
      });
    } catch (error) {
      console.error(
        `[Referral] Failed to process referral rewards for user ${payload.userId}:`,
        error
      );
    }
  });
});
