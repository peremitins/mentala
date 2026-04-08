<template>
  <section class="space-y-3">
    <ReferralSummaryCard
      v-if="loading || summary"
      :loading="loading"
      :summary="summary"
      @copy="handleCopyCode"
      @share="handleShareCode"
    />

    <div v-if="summary" class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="glass-deep rounded-xl border border-border/70 p-4">
          <p class="text-xs text-foreground/60">Успешных приглашений</p>
          <p class="mt-1 text-xl font-semibold text-foreground">
            {{ summary.successfulInvitesCount }}
          </p>
        </div>
        <div class="glass-deep rounded-xl border border-border/70 p-4">
          <p class="text-xs text-foreground/60">Ожидающих начислений</p>
          <p class="mt-1 text-xl font-semibold text-foreground">
            {{ summary.pendingRewardsCount }}
          </p>
        </div>
      </div>

      <div
        v-if="summary.pendingCredits?.length"
        class="glass-deep rounded-xl border border-border/70 p-4 space-y-2"
      >
        <p class="text-sm font-medium text-foreground">Ожидающие начисления</p>
        <div
          v-for="credit in summary.pendingCredits"
          :key="credit.id"
          class="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-foreground/80"
        >
          {{ formatAmount(credit.amount) }} до
          {{ formatDate(credit.availableAt) }}
        </div>
      </div>

      <div class="glass-deep rounded-xl border border-border/70 p-4">
        <p class="text-xs text-foreground/60">Бонусный счёт</p>
        <p class="mt-1 text-xl font-semibold text-foreground">
          {{ formatAmount(summary.availableBillingCredit) }}
        </p>
      </div>

      <div class="glass-deep rounded-xl border border-border/70 p-4">
        <p class="text-xs text-foreground/80">Как это работает</p>
        <ol class="mt-2 space-y-2 text-xs text-foreground/70">
          <li>1. Поделитесь личным кодом.</li>
          <li>2. Друг активирует его до первой платной подписки.</li>
          <li>3. Друг получает скидку на следующий платёж.</li>
          <li>
            4. После его первой успешной оплаты пополнится ваш бонусный счёт.
          </li>
        </ol>
      </div>
    </div>

    <div
      v-else-if="!loading"
      class="glass-deep rounded-xl border border-border/70 p-4 space-y-3"
    >
      <div class="space-y-1">
        <p class="text-sm font-semibold text-foreground">
          Не удалось загрузить реферальные данные
        </p>
        <p class="text-xs leading-relaxed text-foreground/70">
          Попробуйте открыть экран ещё раз или обновить страницу.
        </p>
      </div>

      <Button variant="outline" size="sm" @click="loadSummary">
        Обновить
      </Button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import ReferralSummaryCard from '@/app/components/subscription/ReferralSummaryCard.vue';
import {
  formatReferralAmount,
  formatReferralDate,
  useReferralSummary,
} from '@/app/composables/useReferralSummary';

const { loading, summary, loadSummary, handleCopyCode, handleShareCode } =
  useReferralSummary();
const formatDate = formatReferralDate;
const formatAmount = formatReferralAmount;
</script>
