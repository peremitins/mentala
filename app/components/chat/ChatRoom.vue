<template>
  <div class="flex flex-col flex-1 h-full">
    <!-- Кнопка "Завершить сессию" — доступна только когда выполнены все 3 условия eligibility (ТЗ п.10.2). -->
    <!-- В embedded-режиме (Roadmap-шаг) скрыта: там eligibility отображается отдельно, см. retention/retention_long_term_strategy.md -->
    <div
      v-if="mode === 'page'"
      class="sticky top-[50px] z-40 flex flex-col items-end gap-1 mt-2"
    >
      <button
        data-tour="chat-summary"
        type="button"
        class="glass-deep inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-medium text-foreground transition hover:border-white/30 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!isEligibleForSummary || isFinishingSession"
        @click="handleFinishSession"
        :aria-disabled="!isEligibleForSummary || isFinishingSession"
        :title="finishSessionTooltip"
      >
        <IconLoaderCircle
          v-if="isFinishingSession"
          class="w-3.5 h-3.5 animate-spin"
        />
        <IconCheckCircle v-else class="w-3.5 h-3.5" />
        <span>Подвести итог</span>
      </button>

      <!-- Видимый прогресс eligibility: показывается, пока кнопка неактивна.
           Показывается только в dev-режиме для быстрого тестирования. -->
      <div
        v-if="isDev && !isEligibleForSummary && chat.messages.length > 0"
        class="text-[10px] leading-tight text-foreground/60 text-right max-w-[260px]"
      >
        <span
          :class="
            chat.userMessagesCount >= DEV_MIN_MESSAGES
              ? 'text-emerald-300/80'
              : 'text-foreground/60'
          "
        >
          сообщений {{ chat.userMessagesCount }}/{{ DEV_MIN_MESSAGES }}
        </span>
        <span class="text-foreground/40"> · </span>
        <span
          :class="
            liveSessionDurationSeconds >= DEV_MIN_DURATION_SECONDS
              ? 'text-emerald-300/80'
              : 'text-foreground/60'
          "
        >
          время {{ formattedSessionDuration }}/{{ DEV_MIN_DURATION_LABEL }}
        </span>
        <span class="text-foreground/40"> · </span>
        <span
          :class="
            chat.qualifyingUserMessagesCount >= DEV_MIN_QUALIFYING
              ? 'text-emerald-300/80'
              : 'text-foreground/60'
          "
        >
          содержательных {{ chat.qualifyingUserMessagesCount }}/{{
            DEV_MIN_QUALIFYING
          }}
        </span>
      </div>
    </div>

    <AvatarVoiceControls />

    <!-- Основной контент -->
    <div
      class="flex-1 flex flex-col overflow-hidden absolute w-full top-0 left-0 rounded-lg z-0"
      :style="chatViewportStyle"
    >
      <!-- Экран чата -->

      <div class="flex flex-col flex-1 h-full space-y-6 relative">
        <div class="relative h-full mb-2">
          <section
            ref="chatRef"
            @scroll="handleScroll"
            class="absolute bottom-0 overflow-y-scroll overflow-x-hidden max-h-[100%] inset-x-0 pt-[50%] flex flex-col space-y-3"
            :class="{ 'chat-fade': false }"
          >
            <TransitionGroup
              name="message-list"
              tag="div"
              class="flex flex-col space-y-3"
            >
              <div
                v-for="(m, index) in combinedMessages"
                :key="`msg-${getMessageClientId(m, index)}`"
                class="flex flex-col w-fit max-w-[80%]"
                :class="{
                  'ml-auto self-end items-end': (m as any).role === 'user',
                  'self-start items-start': (m as any).role === 'assistant',
                }"
              >
                <div
                  class="relative px-3 py-2 mb-1 glass-deep"
                  :class="{
                    'ml-auto': (m as any).role === 'user',
                    'pb-6': (m as any).role === 'assistant',
                  }"
                  :data-chat-role="(m as any).role"
                >
                  <div
                    class="items-center markdown-content ym-hide-content"
                    v-html="
                      (m as any).role === 'assistant'
                        ? formatMessage(m.content)
                        : m.content
                    "
                  />
                  <div
                    v-if="
                      (m as any).role === 'assistant' &&
                      !(m as any).feedbackDisabled
                    "
                    class="assistant-feedback-actions absolute right-2 bottom-2 flex items-center gap-1"
                  >
                    <button
                      type="button"
                      class="feedback-action-button"
                      :class="{
                        'feedback-action-button-active-like':
                          getFeedbackRating(getMessageClientId(m, index)) === 1,
                      }"
                      :disabled="
                        isFeedbackButtonDisabled(getMessageClientId(m, index))
                      "
                      @click="handleLikeClick(getMessageClientId(m, index))"
                      aria-label="Полезный ответ"
                    >
                      <IconLoaderCircle
                        v-if="
                          isFeedbackSubmitting(getMessageClientId(m, index))
                        "
                        class="w-3.5 h-3.5 animate-spin"
                      />
                      <IconThumbsUp v-else class="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      class="feedback-action-button"
                      :class="{
                        'feedback-action-button-active-dislike':
                          getFeedbackRating(getMessageClientId(m, index)) ===
                          -1,
                      }"
                      :disabled="
                        isFeedbackButtonDisabled(getMessageClientId(m, index))
                      "
                      @click="handleDislikeClick(getMessageClientId(m, index))"
                      aria-label="Сообщить о проблеме"
                    >
                      <IconThumbsDown class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
              <!-- Индикатор загрузки при генерации ответа -->
              <ChatLoadingIndicator
                v-if="chat.isGenerating"
                key="loading-indicator"
              />
              <SuggestedChips
                v-if="shouldShowSuggestedChips"
                key="suggested-chips"
                class="max-w-[85%] self-start"
                :chips="chat.suggestedChips"
                :disabled="isSending || isTextInputDisabled"
                @select="handleChipSelect"
              />
            </TransitionGroup>
          </section>
        </div>

        <section class="glass-deep p-2 mt-auto z-100">
          <div class="flex items-center gap-3">
            <div class="relative flex-1">
              <TextareaResize
                ref="textareaRef"
                v-model.trim="chat.userText"
                :disabled="isTextInputDisabled"
                :resize="true"
                :prevent-enter-default="true"
                @enter-pressed="handleKeydown"
                :placeholder="chatInputPlaceholder"
                :class="[
                  'ym-disable-keys',
                  isUserTextOverLimit
                    ? 'ring-2 ring-red-500/60 !border-red-500/70 transition-colors duration-200'
                    : 'ring-0 ring-transparent transition-colors duration-200',
                ]"
              />
              <div
                v-if="isUserTextOverLimit"
                class="pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur bg-black/30 text-white/80 transition-colors duration-200"
                :class="
                  isUserTextOverLimit
                    ? 'text-red-200/95 bg-red-500/20'
                    : 'text-white/70 bg-black/25'
                "
              >
                {{ userTextCount }}/{{ MAX_USER_TEXT_LENGTH }}
              </div>
            </div>
            <div class="flex items-center">
              <button
                data-tour="chat-realtime-voice"
                type="button"
                class="chat-action-button chat-action-button-call relative flex items-center justify-center cursor-pointer flex-none disabled:cursor-not-allowed disabled:opacity-45"
                :class="realtimeVoiceCallButtonClass"
                :style="{ borderRadius: 'var(--radius-icon)' }"
                :aria-busy="realtimeVoice.isBusy.value"
                :aria-disabled="realtimeVoice.isBusy.value"
                :aria-pressed="realtimeVoice.isActive.value"
                :aria-label="realtimeVoiceCallAriaLabel"
                :disabled="realtimeVoice.isBusy.value"
                @click="handleRealtimeVoiceAction"
              >
                <IconLoaderCircle
                  v-if="realtimeVoice.isBusy.value"
                  class="w-5 h-5 animate-spin"
                />
                <IconPhoneOff
                  v-else-if="realtimeVoice.isActive.value"
                  class="w-5 h-5"
                />
                <IconPhoneCall v-else class="w-5 h-5" />

                <span
                  v-if="
                    !realtimeVoiceAccess.available &&
                    !realtimeVoice.isBusy.value &&
                    !realtimeVoice.isActive.value
                  "
                  class="chat-action-button-badge"
                  aria-hidden="true"
                >
                  {{ getPlanBadgeEmoji(realtimeVoiceAccess.requiredPlan) }}
                </span>
              </button>
            </div>
            <div class="flex items-center">
              <button
                data-tour="chat-mic"
                type="button"
                @click="handleMicClick"
                class="chat-action-button relative flex items-center justify-center cursor-pointer flex-none disabled:cursor-not-allowed disabled:opacity-45"
                :class="
                  speechStore.isListening && !isDictationMicDisabled
                    ? 'is-recording ring-2 ring-red-400/60 bg-red-500/15 shadow-[0_0_20px_rgba(239,68,68,0.35)]'
                    : ''
                "
                :style="{ borderRadius: 'var(--radius-icon)' }"
                :aria-pressed="speechStore.isListening"
                :aria-disabled="isDictationMicDisabled"
                aria-label="Запись голоса"
                :disabled="isDictationMicDisabled"
              >
                <IconMic
                  :class="
                    speechStore.isListening && !isDictationMicDisabled
                      ? 'text-red-300'
                      : 'text-foreground'
                  "
                  class="w-5 h-5"
                />
              </button>
            </div>
            <button
              type="button"
              @pointerdown.prevent="onSendPointer"
              @click="onSendClick"
              class="chat-action-button flex items-center justify-center cursor-pointer flex-none disabled:cursor-not-allowed disabled:opacity-40"
              :style="{ borderRadius: 'var(--radius-icon)' }"
              :disabled="isUserTextOverLimit || isTextInputDisabled"
            >
              <IconSend class="w-5 h-5" />
            </button>
          </div>
        </section>
      </div>
    </div>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />

    <Dialog
      :open="isDislikeDialogOpen"
      @update:open="handleDislikeDialogOpenChange"
    >
      <DialogContent
        class="glass-deep border border-border bg-card backdrop-blur-xl text-card-foreground"
        @interact-outside="handleDislikeDialogInteractOutside"
      >
        <DialogHeader>
          <DialogTitle class="text-lg font-semibold">
            Что не так с ответом?
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ feedbackReasonDescription }}
          </DialogDescription>
        </DialogHeader>

        <form class="space-y-4" @submit.prevent="submitDislikeFeedback">
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">
              Причина (опционально)
            </label>
            <Select
              v-model="dislikeTopicCode"
              v-model:open="isDislikeTopicSelectOpen"
            >
              <SelectTrigger
                class="w-full glass-deep border-white/20 data-[placeholder]:text-foreground/70 focus:ring-0"
              >
                <SelectValue :placeholder="feedbackReasonPlaceholder" />
              </SelectTrigger>
              <SelectContent
                :body-lock="false"
                class="glass-deep border-white/20"
              >
                <SelectItem
                  v-for="item in FEEDBACK_TOPIC_OPTIONS"
                  :key="item.code"
                  :value="item.code"
                  class="focus:bg-white/10 focus:text-foreground"
                >
                  {{ item.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-sm font-medium text-foreground">
                Комментарий (опционально)
              </label>
              <span class="text-xs text-muted-foreground">
                {{ dislikeCommentLength }}/{{ FEEDBACK_COMMENT_MAX_LENGTH }}
              </span>
            </div>
            <TextareaResize
              v-model="dislikeComment"
              variant="form"
              :min-height="'96px'"
              :max-height="'220px'"
              :maxlength="FEEDBACK_COMMENT_MAX_LENGTH"
              :placeholder="feedbackCommentPlaceholder"
            />
          </div>

          <div class="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              @click="closeDislikeDialog"
              :disabled="isDislikeSubmitting"
            >
              Отмена
            </Button>
            <Button type="submit" :disabled="isDislikeSubmitDisabled">
              <IconLoaderCircle
                v-if="isDislikeSubmitting"
                class="w-4 h-4 animate-spin"
              />
              <span>Отправить</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <MicPermissionDeniedDialog
      :open="showMicDeniedModal"
      :mode="micDeniedDialogMode"
      :is-standalone-pwa="micDeniedIsStandalonePwa"
      @update:open="showMicDeniedModal = $event"
      @open-settings="openMicSettings"
    />

    <!-- Модалка: сессия завершена, итог отправлен на генерацию -->
    <Dialog
      :open="showSessionFinishedModal"
      @update:open="onSessionFinishedModalChange"
    >
      <DialogContent
        class="glass-deep border border-border bg-card backdrop-blur-xl text-card-foreground"
      >
        <DialogHeader>
          <DialogTitle class="text-lg font-semibold">
            Сессия завершена
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            Итог разговора готовится — обычно это занимает меньше минуты. Вы
            можете перейти в раздел «Итоги сессий» прямо сейчас или вернуться
            позже.
          </DialogDescription>
        </DialogHeader>
        <div class="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            @click="showSessionFinishedModal = false"
          >
            Остаться
          </Button>
          <Button type="button" @click="goToSessionSummaries">
            Перейти к итогам
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import {
  nextTick,
  onMounted,
  onBeforeUnmount,
  watch,
  ref,
  computed,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTTS } from '@/app/composables/useTTS';
import { useMarkdown } from '@/app/composables/useMarkdown';
import { useRealtimeVoiceSession } from '@/app/composables/useRealtimeVoiceSession';
import { useRealtimeVoiceCallFeedback } from '@/app/composables/useRealtimeVoiceCallFeedback';
import { useVoiceDictationInput } from '@/app/composables/useVoiceDictationInput';
import { useHaptics } from '@/app/composables/useHaptics';
import {
  useChatSession,
  type ChatSessionFinalizeReason,
  type ChatSessionFinalizeResult,
} from '@/app/composables/useChatSession';
import { useIsDev } from '@/app/composables/useIsDev';
import {
  useChatStore,
  SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES,
  SESSION_SUMMARY_MIN_USER_MESSAGES,
  SESSION_SUMMARY_MIN_DURATION_SECONDS,
  SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES,
  type ChatMessageFeedbackState,
} from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useAuthStore } from '@/app/stores/auth';
import { useToast } from '@/app/composables/useToast';
import { CHAT_STREAM_MODE } from '@/app/constants/chat';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/shadcn/select';

import IconMic from '~icons/lucide/mic';
import IconSend from '~icons/lucide/send';
import IconCheckCircle from '~icons/lucide/check-circle';
import IconPhoneCall from '~icons/lucide/phone-call';
import IconPhoneOff from '~icons/lucide/phone-off';
import IconThumbsUp from '~icons/lucide/thumbs-up';
import IconThumbsDown from '~icons/lucide/thumbs-down';
import IconLoaderCircle from '~icons/lucide/loader-circle';
import AvatarVoiceControls from '@/app/components/AvatarVoiceControls.vue';
import SuggestedChips from '@/app/components/chat/SuggestedChips.vue';
import ChatLoadingIndicator from '@/app/components/chat/ChatLoadingIndicator.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import MicPermissionDeniedDialog from '@/app/components/mic/MicPermissionDeniedDialog.vue';
import {
  ChatFeedbackUpsertResponseDto,
  type SuggestedChip,
  type ChatFeedbackTopicCode,
} from '@/shared/dto';
import { getAddressingCopy } from '@/app/lib/addressingCopy';
import { useAiChatConsentGate } from '@/app/composables/useAiChatConsentGate';
import { useAppNavigation } from '@/app/composables/useAppNavigation';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useNuxtApp, useRuntimeConfig } from '#imports';
import { resolveAddressing } from '@/shared/utils/addressing';

/**
 * Многоразовый UI чат-комнаты. Использует useChatSession для lifecycle
 * (см. .docs/audit_chat_lifecycle.md). В page-режиме монтируется напрямую
 * на странице `/chat`; в embedded-режиме (Этап 5) — внутри Roadmap-шага
 * через ProgramAiChatAction.
 *
 * Эмиты:
 *  - send(text)  — legacy hook для родителей, реальная отправка идёт через
 *                  внутренний chat.sendMessage; оставлен для backward compat.
 *  - done()      — сигнал родителю о финализации сессии (только embedded).
 */

const props = withDefaults(
  defineProps<{
    mode?: 'page' | 'embedded';
    topicPrompt?: string;
    goalHint?: string;
    /**
     * Пороги eligibility для embedded-режима (Roadmap-шаг). Если переданы,
     * `useChatSession` использует их вместо глобальных prod-констант
     * (которые требуют 80 символов без пробелов и 4 минуты — это слишком
     * строго для 5-минутного шага программы).
     */
    minQualifyingMessages?: number;
    minDurationSec?: number;
    qualifyingMinChars?: number;
  }>(),
  {
    mode: 'page',
    topicPrompt: undefined,
    goalHint: undefined,
    minQualifyingMessages: undefined,
    minDurationSec: undefined,
    qualifyingMinChars: undefined,
  }
);

const emit = defineEmits<{
  (e: 'send', text: string): void;
  (e: 'done'): void;
}>();

// topicPrompt / goalHint используются в embedded-режиме (Roadmap-шаг).
// На уровне UI они станут видимы при подключении ProgramAiChatAction в Этапе 5.
// Сейчас аргументы доступны через `props.topicPrompt`/`props.goalHint`,
// чтобы родитель мог их прокидывать заранее.
void props.topicPrompt;
void props.goalHint;

const route = useRoute();
const router = useRouter();
const { navigateToTarget } = useAppNavigation();
const { requestAiConsent } = useAiChatConsentGate();
const auth = useAuthStore();
const addressing = computed(() => resolveAddressing(auth.user?.addressing));
const chatViewportStyle = computed(() => {
  // В page-режиме оставляем место под BottomNav (95px).
  // В embedded-режиме ChatRoom занимает весь свой bounding box —
  // ограничения высоты выставляются снаружи в ProgramAiChatAction,
  // чтобы композер всегда оставался над fixed-кнопкой step runner'а.
  const bottomOffset = props.mode === 'embedded' ? '0px' : '95px';
  return {
    bottom: bottomOffset,
    height: `calc(100% - ${bottomOffset})`,
  };
});

const chat = useChatStore();
const { getFeatureAccess } = useEntitlements();
const speechStore = useSpeechStore();
const chatSettings = useChatSettingsStore();
const runtimeConfig = useRuntimeConfig();
const { $api } = useNuxtApp();
const isTtsEnabled = computed(
  () => runtimeConfig.public.featureTtsEnabled === true
);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);
const chatAssistantAccess = computed(() => getFeatureAccess('chat.assistant'));
const realtimeVoiceAccess = computed(() =>
  getFeatureAccess('chat.realtime_voice')
);
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);
const feedbackReasonDescription = computed(() =>
  getAddressingCopy('chatFeedbackReasonDescription', addressing.value)
);
const feedbackReasonPlaceholder = computed(() =>
  getAddressingCopy('chatFeedbackReasonPlaceholder', addressing.value)
);
const feedbackCommentPlaceholder = computed(() =>
  getAddressingCopy('chatFeedbackCommentPlaceholder', addressing.value)
);
const chatRetryHint = computed(() =>
  getAddressingCopy('chatRetryHint', addressing.value)
);

// Псевдонимы для шаблона: пороги берутся из стора (разведены по import.meta.dev).
const DEV_MIN_MESSAGES = SESSION_SUMMARY_MIN_USER_MESSAGES;
const DEV_MIN_DURATION_SECONDS = SESSION_SUMMARY_MIN_DURATION_SECONDS;
const DEV_MIN_QUALIFYING = SESSION_SUMMARY_MIN_QUALIFYING_MESSAGES;
const FORCE_MIN_MESSAGES = SESSION_SUMMARY_FORCE_MIN_USER_MESSAGES;

// Флаг для шаблона — показывать ли dev-счётчик eligibility.
// На iOS device-сборке для Realtime Voice используется static bundle без
// Nuxt dev-server, поэтому `import.meta.dev` там false. Берём runtime-флаг.
const isDev = useIsDev();

const DEV_MIN_DURATION_LABEL = (() => {
  const m = Math.floor(DEV_MIN_DURATION_SECONDS / 60);
  const s = DEV_MIN_DURATION_SECONDS % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`;
})();

function formatMmSs(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// Composable инкапсулирует ticker, eligibility-getters и finalize-orchestrator
// (см. app/composables/useChatSession.ts + .docs/audit_chat_lifecycle.md).
// В embedded-режиме (Roadmap-шаг) дефолтный finalize-on-unmount отключён —
// родитель ProgramAiChatAction.vue сам вызывает finalize по нажатию «Дальше».
const chatSession = useChatSession({
  skipDisposeFinalize: props.mode === 'embedded',
  // В embedded-режиме (Roadmap-шаг) пороги eligibility берутся из blueprint
  // конкретного шага. OR-логика: достаточно ИЛИ N содержательных сообщений,
  // ИЛИ minDurationSec времени в разговоре. Это позволяет пользователю
  // завершить шаг даже если он быстро написал суть, или наоборот, если он
  // долго общался короткими репликами.
  eligibilityOverrides:
    props.mode === 'embedded'
      ? {
          minMessages: props.minQualifyingMessages,
          minQualifying: props.minQualifyingMessages,
          minDurationSec: props.minDurationSec,
          qualifyingMinChars: props.qualifyingMinChars ?? 30,
        }
      : undefined,
  useOrLogic: props.mode === 'embedded',
});
const liveSessionDurationSeconds = chatSession.liveDurationSeconds;
const isEligibleForSummary = chatSession.isEligible;
const formattedSessionDuration = computed(() =>
  formatMmSs(liveSessionDurationSeconds.value)
);

const finishSessionTooltip = computed(() => {
  if (isEligibleForSummary.value) {
    return 'Подвести итог сессии';
  }
  const messages = `сообщений ${chat.userMessagesCount}/${DEV_MIN_MESSAGES}`;
  const time = `время ${formattedSessionDuration.value}/${DEV_MIN_DURATION_LABEL}`;
  const qualifying = `содержательных ${chat.qualifyingUserMessagesCount}/${DEV_MIN_QUALIFYING} (по ≥80 символов без пробелов)`;
  const fastTrack = `или после ${FORCE_MIN_MESSAGES} пользовательских сообщений в backlog`;
  return `Кнопка активируется после содержательной сессии (${messages}, ${time}, ${qualifying}) ${fastTrack}`;
});

const MAX_USER_TEXT_LENGTH = 2500;
const userTextCount = computed(() => chat.userText?.length ?? 0);
const isUserTextOverLimit = computed(
  () => userTextCount.value > MAX_USER_TEXT_LENGTH
);

const FEEDBACK_COMMENT_MAX_LENGTH = 1000;
const FEEDBACK_ASSISTANT_MESSAGE_TEXT_MAX_LENGTH = 8000;
const FEEDBACK_TOPIC_OPTIONS: Array<{
  code: ChatFeedbackTopicCode;
  label: string;
}> = [
  { code: 'FACTUAL_ERROR', label: 'Информация не верна' },
  { code: 'NOT_HELPFUL', label: 'Не помогло / слишком общее' },
  { code: 'TONE_ISSUE', label: 'Неподходящий тон' },
  { code: 'UNSAFE_ADVICE', label: 'Опасный или вредный совет' },
  { code: 'PRIVACY_CONCERN', label: 'Нарушение приватности' },
  { code: 'OTHER', label: 'Другое' },
];

const isDislikeDialogOpen = ref(false);
const isDislikeTopicSelectOpen = ref(false);
const dislikeTargetMessageId = ref<string | null>(null);
const dislikeTopicCode = ref<ChatFeedbackTopicCode>('OTHER');
const dislikeComment = ref('');
const dislikeCommentLength = computed(() => dislikeComment.value.length);
const isDislikeSubmitting = computed(() => {
  const messageId = dislikeTargetMessageId.value;
  if (!messageId) return false;
  return chat.feedbackSubmittingByMessageId[messageId] === true;
});
const isDislikeSubmitDisabled = computed(() => {
  const messageId = dislikeTargetMessageId.value;
  if (!messageId) {
    return true;
  }
  return !getMessageTherapySessionId(messageId) || isDislikeSubmitting.value;
});

const { speak: speakTTS, stop: stopTTS } = useTTS();
const { renderMarkdown } = useMarkdown();

const isSending = ref(false);
const lastSendPointerTs = ref(0);
const isFinishingSession = ref(false);
const showSessionFinishedModal = ref(false);

async function handleFinishSession() {
  if (isFinishingSession.value) return;
  if (!isEligibleForSummary.value) {
    useToast(
      'Недостаточно сообщений',
      'Продолжайте общение, чтобы подвести итог',
      'warning'
    );
    return;
  }
  isFinishingSession.value = true;
  try {
    // Если активна голосовая сессия — сначала корректно её завершаем.
    // Иначе последний user_turn_completed / response_completed не долетит
    // до сервера, transcript в БД окажется неполным, серверный eligibility
    // вернёт false и summary не создастся.
    if (realtimeVoice.isActive.value) {
      await realtimeVoiceCallFeedback.notifyHangupIntent();
      await realtimeVoice.stop('user_stop');
    }
    const result = await chatSession.finalize({ reason: 'manual_summary' });
    if (result?.eligible && result?.triggered) {
      void triggerSuccess();
      // Сервер подтвердил — итог запущен на генерацию.
      if (props.mode === 'embedded') {
        // Embedded-режим (Roadmap-шаг): пробрасываем done родителю —
        // он покажет переход к следующему action.
        emit('done');
      } else {
        showSessionFinishedModal.value = true;
      }
    } else if (result?.eligible && !result?.triggered) {
      useToast(
        'Что-то пошло не так',
        'Не удалось отправить запрос на создание итога',
        'error'
      );
    } else {
      useToast(
        'Недостаточно сообщений',
        'Продолжайте общение, чтобы подвести итог',
        'warning'
      );
    }
  } catch (error) {
    console.error('[Chat] Failed to finish session:', error);
    useToast('Что-то пошло не так', 'Не удалось подвести итог сессии', 'error');
  } finally {
    isFinishingSession.value = false;
  }
}

function onSessionFinishedModalChange(open: boolean) {
  if (!open) showSessionFinishedModal.value = false;
}

function goToSessionSummaries() {
  showSessionFinishedModal.value = false;
  void router.push('/session-summaries-user');
}

const {
  settings,
  toggleListening: toggleMic,
  stopListening: stopMic,
  clearBaseText: clearVoiceBase,
  showMicDeniedModal,
  micDeniedDialogMode,
  micDeniedIsStandalonePwa,
  openMicSettings,
} = useVoiceDictationInput({
  getValue: () => chat.userText,
  setValue: (value) => {
    chat.userText = value;
  },
  onStartError: (error) => {
    console.error('[Chat] Failed to start dictation:', error);
  },
  onFinalTranscription: ({ mergedText }) => {
    if (!settings.value.autoSend || !mergedText.trim()) return;
    emitSend();
  },
});

function handleMicClick() {
  if (isDictationMicDisabled.value) return;
  void triggerLight();
  void toggleMic();
}

const realtimeVoice = useRealtimeVoiceSession({
  onBeforeStart: async () => {
    chat.stopChatStream();
    stopTTS();

    if (speechStore.isListening) {
      await stopMic();
    }

    clearVoiceBase();
  },
  getReadyMessageText: () =>
    getAddressingCopy('realtimeReadyHint', addressing.value),
});
const realtimeVoiceCallFeedback = useRealtimeVoiceCallFeedback({
  status: realtimeVoice.status,
  errorMessage: realtimeVoice.errorMessage,
});
const { triggerLight, triggerSuccess } = useHaptics();
const isTextInputDisabled = computed(() => realtimeVoice.blocksTextInput.value);
const shouldShowSuggestedChips = computed(
  () =>
    chat.suggestedChips.length > 0 &&
    !realtimeVoice.isActive.value &&
    !realtimeVoice.isBusy.value &&
    // В embedded-режиме (Roadmap-шаг) suggestion chips отключены — они
    // облегчают пользователю работу, а на ai_chat-шаге задача в том, чтобы
    // он сам сформулировал ответ. См. UX-фидбэк сессии 17.
    props.mode !== 'embedded'
);
const isDictationMicDisabled = computed(
  () =>
    isTextInputDisabled.value ||
    realtimeVoice.isActive.value ||
    realtimeVoice.isBusy.value
);
const chatInputPlaceholder = computed(() =>
  getAddressingCopy('chatInputPlaceholder', addressing.value)
);
const realtimeVoiceCallButtonClass = computed(() => {
  if (realtimeVoice.isActive.value) {
    return 'is-call-active';
  }
  if (realtimeVoice.status.value === 'starting') {
    return 'is-call-connecting';
  }
  if (realtimeVoice.status.value === 'stopping') {
    return 'is-call-stopping';
  }
  if (!realtimeVoiceAccess.value.available) {
    return 'is-call-locked';
  }
  return '';
});
const realtimeVoiceCallAriaLabel = computed(() => {
  if (realtimeVoice.isBusy.value) {
    return realtimeVoice.status.value === 'starting'
      ? 'Подключаю realtime voice'
      : 'Завершаю realtime voice';
  }
  if (realtimeVoice.isActive.value) {
    return `Завершить realtime voice. Осталось ${formatDurationShort(realtimeVoice.remainingSeconds.value)}.`;
  }
  if (!realtimeVoiceAccess.value.available) {
    return `Realtime voice доступен на тарифе ${realtimeVoiceAccess.value.requiredPlan}. Открыть paywall.`;
  }
  return 'Подключить realtime voice';
});
const lastRealtimeVoiceToastError = ref('');

watch(
  () => realtimeVoice.errorMessage.value,
  (nextMessage) => {
    const normalized = String(nextMessage || '').trim();
    if (!normalized) {
      lastRealtimeVoiceToastError.value = '';
      return;
    }
    if (normalized === lastRealtimeVoiceToastError.value) {
      return;
    }
    lastRealtimeVoiceToastError.value = normalized;
    useToast('Голосовой чат недоступен', normalized, 'error');
  }
);

/**
 * Автоматический старт диалога от ассистента, если пользователь открыл чат "пустым"
 * (нет сообщений в сторе). Вызывается из onMounted после проверки consent и доступа.
 */
async function autoStartConversationIfNeeded() {
  if (!chatAssistantAccess.value.available) return;
  if (chat.messages.length > 0) return;
  // В embedded-режиме (Roadmap-шаг) ассистент НЕ начинает разговор первым —
  // первое сообщение всегда пишет пользователь, чтобы он сам сформулировал
  // ответ на topicPrompt без подсказки. См. UX-фидбэк сессии 17.
  if (props.mode === 'embedded') return;
  // Если стрим уже запущен извне (например, через void startConversation() в useEntryChat),
  // не запускаем дублирующий. Без этой проверки возникает race condition:
  // void startConversation() выставляет isGenerating=true только после await startTherapySession,
  // а onMounted срабатывает раньше — и мы получаем два параллельных стрима.
  if (chat.isGenerating) return;

  const consentGranted = await requestAiConsent();
  if (!consentGranted) return;

  try {
    chat.startSession();
    const res = await chat.startConversation();
    if (res?.ok) {
      await nextTick();
      if (isTtsEnabled.value && chatSettings.voice === true) {
        const last = [...chat.messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        const content =
          last && typeof last.content === 'string' ? last.content : '';
        if (content) {
          await speakLastMessage(content);
        }
      }
    }
  } catch (error) {
    console.error('[Chat] Auto-start conversation failed:', error);
  }
}

function emitSend() {
  if (!ensureChatAccessOrPaywall()) return;
  if (!chat.userText?.trim()) return;
  if (isUserTextOverLimit.value) return;
  if (isTextInputDisabled.value) return;
  if (isSending.value) return;
  const finalText = chat.userText?.trim();
  emit('send', finalText);
}

function handleKeydown(e: KeyboardEvent) {
  if (isTextInputDisabled.value) return;
  if (!chat.userText?.trim()) return;
  if (isUserTextOverLimit.value) return;
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    chat.userText =
      chat.userText.substring(0, start) + '\n' + chat.userText.substring(end);
    nextTick(() => {
      target.selectionStart = target.selectionEnd = start + 1;
    });
  } else if (!e.shiftKey) {
    e.preventDefault();
    onSend();
  }
}

async function speakLastMessage(content: string) {
  if (content && isTtsEnabled.value && chatSettings.voice) {
    await speakTTS(content);
  }
}

const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);

const sendText = async (rawText: string) => {
  if (!ensureChatAccessOrPaywall()) return;
  if (isTextInputDisabled.value) return;
  const consentGranted = await requestAiConsent();
  if (!consentGranted) return;
  const textToSend = rawText?.trim();
  if (!textToSend) return;

  const currentText = textToSend;
  isSending.value = true;

  if (speechStore.isListening) {
    void stopMic();
  }

  clearVoiceBase();

  chat.userText = '';

  nextTick(() => {
    textareaRef.value?.resetHeight();
  });

  let res: any = null;
  try {
    res = await chat.sendMessage(JSON.parse(JSON.stringify(currentText)));
  } catch (error) {
    console.error('[sendText] Failed to send message:', error);
    isSending.value = false;
    return;
  }

  if (res?.ok) {
    if (isTtsEnabled.value && chatSettings.voice === true) {
      const last = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant');
      const content =
        last && typeof last.content === 'string' ? last.content : '';
      await speakLastMessage(content);
    }
  }

  await nextTick();
  setTimeout(() => {
    isSending.value = false;
  }, 500);
};

const onSend = async () => {
  if (!ensureChatAccessOrPaywall()) return;
  if (isTextInputDisabled.value) return;
  if (isSending.value) return;
  if (isUserTextOverLimit.value) return;
  if (!chat.userText?.trim()) return;
  void triggerLight();
  await sendText(chat.userText);
};

function onSendPointer() {
  // На мобильных отправляем сразу по pointerdown, чтобы не ждать закрытия клавиатуры.
  lastSendPointerTs.value = Date.now();
  void onSend();
}

function onSendClick() {
  // Отсекаем "второй" клик после pointerdown на тач-устройствах.
  if (Date.now() - lastSendPointerTs.value < 500) return;
  void onSend();
}

const handleChipSelect = async (chip: SuggestedChip) => {
  // Чипы отправляются сразу, не заполняя textarea.
  if (isTextInputDisabled.value) return;
  if (isSending.value) return;
  if (chip.kind === 'action') {
    await handleActionChip(chip);
    return;
  }
  await sendText(chip.text);
};

const handleActionChip = async (chip: SuggestedChip) => {
  if (!chip.target && !chip.action) return;
  chat.clearSuggestedChips();
  if (chip.target) {
    await navigateToTarget(chip.target, {
      source: 'chat_chip',
      entryPoint: 'assistant_suggested_chip',
    });
  }
};

const combinedMessages = computed(() => chat?.messages || []);

const formatMessage = (content: string) => {
  if (!content) return '';
  return renderMarkdown(content);
};

function getMessageClientId(message: unknown, index: number): string {
  if (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { id?: unknown }).id === 'string' &&
    (message as { id: string }).id.trim().length > 0
  ) {
    return (message as { id: string }).id;
  }
  return `legacy-${index}`;
}

function getMessageByClientId(
  messageId: string
): (typeof combinedMessages.value)[number] | null {
  return (
    combinedMessages.value.find(
      (message, index) => getMessageClientId(message, index) === messageId
    ) ?? null
  );
}

function getMessageTherapySessionId(messageId: string): number | null {
  const message = getMessageByClientId(messageId);
  const therapySessionId = message?.therapySessionId;
  if (
    typeof therapySessionId !== 'number' ||
    !Number.isInteger(therapySessionId) ||
    therapySessionId <= 0
  ) {
    return null;
  }
  return therapySessionId;
}

function getFeedbackRating(messageId: string): 1 | -1 | null {
  return chat.feedbackByMessageId[messageId]?.rating ?? null;
}

function isFeedbackSubmitting(messageId: string): boolean {
  return chat.feedbackSubmittingByMessageId[messageId] === true;
}

function isFeedbackButtonDisabled(messageId: string): boolean {
  return (
    !getMessageTherapySessionId(messageId) || isFeedbackSubmitting(messageId)
  );
}

function setFeedbackSubmitting(messageId: string, isSubmitting: boolean) {
  chat.setFeedbackSubmitting(messageId, isSubmitting);
}

function setFeedbackState(
  messageId: string,
  state: ChatMessageFeedbackState | null
) {
  chat.setFeedbackState(messageId, state);
}

function normalizeFeedbackComment(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, FEEDBACK_COMMENT_MAX_LENGTH);
}

function resolveAssistantMessageTextForFeedback(
  messageId: string
): string | null {
  // Берем исходный текст assistant-сообщения, чтобы в БД было видно, на что именно пожаловались.
  const assistantMessage = getMessageByClientId(messageId);
  if (!assistantMessage || assistantMessage.role !== 'assistant') {
    return null;
  }
  const rawText = assistantMessage.content;
  const normalized = rawText.trim();
  if (!normalized) {
    return null;
  }
  return normalized.slice(0, FEEDBACK_ASSISTANT_MESSAGE_TEXT_MAX_LENGTH);
}

function extractFeedbackErrorMessage(error: any): string {
  const message =
    error?.data?.error?.message ||
    error?.data?.message ||
    error?.response?._data?.error?.message ||
    error?.response?._data?.message ||
    error?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }
  return 'Не удалось отправить обратную связь';
}

async function submitFeedback(params: {
  messageId: string;
  rating: 1 | -1;
  topicCode: ChatFeedbackTopicCode | null;
  comment: string | null;
  showSuccessToast?: boolean;
}): Promise<boolean> {
  const therapySessionId = getMessageTherapySessionId(params.messageId);
  if (!therapySessionId) {
    useToast('Сессия завершена', chatRetryHint.value, 'warning');
    return false;
  }

  const previousState = chat.feedbackByMessageId[params.messageId] ?? null;
  const optimisticState: ChatMessageFeedbackState = {
    rating: params.rating,
    topicCode: params.rating === -1 ? params.topicCode : null,
    comment: params.comment,
    updatedAt: new Date().toISOString(),
  };

  setFeedbackState(params.messageId, optimisticState);
  setFeedbackSubmitting(params.messageId, true);

  try {
    const response = await $api('/api/chat/feedback', {
      method: 'POST',
      body: {
        therapySessionId,
        assistantMessageClientId: params.messageId,
        sessionId: chat.sessionId || undefined,
        rating: params.rating,
        topicCode:
          params.rating === -1 ? params.topicCode || undefined : undefined,
        comment: params.comment || undefined,
        assistantMessageText:
          resolveAssistantMessageTextForFeedback(params.messageId) || undefined,
      },
    });
    const parsed = ChatFeedbackUpsertResponseDto.parse(response);

    setFeedbackState(params.messageId, {
      rating: parsed.item.rating,
      topicCode: parsed.item.topicCode,
      comment: parsed.item.comment,
      updatedAt: parsed.item.updatedAt,
    });

    if (params.showSuccessToast) {
      useToast('Спасибо за обратную связь');
    }

    return true;
  } catch (error) {
    setFeedbackState(params.messageId, previousState);
    useToast(
      'Не удалось отправить оценку',
      extractFeedbackErrorMessage(error),
      'error'
    );
    return false;
  } finally {
    setFeedbackSubmitting(params.messageId, false);
  }
}

async function handleLikeClick(messageId: string) {
  if (isFeedbackButtonDisabled(messageId)) return;
  await submitFeedback({
    messageId,
    rating: 1,
    topicCode: null,
    comment: null,
    showSuccessToast: true,
  });
}

function handleDislikeClick(messageId: string) {
  if (isFeedbackButtonDisabled(messageId)) return;

  const current = chat.feedbackByMessageId[messageId];
  const hasCurrentTopicInUi = FEEDBACK_TOPIC_OPTIONS.some(
    (option) => option.code === current?.topicCode
  );
  dislikeTargetMessageId.value = messageId;
  dislikeTopicCode.value =
    current?.rating === -1 && current.topicCode && hasCurrentTopicInUi
      ? current.topicCode
      : 'OTHER';
  dislikeComment.value =
    current?.rating === -1 && current.comment ? current.comment : '';
  isDislikeDialogOpen.value = true;
}

function closeDislikeDialog() {
  isDislikeDialogOpen.value = false;
  isDislikeTopicSelectOpen.value = false;
  dislikeTargetMessageId.value = null;
  dislikeTopicCode.value = 'OTHER';
  dislikeComment.value = '';
}

function handleDislikeDialogInteractOutside(event: Event) {
  // Если dropdown причины открыт, первый клик снаружи должен закрыть только его.
  if (isDislikeTopicSelectOpen.value) {
    event.preventDefault();
  }
}

function handleDislikeDialogOpenChange(open: boolean) {
  if (!open) {
    closeDislikeDialog();
    return;
  }
  isDislikeDialogOpen.value = true;
}

async function submitDislikeFeedback() {
  if (!dislikeTargetMessageId.value) {
    return;
  }
  const isSaved = await submitFeedback({
    messageId: dislikeTargetMessageId.value,
    rating: -1,
    topicCode: dislikeTopicCode.value,
    comment: normalizeFeedbackComment(dislikeComment.value),
    showSuccessToast: true,
  });
  if (isSaved) {
    closeDislikeDialog();
  }
}

const chatRef = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const THRESHOLD = 80;

const isNearBottom = () => {
  const el = chatRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
};

const scrollToBottom = async (behavior: 'auto' | 'smooth' = 'smooth') => {
  const el = chatRef.value;
  if (!el) return;

  if (CHAT_STREAM_MODE) {
    el.scrollTo({ top: el.scrollHeight, behavior });
  } else {
    await nextTick();

    const messages = Array.from(
      el.querySelectorAll('[data-chat-role="assistant"]')
    ) as HTMLElement[];

    let lastAssistantMessage: HTMLElement | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg) {
        lastAssistantMessage = msg;
        break;
      }
    }

    if (lastAssistantMessage) {
      const scrollTop = lastAssistantMessage.offsetTop - 20;
      el.scrollTo({ top: Math.max(0, scrollTop), behavior });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  }
};

const handleScroll = () => {
  stickToBottom.value = isNearBottom();
};

onMounted(async () => {
  // Ticker eligibility теперь живёт внутри useChatSession (см. cleanup в onScopeDispose composable'а).

  chat.ensureMessageIds();

  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('[Index] Failed to load chat settings:', error);
  }

  // Page-mode: обработка legacy query-параметров lockedFeature/screen.
  // В embedded-режиме маршрут принадлежит Roadmap, эти параметры мы не трогаем.
  if (props.mode === 'page') {
    const rawLockedFeature = route.query.lockedFeature;
    const lockedFeature = Array.isArray(rawLockedFeature)
      ? rawLockedFeature[0]
      : rawLockedFeature;

    if (typeof lockedFeature === 'string' && lockedFeature.trim().length > 0) {
      openPaywall(lockedFeature.trim());
      const nextQuery = { ...route.query };
      delete (nextQuery as any).lockedFeature;
      await router.replace({ path: route.path, query: nextQuery });
    }

    if ('screen' in route.query) {
      const nextQuery = { ...route.query };
      delete (nextQuery as any).screen;
      await router
        .replace({ path: route.path, query: nextQuery })
        .catch(() => {});
    }
  }

  await nextTick();

  if (chat.messages.length > 0) {
    await nextTick();
    const el = chatRef.value;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }
    return;
  }

  // КРИТИЧНО для Roadmap (embedded): каждый ai_chat шаг — НОВАЯ сессия с
  // собственным entryContext (topic_prompt/goal_hint). Если здесь подтянуть
  // прошлую активную therapy_session с сервера, в чат шага 21 «приедут»
  // сообщения шага 14 и eligibility сразу будет выполнена без общения.
  // Кейс воспроизводился пользователем (скриншот сессии 24): два ai_chat
  // шага в одном Saду → во втором видны прежние сообщения, кнопка «Дальше»
  // активна без переписки. Родитель ProgramAiChatAction.vue уже синхронно
  // зачистил store + закрыл предыдущую сессию через endSessionAndSummarize
  // ещё ДО mount этого ChatRoom — здесь restore-step просто опасен.
  if (props.mode !== 'embedded') {
    // Page-mode (`/chat`): на холодном старте восстанавливаем незавершённую
    // сессию с сервера — там пользователь ожидает увидеть свой прошлый чат.
    const restored = await chat.restoreActiveSessionFromServer();
    if (restored && chat.messages.length > 0) {
      await nextTick();
      const el = chatRef.value;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      }
      return;
    }
  }

  scrollToBottom('auto');
  await autoStartConversationIfNeeded();
});

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function getPlanBadgeEmoji(plan: string): string {
  return plan === 'premium' ? '💎' : '⭐';
}

function ensureChatAccessOrPaywall() {
  if (chatAssistantAccess.value.available) {
    return true;
  }
  openPaywall('chat.assistant');
  return false;
}

function ensureRealtimeVoiceAccessOrPaywall() {
  if (realtimeVoiceAccess.value.available) {
    return true;
  }
  openPaywall('chat.realtime_voice');
  return false;
}

function formatDurationShort(totalSeconds: number): string {
  const normalized = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function handleRealtimeVoiceAction() {
  if (realtimeVoice.isBusy.value) {
    return;
  }
  if (realtimeVoice.isActive.value) {
    await realtimeVoiceCallFeedback.notifyHangupIntent();
    await realtimeVoice.stop('user_stop');
    return;
  }
  if (!ensureRealtimeVoiceAccessOrPaywall()) {
    await realtimeVoiceCallFeedback.notifyUnavailableIntent();
    return;
  }
  const consentGranted = await requestAiConsent();
  if (!consentGranted) {
    return;
  }
  await realtimeVoiceCallFeedback.notifyCallIntent();
  await realtimeVoice.start();
}

async function finalizeChatRoomSession(params: {
  reason: ChatSessionFinalizeReason;
}): Promise<ChatSessionFinalizeResult> {
  if (realtimeVoice.isActive.value) {
    await realtimeVoiceCallFeedback.notifyHangupIntent();
    await realtimeVoice.stop('user_stop');
  }

  return chatSession.finalize(params);
}

// При уходе со страницы чата:
//  - chatSession.onScopeDispose останавливает ticker и вызывает finalize(unmount).
//  - finalize() внутри сам зовёт stopChatStream + stopTTS + stopMic + chat.endTherapySession.
//  - subscriptionStore.invalidateCache() тоже происходит внутри finalize().
// Здесь component-level страховочно дёргаем только stopMic, чтобы клавиатура/индикатор
// записи свернулись синхронно ещё до finalize-цепочки (UX мелочь).
onBeforeUnmount(() => {
  void stopMic();
});

watch(
  () => combinedMessages.value.length,
  async (newLength, oldLength) => {
    await nextTick();

    if (oldLength === 0 && newLength > 0) {
      setTimeout(() => {
        const el = chatRef.value;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        }
      }, 150);
      return;
    }

    if (stickToBottom.value) scrollToBottom('smooth');
  }
);

watch(
  () => chat.suggestedChips.length,
  async (chipsCount) => {
    if (!chipsCount) return;
    await nextTick();
    if (stickToBottom.value) scrollToBottom('smooth');
  }
);

watch(
  () => chat.isGenerating,
  async (isGenerating) => {
    if (isGenerating) {
      await nextTick();
      const el = chatRef.value;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
  }
);

watch(
  () => chat.userText,
  (newText, oldText) => {
    const newLength = (newText || '').length;
    const oldLength = (oldText || '').length;

    if (newLength > oldLength && stickToBottom.value) {
      nextTick(() => {
        scrollToBottom('smooth');
      });
    }
  }
);

// Публичный API для embedded-режима. Используется ProgramAiChatAction.vue
// через ref, чтобы:
//   - читать прогресс eligibility и состояние «можно ли завершить» в step runner;
//   - триггерить finalize по нажатию «Дальше» в Roadmap-шаге.
// В page-режиме эти методы не используются (chat.vue не имеет ref на ChatRoom),
// но defineExpose безопасен — он не влияет на встроенное поведение.
defineExpose({
  isEligible: chatSession.isEligible,
  eligibilityProgress: chatSession.eligibilityProgress,
  finalize: finalizeChatRoomSession,
});
</script>

<style scoped>
/* Плавные анимации для списка сообщений с использованием scale */
.message-list-move {
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.message-list-enter-active {
  transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.message-list-leave-active {
  transition: all 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.message-list-enter-from {
  opacity: 0;
  transform: scale(0.85) translateY(20px);
}

.message-list-leave-to {
  opacity: 0;
  transform: scale(0.85) translateY(-20px);
}

/* Убираем элемент из потока во время leave, чтобы остальные плавно заняли его место */
.message-list-leave-active {
  position: absolute;
  width: calc(100% - 2rem);
}

/* Анимация появления/исчезновения индикатора загрузки */
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-slide-enter-to,
.fade-slide-leave-from {
  opacity: 1;
  transform: translateY(0);
}

.feedback-action-button {
  width: 24px;
  height: 24px;
  border-radius: 9999px;
  border: none;
  color: hsl(var(--foreground) / 0.78);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;
}

.feedback-action-button:hover:not(:disabled) {
  color: hsl(var(--foreground));
  background: hsl(var(--background) / 0.28);
}

.feedback-action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.feedback-action-button-active-like {
  color: rgb(52 211 153);
  background: rgb(16 185 129 / 0.16);
}

.feedback-action-button-active-dislike {
  color: rgb(251 113 133);
  background: rgb(244 63 94 / 0.16);
}

/* Стили для markdown контента в сообщениях */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3),
.markdown-content :deep(h4),
.markdown-content :deep(h5),
.markdown-content :deep(h6) {
  font-weight: 600;
  margin-top: 0.75em;
  margin-bottom: 0.5em;
  line-height: 1.4;
}

.markdown-content :deep(h1) {
  font-size: 1.5em;
}

.markdown-content :deep(h2) {
  font-size: 1.3em;
}

.markdown-content :deep(h3) {
  font-size: 1.1em;
}

.markdown-content :deep(p) {
  margin-bottom: 0.75em;
  line-height: 1.6;
}

.markdown-content :deep(strong),
.markdown-content :deep(b) {
  font-weight: 600;
  color: hsl(var(--foreground));
}

.markdown-content :deep(em),
.markdown-content :deep(i) {
  font-style: italic;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin: 0.75em 0;
  padding-left: 1.5em;
  line-height: 1.6;
}

.markdown-content :deep(li) {
  margin: 0.4em 0;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li > p) {
  margin-bottom: 0.4em;
}

.markdown-content :deep(code) {
  background: hsl(var(--muted));
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Courier New', monospace;
}

.markdown-content :deep(pre) {
  background: hsl(var(--muted));
  padding: 1em;
  border-radius: 8px;
  overflow-x: auto;
  margin: 0.75em 0;
}

.markdown-content :deep(pre code) {
  background: transparent;
  padding: 0;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid hsl(var(--primary-ui) / 0.5);
  padding-left: 1em;
  margin: 0.75em 0;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.markdown-content :deep(a) {
  color: hsl(var(--primary-ui));
  text-decoration: underline;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 1em 0;
}

@media (max-width: 480px) {
  .markdown-content {
    font-size: 0.875rem;
    line-height: 1.45;
  }

  .markdown-content :deep(h1),
  .markdown-content :deep(h2),
  .markdown-content :deep(h3),
  .markdown-content :deep(h4),
  .markdown-content :deep(h5),
  .markdown-content :deep(h6) {
    font-size: 0.875rem;
    line-height: 1.3;
  }

  .markdown-content :deep(p),
  .markdown-content :deep(ul),
  .markdown-content :deep(ol) {
    line-height: 1.45;
  }
}
</style>
