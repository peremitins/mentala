<template>
  <div class="flex gap-2 py-2">
    <!-- Кнопка аватара -->
    <button
      v-if="false"
      @click="false"
      class="flex-1 glass-deep rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
    >
      <IconVideo
        v-show="chatSettings.avatar"
        class="w-5 h-5 transition-all text-primary-ui drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]"
      />

      <IconVideoOff
        v-show="!chatSettings.avatar"
        class="w-5 h-5 transition-all text-foreground"
      />
      <span
        class="text-sm font-medium whitespace-nowrap text-foreground"
        :class="chatSettings.avatar ? 'text-primary-ui' : ''"
      >
        {{ chatSettings.avatar ? 'Аватар включён' : 'Аватар выключен' }}
      </span>
    </button>

    <!-- Кнопка звука -->
    <button
      @click="toggleVoice"
      class="flex-1 glass-deep rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
    >
      <IconVolume2 v-if="chatSettings.voice" class="w-5 h-5 text-primary-ui" />
      <IconVolumeX v-else class="w-5 h-5 text-foreground" />
      <span
        class="text-sm font-medium"
        :class="chatSettings.voice ? 'text-primary-ui' : ''"
      >
        {{ chatSettings.voice ? 'Голос включён' : 'Голос выключен' }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import IconVideo from '~icons/lucide/video';
import IconVideoOff from '~icons/lucide/video-off';
import IconVolume2 from '~icons/lucide/volume-2';
import IconVolumeX from '~icons/lucide/volume-x';
import { computed } from 'vue';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useChatStore } from '@/app/stores/chat';
import { useLoadersStore } from '@/app/stores/loaders';
import { useTTS } from '@/app/composables/useTTS';

const chatSettings = useChatSettingsStore();
const chat = useChatStore();
const loaders = useLoadersStore();
const { stop: stopTTS } = useTTS();

// Проверяем, находимся ли на welcome screen
const showWelcomeScreen = computed(() => chat.messages.length === 0);

async function toggleVoice() {
  const newValue = !chatSettings.voice;

  // Если отключаем звук, останавливаем все воспроизведения
  if (!newValue) {
    // Останавливаем TTS озвучку
    stopTTS();
  }

  await chatSettings.updateChatSettings({ voice: newValue });

  if (showWelcomeScreen.value) {
    loaders.hideLoader();
  }
}
</script>
