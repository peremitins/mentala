import { defineStore } from 'pinia';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import type {
  Room as LKRoom,
  RoomEvent as LKRoomEvent,
  RemoteTrackPublication as LKRemoteTrackPublication,
  RemoteParticipant as LKRemoteParticipant,
  RemoteTrack as LKRemoteTrack,
  RemoteAudioTrack as LKRemoteAudioTrack,
  RemoteVideoTrack as LKRemoteVideoTrack,
} from 'livekit-client';

let LiveKit: any | null = null;

export const useHeygenStore = defineStore('heygen', {
  state: () => ({
    videoEl: null as HTMLVideoElement | null,
    audioEl: null as HTMLAudioElement | null,

    sessionId: null as string | null,
    livekitUrl: null as string | null,
    livekitToken: null as string | null,

    // status: idle -> starting -> connected -> streaming
    status: 'idle' as 'idle' | 'starting' | 'connected' | 'streaming',

    room: null as LKRoom | null,
  }),
  getters: {
    isStarting: (state) => state.status === 'starting',
    isConnected: (state) =>
      state.status === 'connected' || state.status === 'streaming',
    isStarted: (state) => state.status === 'streaming',
    isStreaming: (state) => state.status === 'streaming',
    getChatSettings: () => useChatSettingsStore(),
  },
  actions: {
    setVideoEl(el: HTMLVideoElement | null) {
      this.videoEl = el;
    },
    setAudioEl(el: HTMLAudioElement | null) {
      this.audioEl = el;
    },

    async ensureLiveKitLoaded() {
      if (LiveKit) return LiveKit;
      if (process.server) return null;
      LiveKit = await import('livekit-client');
      return LiveKit;
    },
    async speak(text: string) {
      if (!this.sessionId) return;
      if (!this.getChatSettings.voice) return;
      const speech = useSpeechStore();
      try {
        speech?.setAvatarSpeaking?.(true);

        if (this.sessionId && text) {
          await useAPI('/api/heygen/speak', {
            method: 'POST',
            body: {
              sessionId: this.sessionId,
              text,
              taskMode: 'sync',
              taskType: 'repeat',
            },
          });
        }
      } catch (e: any) {
        useToast('HeyGen', e?.message || 'Не удалось отправить речь', 'error');
      } finally {
        speech?.setAvatarSpeaking?.(false);
      }
    },
    async startSession(avatarId?: string) {
      if (this.status !== 'idle') return;
      this.status = 'starting';
      try {
        const session = await useAPI<any>('/api/heygen/session', {
          method: 'POST',
          body: {
            avatarId,
            quality: 'medium',
            video_encoding: 'VP8',
            version: 'v2',
            stt_settings: { provider: 'deepgram', confidence: 0.55 },
            disable_idle_timeout: false,
            activity_idle_timeout: 120,
          },
        });

        const data = (session as any)?.data;

        if (!data) {
          console.error('[HeyGen] No data in response');
          throw new Error('HeyGen session response is invalid: no data');
        }

        if (!data.access_token) {
          console.error('[HeyGen] Missing access_token');
          throw new Error(
            'HeyGen session response is invalid: missing access_token'
          );
        }

        if (!data.url) {
          console.error('[HeyGen] Missing url');
          throw new Error('HeyGen session response is invalid: missing url');
        }

        // session_id опционален по API
        this.sessionId = data.session_id || null;
        this.livekitUrl = data.url;
        this.livekitToken = data.access_token;

        const LK = await this.ensureLiveKitLoaded();
        if (!LK) throw new Error('LiveKit is unavailable on server');

        // Подключаемся к LiveKit и подписываемся на треки
        this.room = new LK.Room({});
        const room = this.room as LKRoom;
        room.on(
          'trackSubscribed',
          (
            track: LKRemoteTrack,
            publication: LKRemoteTrackPublication,
            participant: LKRemoteParticipant
          ) => {
            this.attachRemoteTrack(LK, track, publication, participant);
          }
        );
        room.on('trackUnsubscribed', (track: LKRemoteTrack) => {
          if (track.kind === 'video' && this.videoEl) {
            (track as LKRemoteVideoTrack).detach(this.videoEl);
            this.videoEl.srcObject = null;
          }
        });
        room.on('disconnected', () => {
          console.log('[HeyGen] Room disconnected');
          this.status = 'idle';
        });

        await room.connect(
          this.livekitUrl as string,
          this.livekitToken as string
        );
        this.status = 'connected';

        // Включаем стрим у HeyGen
        await useAPI('/api/heygen/start', {
          method: 'POST',
          body: { sessionId: this.sessionId },
        });

        // Разрешаем воспроизведение аудио (политики браузера)
        try {
          await room.startAudio?.();
        } catch {}

        this.status = 'streaming';
        useToast('HeyGen', 'Подключено и запущено', 'success');
      } catch (e: any) {
        useToast(
          'HeyGen',
          e?.message || 'Не удалось запустить сессию',
          'error'
        );
      } finally {
        if (this.status === 'starting') this.status = 'idle';
      }
    },

    async stopSession() {
      try {
        if (this.sessionId) {
          await useAPI('/api/heygen/stop', {
            method: 'POST',
            body: { sessionId: this.sessionId },
          });
        }
      } catch {}
      if (this.room) {
        try {
          await this.room.disconnect();
        } catch {}
        this.room = null;
      }
      this.status = 'idle';
      this.sessionId = null;
    },

    attachRemoteTrack(
      LK: any,
      track: LKRemoteTrack,
      _publication: LKRemoteTrackPublication,
      _participant: LKRemoteParticipant
    ) {
      if (track.kind === 'video' && this.videoEl) {
        (track as LKRemoteVideoTrack).attach(this.videoEl);
      }
      if (track.kind === 'audio' && this.audioEl) {
        (track as LKRemoteAudioTrack).attach(this.audioEl);
        try {
          this.audioEl.muted = false;
          void this.audioEl.play().catch(() => {});
        } catch {}
      }
    },
  },
});
