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
                </PopoverContent>
              </PopoverPortal>
            </PopoverRoot>
          </div>
        </div>
      </template>
    </PageHeader>

    <!-- Кнопки управления аватаром и звуком -->
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
          <section class="w-full h-full grid place-items-center">
            <div
              v-if="chatSettings.avatar"
              class="relative w-full h-full overflow-hidden max-w-[480px]"
            >
              <HeyGenPlayer />
            </div>
            <div
              v-else
              class="relative w-full h-full overflow-hidden max-w-[480px]"
            >
              <div class="w-full h-full grid place-items-center">
                <div class="text-sm text-muted-foreground">
                  <!-- Аватар не включен -->
                </div>
              </div>
            </div>
          </section>

          <section
            ref="chatRef"
            @scroll="handleScroll"
            class="absolute bottom-0 overflow-auto max-h-[100%] inset-x-0 pt-[50%] flex flex-col space-y-3"
            :class="{ 'chat-fade': heygen.isConnected }"
          >
            <div
              v-for="(m, index) in combinedMessages"
              :key="index"
              class="w-max px-3 py-1 mb-2 items-center bubble max-w-[80%]"
              :class="{ 'ml-auto': (m as any).role === 'user' }"
              v-html="m.content"
            />
          </section>
        </div>

        <section
          class="glass-deep p-2 mt-auto z-100"
          :style="{ borderRadius: `calc(var(--radius-sm))` }"
        >
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
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useTTS } from '@/app/composables/useTTS';
import { useChatStore } from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useHeygenStore } from '@/app/stores/heygen';
import { useSubscriptionStore } from '@/app/stores/subscription';
import { useColorMode } from '#imports';
import {
  AI_WORK_MODE_OPTIONS,
  THEME_OPTIONS,
} from '@/app/constants/select-options';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';

import IconMic from '~icons/lucide/mic';
import IconSend from '~icons/lucide/send';
import IconSettings from '~icons/lucide/settings';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from 'radix-vue';
import PageHeader from '@/app/components/PageHeader.vue';
import WelcomeScreen from '@/app/components/WelcomeScreen.vue';
import AvatarVoiceControls from '@/app/components/AvatarVoiceControls.vue';
import HeyGenPlayer from '@/app/components/HeyGenPlayer.vue';

const emit = defineEmits<{ (e: 'send', text: string): void }>();

const colorMode = useColorMode();

// Показываем приветственный экран, если нет сообщений
const showWelcomeScreen = computed(() => chat.messages.length === 0);

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
const heygen = useHeygenStore();

// Управление TTS озвучкой
const { speak: speakTTS } = useTTS();

const settingsOpen = ref(false);

// Отслеживаем ручные изменения текста для синхронизации speechBase
// Очищаем speechBase если пользователь полностью удалил текст
const isProcessingVoiceInput = ref(false);

onPartial((t) => {
  // Игнорируем partial, если микрофон не слушает (был остановлен)
  if (!speechStore.isListening) return;

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
  // Игнорируем final, если микрофон не слушает (был остановлен)
  if (!speechStore.isListening) return;

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
    // Пропускаем изменения из-за голосового ввода
    if (isProcessingVoiceInput.value) return;

    // Если текст стал пустым - очищаем speechBase
    if (!newText?.trim()) {
      speechBase.value = '';
    }
  }
);

// Обработчик выбора на приветственном экране
async function handleWelcomeSelect(
  mode: 'therapy' | 'habits' | 'talk',
  userPrompt?: string
) {
  // Режим уже установлен в WelcomeScreen компоненте
  // Начинаем диалог от ассистента (без user-сообщения "Привет")
  try {
    chat.startSession();

    // Запускаем аватар, если он включен (заранее, до получения ответа)
    if (chatSettings.avatar && !heygen.isConnected && !heygen.isStarting) {
      await heygen.startSession();
    }

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
  if (content) {
    // Если аватар включен, используем его для озвучки
    if (chatSettings.avatar && heygen.isConnected) {
      await heygen.speak(content);
    } else if (chatSettings.voice) {
      // Используем TTS только если аватар выключен
      // useTTS автоматически останавливает предыдущую озвучку
      await speakTTS(content);
    }
  }
}

const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);

const onSend = async () => {
  if (!chat.userText?.trim()) return;

  // Останавливаем микрофон, если он активен
  if (speechStore.isListening) {
    await stop();
  }

  // Сохраняем текст перед очисткой
  const textToSend = chat.userText.trim();

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
    console.error('[onSend] Failed to send message:', error);
    return;
  }

  if (res?.ok) {
    chat.startSession();

    // Озвучим последний ответ ассистента через HeyGen или TTS OpenAI
    if (chatSettings.voice === true) {
      const last = [...chat.messages]
        .reverse()
        .find((m) => m.role === 'assistant');
      const content =
        last && typeof last.content === 'string' ? last.content : '';
      await speakLastMessage(content);
    }
  }
};

const combinedMessages = computed(() => chat?.messages || []);

// длина контента последнего сообщения (для стриминга)
const lastMessageContentLen = computed(() => {
  const arr = combinedMessages.value as Array<any>;
  if (!arr || arr.length === 0) return 0;
  const last = arr[arr.length - 1];
  const text = last && typeof last.content === 'string' ? last.content : '';
  return text.length;
});

const chatRef = ref<HTMLElement | null>(null);
const stickToBottom = ref(true); // «прилипать» ли при добавлении
const THRESHOLD = 80; // порог, насколько близко к низу считать «рядом»

const isNearBottom = () => {
  const el = chatRef.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD;
};

const scrollToBottom = (behavior: 'auto' | 'smooth' = 'smooth') => {
  const el = chatRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
};

const handleScroll = () => {
  // если пользователь отскроллил далеко вверх — перестаём автоприлипать
  stickToBottom.value = isNearBottom();
};

// Функция для автоматического запуска аватара, если он включен
async function autoStartAvatarIfEnabled() {
  // Проверяем, включен ли аватар в настройках
  if (
    chatSettings.avatar &&
    !heygen.isConnected &&
    !heygen.isStarting &&
    chat.messages?.length
  ) {
    try {
      await heygen.startSession();
    } catch (error) {
      console.error('[Index] Failed to auto-start avatar:', error);
    }
  }
}

onMounted(async () => {
  // Загружаем настройки чата при монтировании
  try {
    await chatSettings.getChatSettings();
  } catch (error) {
    console.error('[Index] Failed to load chat settings:', error);
  }

  await nextTick();
  scrollToBottom('auto'); // на старте — без анимации

  // Автоматически запускаем аватар, если он включен в настройках
  await autoStartAvatarIfEnabled();
});

// Завершаем therapy сессию и останавливаем сервисы при уходе со страницы
onBeforeUnmount(() => {
  // Завершаем therapy сессию
  if (chat.therapySessionId && !chat.isEndingSession) {
    void chat.endTherapySession();
  }
  // Останавливаем голосовой ввод и HeyGen
  stop();
  heygen.stopSession();

  // Сбрасываем кэш subscription store для обновления данных при следующем заходе
  const subscriptionStore = useSubscriptionStore();
  subscriptionStore.invalidateCache();
});

// когда приходит новое сообщение — скроллим, если пользователь внизу
watch(
  () => combinedMessages.value.length,
  async () => {
    await nextTick();
    if (stickToBottom.value) scrollToBottom('smooth');
  }
);

// при поступлении стрим-чанков (меняется длина текста последнего сообщения)
watch(
  () => lastMessageContentLen.value,
  async () => {
    await nextTick();
    if (stickToBottom.value) scrollToBottom('smooth');
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

// Останавливаем HeyGen и отменяем запросы при возврате на welcome screen
watch(
  () => showWelcomeScreen.value,
  async (isWelcomeScreen) => {
    if (isWelcomeScreen) {
      // Отменяем текущий chat stream запрос (если он активен)
      // clearMessages уже вызывает endTherapySession, поэтому не нужно вызывать отдельно
      chat.clearMessages();

      // Останавливаем HeyGen сессию, если она была запущена
      if (heygen.isConnected || heygen.isStarting) {
        try {
          await heygen.stopSession();
        } catch (error) {
          console.error(
            '[Index] Failed to stop HeyGen session on welcome screen:',
            error
          );
        }
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
