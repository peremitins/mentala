import { defineStore } from 'pinia';
import type { SpeechEngineId } from '@/app/composables/speech/types';

export const useSpeechStore = defineStore('speech', {
  state: () => {
    const config = useRuntimeConfig();
    return {
      engine: (config.public.speechDefaultEngine as SpeechEngineId) || 'auto',
      autoSend: false,
      language: 'ru-RU',
      silenceMs: 10000,
      isListening: false,
      isAvatarSpeaking: false,
    };
  },
  actions: {
    setEngine(engine: SpeechEngineId) {
      this.engine = engine;
    },
    setAutoSend(v: boolean) {
      this.autoSend = v;
    },
    setLanguage(l: string) {
      this.language = l;
    },
    setSilenceMs(ms: number) {
      this.silenceMs = ms;
    },
    setListening(v: boolean) {
      this.isListening = v;
    },
    setAvatarSpeaking(v: boolean) {
      this.isAvatarSpeaking = v;
    },
  },
});
