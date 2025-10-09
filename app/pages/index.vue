<template>
  <div class="flex flex-col flex-1 space-y-6 pb-2 relative">
    <section class="absolute w-full h-full grid place-items-center">
      <div
        class="w-auto h-full rounded-3xl overflow-hidden shadow-xl w-full max-w-[480px]"
      >
        <HeyGenPlayer />
      </div>
    </section>

    <section
      ref="chatRef"
      @scroll="handleScroll"
      class="absolute overflow-auto max-h-[50%] inset-x-0 pt-[50%] px-4 bottom-[80px] flex flex-col space-y-3 [mask-image:linear-gradient(to_top,rgba(0,0,0,1)_0%,rgba(0,0,0,0)_100%)] [mask-repeat:no-repeat] [mask-size:100%_100%]"
    >
      <div
        v-for="(m, index) in combinedMessages"
        :key="index"
        class="w-max px-3 py-1 mb-2 items-center bubble max-w-[80%]"
        :class="{ 'ml-auto': (m as any).role === 'user' }"
      >
        {{ m.content }}
      </div>
    </section>

    <section
      class="glass-deep p-2 mx-2 mt-auto z-100"
      :style="{ borderRadius: `calc(var(--radius-sm))` }"
    >
      <div class="mt-2 flex items-center gap-3 text-xs opacity-80">
        <VoiceInput />
      </div>
      <div class="flex items-center gap-3">
        <TextareaResize
          v-model.trim="text"
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
            :class="speechStore.isListening ? 'text-green-500' : 'text-white'"
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
import { nextTick, onMounted, watch, ref, computed } from 'vue';
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useChatStore } from '@/app/stores/chat';
import { useSpeechStore } from '@/app/stores/speech';

import IconMic from '~icons/lucide/mic';
import IconSend from '~icons/lucide/send';
import IconMessage from '~icons/lucide/message-circle';

const text = ref('');
// База для наращивания текста во время голосового ввода
const speechBase = ref('');
const chat = useChatStore?.() as any;
const { settings, start, stop, onPartial, onFinal } = useSpeechEngine();
const speechStore = useSpeechStore();

onPartial((t) => {
  if (!speechStore.isListening) return;
  console.debug('[VoiceInput] partial:', t);
  const base = speechBase.value.trim();
  text.value = (base ? base + ' ' : '') + t;
});

onFinal((t) => {
  console.debug('[VoiceInput] final:', t);
  const base = speechBase.value.trim();
  const merged = ((base ? base + ' ' : '') + t).trim();
  speechBase.value = merged;
  text.value = merged;
  if (settings.value.autoSend && text.value.trim()) emitSend();
});

async function toggleMic() {
  if (speechStore.isListening) {
    await stop();
    speechStore.isListening = false;
    return;
  }
  await start();
  speechStore.isListening = true;
  // фиксируем текущий ввод пользователя, чтобы увеличивать текст, а не затирать
  speechBase.value = text.value.trim();
}

const emit = defineEmits<{ (e: 'send', text: string): void }>();
function emitSend() {
  if (!text.value.trim()) return;
  const finalText = text.value.trim();
  emit('send', finalText);
  try {
    chat?.setDraft?.(finalText);
  } catch {}
  text.value = '';
}

function handleKeydown(e: KeyboardEvent) {
  console.log('handleKeydown', e);
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+Enter или Cmd+Enter → добавить перенос строки
    e.preventDefault();
    const target = e.target as HTMLTextAreaElement;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    text.value =
      text.value.substring(0, start) + '\n' + text.value.substring(end);
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
  if (!text.value.trim()) return;
  speechStore.isListening = false;
  speechBase.value = '';
  const res = await chat.sendMessage(text.value);
  console.log('res', res);
  if (res) {
    chat.startSession();
    text.value = '';
  }
};

const combinedMessages = computed(() => chat?.messages || []);

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
});

// когда приходит новое сообщение — скроллим, если пользователь внизу
watch(
  () => combinedMessages.value.length,
  async () => {
    await nextTick();
    if (stickToBottom.value) scrollToBottom('smooth');
  }
);
</script>
