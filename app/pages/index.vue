<template>
  <div class="flex flex-col flex-1 space-y-6 pb-2 relative">
    <section class="absolute w-full h-full grid place-items-center">
      <div class="w-auto h-full rounded-3xl overflow-hidden shadow-xl">
        <img
          src="/avatar.png"
          alt="assistant"
          class="w-full h-full object-contain"
        />
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
      <div class="flex items-center gap-3">
        <button
          class="icon-disc flex items-center justify-center cursor-pointer"
          :style="{ borderRadius: 'var(--radius-icon)' }"
        >
          <IconMessage class="w-5 h-5" />
        </button>
        <input
          v-model="draft"
          @keydown.enter.prevent="onSend"
          class="flex-1 bg-transparent outline-none placeholder:text-white/60 px-2"
          placeholder="Type a message..."
        />
        <button
          @click="onSend"
          class="icon-disc flex items-center justify-center cursor-pointer"
          :style="{ borderRadius: 'var(--radius-icon)' }"
        >
          <IconMic class="w-5 h-5" />
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, watch, ref, computed } from 'vue';
import { useChatStore } from '~/stores/chat';
import IconMic from '~icons/lucide/mic';
import IconMessage from '~icons/lucide/message-circle';

const chat = useChatStore();

const draft = ref('');

const onSend = () => {
  if (!draft.value.trim()) return;
  chat.sendMessage(draft.value);
  draft.value = '';
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

// когда приходит новое сообщение — скроллим, если пользователь внизу
watch(
  () => combinedMessages.value.length,
  async () => {
    await nextTick();
    if (stickToBottom.value) scrollToBottom('smooth');
  }
);
</script>
