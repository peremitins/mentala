<template>
  <div class="relative h-full overflow-y-auto space-y-2 pb-[100px] rounded-lg">
    <!-- Шапка с брендовым логотипом -->
    <PageHeader title="Mentala">
      <template #custom>
        <div class="flex items-center px-4">
          <BrandLogo class="h-7 w-auto select-none" />
        </div>
      </template>
    </PageHeader>

    <!-- Верхний крупный блок: ИИ-чат -->
    <section
      class="glass-deep relative overflow-hidden p-5 animate-slide-up"
      style="animation-delay: 0s; animation-fill-mode: both"
    >
      <div class="pointer-events-none absolute inset-0">
        <div
          class="tile-orb absolute -right-20 -top-16 h-60 w-60 rounded-full bg-gradient-to-br from-violet-400/35 via-fuchsia-400/20 to-transparent blur-3xl"
        />
        <div
          class="tile-orb tile-orb--delay absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-gradient-to-br from-sky-500/30 via-indigo-500/20 to-transparent blur-3xl"
        />
      </div>

      <div class="relative z-10 space-y-4">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <div class="w-[60px]">
              <img
                src="../assets/images/ai_terapist.webp"
                loading="lazy"
                alt="icon AI-terapist"
              />
            </div>
            <h2 class="text-xl font-semibold text-foreground">ИИ-ассистент</h2>
          </div>
          <p class="text-sm text-foreground/80 leading-relaxed">
            Поделитесь тем, что у вас на душе. Ассистент выслушает, поможет
            разобраться в чувствах и подскажет следующий шаг.
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <NuxtLink
            to="/chat"
            class="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background transition hover:bg-foreground"
          >
            <IconSend class="h-4 w-4" />
            <span>{{ chatButtonLabel }}</span>
          </NuxtLink>

          <NuxtLink
            to="/session-summaries-user"
            :aria-label="sessionHistoryButtonAriaLabel"
            class="relative inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-white/30 hover:bg-white/10"
          >
            <UnreadSummaryIndicator
              v-if="hasUnseenSummary"
              class="pointer-events-none absolute right-[8px] top-[8px] z-10"
            />
            <IconBookOpen class="h-4 w-4" />
            <span>История сессий</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Сетка 2x2: Быстрая помощь / Медитации / Дыхательные / Дневник благодарности -->
    <div class="grid gap-2 grid-cols-2">
      <!-- Быстрая помощь -->
      <NuxtLink
        to="/quick-help"
        class="glass-deep p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.1s; animation-fill-mode: both"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-rose-400/35 via-red-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-orange-500/25 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>
        <div class="relative z-10">
          <!-- <IconHeartPulse class="h-5 w-5 text-foreground" /> -->
          <div class="w-[60px]">
            <img
              src="../assets/images/quick_help.webp"
              loading="lazy"
              alt="icon quick help"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">
              Быстрая помощь
            </h3>
            <p class="text-xs text-foreground/75">
              Короткие техники для снятия тревоги и напряжения
            </p>
          </div>
        </div>
      </NuxtLink>

      <!-- Дыхательные практики -->
      <NuxtLink
        to="/breath-practices"
        class="glass-deep p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.2s; animation-fill-mode: both"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb tile-orb--slow absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-400/40 via-sky-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-12 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-blue-500/30 via-indigo-500/20 to-transparent blur-2xl"
          />
        </div>
        <div class="relative z-10">
          <div class="w-[60px]">
            <img
              src="../assets/images/breath_practiсes.webp"
              loading="lazy"
              alt="icon breath practiсes"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">
              Дыхательные практики
            </h3>
            <p class="text-xs text-foreground/75">
              Готовые упражнения и индивидуальные настройки
            </p>
          </div>
        </div>
      </NuxtLink>

      <!-- Медитации -->
      <NuxtLink
        v-if="meditationsAccess.available"
        to="/meditations"
        class="glass-deep p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.15s; animation-fill-mode: both"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>
        <div class="relative z-10">
          <div class="w-[60px]">
            <img
              src="../assets/images/meditation.webp"
              loading="lazy"
              alt="icon meditation"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">Медитации</h3>
            <p class="text-xs text-foreground/75">
              Музыка и звуки для отдыха и концентрации
            </p>
          </div>
        </div>
      </NuxtLink>
      <button
        v-else
        type="button"
        class="glass-deep p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up text-left"
        style="animation-delay: 0.15s; animation-fill-mode: both"
        @click="openPaywall('meditations.library.full')"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb absolute -right-16 -bottom-8 h-44 w-44 rounded-full bg-gradient-to-br from-amber-400/35 via-rose-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-14 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-purple-500/25 via-fuchsia-500/20 to-transparent blur-2xl"
          />
        </div>
        <div
          class="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/30 text-sm leading-none"
        >
          <span aria-hidden="true">{{
            getPlanBadgeEmoji(meditationsAccess.requiredPlan)
          }}</span>
        </div>
        <div class="relative z-10">
          <div class="w-[60px]">
            <img
              src="../assets/images/meditation.webp"
              loading="lazy"
              alt="icon meditation"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">Медитации</h3>
            <p class="text-xs text-foreground/75">
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

      <!-- Дневник благодарности -->
      <NuxtLink
        v-if="gratitudeDiaryAccess.available"
        to="/practices/gratitude-diary"
        class="glass-deep p-4 group relative overflow-hidden transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.25s; animation-fill-mode: both"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>
        <div class="relative z-10">
          <div class="w-[60px]">
            <img
              src="../assets/images/gratitude_diary.webp"
              loading="lazy"
              alt="icon gratitude diary"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">
              Дневник благодарности
            </h3>
            <p class="text-xs text-foreground/75">
              Записывайте хорошие моменты дня с подсказками
            </p>
          </div>
        </div>
      </NuxtLink>
      <button
        v-else
        type="button"
        class="glass-deep p-4 group relative overflow-hidden text-left transition hover:-translate-y-1 animate-slide-up"
        style="animation-delay: 0.25s; animation-fill-mode: both"
        @click="openPaywall('gratitude.diary.full')"
      >
        <div class="pointer-events-none absolute inset-0">
          <div
            class="tile-orb absolute -right-14 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-fuchsia-400/35 via-pink-400/20 to-transparent blur-2xl"
          />
          <div
            class="tile-orb tile-orb--delay absolute -left-10 bottom-0 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/30 via-rose-500/20 to-transparent blur-2xl"
          />
        </div>
        <div
          class="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-black/30 text-sm leading-none"
        >
          <span aria-hidden="true">{{
            getPlanBadgeEmoji(gratitudeDiaryAccess.requiredPlan)
          }}</span>
        </div>
        <div class="relative z-10">
          <div class="w-[60px]">
            <img
              src="../assets/images/gratitude_diary.webp"
              loading="lazy"
              alt="icon gratitude diary"
            />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm font-semibold text-foreground">
              Дневник благодарности
            </h3>
            <p class="text-xs text-foreground/75">
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

    <!-- Paywall-модалка для карточек -->
    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />

    <!-- Модалка непросмотренного итога сессии -->
    <UnseenSummaryModal />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import IconSend from '~icons/lucide/send';
import IconBookOpen from '~icons/lucide/book-open';
import PageHeader from '@/app/components/PageHeader.vue';
import BrandLogo from '@/app/components/BrandLogo.vue';
import UnreadSummaryIndicator from '@/app/components/sessionSummaries/UnreadSummaryIndicator.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import UnseenSummaryModal from '@/app/components/sessionSummaries/UnseenSummaryModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useUnseenSessionSummary } from '@/app/composables/useUnseenSessionSummary';
import { getLocalizedRequiredPlanLabel } from '@/app/utils/planI18n';
import { useChatStore } from '@/app/stores/chat';

const { getFeatureAccess } = useEntitlements();
const { hasUnseenSummary, loadUnseenSummary } = useUnseenSessionSummary();
const { t } = useI18n();
const chat = useChatStore();

// Показываем "Продолжить" если в сторе есть сообщения (активная или недавняя сессия).
const chatButtonLabel = computed(() =>
  chat.messages.length > 0 ? 'Продолжить' : 'Начать'
);

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
const sessionHistoryButtonAriaLabel = computed(() =>
  hasUnseenSummary.value
    ? 'История сессий, есть новый непрочитанный итог сессии'
    : 'История сессий'
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

onMounted(() => {
  void loadUnseenSummary(true).catch(() => {});
});
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
