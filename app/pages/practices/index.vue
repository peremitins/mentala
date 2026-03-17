<template>
  <div class="relative h-full overflow-y-auto space-y-2 pb-[100px]">
    <PageHeader title="Практики" />

    <div class="grid gap-2 grid-cols-1 xxs:grid-cols-2">
      <NuxtLink
        to="/quick-help"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.1s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-400/35 via-red-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-orange-500/25 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <IconHeartPulse class="h-5 w-5 text-foreground" />
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Быстрая помощь
            </h2>
            <p class="text-sm text-foreground/80">
              Короткие техники для тревоги и напряжения
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        v-if="meditationsAccess.available"
        to="/meditations"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.05s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">🧘‍♀️</span>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">Медитации</h2>
            <p class="text-sm text-foreground/80">
              Музыка и звуки для отдыха и концентрации
            </p>
          </div>
        </div>
      </NuxtLink>

      <button
        v-else
        type="button"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up text-left"
        style="animation-delay: 0.05s; animation-fill-mode: both"
        @click="openPaywall('meditations.library.full')"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>
        <div
          class="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/30 text-sm leading-none"
        >
          <span aria-hidden="true">{{
            getPlanBadgeEmoji(meditationsAccess.requiredPlan)
          }}</span>
        </div>
        <div class="relative z-10 space-y-3">
          <span class="text-3xl">🧘‍♀️</span>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">Медитации</h2>
            <p class="text-sm text-foreground/80">
              {{
                getLockedFeatureLabel(
                  'meditations',
                  meditationsAccess.requiredPlan
                )
              }}
            </p>
          </div>
        </div>
      </button>

      <NuxtLink
        to="/breath-practices"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb tile-orb--slow absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">🌬️</span>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Дыхательные практики
            </h2>
            <p class="text-sm text-foreground/80">
              Готовые практики + настройка под себя
            </p>
          </div>
        </div>
      </NuxtLink>

      <NuxtLink
        v-if="gratitudeDiaryAccess.available"
        to="/practices/gratitude-diary"
        class="glass-deep p-5 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.15s; animation-fill-mode: both"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">📔</span>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Дневник благодарности
            </h2>
            <p class="text-sm text-foreground/80">
              Короткие записи, промпты и streak для ежедневной опоры
            </p>
          </div>
        </div>
      </NuxtLink>

      <button
        v-else
        type="button"
        class="glass-deep p-5 group relative overflow-hidden text-left transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.15s; animation-fill-mode: both"
        @click="openPaywall('gratitude.diary.full')"
      >
        <div
          class="pointer-events-none absolute inset-0 transition group-hover:opacity-100"
        >
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>
        <div
          class="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/30 text-sm leading-none"
        >
          <span aria-hidden="true">{{
            getPlanBadgeEmoji(gratitudeDiaryAccess.requiredPlan)
          }}</span>
        </div>

        <div class="relative z-10 space-y-3">
          <span class="text-3xl">📔</span>
          <div class="space-y-1">
            <h2 class="text-lg font-semibold text-foreground">
              Дневник благодарности
            </h2>
            <p class="text-sm text-foreground/80">
              {{
                getLockedFeatureLabel(
                  'gratitude',
                  gratitudeDiaryAccess.requiredPlan
                )
              }}
            </p>
          </div>
        </div>
      </button>
    </div>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import IconHeartPulse from '~icons/lucide/heart-pulse';
import PageHeader from '@/app/components/PageHeader.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { getLocalizedRequiredPlanLabel } from '@/app/utils/planI18n';

const { getFeatureAccess } = useEntitlements();
const { t } = useI18n();

const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

const meditationsAccess = computed(() =>
  getFeatureAccess('meditations.library.full')
);
const gratitudeDiaryAccess = computed(() =>
  getFeatureAccess('gratitude.diary.full')
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

function getLockedFeatureLabel(
  type: 'meditations' | 'gratitude',
  plan: string
) {
  const plans = getLocalizedRequiredPlanLabel(plan, t);

  return type === 'meditations'
    ? t('PLANS.MEDITATIONS_LIBRARY_UNLOCK', { plans })
    : t('PLANS.GRATITUDE_DIARY_UNLOCK', { plans });
}
</script>

<style scoped>
@keyframes floaty {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -10px, 0);
  }
}

.tile-orb {
  animation: floaty 10s ease-in-out infinite;
}

.tile-orb--delay {
  animation-delay: -4s;
}

.tile-orb--slow {
  animation-duration: 14s;
}
</style>
