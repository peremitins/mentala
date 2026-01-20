<template>
  <div class="flex flex-col flex-1 h-full">
    <!-- Хеддер -->
    <PageHeader title="Ассистент">
      <template #custom>
        <div class="flex items-center justify-between w-full">
          <div class="flex items-center gap-2 px-4">
            <h1 class="text-xl font-bold text-foreground">
              💞&nbsp;&nbsp;Ассистент
            </h1>
          </div>
          <!-- Кнопка настроек в правом верхнем углу -->
          <div class="flex z-10">
            <PopoverRoot v-model:open="settingsOpen">
              <PopoverTrigger as-child>
                <button class="w-7 h-7">
                  <IconSettings class="w-full h-full" />
                </button>
              </PopoverTrigger>
              <PopoverPortal>
                <PopoverContent
                  side="bottom"
                  align="end"
                  :side-offset="8"
                  class="z-50 min-w-[260px] rounded-3xl glass-deep p-3 space-y-4"
                >
                  <div class="flex items-center justify-between gap-0.5 h-10">
                    <div class="text-sm text-foreground">Режим</div>
                    <Combobox
                      class="max-w-[170px]"
                      v-model="displayMode"
                      :options="AI_WORK_MODE_OPTIONS"
                      placeholder="Выберите режим"
                    />
                  </div>

                  <div class="flex items-center justify-between gap-0.5 h-10">
                    <div class="text-sm text-foreground">Тема</div>

                    <Combobox
                      class="max-w-[170px]"
                      v-model="colorMode.preference"
                      :options="THEME_OPTIONS"
                      placeholder="Тема"
                    />
                  </div>

                  <NuxtLink
                    to="/scene-selection"
                    class="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-sm text-foreground transition hover:bg-white/10"
                    @click="settingsOpen = false"
                  >
                    <div class="flex items-center gap-2">
                      <IconSparkles class="h-4 w-4" />
                      <span>Атмосфера</span>
                    </div>
                    <span class="text-xs text-foreground/60">Открыть</span>
                  </NuxtLink>
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
          </div>
        </div>
      </template>
    </PageHeader>

    <AvatarVoiceControls />

    <!-- Основной контент -->
    <div class="flex-1 flex flex-col overflow-hidden relative">
      <!-- Приветственный экран -->

      <WelcomeScreen
        v-if="showWelcomeScreen"
        @select="(mode, userPrompt) => handleWelcomeSelect(mode, userPrompt)"
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
                :key="`msg-${index}-${m.role}`"
                class="w-max px-3 py-2 mb-2 items-center bubble max-w-[80%] glass-deep markdown-content"
                :class="{ 'ml-auto': (m as any).role === 'user' }"
                v-html="
                  (m as any).role === 'assistant'
                    ? formatMessage(m.content)
                    : m.content
                "
              />
              <!-- Индикатор загрузки при генерации ответа -->
              <ChatLoadingIndicator
                v-if="chat.isGenerating"
                key="loading-indicator"
              />
              <SuggestedChips
                v-if="chat.suggestedChips.length"
                key="suggested-chips"
                class="max-w-[85%] self-start"
                :chips="chat.suggestedChips"
                :disabled="isSending"
                @select="handleChipSelect"
              />
            </TransitionGroup>
          </section>
        </div>

        <section class="glass-deep p-2 mt-auto z-100">
          <div class="flex items-center gap-3">
            <TextareaResize
              ref="textareaRef"
              v-model.trim="chat.userText"
              :resize="true"
              :prevent-enter-default="true"
              @enter-pressed="handleKeydown"
              :placeholder="'Напишите сообщение…'"
            />
            <button
              @click="toggleMic"
              class="icon-disc flex items-center justify-center cursor-pointer flex-none"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconMic
                :class="speechStore.isListening ? 'text-primary' : ''"
                class="w-5 h-5"
              />
            </button>
            <button
              @click="onSend"
              class="icon-disc flex items-center justify-center cursor-pointer flex-none"
              :style="{ borderRadius: 'var(--radius-icon)' }"
            >
              <IconSend class="w-5 h-5" />
            </button>
          </div>
        </section>
      </div>
    </div>
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
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useTTS } from '@/app/composables/useTTS';
import { useMarkdown } from '@/app/composables/useMarkdown';
import { useChatStore } from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useColorMode } from '#imports';
import {
  AI_WORK_MODE_OPTIONS,
  THEME_OPTIONS,
} from '@/app/constants/select-options';
import { CHAT_STREAM_MODE } from '@/app/constants/chat';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';

import IconMic from '~icons/lucide/mic';
import IconSend from '~icons/lucide/send';
import IconSettings from '~icons/lucide/settings';
import IconSparkles from '~icons/lucide/sparkles';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from 'radix-vue';
import PageHeader from '@/app/components/PageHeader.vue';
import WelcomeScreen from '@/app/components/WelcomeScreen.vue';
import AvatarVoiceControls from '@/app/components/AvatarVoiceControls.vue';
import SuggestedChips from '@/app/components/chat/SuggestedChips.vue';
import ChatLoadingIndicator from '@/app/components/chat/ChatLoadingIndicator.vue';
import type { SuggestedChip } from '@/shared/dto';
import { useToast } from '@/app/composables/useToast';

const emit = defineEmits<{ (e: 'send', text: string): void }>();

const route = useRoute();
const router = useRouter();
const colorMode = useColorMode();

// Определяем экран на основе query параметра и состояния чата
const showWelcomeScreen = computed(() => {
  const screenParam = route.query.screen as string | undefined;

  // Если в URL указан screen=welcome, показываем welcome
  if (screenParam === 'welcome') {
    return true;
  }

  // Если в URL указан screen=chat, показываем chat
  if (screenParam === 'chat') {
    return false;
  }

  // Если параметра screen нет, определяем по наличию сообщений
  // (для обратной совместимости)
  return chat.messages.length === 0;
});

// Computed для отображения режима в Combobox (маппим 'talk' на 'therapy')
const displayMode = computed({
  get: () => {
    // Если mode === 'talk', отображаем 'therapy' в Combobox
    return chatSettings.mode === 'talk' ? 'therapy' : chatSettings.mode;
  },
  set: (value: string) => {
    // При изменении через Combobox всегда сохраняем в store
    if (value === 'therapy' || value === 'habits') {
      chatSettings.mode = value;
    }
  },
});

// База для наращивания текста во время голосового ввода
const speechBase = ref('');
const lastPartial = ref(''); // Последний partial для сохранения в базу
const chat = useChatStore();
const { settings, start, stop, onPartial, onFinal } = useSpeechEngine();
const speechStore = useSpeechStore();
const chatSettings = useChatSettingsStore();

// Управление TTS озвучкой
const { speak: speakTTS } = useTTS();
const { renderMarkdown } = useMarkdown();

const settingsOpen = ref(false);

// Отслеживаем ручные изменения текста для синхронизации speechBase
// Очищаем speechBase если пользователь полностью удалил текст
const isProcessingVoiceInput = ref(false);
const isSending = ref(false); // Флаг отправки сообщения - блокирует обновление textarea из голосового ввода

onPartial((t) => {
  // Игнорируем partial, если микрофон не слушает (был остановлен) или идет отправка
  if (!speechStore.isListening || isSending.value) return;

  isProcessingVoiceInput.value = true;
  lastPartial.value = t; // Сохраняем последний partial
  const base = speechBase.value.trim();
  console.log('[onPartial] base:', base, 'partial:', t);
  // Показываем: база + текущий partial результат
  chat.userText = (base ? base + ' ' : '') + t;
  nextTick(() => {
    isProcessingVoiceInput.value = false;
  });
});

onFinal((t) => {
  // Игнорируем final, если идет отправка сообщения
  if (isSending.value) return;

  // Для Whisper API isListening может быть false к моменту вызова finalCb
  // Проверяем только наличие текста
  if (!t?.trim()) return;

  // Для final результата используем speechBase как базу
  isProcessingVoiceInput.value = true;
  const base = speechBase.value.trim();
  console.log('[onFinal] base:', base, 'final:', t);
  // Объединяем базу с финальным результатом
  const merged = ((base ? base + ' ' : '') + t).trim();
  // Обновляем speechBase для следующей записи
  speechBase.value = merged;
  chat.userText = merged;

  // stop() уже вызывается в engine.native.ts через событие 'end'
  // Здесь просто обрабатываем текст и проверяем автоотправку

  if (settings.value.autoSend && chat.userText?.trim()) emitSend();

  nextTick(() => {
    isProcessingVoiceInput.value = false;
  });
});

watch(
  () => chat.userText,
  (newText) => {
    if (newText?.trim() && chat.suggestedChips.length) {
      chat.clearSuggestedChips();
    }

    // Пропускаем изменения из-за голосового ввода
    if (isProcessingVoiceInput.value) return;

    // Если текст стал пустым - очищаем speechBase
    if (!newText?.trim()) {
      speechBase.value = '';
    }
  }
);

// Функция для обновления URL с query параметрами
function updateURL(
  screen: 'welcome' | 'chat',
  mode?: 'therapy' | 'habits' | 'talk'
) {
  const query: Record<string, string> = { screen };
  if (mode) {
    query.mode = mode;
  }

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
async function handleWelcomeSelect(
  mode: 'therapy' | 'habits' | 'talk',
  userPrompt?: string
) {
  // Режим уже установлен в WelcomeScreen компоненте
  // Обновляем URL с параметрами screen=chat и mode
  updateURL('chat', mode);

  // Начинаем диалог от ассистента (без user-сообщения "Привет")
  try {
    chat.startSession();

    // Вызываем новый метод startConversation - он НЕ добавляет user-сообщение
    const res = await chat.startConversation({
      mode,
      userPrompt,
    });

    if (res?.ok) {
      // Озвучим ответ ассистента после получения
      await nextTick();
      if (chatSettings.voice === true) {
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

async function toggleMic() {
  if (speechStore.isListening) {
    // Принудительное отключение микрофона
    await stop();
    // Если после остановки текст пустой, очищаем speechBase
    if (!chat.userText?.trim()) {
      speechBase.value = '';
    }
    return;
  }

  // Запускаем запись - используем текущий текст как базу
  speechBase.value = chat.userText?.trim() || '';

  try {
    await start();
    // start() автоматически установит isListening = true
  } catch (error) {
    console.error('[toggleMic] Failed to start:', error);
    speechStore.isListening = false;
    speechBase.value = '';
  }
}

function emitSend() {
  if (!chat.userText?.trim()) return;
  const finalText = chat.userText?.trim();
  emit('send', finalText);
}

function handleKeydown(e: KeyboardEvent) {
  if (!chat.userText?.trim()) return;
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
  if (content && chatSettings.voice) {
    // Используем только TTS для озвучки
    // useTTS автоматически останавливает предыдущую озвучку
    await speakTTS(content);
  }
}

const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);

const sendText = async (rawText: string) => {
  const textToSend = rawText?.trim();
  if (!textToSend) return;

  // Устанавливаем флаг отправки - блокируем обновление textarea из голосового ввода
  isSending.value = true;

  // Останавливаем микрофон, если он активен
  if (speechStore.isListening) {
    await stop();
  }

  // Очищаем состояние голосового ввода
  speechBase.value = '';
  chat.userText = '';

  // Сбрасываем высоту textarea к исходному состоянию
  nextTick(() => {
    textareaRef.value?.resetHeight();
  });

  let res: any = null;
  try {
    res = await chat.sendMessage(JSON.parse(JSON.stringify(textToSend)));
  } catch (error) {
    console.error('[sendText] Failed to send message:', error);
    isSending.value = false; // Сбрасываем флаг при ошибке
    return;
  }

  if (res?.ok) {
    chat.startSession();

    // Озвучим последний ответ ассистента через TTS OpenAI
    if (chatSettings.voice === true) {
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
  if (!chat.userText?.trim()) return;
  await sendText(chat.userText);
};

const handleChipSelect = async (chip: SuggestedChip) => {
  // Чипы отправляются сразу, не заполняя textarea.
  if (isSending.value) return;
  if (chip.kind === 'action') {
    await handleActionChip(chip);
    return;
  }
  await sendText(chip.text);
};

const handleActionChip = async (chip: SuggestedChip) => {
  if (!chip.action) return;

  // Скрываем текущие чипы, чтобы не дублировать навигацию
  chat.clearSuggestedChips();

  if (chip.action === 'open_meditations') {
    await router.push('/meditations');
    useToast('Открываю медитации');
    return;
  }

  if (chip.action === 'open_meditation_track' && chip.params?.trackId) {
    await router.push({
      path: '/meditations',
      query: { trackId: chip.params.trackId },
    });
    useToast('Открываю медитацию');
    return;
  }

  if (
    chip.action === 'open_meditations_collection' &&
    chip.params?.collectionId
  ) {
    // collectionId трактуем как ключ темы медитаций
    await router.push(`/meditations?topic=${chip.params.collectionId}`);
    useToast('Открываю подборку');
  }
};

const combinedMessages = computed(() => chat?.messages || []);

// Функция для форматирования сообщения с markdown
const formatMessage = (content: string) => {
  if (!content) return '';
  // Рендерим markdown только для сообщений ассистента
  return renderMarkdown(content);
};

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

    // Находим все сообщения (элементы с классом bubble)
    const messages = Array.from(
      el.querySelectorAll('.bubble')
    ) as HTMLElement[];

    // Находим последнее сообщение ассистента (без класса ml-auto)
    let lastAssistantMessage: HTMLElement | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && !msg.classList.contains('ml-auto')) {
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

// Watch на route.query для реакции на изменение URL (например, при навигации назад/вперед)
watch(
  () => route.query,
  (newQuery) => {
    if (isUpdatingURL.value) return;

    const screenParam = newQuery.screen as string | undefined;
    const modeParam = newQuery.mode as
      | 'therapy'
      | 'habits'
      | 'talk'
      | undefined;

    // Если в URL указан режим и экран чата, восстанавливаем режим
    if (screenParam === 'chat' && modeParam) {
      // Устанавливаем режим в настройках (маппим talk на therapy для внутреннего использования)
      if (modeParam === 'talk') {
        chatSettings.mode = 'therapy';
      } else if (modeParam === 'therapy' || modeParam === 'habits') {
        chatSettings.mode = modeParam;
      }
    }
  },
  { immediate: false }
);

// Watch на chat.messages для синхронизации URL
watch(
  () => chat.messages.length,
  (messageCount) => {
    if (isUpdatingURL.value) return;

    const screenParam = route.query.screen as string | undefined;

    // Если сообщения появились и screen не chat - обновляем URL
    if (messageCount > 0 && screenParam !== 'chat') {
      const currentMode = chatSettings.mode;
      const modeForURL = currentMode === 'therapy' ? 'therapy' : currentMode;
      isUpdatingURL.value = true;
      updateURL('chat', modeForURL as 'therapy' | 'habits' | 'talk');
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
  // Загружаем настройки чата при монтировании
  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('[Index] Failed to load chat settings:', error);
  }

  // Восстанавливаем состояние из query параметров
  const screenParam = route.query.screen as string | undefined;
  const modeParam = route.query.mode as
    | 'therapy'
    | 'habits'
    | 'talk'
    | undefined;

  // Если в URL указан режим и экран чата, восстанавливаем режим
  if (screenParam === 'chat' && modeParam) {
    // Устанавливаем режим в настройках (маппим talk на therapy для внутреннего использования)
    if (modeParam === 'talk') {
      chatSettings.mode = 'therapy';
    } else if (modeParam === 'therapy' || modeParam === 'habits') {
      chatSettings.mode = modeParam;
    }
  }

  // Если screen не указан в URL, но есть сообщения - устанавливаем screen=chat
  if (!screenParam && chat.messages.length > 0) {
    const currentMode = chatSettings.mode;
    const modeForURL = currentMode === 'therapy' ? 'therapy' : currentMode;
    isUpdatingURL.value = true;
    updateURL('chat', modeForURL as 'therapy' | 'habits' | 'talk');
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
    const currentMode = chatSettings.mode || 'therapy';
    const modeForURL = currentMode === 'therapy' ? 'therapy' : currentMode;
    isUpdatingURL.value = true;
    updateURL('chat', modeForURL as 'therapy' | 'habits' | 'talk');
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

// Завершаем therapy сессию и останавливаем сервисы при уходе со страницы
onBeforeUnmount(() => {
  // Завершаем therapy сессию
  if (chat.therapySessionId && !chat.isEndingSession) {
    void chat.endTherapySession();
  }
  // Останавливаем голосовой ввод
  stop();

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

// автосохранение режима AI при изменении
watch(
  () => chatSettings.mode,
  async (newMode) => {
    if (
      newMode &&
      (newMode === 'therapy' || newMode === 'habits' || newMode === 'talk')
    ) {
      // Сохраняем только если режим валидный (talk сохраняется как 'therapy' на бэкенде)
      const modeToSave = newMode === 'talk' ? 'therapy' : newMode;
      await chatSettings.updateChatSettings({ mode: modeToSave }, false);
    }
  },
  { immediate: false }
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
  border-left: 3px solid hsl(var(--primary) / 0.5);
  padding-left: 1em;
  margin: 0.75em 0;
  color: hsl(var(--muted-foreground));
  font-style: italic;
}

.markdown-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.markdown-content :deep(hr) {
  border: none;
  border-top: 1px solid hsl(var(--border));
  margin: 1em 0;
}
</style>
