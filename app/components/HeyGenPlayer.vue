<template>
  <div class="flex flex-col gap-3">
    <div class="fixed flex gap-2 top-0 right-0">
      <button
        class="px-3 py-2 rounded bg-white/10"
        @click="startSession()"
        :disabled="isStarting || connected"
      >
        Start
      </button>
      <button
        class="px-3 py-2 rounded bg-white/10"
        @click="() => speak('Привет! Как ты себя чувствуешь сегодня?')"
        :disabled="!connected || !isStarted"
      >
        Speak
      </button>
      <button
        class="px-3 py-2 rounded bg-white/10"
        @click="stopSession"
        :disabled="!connected"
      >
        Stop
      </button>
    </div>
    <video
      ref="videoEl"
      playsinline
      autoplay
      :muted="false"
      class="w-full rounded-xl bg-black/30"
    />
    <audio ref="audioEl" autoplay />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import {
  Room,
  RoomEvent,
  RemoteTrackPublication,
  RemoteParticipant,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
} from 'livekit-client';

const videoEl = ref<HTMLVideoElement | null>(null);
const audioEl = ref<HTMLAudioElement | null>(null);
const sessionId = ref<string | null>(null);
const livekitUrl = ref<string | null>(null);
const livekitToken = ref<string | null>(null);
const connected = ref(false);
const isStarting = ref(false);
let room: Room | null = null;
const isStarted = ref(false);

async function startSession(avatarId?: string) {
  if (isStarting.value || connected.value) return;
  isStarting.value = true;
  try {
    const session = await useNuxtApp().$api<any>('heygen/session', {
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
    if (!data?.session_id || !data?.access_token || !data?.url) {
      throw new Error('HeyGen session response is invalid');
    }

    sessionId.value = String(data.session_id);
    livekitUrl.value = String(data.url);
    livekitToken.value = String(data.access_token);
    (globalThis as any).lastHeygenSessionId = sessionId.value;

    // Подключаемся к LiveKit и подписываемся на треки
    room = new Room({});
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        attachRemoteTrack(track, publication, participant);
      }
    );
    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === 'video' && videoEl.value) {
        (track as RemoteVideoTrack).detach(videoEl.value);
        videoEl.value.srcObject = null;
      }
    });

    await room.connect(livekitUrl.value, livekitToken.value);

    // Включаем стрим у HeyGen
    await useNuxtApp().$api('heygen/start', {
      method: 'POST',
      body: { sessionId: sessionId.value },
    });

    // Разрешаем воспроизведение аудио (политики браузера)
    try {
      await (room as Room).startAudio?.();
    } catch {}

    isStarted.value = true;
    connected.value = true;
    useToast('HeyGen', 'Подключено и запущено', 'success');
  } catch (e: any) {
    useToast('HeyGen', e?.message || 'Не удалось запустить сессию', 'error');
  } finally {
    isStarting.value = false;
  }
}

async function speak(text: string) {
  if (!sessionId.value) return;
  try {
    await useNuxtApp().$api('heygen/speak', {
      method: 'POST',
      body: {
        sessionId: sessionId.value,
        text,
        taskMode: 'sync',
        taskType: 'repeat',
      },
    });
  } catch (e: any) {
    useToast('HeyGen', e?.message || 'Не удалось отправить речь', 'error');
  }
}

async function stopSession() {
  try {
    if (sessionId.value) {
      await useNuxtApp().$api('heygen/stop', {
        method: 'POST',
        body: { sessionId: sessionId.value },
      });
    }
  } catch {}
  if (room) {
    try {
      await room.disconnect();
    } catch {}
    room = null;
  }
  (globalThis as any).lastHeygenSessionId = '';
  connected.value = false;
}

onMounted(() => {
  // авто-старт отключён, включай по кнопке
});

onBeforeUnmount(stopSession);

function attachRemoteTrack(
  track: RemoteTrack,
  _publication: RemoteTrackPublication,
  _participant: RemoteParticipant
) {
  if (track.kind === 'video' && videoEl.value) {
    (track as RemoteVideoTrack).attach(videoEl.value);
  }
  if (track.kind === 'audio' && audioEl.value) {
    (track as RemoteAudioTrack).attach(audioEl.value);
    try {
      audioEl.value.muted = false;
      void audioEl.value.play().catch(() => {});
    } catch {}
  }
}
</script>

<style scoped>
video {
  aspect-ratio: 9/16;
  object-fit: cover;
}
</style>
