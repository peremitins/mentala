<template>
  <div class="flex flex-col flex-1 h-full">
    <!-- Хеддер -->
    <PageHeader title="Ассистент">
      <template #custom>
        <div class="flex items-center gap-2 px-4">
          <h1 class="text-xl font-bold text-foreground">
            💞&nbsp;&nbsp;Ассистент
          </h1>
        </div>
      </template>
    </PageHeader>

    <AvatarVoiceControls v-if="!showWelcomeScreen" />

    <!-- Основной контент -->
    <div
      class="flex-1 flex flex-col overflow-hidden absolute w-full top-0 left-0 rounded-lg z-0"
      :style="chatViewportStyle"
      :class="{ 'pt-[100px]': showWelcomeScreen }"
    >
      <!-- Приветственный экран -->

      <WelcomeScreen
        v-if="showWelcomeScreen"
        :locked="!chatAssistantAccess.available"
        :required-plan="chatAssistantAccess.requiredPlan"
        @select="handleWelcomeSelect"
        class="flex-1"
      />

      <!-- Экран чата -->

      <div
        v-if="!showWelcomeScreen"
        class="flex flex-col flex-1 h-full space-y-6 relative"
      >
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
                    class="items-center markdown-content"
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
                :class="
                  isUserTextOverLimit
                    ? 'ring-2 ring-red-500/60 !border-red-500/70 transition-colors duration-200'
                    : 'ring-0 ring-transparent transition-colors duration-200'
                "
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
                type="button"
                @click="toggleMic"
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
            <div class="flex items-center">
              <button
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
import { useChatStore, type ChatMessageFeedbackState } from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSubscriptionStore } from '@/app/stores/subscription';
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
import IconPhoneCall from '~icons/lucide/phone-call';
import IconPhoneOff from '~icons/lucide/phone-off';
import IconThumbsUp from '~icons/lucide/thumbs-up';
import IconThumbsDown from '~icons/lucide/thumbs-down';
import IconLoaderCircle from '~icons/lucide/loader-circle';
import PageHeader from '@/app/components/PageHeader.vue';
import WelcomeScreen from '@/app/components/WelcomeScreen.vue';
import AvatarVoiceControls from '@/app/components/AvatarVoiceControls.vue';
import SuggestedChips from '@/app/components/chat/SuggestedChips.vue';
import ChatLoadingIndicator from '@/app/components/chat/ChatLoadingIndicator.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import {
  ChatFeedbackUpsertResponseDto,
  type SuggestedChip,
  type ChatFeedbackTopicCode,
} from '@/shared/dto';
import { getAddressingCopy } from '@/app/lib/addressingCopy';
import { useAppNavigation } from '@/app/composables/useAppNavigation';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useNuxtApp, useRuntimeConfig } from '#imports';
import { resolveAddressing } from '@/shared/utils/addressing';

const emit = defineEmits<{ (e: 'send', text: string): void }>();

const route = useRoute();
const router = useRouter();
const { navigateToTarget } = useAppNavigation();
const auth = useAuthStore();
const addressing = computed(() => resolveAddressing(auth.user?.addressing));
const chatViewportStyle = computed(() => {
  const bottomOffset = '95px';

  return {
    bottom: bottomOffset,
    height: `calc(100% - ${bottomOffset})`,
  };
});

// Определяем экран на основе query параметра и состояния чата
const showWelcomeScreen = computed(() => {
  const screenParam = route.query.screen as string | undefined;

  // Если в URL указан screen=welcome, показываем welcome
  if (screenParam === 'welcome') {
    return true;
  }

  // Если в URL указан screen=chat, показываем chat
  if (screenParam === 'chat') {
    // Если чат недоступен и нет истории, остаёмся на welcome с paywall-CTA.
    if (!chatAssistantAccess.value.available && chat.messages.length === 0) {
      return true;
    }
    return false;
  }

  // Если параметра screen нет, определяем по наличию сообщений
  // (для обратной совместимости)
  return chat.messages.length === 0;
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

// Ограничение длины пользовательского ввода для защиты бюджета.
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

// Управление TTS озвучкой
const { speak: speakTTS, stop: stopTTS } = useTTS();
const { renderMarkdown } = useMarkdown();

const isSending = ref(false); // Флаг отправки сообщения - блокирует обновление textarea из голосового ввода
const lastSendPointerTs = ref(0); // Защита от двойного клика после pointer-события

const {
  settings,
  toggleListening: toggleMic,
  stopListening: stopMic,
  clearBaseText: clearVoiceBase,
} = useVoiceDictationInput({
  getValue: () => chat.userText,
  setValue: (value) => {
    chat.userText = value;
  },
  isBlocked: isSending,
  onStartError: (error) => {
    console.error('[Chat] Failed to start dictation:', error);
  },
  onFinalTranscription: ({ mergedText }) => {
    if (!settings.value.autoSend || !mergedText.trim()) return;
    emitSend();
  },
});
const realtimeVoice = useRealtimeVoiceSession({
  onBeforeStart: async () => {
    chat.stopChatStream();
    stopTTS();

    if (speechStore.isListening) {
      await stopMic();
    }

    clearVoiceBase();

    if (chat.therapySessionId && !chat.isEndingSession) {
      await chat.endTherapySession();
    }
  },
  getReadyMessageText: () =>
    getAddressingCopy('realtimeReadyHint', addressing.value),
});
const realtimeVoiceCallFeedback = useRealtimeVoiceCallFeedback({
  status: realtimeVoice.status,
  errorMessage: realtimeVoice.errorMessage,
});
const isTextInputDisabled = computed(() => realtimeVoice.blocksTextInput.value);
const shouldShowSuggestedChips = computed(
  () =>
    chat.suggestedChips.length > 0 &&
    !realtimeVoice.isActive.value &&
    !realtimeVoice.isBusy.value
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

// Функция для обновления URL с query параметрами
function updateURL(screen: 'welcome' | 'chat') {
  const query: Record<string, string> = { screen };

  // Используем replace, чтобы не создавать новую запись в истории
  router
    .replace({
      path: route.path,
      query,
    })
    .catch(() => {
      // Игнорируем ошибки навигации (например, если уже находимся на этой странице)
    });
}

// Обработчик выбора на приветственном экране
async function handleWelcomeSelect() {
  if (!ensureChatAccessOrPaywall()) {
    return;
  }

  console.log('chat.messages?.length111', chat.messages?.length);
  if (chat.messages?.length) {
    console.log('chat.messages?.length', chat.messages?.length);
    updateURL('chat');
    await nextTick();
    await scrollToBottom('auto');
    return;
  }

  updateURL('chat');

  // Начинаем диалог от ассистента (без user-сообщения "Привет")
  try {
    chat.startSession();

    // Вызываем новый метод startConversation - он НЕ добавляет user-сообщение
    const res = await chat.startConversation();

    if (res?.ok) {
      // Озвучим ответ ассистента после получения
      await nextTick();
      if (isTtsEnabled.value && chatSettings.voice === true) {
        const last = [...chat.messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        const content =
          last && typeof last.content === 'string' ? last.content : '';
        if (content) {
          // Озвучиваем - если аватар еще не готов, он подключится позже через события
          await speakLastMessage(content);
        }
      }
    }
  } catch (error) {
    console.error('[handleWelcomeSelect] Failed to start conversation:', error);
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
    // Ctrl+Enter или Cmd+Enter → добавить перенос строки
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
    // Просто Enter → отправляем сообщение
    e.preventDefault();
    onSend();
  }
}

async function speakLastMessage(content: string) {
  if (content && isTtsEnabled.value && chatSettings.voice) {
    // Используем только TTS для озвучки
    // useTTS автоматически останавливает предыдущую озвучку
    await speakTTS(content);
  }
}

const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);

const sendText = async (rawText: string) => {
  if (!ensureChatAccessOrPaywall()) return;
  if (isTextInputDisabled.value) return;
  const textToSend = rawText?.trim();
  if (!textToSend) return;

  const currentText = textToSend;

  // Устанавливаем флаг отправки - блокируем обновление textarea из голосового ввода
  isSending.value = true;

  // Останавливаем микрофон, если он активен
  if (speechStore.isListening) {
    // Останавливаем микрофон, но не ждём финального колбэка - отправляем сразу.
    void stopMic();
  }

  // Очищаем состояние голосового ввода
  clearVoiceBase();

  // Очищаем ввод после захвата текста, чтобы отправка на мобильных срабатывала сразу.
  chat.userText = '';

  // Сбрасываем высоту textarea к исходному состоянию
  nextTick(() => {
    textareaRef.value?.resetHeight();
  });

  let res: any = null;
  try {
    res = await chat.sendMessage(JSON.parse(JSON.stringify(currentText)));
  } catch (error) {
    console.error('[sendText] Failed to send message:', error);
    isSending.value = false; // Сбрасываем флаг при ошибке
    return;
  }

  if (res?.ok) {
    chat.startSession();

    // Озвучим последний ответ ассистента через TTS OpenAI
    if (isTtsEnabled.value && chatSettings.voice === true) {
      const last = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant');
      const content =
        last && typeof last.content === 'string' ? last.content : '';
      await speakLastMessage(content);
    }
  }

  // Сбрасываем флаг отправки после завершения
  // Используем небольшую задержку, чтобы убедиться, что все асинхронные вызовы onFinal завершились
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

  // Скрываем текущие чипы, чтобы не дублировать навигацию
  chat.clearSuggestedChips();

  if (chip.target) {
    await navigateToTarget(chip.target, {
      source: 'chat_chip',
      entryPoint: 'assistant_suggested_chip',
    });
  }
};

const combinedMessages = computed(() => chat?.messages || []);

// Функция для форматирования сообщения с markdown
const formatMessage = (content: string) => {
  if (!content) return '';
  // Рендерим markdown только для сообщений ассистента
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
const stickToBottom = ref(true); // «прилипать» ли при добавлении
const THRESHOLD = 80; // порог, насколько близко к низу считать «рядом»

const isNearBottom = () => {
  const el = chatRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
};

const scrollToBottom = async (behavior: 'auto' | 'smooth' = 'smooth') => {
  const el = chatRef.value;
  if (!el) return;

  if (CHAT_STREAM_MODE) {
    // Для stream режима скроллим до самого низа
    el.scrollTo({ top: el.scrollHeight, behavior });
  } else {
    // Для non-stream режима находим последний ответ ИИ и скроллим так, чтобы он был вверху
    await nextTick();

    // Находим все сообщения ассистента по data-атрибуту роли.
    const messages = Array.from(
      el.querySelectorAll('[data-chat-role="assistant"]')
    ) as HTMLElement[];

    // Находим последнее сообщение ассистента.
    let lastAssistantMessage: HTMLElement | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg) {
        lastAssistantMessage = msg;
        break;
      }
    }

    if (lastAssistantMessage) {
      // Скроллим так, чтобы последний ответ был вверху видимой области
      const scrollTop = lastAssistantMessage.offsetTop - 20; // Небольшой отступ сверху 20px
      el.scrollTo({ top: Math.max(0, scrollTop), behavior });
    } else {
      // Если не нашли сообщение ассистента, скроллим до низа
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
  }
};

const handleScroll = () => {
  // если пользователь отскроллил далеко вверх — перестаём автоприлипать
  stickToBottom.value = isNearBottom();
};

// Флаг для предотвращения циклических обновлений URL
const isUpdatingURL = ref(false);

// Watch на chat.messages для синхронизации URL
watch(
  () => chat.messages.length,
  (messageCount) => {
    if (isUpdatingURL.value) return;

    const screenParam = route.query.screen as string | undefined;

    // Если сообщения появились и screen не chat - обновляем URL
    if (messageCount > 0 && screenParam !== 'chat') {
      isUpdatingURL.value = true;
      updateURL('chat');
      nextTick(() => {
        isUpdatingURL.value = false;
      });
    }
    // Если сообщений нет и screen не welcome - обновляем URL
    else if (messageCount === 0 && screenParam !== 'welcome') {
      isUpdatingURL.value = true;
      updateURL('welcome');
      nextTick(() => {
        isUpdatingURL.value = false;
      });
    }
  },
  { immediate: false }
);

onMounted(async () => {
  // Нормализуем legacy-состояние сообщений без id (например, после HMR).
  chat.ensureMessageIds();

  // Загружаем настройки чата при монтировании
  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('[Index] Failed to load chat settings:', error);
  }

  // Восстанавливаем состояние из query параметров
  const screenParam = route.query.screen as string | undefined;
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

  // Если screen не указан в URL, но есть сообщения - устанавливаем screen=chat
  if (!screenParam && chat.messages.length > 0) {
    isUpdatingURL.value = true;
    updateURL('chat');
    nextTick(() => {
      isUpdatingURL.value = false;
    });
  }
  // Если screen не указан и нет сообщений - устанавливаем screen=welcome
  else if (!screenParam && chat.messages.length === 0) {
    isUpdatingURL.value = true;
    updateURL('welcome');
    nextTick(() => {
      isUpdatingURL.value = false;
    });
  }
  // Если есть entryContext (переход с другой страницы), но screen не указан - устанавливаем screen=chat
  else if (!screenParam && chat.entryContext) {
    isUpdatingURL.value = true;
    updateURL('chat');
    nextTick(() => {
      isUpdatingURL.value = false;
    });
  }

  await nextTick();

  // Если есть сообщения (переход в чат с других страниц), скроллим в самый низ
  if (chat.messages.length > 0) {
    // Даем время на рендеринг сообщений
    await nextTick();
    const el = chatRef.value;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
    }
  } else {
    scrollToBottom('auto'); // на старте — без анимации
  }
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

  await realtimeVoiceCallFeedback.notifyCallIntent();
  await realtimeVoice.start();
}

// Завершаем therapy сессию и останавливаем сервисы при уходе со страницы
onBeforeUnmount(() => {
  // Завершаем therapy сессию
  if (chat.therapySessionId && !chat.isEndingSession) {
    void chat.endTherapySession();
  }
  // Останавливаем голосовой ввод
  void stopMic();

  // Сбрасываем кэш subscription store для обновления данных при следующем заходе
  const subscriptionStore = useSubscriptionStore();
  subscriptionStore.invalidateCache();
});

// когда приходит новое сообщение — скроллим, если пользователь внизу
watch(
  () => combinedMessages.value.length,
  async (newLength, oldLength) => {
    await nextTick();

    // Если сообщения появились впервые (переход в чат с других страниц)
    if (oldLength === 0 && newLength > 0) {
      // Даем время на рендеринг всех сообщений и скроллим в самый низ
      setTimeout(() => {
        const el = chatRef.value;
        if (el) {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        }
      }, 150);
      return;
    }

    // Обычное поведение для новых сообщений
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

// Когда появляется индикатор загрузки — скроллим в самый низ, чтобы он был виден
watch(
  () => chat.isGenerating,
  async (isGenerating) => {
    if (isGenerating) {
      await nextTick();
      // Всегда скроллим в самый низ при появлении индикатора загрузки
      const el = chatRef.value;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }
  }
);

// отслеживаем изменение текста в textarea для автоматической прокрутки сообщений вниз
// когда textarea увеличивается в высоте, блок с сообщениями уменьшается
// и нужно прокрутить вниз, чтобы последние сообщения оставались видимыми
watch(
  () => chat.userText,
  (newText, oldText) => {
    const newLength = (newText || '').length;
    const oldLength = (oldText || '').length;

    // Прокручиваем вниз только если текст увеличился (высота textarea растет)
    // и пользователь находится внизу (не скроллит вверх)
    if (newLength > oldLength && stickToBottom.value) {
      nextTick(() => {
        scrollToBottom('smooth');
      });
    }
  }
);

// отменяем запросы при возврате на welcome screen и синхронизируем URL
watch(
  () => showWelcomeScreen.value,
  async (isWelcomeScreen, wasWelcomeScreen) => {
    if (isWelcomeScreen && !isUpdatingURL.value) {
      const screenParam = route.query.screen as string | undefined;
      // Обновляем URL только если он еще не установлен на welcome
      if (screenParam !== 'welcome') {
        isUpdatingURL.value = true;
        updateURL('welcome');
        nextTick(() => {
          isUpdatingURL.value = false;
        });
      }
    }

    // При переходе с welcome на chat (когда появляются сообщения) скроллим вниз
    if (wasWelcomeScreen && !isWelcomeScreen && chat.messages.length > 0) {
      await nextTick();
      const el = chatRef.value;
      if (el) {
        // Даем время на рендеринг всех сообщений
        setTimeout(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
        }, 100);
      }
    }
  }
);
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
</style>
