<template>
  <!-- Полноразмерный геро-блок ИИ-ассистента. Раньше встречал пользователя на
       главном экране; по стратегии главного экрана (Вариант A) перенесён сюда,
       на «Практики», первым рядом. На главной остался компактный вход
       (HomeAssistantCompact). Размер/верстка совпадают с прежним hero-блоком. -->
  <section
    class="glass-deep relative overflow-hidden p-5 animate-slide-up cursor-pointer"
    style="animation-delay: 0s; animation-fill-mode: both"
    role="button"
    tabindex="0"
    :aria-label="
      chatAssistantAccess.available
        ? 'Открыть чат с ИИ-ассистентом'
        : 'Узнать о доступе к ИИ-ассистенту'
    "
    @click="handleHeroCardClick"
    @keydown.enter.prevent="handleHeroCardClick"
    @keydown.space.prevent="handleHeroCardClick"
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
              src="../../assets/images/ai_terapist.webp"
              loading="lazy"
              alt="icon AI-terapist"
            />
          </div>
          <h2 class="text-xl font-semibold text-foreground">ИИ-ассистент</h2>
        </div>
        <p class="text-sm text-foreground/80">
          Поделитесь тем, что у вас на душе. Ассистент выслушает, поможет
          разобраться в чувствах и подскажет следующий шаг.
        </p>
      </div>

      <div class="flex flex-wrap gap-2">
        <NuxtLink
          v-if="chatAssistantAccess.available"
          to="/chat"
          class="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background transition hover:bg-foreground"
          @click.stop
        >
          <IconSend class="h-4 w-4" />
          <span>{{ chatButtonLabel }}</span>
        </NuxtLink>
        <button
          v-else
          type="button"
          class="relative inline-flex items-center gap-2 rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background transition hover:bg-foreground"
          @click.stop="emit('paywall', 'chat.assistant')"
        >
          <span
            class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-xs leading-none"
            aria-hidden="true"
            >{{ getPlanBadgeEmoji(chatAssistantAccess.requiredPlan) }}</span
          >
          <IconSend class="h-4 w-4" />
          <span>{{ chatButtonLabel }}</span>
        </button>

        <NuxtLink
          to="/session-summaries-user"
          :aria-label="sessionHistoryButtonAriaLabel"
          class="relative inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-white/30 hover:bg-white/10"
          @click.stop
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
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconSend from '~icons/lucide/send';
import IconBookOpen from '~icons/lucide/book-open';
import UnreadSummaryIndicator from '@/app/components/sessionSummaries/UnreadSummaryIndicator.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useUnseenSessionSummary } from '@/app/composables/useUnseenSessionSummary';
import { useChatStore } from '@/app/stores/chat';

const emit = defineEmits<{
  (event: 'paywall', featureKey: string): void;
}>();

const { getFeatureAccess } = useEntitlements();
const { hasUnseenSummary } = useUnseenSessionSummary();
const chat = useChatStore();

const chatAssistantAccess = computed(() => getFeatureAccess('chat.assistant'));

const chatButtonLabel = computed(() =>
  chat.messages.length > 0 ? 'Продолжить' : 'Начать'
);

const sessionHistoryButtonAriaLabel = computed(() =>
  hasUnseenSummary.value
    ? 'История сессий, есть новый непрочитанный итог сессии'
    : 'История сессий'
);

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

function handleHeroCardClick() {
  if (chatAssistantAccess.value.available) {
    void navigateTo('/chat');
  } else {
    emit('paywall', 'chat.assistant');
  }
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
</style>
