<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <select
        class="px-2 py-1 rounded bg-white/10"
        v-model="speech.engine"
        @change="(e: any) => setEngine(e.target.value)"
      >
        <option value="auto">Auto</option>
        <option value="native">Native (iOS/Android)</option>
        <option value="webspeech">Web Speech (Browser)</option>
        <option value="whisper">Whisper (Fallback)</option>
      </select>

      <label class="flex items-center gap-2 ml-4">
        <input
          type="checkbox"
          :checked="settings.autoSend"
          @change="(e: any) => setAutoSend(e.target.checked)"
        />
        Автоотправка
      </label>

      <span class="ml-auto text-xs opacity-60"
        >Пауза авто-стоп: {{ settings.silenceMs / 1000 }}с</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSpeechEngine } from '@/app/composables/useSpeechEngine';
import { useSpeechStore } from '@/app/stores/speech';

const { settings, setEngine, setAutoSend } = useSpeechEngine();
const speech = useSpeechStore();
</script>
