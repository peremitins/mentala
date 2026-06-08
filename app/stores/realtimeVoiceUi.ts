import { defineStore } from 'pinia';

export type RealtimeVoiceUiStatus = 'idle' | 'starting' | 'active' | 'stopping';

// UI-состояние realtime voice, поднятое до глобального уровня,
// чтобы оверлеи (амбиентная рамка и т.п.) могли реагировать вне chat.vue.
export const useRealtimeVoiceUiStore = defineStore('realtimeVoiceUi', {
  state: () => ({
    status: 'idle' as RealtimeVoiceUiStatus,
  }),
  getters: {
    isActive: (state) => state.status === 'active',
    isTransitioning: (state) =>
      state.status === 'starting' || state.status === 'stopping',
  },
  actions: {
    setStatus(status: RealtimeVoiceUiStatus) {
      this.status = status;
    },
    reset() {
      this.status = 'idle';
    },
  },
});
