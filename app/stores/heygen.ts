import { markRaw } from 'vue';
import { defineStore } from 'pinia';
import { useSpeechStore } from '@/app/stores/speech';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import {
  getSessionItem,
  setSessionItem,
  removeSessionItem,
} from '@/app/utils/sessionStorage';
import type {
  Room as LKRoom,
  RemoteTrackPublication as LKRemoteTrackPublication,
  RemoteParticipant as LKRemoteParticipant,
  RemoteTrack as LKRemoteTrack,
  RemoteAudioTrack as LKRemoteAudioTrack,
  RemoteVideoTrack as LKRemoteVideoTrack,
} from 'livekit-client';

let LiveKit: any | null = null;
let roomInstance: LKRoom | null = null; // держим Room вне state, чтобы devtools/гидрация не падали на сериализации

export const useHeygenStore = defineStore('heygen', {
  state: () => ({
    videoEl: null as HTMLVideoElement | null,
    audioEl: null as HTMLAudioElement | null,

    sessionId: null as string | null,
    livekitUrl: null as string | null,
    livekitToken: null as string | null,

    // status: idle -> starting -> connected -> streaming
    status: 'idle' as 'idle' | 'starting' | 'connected' | 'streaming',
  }),
  getters: {
    isStarting: (state) => state.status === 'starting',
    isConnected: (state) =>
      state.status === 'connected' || state.status === 'streaming',
    isStarted: (state) => state.status === 'streaming',
    isStreaming: (state) => state.status === 'streaming',
    getChatSettings() {
      try {
        return useChatSettingsStore();
      } catch (e) {
        console.error('[HeyGen] Error getting chat settings:', e);
        // Возвращаем дефолтные настройки в случае ошибки
        return {
          voice: true,
          avatar: true,
        } as any;
      }
    },
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
      try {
        const chatSettings = this.getChatSettings;
        if (!chatSettings?.voice) return;
      } catch (e) {
        console.error('[HeyGen] Error checking voice settings:', e);
        return;
      }
      const speech = useSpeechStore();
      try {
        // Безопасная установка isAvatarSpeaking с проверкой
        if (speech) {
          try {
            speech.setAvatarSpeaking(true);
          } catch (e) {
            console.error('[HeyGen] Error setting avatar speaking to true:', e);
          }
        }

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
        useToast('HeyGen', e?.message || 'Не удалось отправить речь');
      } finally {
        // Безопасная установка isAvatarSpeaking обратно в false
        if (speech) {
          try {
            speech.setAvatarSpeaking(false);
          } catch (e) {
            console.error(
              '[HeyGen] Error setting avatar speaking to false:',
              e
            );
          }
        }
      }
    },
    async startSession(avatarId?: string) {
      // Проверяем универсальное хранилище на наличие старой сессии (после перезагрузки страницы)
      let oldSessionId: string | null = null;
      if (typeof window !== 'undefined') {
        oldSessionId = await getSessionItem('heygen_session_id');
      }

      // Если уже есть активная сессия в state или в sessionStorage, завершаем её перед запуском новой
      // Это важно при перезагрузке страницы, когда старая сессия может быть активна
      const sessionIdToFinish = this.sessionId || oldSessionId;
      if (
        sessionIdToFinish &&
        (this.status === 'connected' ||
          this.status === 'starting' ||
          oldSessionId)
      ) {
        try {
          // Завершаем старую сессию, но не сбрасываем состояние полностью
          // чтобы не потерять sessionId до завершения
          if (roomInstance) {
            try {
              await roomInstance.disconnect();
            } catch {}
            roomInstance = null;
          }
          // Вызываем API для завершения сессии на сервере
          try {
            await useAPI('/api/heygen/stop', {
              method: 'POST',
              body: { sessionId: sessionIdToFinish },
            });
          } catch (err) {
            console.warn('[HeyGen] Failed to stop old session:', err);
          }
        } catch (err) {
          console.warn('[HeyGen] Error finishing old session:', err);
        }
        // Сбрасываем состояние после завершения старой сессии
        this.status = 'idle';
        this.sessionId = null;
        // Очищаем универсальное хранилище
        if (typeof window !== 'undefined') {
          await removeSessionItem('heygen_session_id');
        }
      }

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

        // Сохраняем sessionId в универсальное хранилище для возможности завершения при перезагрузке
        if (this.sessionId && typeof window !== 'undefined') {
          await setSessionItem('heygen_session_id', this.sessionId);
        }
        this.livekitUrl = data.url;
        this.livekitToken = data.access_token;

        const LK = await this.ensureLiveKitLoaded();
        if (!LK) throw new Error('LiveKit is unavailable on server');

        // Хелпер для подписки на треки без Pinia-инструментации (иначе devtools пытается сериализовать LiveKit объекты)
        const attachRemoteTrack = (
          track: LKRemoteTrack,
          _publication: LKRemoteTrackPublication,
          _participant: LKRemoteParticipant
        ) => {
          if (!track) {
            console.warn('[HeyGen] attachRemoteTrack: track is undefined');
            return;
          }

          if (!track.kind) {
            console.warn('[HeyGen] attachRemoteTrack: track.kind is undefined');
            return;
          }

          if (track.kind === 'video' && this.videoEl) {
            try {
              (track as LKRemoteVideoTrack).attach(this.videoEl);
            } catch (e) {
              console.error('[HeyGen] Failed to attach video track:', e);
            }
          }

          if (track.kind === 'audio' && this.audioEl) {
            try {
              (track as LKRemoteAudioTrack).attach(this.audioEl);
              this.audioEl.muted = false;
              void this.audioEl.play().catch(() => {});
            } catch (e) {
              console.error('[HeyGen] Failed to attach audio track:', e);
            }
          }
        };

        // Подключаемся к LiveKit и подписываемся на треки
        if (roomInstance) {
          try {
            await roomInstance.disconnect();
          } catch {}
        }
        roomInstance = markRaw(new LK.Room({}));
        const room = roomInstance as LKRoom;

        // Оборачиваем обработчики событий в try-catch для предотвращения ошибок
        room.on(
          'trackSubscribed',
          (
            track: LKRemoteTrack,
            publication: LKRemoteTrackPublication,
            participant: LKRemoteParticipant
          ) => {
            try {
              // Безопасная проверка всех параметров перед обработкой
              if (!track || !publication || !participant) {
                console.warn(
                  '[HeyGen] trackSubscribed: missing required parameters',
                  {
                    hasTrack: !!track,
                    hasPublication: !!publication,
                    hasParticipant: !!participant,
                  }
                );
                return;
              }
              attachRemoteTrack(track, publication, participant);
            } catch (e) {
              console.error('[HeyGen] Error in trackSubscribed handler:', e);
            }
          }
        );

        room.on('trackUnsubscribed', (track: LKRemoteTrack) => {
          try {
            if (!track || !track.kind) {
              console.warn('[HeyGen] trackUnsubscribed: invalid track');
              return;
            }
            if (track.kind === 'video' && this.videoEl) {
              (track as LKRemoteVideoTrack).detach(this.videoEl);
              this.videoEl.srcObject = null;
            }
          } catch (e) {
            console.error('[HeyGen] Error in trackUnsubscribed handler:', e);
          }
        });

        // Обработка других событий LiveKit для предотвращения неожиданных ошибок
        room.on('participantConnected', (participant: LKRemoteParticipant) => {
          try {
            // Безопасная обработка подключения участника
            if (!participant) {
              console.warn(
                '[HeyGen] participantConnected: participant is undefined'
              );
              return;
            }
            // Не обращаемся к participant.name напрямую, если это может быть undefined
            console.log(
              '[HeyGen] Participant connected:',
              participant.identity || 'unknown'
            );
          } catch (e) {
            console.error('[HeyGen] Error in participantConnected handler:', e);
          }
        });

        room.on(
          'participantDisconnected',
          (participant: LKRemoteParticipant) => {
            try {
              if (!participant) {
                console.warn(
                  '[HeyGen] participantDisconnected: participant is undefined'
                );
                return;
              }
            } catch (e) {
              console.error(
                '[HeyGen] Error in participantDisconnected handler:',
                e
              );
            }
          }
        );

        room.on('disconnected', () => {
          try {
            this.status = 'idle';
            roomInstance = null;
          } catch (e) {
            console.error('[HeyGen] Error in disconnected handler:', e);
          }
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
        useToast('HeyGen', 'Подключено и запущено');
      } catch (e: any) {
        useToast('HeyGen', e?.message || 'Не удалось запустить сессию');
      } finally {
        if (this.status === 'starting') {
          this.status = 'idle';
          roomInstance = null;
        }
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
      if (roomInstance) {
        try {
          await roomInstance.disconnect();
        } catch {}
        roomInstance = null;
      }
      this.status = 'idle';
      this.sessionId = null;

      // Удаляем sessionId из универсального хранилища
      if (typeof window !== 'undefined') {
        await removeSessionItem('heygen_session_id');
      }
    },
  },
});
