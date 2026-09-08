import { markRaw } from 'vue';
import { defineStore } from 'pinia';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import {
  getSessionItem,
  setSessionItem,
  removeSessionItem,
} from '@/app/utils/sessionStorage';
import { useRuntimeConfig } from 'nuxt/app';
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

    // Флаг что видео трек реально подключен и готов к отображению
    hasVideoTrack: false,
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
    // Синхронная проверка и подключение существующих треков (для setVideoEl)
    attachExistingTracksSync(room: LKRoom) {
      try {
        // Проверяем всех удаленных участников и их треки
        room.remoteParticipants.forEach((participant) => {
          participant.trackPublications.forEach((publication) => {
            if (publication.isSubscribed && publication.track) {
              const track = publication.track;

              // Если это видео трек и videoEl уже установлен, но еще не подключен
              if (
                track.kind === 'video' &&
                this.videoEl &&
                !this.hasVideoTrack
              ) {
                try {
                  (track as LKRemoteVideoTrack).attach(this.videoEl);
                  this.hasVideoTrack = true;
                  console.log(
                    '[HeyGen] ✓ Video track attached from existing tracks'
                  );
                } catch (e) {
                  console.error(
                    '[HeyGen] Failed to attach existing video track:',
                    e
                  );
                }
              }

              // Если это аудио трек и audioEl установлен
              if (track.kind === 'audio' && this.audioEl) {
                try {
                  (track as LKRemoteAudioTrack).attach(this.audioEl);
                  this.audioEl.muted = false;
                  void this.audioEl.play().catch(() => {});
                } catch (e) {
                  console.error(
                    '[HeyGen] Failed to attach existing audio track:',
                    e
                  );
                }
              }
            }
          });
        });
      } catch (e) {
        console.error('[HeyGen] Error checking existing tracks:', e);
      }
    },

    setVideoEl(el: HTMLVideoElement | null) {
      this.videoEl = el;

      // Если videoEl установлен и уже есть активная сессия, СРАЗУ проверяем существующие треки
      if (
        el &&
        (this.status === 'streaming' || this.status === 'connected') &&
        roomInstance &&
        !this.hasVideoTrack
      ) {
        // Синхронная проверка без задержки
        this.attachExistingTracksSync(roomInstance as LKRoom);
      }
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

    // Проверка существующих треков (синхронная, вызывается из событий)
    checkAndAttachExistingTracks(room: LKRoom) {
      // Просто вызываем синхронную проверку
      this.attachExistingTracksSync(room);
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
      try {
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
        const errorMessage =
          e?.message || e?.statusMessage || 'Не удалось отправить речь';
        useToast('HeyGen', errorMessage);

        // При любой ошибке отключаем аватар в настройках
        try {
          const chatSettings = useChatSettingsStore();
          await chatSettings.updateChatSettings({ avatar: false });
          await this.stopSession();
        } catch (disableError) {
          console.error(
            '[HeyGen] Failed to disable avatar after error:',
            disableError
          );
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
            } catch {
              // Старая сессия могла уже завершиться на стороне провайдера.
            }
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
      this.hasVideoTrack = false; // Сбрасываем при новом запуске
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
            activity_idle_timeout:
              (useRuntimeConfig().public.chatIdleTimeoutMs as number) / 1000, // Конвертируем миллисекунды в секунды для API
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

          if (track.kind === 'video') {
            if (this.videoEl) {
              try {
                (track as LKRemoteVideoTrack).attach(this.videoEl);
                // Помечаем что видео трек подключен
                this.hasVideoTrack = true;
                console.log('[HeyGen] ✓ Video track attached and ready');
              } catch (e) {
                console.error('[HeyGen] Failed to attach video track:', e);
              }
            } else {
              console.warn(
                '[HeyGen] Video track received but videoEl is not set yet'
              );
              // Если videoEl еще не установлен, попробуем подключить позже
              // Это может произойти если компонент еще не смонтирован
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
          } catch {
            // Соединение уже могло быть закрыто.
          }
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
              // Сбрасываем флаг при отключении
              this.hasVideoTrack = false;
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
            this.hasVideoTrack = false;
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
        } catch {
          // Браузер может отложить запуск аудио до пользовательского жеста.
        }

        this.status = 'streaming';

        // ВАЖНО: Проверяем уже существующие треки после подключения
        // (на случай если trackSubscribed сработал до установки videoEl)
        this.checkAndAttachExistingTracks(room);

        useToast('HeyGen', 'Подключено и запущено');
      } catch (e: any) {
        const errorMessage =
          e?.message || e?.statusMessage || 'Не удалось запустить сессию';

        useToast('HeyGen', errorMessage);

        // При любой ошибке запуска отключаем аватар в настройках
        try {
          const chatSettings = useChatSettingsStore();
          await chatSettings.updateChatSettings({ avatar: false });
        } catch (disableError) {
          console.error(
            '[HeyGen] Failed to disable avatar after start error:',
            disableError
          );
        }

        // Очищаем состояние при ошибке
        await this.stopSession();
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
      } catch {
        // Серверная сессия может уже отсутствовать.
      }
      if (roomInstance) {
        try {
          await roomInstance.disconnect();
        } catch {
          // Соединение уже могло быть закрыто.
        }
        roomInstance = null;
      }
      this.status = 'idle';
      this.hasVideoTrack = false;
      this.sessionId = null;

      // Удаляем sessionId из универсального хранилища
      if (typeof window !== 'undefined') {
        await removeSessionItem('heygen_session_id');
      }
    },
  },
});
