<template>
  <div class="flex gap-2 py-2">
    <!-- Кнопка аватара -->
    <button
      @click="toggleAvatar"
      class="flex-1 glass-deep rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      :class="{
        'border border-white/20': !chatSettings.avatar,
        'border border-green-500/50 bg-green-500/10': chatSettings.avatar,
      }"
    >
      <IconVideo
        v-show="chatSettings.avatar"
        class="w-5 h-5 transition-all text-green-400 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]"
      />

      <IconVideoOff
        v-show="!chatSettings.avatar"
        class="w-5 h-5 transition-all text-white/70"
      />
      <span
        class="text-sm font-medium whitespace-nowrap"
        :class="chatSettings.avatar ? 'text-green-400' : 'text-white/70'"
      >
        {{ chatSettings.avatar ? 'Аватар включён' : 'Аватар выключен' }}
      </span>
    </button>

    <!-- Кнопка звука -->
    <button
      @click="toggleVoice"
      class="flex-1 glass-deep rounded-xl px-4 py-3 flex items-center justify-center gap-2 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      :class="{
        'border border-white/20': !chatSettings.voice,
        'border border-green-500/50 bg-green-500/10': chatSettings.voice,
      }"
    >
      <IconVolume2 v-if="chatSettings.voice" class="w-5 h-5 text-green-400" />
      <IconVolumeX v-else class="w-5 h-5 text-white/70" />
      <span
        class="text-sm font-medium"
        :class="chatSettings.voice ? 'text-green-400' : 'text-white/70'"
      >
        {{ chatSettings.voice ? 'Звук включён' : 'Звук выключен' }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import IconVideo from '~icons/lucide/video';
import IconVideoOff from '~icons/lucide/video-off';
import IconVolume2 from '~icons/lucide/volume-2';
import IconVolumeX from '~icons/lucide/volume-x';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useHeygenStore } from '@/app/stores/heygen';
import { useTTS } from '@/app/composables/useTTS';

const chatSettings = useChatSettingsStore();
const heygen = useHeygenStore();
const { stop: stopTTS } = useTTS();

async function toggleAvatar() {
  const newValue = !chatSettings.avatar;
  await chatSettings.updateChatSettings({ avatar: newValue });

  // Если включаем аватар и он ещё не подключен, запускаем сессию
  if (newValue && !heygen.isConnected && !heygen.isStarting) {
    heygen.startSession();
  }
  // Если выключаем аватар и он подключен, останавливаем сессию
  else if (!newValue && heygen.isConnected) {
    heygen.stopSession();
  }
}

async function toggleVoice() {
  const newValue = !chatSettings.voice;

  // Если отключаем звук, останавливаем все воспроизведения
  if (!newValue) {
    // Останавливаем TTS озвучку
    stopTTS();

    // Останавливаем HeyGen аудио, если оно воспроизводится
    if (heygen.audioEl) {
      try {
        heygen.audioEl.pause();
        heygen.audioEl.currentTime = 0;
      } catch (error) {
        console.error(
          '[AvatarVoiceControls] Error stopping HeyGen audio:',
          error
        );
      }
    }
  }

  await chatSettings.updateChatSettings({ voice: newValue });
}
</script>
