<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2 rounded-lg">
    <PageHeader
      title="Промокоды и Referral"
      :show-back-button="true"
      @go-back="goBack"
    />

    <section class="space-y-2">
      <div class="glass-deep rounded-xl border border-border/70 p-4 space-y-2">
        <p class="text-sm font-semibold text-foreground">
          Когда использовать какой тип
        </p>
        <p class="text-xs text-foreground/70">
          `free_access_days` — компенсация доступа или точечный подарок.
        </p>
        <p class="text-xs text-foreground/70">
          `next_payment_percent_discount` — скидка на ближайший платёж.
        </p>
        <p class="text-xs text-foreground/70">
          `referral` — органический рост, а не ручные компенсации.
        </p>
      </div>

      <Tabs default-value="codes" class="space-y-2">
        <TabsList class="grid w-full grid-cols-2">
          <TabsTrigger value="codes">Промокоды</TabsTrigger>
          <TabsTrigger value="referral">Referral</TabsTrigger>
        </TabsList>

        <TabsContent value="codes" class="space-y-2">
          <div
            class="glass-deep rounded-xl border border-border/70 p-4 space-y-4"
          >
            <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div class="flex-1 space-y-1">
                <label class="text-xs text-foreground/70">Поиск</label>
                <Input
                  v-model="filters.search"
                  placeholder="Код, email или ID пользователя"
                  class="bg-white/5"
                />
              </div>
              <div class="grid gap-3 sm:grid-cols-2 lg:w-[320px]">
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70">Статус</label>
                  <select
                    v-model="filters.status"
                    class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                  >
                    <option value="">Все</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="consumed">consumed</option>
                    <option value="revoked">revoked</option>
                  </select>
                </div>
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70">Тип</label>
                  <select
                    v-model="filters.type"
                    class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                  >
                    <option value="">Все</option>
                    <option value="free_access_days">free_access_days</option>
                    <option value="next_payment_percent_discount">
                      next_payment_percent_discount
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <div class="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
              <div class="space-y-3">
                <div
                  class="sticky top-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold text-foreground">
                        {{
                          form.id ? 'Редактирование кампании' : 'Создать код'
                        }}
                      </p>
                      <p class="text-xs text-foreground/65">
                        Сразу видно, как это увидит пользователь.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" @click="resetForm">
                      Новый
                    </Button>
                  </div>

                  <div class="space-y-3">
                    <div class="space-y-1">
                      <div class="flex items-center justify-between gap-3">
                        <label class="text-xs text-foreground/70">Код</label>
                        <div class="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            :disabled="generatingCode"
                            @click="handleGenerateCode"
                          >
                            {{
                              generatingCode
                                ? 'Генерируем…'
                                : 'Сгенерировать код'
                            }}
                          </Button>
                        </div>
                      </div>
                      <Input
                        v-model="form.code"
                        class="bg-white/5 uppercase"
                        @input="handleCodeInput"
                      />
                      <p
                        v-if="codeAvailability.message"
                        class="text-[11px]"
                        :class="
                          codeAvailability.available
                            ? 'text-emerald-300'
                            : 'text-amber-300'
                        "
                      >
                        {{ codeAvailability.message }}
                      </p>
                    </div>

                    <div class="grid gap-3 sm:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-xs text-foreground/70">Тип</label>
                        <select
                          v-model="form.campaignType"
                          class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                        >
                          <option value="free_access_days">
                            free_access_days
                          </option>
                          <option value="next_payment_percent_discount">
                            next_payment_percent_discount
                          </option>
                        </select>
                      </div>
                      <div class="space-y-1">
                        <label class="text-xs text-foreground/70"
                          >Binding</label
                        >
                        <select
                          v-model="form.bindingMode"
                          class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                        >
                          <option value="none">none</option>
                          <option value="user_id">user_id</option>
                          <option value="email">email</option>
                        </select>
                      </div>
                    </div>

                    <div
                      v-if="form.bindingMode === 'user_id'"
                      class="space-y-1"
                    >
                      <label class="text-xs text-foreground/70"
                        >Target user ID</label
                      >
                      <Input
                        v-model="form.targetUserId"
                        type="number"
                        class="bg-white/5"
                      />
                    </div>

                    <div v-if="form.bindingMode === 'email'" class="space-y-1">
                      <label class="text-xs text-foreground/70"
                        >Target email</label
                      >
                      <Input
                        v-model="form.targetEmail"
                        type="email"
                        class="bg-white/5"
                      />
                    </div>

                    <template v-if="form.campaignType === 'free_access_days'">
                      <div class="grid gap-3 sm:grid-cols-2">
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70">Дней</label>
                          <Input
                            v-model="form.durationDays"
                            type="number"
                            min="1"
                            class="bg-white/5"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70"
                            >Plan mode</label
                          >
                          <select
                            v-model="form.planMode"
                            class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                          >
                            <option value="auto">auto</option>
                            <option value="explicit">explicit</option>
                          </select>
                        </div>
                      </div>

                      <div
                        v-if="form.planMode === 'explicit'"
                        class="space-y-1"
                      >
                        <label class="text-xs text-foreground/70"
                          >Выдать план</label
                        >
                        <select
                          v-model="form.explicitPlanId"
                          class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                        >
                          <option value="pro">PRO</option>
                          <option value="premium">Premium</option>
                        </select>
                      </div>
                    </template>

                    <template v-else>
                      <div class="grid gap-3 sm:grid-cols-2">
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70"
                            >Скидка %</label
                          >
                          <Input
                            v-model="form.percent"
                            type="number"
                            min="1"
                            max="100"
                            class="bg-white/5"
                          />
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70"
                            >Действует дней</label
                          >
                          <Input
                            v-model="form.expiresInDays"
                            type="number"
                            min="1"
                            class="bg-white/5"
                          />
                        </div>
                      </div>

                      <div class="grid gap-3 sm:grid-cols-2">
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70"
                            >Plan scope</label
                          >
                          <select
                            v-model="form.targetPlanScope"
                            class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                          >
                            <option value="any_paid">any_paid</option>
                            <option value="pro">pro</option>
                            <option value="premium">premium</option>
                          </select>
                        </div>
                        <div class="space-y-1">
                          <label class="text-xs text-foreground/70"
                            >Period scope</label
                          >
                          <select
                            v-model="form.targetPeriodScope"
                            class="h-10 w-full rounded-lg border border-border bg-white/5 px-3 text-sm text-foreground"
                          >
                            <option value="any">any</option>
                            <option value="month">month</option>
                            <option value="year">year</option>
                          </select>
                        </div>
                      </div>
                    </template>

                    <div class="grid gap-3 sm:grid-cols-2">
                      <div class="space-y-1">
                        <label class="text-xs text-foreground/70"
                          >Starts at</label
                        >
                        <Input
                          v-model="form.startsAt"
                          type="datetime-local"
                          class="bg-white/5"
                        />
                      </div>
                      <div class="space-y-1">
                        <label class="text-xs text-foreground/70"
                          >Ends at</label
                        >
                        <Input
                          v-model="form.endsAt"
                          type="datetime-local"
                          class="bg-white/5"
                        />
                      </div>
                    </div>

                    <div class="space-y-1">
                      <label class="text-xs text-foreground/70"
                        >Комментарий</label
                      >
                      <textarea
                        v-model="form.adminComment"
                        rows="3"
                        class="w-full rounded-lg border border-border bg-white/5 px-3 py-2 text-sm text-foreground outline-none"
                      />
                    </div>

                    <div
                      class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 space-y-2"
                    >
                      <p class="text-xs font-medium text-foreground/85">
                        Live preview
                      </p>
                      <p class="text-sm text-foreground">
                        {{ livePreviewTitle }}
                      </p>
                      <p class="text-xs text-foreground/75">
                        {{ livePreviewDescription }}
                      </p>
                    </div>

                    <div class="flex gap-2">
                      <Button :disabled="saving" @click="handleSaveCampaign">
                        {{
                          saving
                            ? 'Сохраняем…'
                            : form.id
                              ? 'Сохранить'
                              : 'Создать'
                        }}
                      </Button>
                      <Button variant="outline" @click="resetForm">
                        Сбросить
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div
                  v-for="campaign in filteredCampaigns"
                  :key="campaign.id"
                  class="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
                >
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <p class="text-sm font-semibold text-foreground">
                          {{ campaign.code }}
                        </p>
                        <Badge variant="outline">{{ campaign.status }}</Badge>
                      </div>
                      <p class="text-xs text-foreground/70">
                        {{ campaign.campaignType }}
                      </p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        @click="fillFormFromCampaign(campaign)"
                      >
                        Редактировать
                      </Button>
                      <Button
                        v-if="campaign.status !== 'paused'"
                        variant="outline"
                        size="sm"
                        @click="changeCampaignState(campaign.id, 'pause')"
                      >
                        Пауза
                      </Button>
                      <Button
                        v-if="campaign.status === 'paused'"
                        variant="outline"
                        size="sm"
                        @click="changeCampaignState(campaign.id, 'activate')"
                      >
                        Активировать
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        @click="changeCampaignState(campaign.id, 'revoke')"
                      >
                        Отозвать
                      </Button>
                    </div>
                  </div>

                  <div
                    class="grid gap-2 text-xs text-foreground/70 sm:grid-cols-2"
                  >
                    <p>Binding: {{ campaign.bindingMode }}</p>
                    <p>
                      Цель:
                      {{
                        campaign.targetEmail ||
                        campaign.targetUserId ||
                        'unbound'
                      }}
                    </p>
                    <p>
                      Создан:
                      {{ formatDateTime(campaign.createdAt) }}
                    </p>
                    <p>
                      Использован:
                      {{
                        campaign.consumedAt
                          ? formatDateTime(campaign.consumedAt)
                          : 'ещё нет'
                      }}
                    </p>
                  </div>

                  <p class="text-sm text-foreground/85">
                    {{ buildCampaignSummary(campaign) }}
                  </p>
                </div>

                <div
                  v-if="!filteredCampaigns.length"
                  class="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-foreground/60"
                >
                  По текущим фильтрам кампаний нет.
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="referral" class="space-y-2">
          <div class="grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
            <div
              class="glass-deep rounded-xl border border-border/70 p-4 space-y-4"
            >
              <div class="space-y-1">
                <p class="text-sm font-semibold text-foreground">
                  Настройки программы
                </p>
                <p class="text-xs text-foreground/70">
                  Меняйте скидку invitee и hold-период перед начислением billing
                  credit referrer.
                </p>
              </div>

              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-foreground">Включено</p>
                  <p class="text-xs text-foreground/65">
                    Если выключить, новые redeem будут запрещены.
                  </p>
                </div>
                <Switch v-model:checked="referralForm.enabled" />
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70">Invitee %</label>
                  <Input
                    v-model="referralForm.inviteePercent"
                    type="number"
                    min="1"
                    max="100"
                    class="bg-white/5"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70">Referrer %</label>
                  <Input
                    v-model="referralForm.referrerPercent"
                    type="number"
                    min="1"
                    max="100"
                    class="bg-white/5"
                  />
                </div>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70"
                    >Invitee validity</label
                  >
                  <Input
                    v-model="referralForm.inviteeRewardValidityDays"
                    type="number"
                    min="1"
                    class="bg-white/5"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-xs text-foreground/70">Hold days</label>
                  <Input
                    v-model="referralForm.creditHoldDays"
                    type="number"
                    min="0"
                    class="bg-white/5"
                  />
                </div>
              </div>

              <p class="text-xs text-foreground/65">
                `Referrer %` считается от первой успешной оплаты invitee и
                зачисляется в `billingCredit` после hold-периода.
              </p>

              <div class="flex gap-2">
                <Button :disabled="savingReferral" @click="saveReferralProgram">
                  {{ savingReferral ? 'Сохраняем…' : 'Сохранить настройки' }}
                </Button>
              </div>
            </div>

            <div
              class="glass-deep rounded-xl border border-border/70 p-4 space-y-3"
            >
              <div class="space-y-1">
                <p class="text-sm font-semibold text-foreground">
                  Последние referral-redemptions
                </p>
                <p class="text-xs text-foreground/70">
                  Здесь видно, кто уже пригласил друга и где награду пришлось
                  отозвать.
                </p>
              </div>

              <div
                v-for="redemption in referrals"
                :key="redemption.id"
                class="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-foreground">
                        {{ redemption.code }}
                      </p>
                      <Badge variant="outline">{{ redemption.status }}</Badge>
                    </div>
                    <p class="text-xs text-foreground/70">
                      referrer #{{ redemption.referrerUserId }} · invitee #{{
                        redemption.inviteeUserId
                      }}
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    @click="revokeReferralReward(redemption.id)"
                  >
                    Отозвать награды
                  </Button>
                </div>

                <div
                  class="grid gap-2 text-xs text-foreground/70 sm:grid-cols-2"
                >
                  <p>Redeemed: {{ formatDateTime(redemption.redeemedAt) }}</p>
                  <p>
                    Converted:
                    {{
                      redemption.convertedAt
                        ? formatDateTime(redemption.convertedAt)
                        : 'ещё нет'
                    }}
                  </p>
                  <p>
                    Invitee grant: {{ redemption.inviteeRewardGrantId || '—' }}
                  </p>
                  <p>
                    Referrer credit:
                    {{
                      redemption.referrerCreditAmount
                        ? `${Number(redemption.referrerCreditAmount).toFixed(2)} ₽`
                        : '—'
                    }}
                  </p>
                  <p>
                    Credit available:
                    {{
                      redemption.referrerCreditAvailableAt
                        ? formatDateTime(redemption.referrerCreditAvailableAt)
                        : '—'
                    }}
                  </p>
                </div>
              </div>

              <div
                v-if="!referrals.length"
                class="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-foreground/60"
              >
                Пока нет referral-redemptions.
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
});

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import { Badge } from '@/app/components/ui/shadcn/badge';
import { Switch } from '@/app/components/ui/shadcn/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';

type Campaign = any;
type ReferralRedemption = any;

const router = useRouter();
const campaigns = ref<Campaign[]>([]);
const referrals = ref<ReferralRedemption[]>([]);
const saving = ref(false);
const savingReferral = ref(false);
const generatingCode = ref(false);
const filters = reactive({
  search: '',
  status: '',
  type: '',
});
const codeAvailability = reactive({
  checking: false,
  available: false,
  message: '',
});
let codeAvailabilityTimer: ReturnType<typeof setTimeout> | null = null;

const form = reactive({
  id: null as number | null,
  code: '',
  campaignType: 'free_access_days',
  bindingMode: 'none',
  targetUserId: '',
  targetEmail: '',
  durationDays: 7,
  planMode: 'auto',
  explicitPlanId: 'premium',
  percent: 20,
  targetPlanScope: 'any_paid',
  targetPeriodScope: 'any',
  expiresInDays: 90,
  startsAt: '',
  endsAt: '',
  adminComment: '',
});

const referralForm = reactive({
  enabled: true,
  inviteePercent: 20,
  referrerPercent: 20,
  inviteeRewardValidityDays: 30,
  creditHoldDays: 1,
});

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

function setCodeAvailability(params: {
  available: boolean;
  message: string;
  checking?: boolean;
}) {
  codeAvailability.available = params.available;
  codeAvailability.message = params.message;
  codeAvailability.checking = params.checking ?? false;
}

function toDatetimeLocal(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';

  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildCampaignSummary(campaign: Campaign) {
  if (campaign.campaignType === 'free_access_days') {
    const duration = campaign.benefitPayload?.durationDays || '—';
    const explicitPlanId = campaign.benefitPayload?.explicitPlanId;
    const planMode = campaign.benefitPayload?.planMode || 'auto';
    return planMode === 'explicit'
      ? `${duration} дн. доступа к ${explicitPlanId === 'premium' ? 'Premium' : 'PRO'}`
      : `${duration} дн. на текущий платный тариф пользователя`;
  }

  return `${campaign.benefitPayload?.percent || '—'}% на ближайший платёж`;
}

const livePreviewTitle = computed(() => {
  if (form.campaignType === 'free_access_days') {
    return form.planMode === 'explicit'
      ? `Бесплатный доступ к ${form.explicitPlanId === 'premium' ? 'Premium' : 'PRO'}`
      : 'Продление текущего платного доступа';
  }

  return `Скидка ${form.percent}% на ближайший платёж`;
});

const livePreviewDescription = computed(() => {
  if (form.campaignType === 'free_access_days') {
    return form.planMode === 'explicit'
      ? `Пользователь получит ${form.durationDays} дн. доступа и увидит новый effective plan сразу после redeem.`
      : `Код продлит текущую платную границу на ${form.durationDays} дн. без сгорания уже оплаченного периода.`;
  }

  return `Скидка применится к ближайшему qualifying payment и не будет стаκаться с другой процентной скидкой.`;
});

const filteredCampaigns = computed(() => {
  return campaigns.value.filter((campaign) => {
    const matchesSearch = filters.search
      ? JSON.stringify(campaign)
          .toLowerCase()
          .includes(filters.search.trim().toLowerCase())
      : true;
    const matchesStatus = filters.status
      ? campaign.status === filters.status
      : true;
    const matchesType = filters.type
      ? campaign.campaignType === filters.type
      : true;

    return matchesSearch && matchesStatus && matchesType;
  });
});

async function goBack() {
  // Для прямого входа на админ-страницу нужен fallback, иначе history.back()
  // может оставить пользователя на пустом экране или вообще ничего не сделать.
  if (window.history.length > 1) {
    await router.back();
    return;
  }

  await navigateTo('/settings');
}

function buildCampaignPayload() {
  if (form.campaignType === 'free_access_days') {
    return {
      code: normalizeCode(form.code),
      campaignType: form.campaignType,
      bindingMode: form.bindingMode,
      targetUserId:
        form.bindingMode === 'user_id' && form.targetUserId
          ? Number(form.targetUserId)
          : null,
      targetEmail:
        form.bindingMode === 'email' && form.targetEmail
          ? form.targetEmail.trim()
          : null,
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      adminComment: form.adminComment || null,
      benefitPayload: {
        campaignType: 'free_access_days',
        durationDays: Number(form.durationDays),
        planMode: form.planMode,
        explicitPlanId:
          form.planMode === 'explicit' ? form.explicitPlanId : undefined,
      },
    };
  }

  return {
    code: normalizeCode(form.code),
    campaignType: form.campaignType,
    bindingMode: form.bindingMode,
    targetUserId:
      form.bindingMode === 'user_id' && form.targetUserId
        ? Number(form.targetUserId)
        : null,
    targetEmail:
      form.bindingMode === 'email' && form.targetEmail
        ? form.targetEmail.trim()
        : null,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    adminComment: form.adminComment || null,
    benefitPayload: {
      campaignType: 'next_payment_percent_discount',
      percent: Number(form.percent),
      targetPlanScope: form.targetPlanScope,
      targetPeriodScope: form.targetPeriodScope,
      expiresInDays: Number(form.expiresInDays),
    },
  };
}

async function validateCodeUniqueness() {
  const normalizedCode = normalizeCode(form.code);
  form.code = normalizedCode;
  if (!normalizedCode) {
    setCodeAvailability({
      available: false,
      message: '',
      checking: false,
    });
    return false;
  }

  codeAvailability.checking = true;

  try {
    const response = await useAPI<{
      available: boolean;
      conflictType: 'promo_campaign' | 'referral_profile' | null;
    }>('/api/admin/promo-codes/check-unique', {
      method: 'GET',
      query: {
        code: normalizedCode,
        excludeId: form.id || undefined,
      },
    });

    setCodeAvailability({
      available: Boolean(response.available),
      message: response.available
        ? 'Код свободен и может быть использован.'
        : response.conflictType === 'referral_profile'
          ? 'Код уже занят реферальной программой.'
          : 'Код уже занят другим промокодом.',
    });

    return Boolean(response.available);
  } catch {
    setCodeAvailability({
      available: false,
      message: 'Не удалось проверить уникальность кода.',
    });
    return false;
  } finally {
    codeAvailability.checking = false;
  }
}

function handleCodeInput() {
  form.code = normalizeCode(form.code);
}

async function handleGenerateCode() {
  generatingCode.value = true;

  try {
    const response = await useAPI<{ code: string }>(
      '/api/admin/promo-codes/generate',
      {
        method: 'POST',
      }
    );
    form.code = normalizeCode(response.code);
    await validateCodeUniqueness();
  } catch (error: any) {
    useToast(
      'Ошибка',
      error?.data?.statusMessage ||
        error?.message ||
        'Не удалось сгенерировать код',
      'error'
    );
  } finally {
    generatingCode.value = false;
  }
}

function fillFormFromCampaign(campaign: Campaign) {
  form.id = campaign.id;
  form.code = campaign.code;
  form.campaignType = campaign.campaignType;
  form.bindingMode = campaign.bindingMode;
  form.targetUserId = campaign.targetUserId
    ? String(campaign.targetUserId)
    : '';
  form.targetEmail = campaign.targetEmail || '';
  form.startsAt = toDatetimeLocal(campaign.startsAt);
  form.endsAt = toDatetimeLocal(campaign.endsAt);
  form.adminComment = campaign.adminComment || '';

  if (campaign.campaignType === 'free_access_days') {
    form.durationDays = Number(campaign.benefitPayload?.durationDays || 7);
    form.planMode = campaign.benefitPayload?.planMode || 'auto';
    form.explicitPlanId = campaign.benefitPayload?.explicitPlanId || 'premium';
  } else {
    form.percent = Number(campaign.benefitPayload?.percent || 20);
    form.targetPlanScope =
      campaign.benefitPayload?.targetPlanScope || 'any_paid';
    form.targetPeriodScope =
      campaign.benefitPayload?.targetPeriodScope || 'any';
    form.expiresInDays = Number(campaign.benefitPayload?.expiresInDays || 90);
  }
}

function resetForm() {
  form.id = null;
  form.code = '';
  form.campaignType = 'free_access_days';
  form.bindingMode = 'none';
  form.targetUserId = '';
  form.targetEmail = '';
  form.durationDays = 7;
  form.planMode = 'auto';
  form.explicitPlanId = 'premium';
  form.percent = 20;
  form.targetPlanScope = 'any_paid';
  form.targetPeriodScope = 'any';
  form.expiresInDays = 90;
  form.startsAt = '';
  form.endsAt = '';
  form.adminComment = '';
  setCodeAvailability({
    available: false,
    message: '',
    checking: false,
  });
}

async function loadCampaigns() {
  const response = await useAPI<{ campaigns: Campaign[] }>(
    '/api/admin/promo-codes',
    {
      method: 'GET',
    }
  );
  campaigns.value = response.campaigns || [];
}

async function loadReferralData() {
  const [programResponse, redemptionsResponse] = await Promise.all([
    useAPI<any>('/api/admin/referral-program', {
      method: 'GET',
    }),
    useAPI<any>('/api/admin/referrals', {
      method: 'GET',
    }),
  ]);

  referralForm.enabled = Boolean(programResponse.enabled);
  referralForm.inviteePercent = Number(programResponse.inviteePercent);
  referralForm.referrerPercent = Number(programResponse.referrerPercent);
  referralForm.inviteeRewardValidityDays = Number(
    programResponse.inviteeRewardValidityDays
  );
  referralForm.creditHoldDays = Number(programResponse.creditHoldDays ?? 1);
  referrals.value = redemptionsResponse.redemptions || [];
}

async function handleSaveCampaign() {
  saving.value = true;

  try {
    const isCodeAvailable = await validateCodeUniqueness();
    if (!isCodeAvailable) {
      useToast(
        'Код недоступен',
        codeAvailability.message || 'Выберите другой код.',
        'warning'
      );
      return;
    }

    const payload = buildCampaignPayload();
    if (form.id) {
      await useAPI(`/api/admin/promo-codes/${form.id}`, {
        method: 'PATCH',
        body: payload,
      });
      useToast('Кампания обновлена', 'Изменения сохранены.', 'success');
    } else {
      await useAPI('/api/admin/promo-codes', {
        method: 'POST',
        body: payload,
      });
      useToast(
        'Кампания создана',
        'Промокод готов к использованию.',
        'success'
      );
    }

    resetForm();
    await loadCampaigns();
  } catch (error: any) {
    useToast(
      'Ошибка',
      error?.data?.statusMessage ||
        error?.message ||
        'Не удалось сохранить кампанию',
      'error'
    );
  } finally {
    saving.value = false;
  }
}

async function changeCampaignState(
  id: number,
  action: 'pause' | 'activate' | 'revoke'
) {
  try {
    await useAPI(`/api/admin/promo-codes/${id}/${action}`, {
      method: 'POST',
    });
    await loadCampaigns();
  } catch (error: any) {
    useToast(
      'Ошибка',
      error?.data?.statusMessage ||
        error?.message ||
        'Не удалось обновить статус',
      'error'
    );
  }
}

async function saveReferralProgram() {
  savingReferral.value = true;

  try {
    await useAPI('/api/admin/referral-program', {
      method: 'PATCH',
      body: {
        enabled: referralForm.enabled,
        inviteePercent: Number(referralForm.inviteePercent),
        referrerPercent: Number(referralForm.referrerPercent),
        inviteeRewardValidityDays: Number(
          referralForm.inviteeRewardValidityDays
        ),
        creditHoldDays: Number(referralForm.creditHoldDays),
      },
    });

    useToast('Referral обновлён', 'Новые условия сохранены.', 'success');
    await loadReferralData();
  } catch (error: any) {
    useToast(
      'Ошибка',
      error?.data?.statusMessage ||
        error?.message ||
        'Не удалось сохранить referral settings',
      'error'
    );
  } finally {
    savingReferral.value = false;
  }
}

async function revokeReferralReward(id: number) {
  try {
    await useAPI(`/api/admin/referrals/${id}/revoke-reward`, {
      method: 'POST',
    });
    useToast('Награды отозваны', 'Состояние referral обновлено.', 'success');
    await loadReferralData();
  } catch (error: any) {
    useToast(
      'Ошибка',
      error?.data?.statusMessage ||
        error?.message ||
        'Не удалось отозвать награду',
      'error'
    );
  }
}

onMounted(async () => {
  await Promise.all([loadCampaigns(), loadReferralData()]);
});

watch(
  () => form.code,
  () => {
    if (codeAvailabilityTimer) {
      clearTimeout(codeAvailabilityTimer);
    }

    if (!form.code) {
      setCodeAvailability({
        available: false,
        message: '',
        checking: false,
      });
      return;
    }

    codeAvailabilityTimer = setTimeout(() => {
      void validateCodeUniqueness();
    }, 250);
  }
);
</script>
