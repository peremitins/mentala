import { defineStore } from 'pinia';

export type RealtimeVoiceUiStatus = 'idle' | 'starting' | 'active' | 'stopping';

const OUTPUT_VOLUME_STORAGE_KEY = 'mentala.realtimeVoice.outputVolume';
const DEFAULT_OUTPUT_VOLUME = 1;

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUTPUT_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

// Громкость воспроизведения ассистента (0..1) — программная аттенюация
// remoteAudioElement.volume. Нужна прежде всего на Android web/PWA, где
// аппаратные клавиши громкости физически не управляют WebRTC-аудио (media-канал
// vs call-канал, см. .docs/arch_audio_platforms.md). Значение персистится между
// сессиями.
function readPersistedOutputVolume(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_OUTPUT_VOLUME;
  }
  try {
    const raw = window.localStorage.getItem(OUTPUT_VOLUME_STORAGE_KEY);
    if (raw == null) {
      return DEFAULT_OUTPUT_VOLUME;
    }
    return clampVolume(Number(raw));
  } catch {
    return DEFAULT_OUTPUT_VOLUME;
  }
}

function persistOutputVolume(value: number) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(OUTPUT_VOLUME_STORAGE_KEY, String(value));
  } catch {
    // Приватный режим / переполнение storage — не критично, держим в памяти.
  }
}

// UI-состояние realtime voice, поднятое до глобального уровня,
// чтобы оверлеи (амбиентная рамка и т.п.) могли реагировать вне chat.vue.
export const useRealtimeVoiceUiStore = defineStore('realtimeVoiceUi', {
  state: () => ({
    status: 'idle' as RealtimeVoiceUiStatus,
    outputVolume: readPersistedOutputVolume(),
  }),
  getters: {
    isActive: (state) => state.status === 'active',
    isTransitioning: (state) =>
      state.status === 'starting' || state.status === 'stopping',
    outputVolumePercent: (state) => Math.round(state.outputVolume * 100),
  },
  actions: {
    setStatus(status: RealtimeVoiceUiStatus) {
      this.status = status;
    },
    setOutputVolume(value: number) {
      const clamped = clampVolume(value);
      this.outputVolume = clamped;
      persistOutputVolume(clamped);
    },
    reset() {
      // Сбрасываем только статус: пользовательскую громкость сохраняем между
      // сессиями.
      this.status = 'idle';
    },
  },
});
