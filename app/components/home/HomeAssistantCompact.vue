<template>
  <!-- Компактная точка входа в ИИ-чат (Вариант A стратегии главного экрана):
       ИИ больше не геро-блок, а небольшая карточка «всегда под рукой».
       Полноразмерный геро-блок переехал на страницу «Практики».
       Вся карточка кликабельна и повторяет действие кнопки «Начать /
       Продолжить»; на внутренних ссылках стоит @click.stop. -->
  <section
    data-tour="home-hero"
    class="glass-deep relative overflow-hidden p-4 animate-slide-up cursor-pointer"
    role="button"
    tabindex="0"
    :aria-label="
      chatAssistantAccess.available
        ? 'Открыть чат с ИИ-ассистентом'
        : 'Узнать о доступе к ИИ-ассистенту'
    "
    @click="handleCardClick"
    @keydown.enter.prevent="handleCardClick"
    @keydown.space.prevent="handleCardClick"
  >
    <div class="pointer-events-none absolute inset-0">
      <div
        class="tile-orb absolute -right-16 -top-12 h-44 w-44 rounded-full bg-gradient-to-br from-violet-400/30 via-fuchsia-400/18 to-transparent blur-3xl"
      />
    </div>

    <div class="relative z-10 flex items-center gap-3">
      <img
        src="../../assets/images/ai_terapist.webp"
        loading="lazy"
        alt=""
        class="h-11 w-11 shrink-0 object-contain"
      />
      <div class="min-w-0 flex-1">
        <h2 class="text-sm font-semibold text-foreground">ИИ-ассистент</h2>
        <p class="text-xs leading-relaxed text-foreground/55">
          Поделитесь тем, что у вас на душе
        </p>
      </div>
    </div>

    <div class="relative z-10 mt-3 flex flex-wrap gap-2">
      <NuxtLink
        v-if="chatAssistantAccess.available"
        to="/chat"
        class="inline-flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2 text-xs font-medium text-background transition hover:bg-foreground"
        @click.stop="handleChatLinkClick"
      >
        <IconSend class="h-3.5 w-3.5" />
        <span>{{ chatButtonLabel }}</span>
      </NuxtLink>
      <button
        v-else
        type="button"
        class="relative inline-flex items-center gap-2 rounded-full bg-foreground/90 px-4 py-2 text-xs font-medium text-background transition hover:bg-foreground"
        @click.stop="emit('paywall', 'chat.assistant')"
      >
        <span
          class="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-black/70 text-[10px] leading-none"
          aria-hidden="true"
          >{{ getPlanBadgeEmoji(chatAssistantAccess.requiredPlan) }}</span
        >
        <IconSend class="h-3.5 w-3.5" />
        <span>{{ chatButtonLabel }}</span>
      </button>

      <NuxtLink
        to="/session-summaries-user"
        :aria-label="sessionHistoryButtonAriaLabel"
        class="relative inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-foreground transition hover:border-white/30 hover:bg-white/10"
        @click.stop
      >
        <UnreadSummaryIndicator
          v-if="hasUnseenSummary"
          class="pointer-events-none absolute right-[6px] top-[6px] z-10"
        />
        <IconBookOpen class="h-3.5 w-3.5" />
        <span>История сессий</span>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconSend from '~icons/lucide/send';
import IconBookOpen from '~icons/lucide/book-open';
import UnreadSummaryIndicator from '@/app/components/sessionSummaries/UnreadSummaryIndicator.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useHaptics } from '@/app/composables/useHaptics';
import { useUnseenSessionSummary } from '@/app/composables/useUnseenSessionSummary';
import { useChatStore } from '@/app/stores/chat';

const emit = defineEmits<{
  (event: 'paywall', featureKey: string): void;
}>();

const { getFeatureAccess } = useEntitlements();
const { triggerLight } = useHaptics();
const { hasUnseenSummary } = useUnseenSessionSummary();
const chat = useChatStore();

const chatAssistantAccess = computed(() => getFeatureAccess('chat.assistant'));

// «Продолжить», если в сторе уже есть сообщения активной/недавней сессии.
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

function handleCardClick() {
  if (chatAssistantAccess.value.available) {
    void triggerLight();
    void navigateTo('/chat');
  } else {
    emit('paywall', 'chat.assistant');
  }
}

function handleChatLinkClick() {
  void triggerLight();
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
</style>
