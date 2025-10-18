<template>
  <div class="flex flex-col flex-1 h-full space-y-6 pb-2 relative">
    <div class="absolute top-4 right-4 flex flex-col gap-y-3 z-1">
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
              <div class="text-sm opacity-80">Режим</div>
              <SelectField
                v-model="chatSettings.mode"
                :options="modeOptions"
                placeholder="Выберите режим"
              />
            </div>

            <div class="flex items-center justify-between h-10">
              <div class="text-sm">Голос</div>

              <SwitchRoot
                v-model:checked="chatSettings.voice"
                @update:checked="onSwitchChangeVoice"
                class="w-12 h-6 rounded-full border border-white/15 bg-white/10 backdrop-blur flex items-center px-1 data-[state=checked]:bg-green-500"
              >
                <SwitchThumb
                  class="w-4 h-4 bg-white rounded-full transition-transform translate-x-0 data-[state=checked]:translate-x-6"
                />
              </SwitchRoot>
            </div>

            <div class="flex items-center justify-between h-10">
              <div class="text-sm">Аватар</div>
              <SwitchRoot
                v-model:checked="chatSettings.avatar"
                @update:checked="onSwitchChangeAvatar"
                class="w-12 h-6 rounded-full border border-white/15 bg-white/10 backdrop-blur flex items-center px-1 data-[state=checked]:bg-green-500"
              >
                <SwitchThumb
                  class="w-4 h-4 bg-white rounded-full transition-transform translate-x-0 data-[state=checked]:translate-x-6"
                />
              </SwitchRoot>
            </div>

            <div class="flex items-center justify-between gap-0.5 h-10">
              <div class="text-sm opacity-80">Тема</div>
              <SelectField
                v-model="chatSettings.theme"
                :options="themeOptions"
                placeholder="Тема"
              />
            </div>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>

      <div class="transition-all duration-200 hover:scale-105 active:scale-95">
        <div class="w-7 h-7 flex items-center justify-center">
          <button class="w-full h-full" @click="startSession()">
            <img
              v-if="!heygen.isConnected"
              src="@/app/assets/images/avatar_on.svg"
              alt="avatar"
              class="w-full h-full"
            />
            <img
              v-if="heygen.isConnected"
              src="@/app/assets/images/avatar_off.svg"
              alt="avatar"
              class="w-full h-full"
            />
          </button>
        </div>
      </div>
      <div class="transition-all duration-200 hover:scale-105 active:scale-95">
        <div class="w-7 h-7 flex items-center justify-center">
          <button
            class="w-full h-full"
            @click="onSwitchChangeVoice(!chatSettings.voice)"
          >
            <img
              v-if="chatSettings.voice === true"
              src="@/app/assets/images/voice_on.svg"
              alt="voice"
              class="w-full h-full"
            />
            <img
              v-if="chatSettings.voice === false"
              src="@/app/assets/images/voice_off.svg"
              alt="voice"
              class="w-full h-full"
            />
          </button>
        </div>
      </div>
    </div>

    <div class="relative h-full mb-2 glass-deep">
      <section class="w-full h-full grid place-items-center">
        <div
          class="relative w-auto h-full overflow-hidden w-full max-w-[480px]"
        >
          <HeyGenPlayer />
        </div>
      </section>

      <section
        ref="chatRef"
        @scroll="handleScroll"
        class="absolute bottom-0 overflow-auto max-h-[100%] inset-x-0 pt-[50%] px-4 flex flex-col space-y-3"
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
          v-model.trim="chat.userText"
          :resize="true"
          :prevent-enter-default="true"
          @enter-pressed="handleKeydown"
          :placeholder="'Type a message...'"
        />
        <button
          @click="toggleMic"
          class="icon-disc flex items-center justify-center cursor-pointer flex-none"
          :style="{ borderRadius: 'var(--radius-icon)' }"
        >
          <IconMic
            :class="speechStore.isListening ? 'text-green-500' : ''"
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
import { useChatStore } from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useHeygenStore } from '@/app/stores/heygen';

import IconMic from '~icons/lucide/mic';
import IconSend from '~icons/lucide/send';
import IconSettings from '~icons/lucide/settings';
import IconMessage from '~icons/lucide/message-circle';
import SelectField from '@/app/components/ui/SelectField.vue';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  RadioGroupRoot,
  RadioGroupItem,
  SwitchRoot,
  SwitchThumb,
} from 'radix-vue';

const emit = defineEmits<{ (e: 'send', text: string): void }>();

// База для наращивания текста во время голосового ввода
const speechBase = ref('');
const chat = useChatStore();
const { settings, start, stop, onPartial, onFinal } = useSpeechEngine();
const speechStore = useSpeechStore();
const chatSettings = useChatSettingsStore();
const heygen = useHeygenStore();

const settingsOpen = ref(false);

const connected = computed(() => heygen.isConnected);
const isStarting = computed(() => heygen.isStarting);
const isStarted = computed(() => heygen.isStarted);

const modeOptions = [
  { label: '🧠 Психотерапия', value: 'therapy' },
  { label: '💪 Привычки', value: 'habits' },
  { label: '🌿 Баланс', value: 'balance' },
];

const themeOptions = [
  { label: 'Тёмная', value: 'dark' },
  { label: 'Светлая', value: 'light' },
  { label: 'Серая', value: 'gray' },
];

onPartial((t) => {
  if (!speechStore.isListening) return;
  const base = speechBase.value.trim();
  chat.userText = (base ? base + ' ' : '') + t;
});

onFinal((t) => {
  const base = speechBase.value.trim();
  const merged = ((base ? base + ' ' : '') + t).trim();
  speechBase.value = merged;
  chat.userText = merged;
  if (settings.value.autoSend && chat.userText.trim()) emitSend();
});

async function onSwitchChangeVoice(v: boolean) {
  chatSettings.updateChatSettings({ voice: v });

  chatSettings.getChatSettings();
}

async function onSwitchChangeAvatar(v: boolean) {
  chatSettings.updateChatSettings({ avatar: v });

  chatSettings.getChatSettings();
}

function startSession() {
  console.log('startSession', connected.value, isStarting.value);
  if (!connected.value && !isStarting.value) {
    heygen.startSession();
  } else if (connected.value && !isStarting.value) {
    heygen.stopSession();
  }
}
function speak(text: string) {
  heygen.speak(text);
}

async function toggleMic() {
  if (speechStore.isListening) {
    await stop();
    speechStore.isListening = false;
    return;
  }
  await start();
  speechStore.isListening = true;
  // фиксируем текущий ввод пользователя, чтобы увеличивать текст, а не затирать
  speechBase.value = chat.userText.trim();
}

// открытие/закрытие управляет PopoverTrigger

// Применяем тему моментально
if (process.client) {
  const applyTheme = (t: 'dark' | 'light' | 'gray') => {
    const root = document.documentElement;
    if (!root) return;
    root.classList.remove('theme-dark', 'theme-light', 'theme-gray', 'dark');
    switch (t) {
      case 'dark':
        root.classList.add('theme-dark', 'dark');
        break;
      case 'light':
        root.classList.add('theme-light');
        break;
      case 'gray':
        root.classList.add('theme-gray');
        break;
    }
  };
  watch(
    () => chatSettings?.theme,
    (t) => applyTheme(t as 'dark' | 'light' | 'gray'),
    { immediate: true }
  );

  // Сохраняем выбор темы на бэкенд, избегая первоначального триггера
  const lastTheme = ref<string | null>(null);
  watch(
    () => chatSettings?.theme,
    async (t) => {
      if (!t) return;
      if (lastTheme.value === null) {
        lastTheme.value = t;
        return;
      }
      if (lastTheme.value !== t) {
        lastTheme.value = t;
        try {
          await chatSettings.updateChatSettings({ theme: t });
        } catch {}
      }
    },
    { immediate: true }
  );
}

function emitSend() {
  if (!chat.userText.trim()) return;
  const finalText = chat.userText.trim();
  emit('send', finalText);
}

function handleKeydown(e: KeyboardEvent) {
  if (!chat.userText.trim()) return;
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

const onSend = async () => {
  if (!chat.userText.trim()) return;
  speechStore.isListening = false;
  speechBase.value = '';
  const res = await chat.sendMessage(JSON.parse(JSON.stringify(chat.userText)));

  if (res) {
    chat.startSession();
    // Озвучим последний ответ ассистента через HeyGen или TTS OpenAI
    const last = [...chat.messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    const content =
      last && typeof last.content === 'string' ? last.content : '';
    if (content) {
      if (chatSettings.avatar && heygen.isConnected) {
        heygen.speak(content);
      } else if (chatSettings.voice && process.client) {
        try {
          const { $api } = useNuxtApp();
          const buf = (await $api('/api/tts/openai', {
            method: 'POST',
            body: { text: content, voice: 'sage', format: 'mp3' },
            responseType: 'arrayBuffer',
          } as any)) as ArrayBuffer;
          const blob = new Blob([new Uint8Array(buf)], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          try {
            await audio.play();
          } catch {}
          audio.onended = () => URL.revokeObjectURL(url);
        } catch {}
      }
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

const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
  const el = chatRef.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
};

const handleScroll = () => {
  // если пользователь отскроллил далеко вверх — перестаём автоприлипать
  stickToBottom.value = isNearBottom();
};

onMounted(async () => {
  await nextTick();
  scrollToBottom('auto'); // на старте — без анимации
});

onBeforeUnmount(() => {
  stop();
  heygen.stopSession();
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
</script>
