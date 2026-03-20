import {
  getRealtimeVoicePeerConnectionCtor,
  getRealtimeVoiceSupport,
  requestRealtimeVoiceUserMedia,
} from '@/app/services/realtime/realtimeVoiceBrowser';

type RealtimeVoiceServerEvent = {
  type: string;
  [key: string]: any;
};

type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type?: string;
  };
};

const AUDIO_SESSION_PLAYBACK = 'playback';

function ensureRealtimeVoicePlaybackAudioSessionType() {
  if (typeof navigator === 'undefined') {
    return;
  }

  const session = (navigator as NavigatorWithAudioSession).audioSession;
  if (!session) {
    return;
  }

  try {
    if (session.type !== AUDIO_SESSION_PLAYBACK) {
      session.type = AUDIO_SESSION_PLAYBACK;
    }
  } catch {
    // В старых WebView API может отсутствовать или быть read-only.
  }
}

async function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = 3_000
) {
  if (connection.iceGatheringState === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeoutId = window.setTimeout(() => {
      connection.removeEventListener(
        'icegatheringstatechange',
        handleIceGatheringChange
      );
      resolve();
    }, timeoutMs);

    function handleIceGatheringChange() {
      if (connection.iceGatheringState !== 'complete') {
        return;
      }

      window.clearTimeout(timeoutId);
      connection.removeEventListener(
        'icegatheringstatechange',
        handleIceGatheringChange
      );
      resolve();
    }

    connection.addEventListener(
      'icegatheringstatechange',
      handleIceGatheringChange
    );
  });
}

export class RealtimeVoiceTransport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;

  get isConnected(): boolean {
    return (
      this.peerConnection?.connectionState === 'connected' &&
      this.dataChannel?.readyState === 'open'
    );
  }

  private ensureRemoteAudioElement(): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') {
      return null;
    }

    if (!this.remoteAudioElement) {
      const audioElement = new Audio();
      audioElement.autoplay = true;
      audioElement.muted = false;
      audioElement.volume = 1;
      audioElement.preload = 'auto';
      audioElement.setAttribute('playsinline', 'true');
      this.remoteAudioElement = audioElement;
    }

    return this.remoteAudioElement;
  }

  private async attachRemoteAudioStream(stream: MediaStream) {
    const remoteAudioElement = this.ensureRemoteAudioElement();
    if (!remoteAudioElement) {
      return;
    }

    ensureRealtimeVoicePlaybackAudioSessionType();
    remoteAudioElement.srcObject = stream;
    remoteAudioElement.muted = false;
    remoteAudioElement.volume = 1;

    await remoteAudioElement.play().catch(() => {
      // Автоплей может быть ограничен браузером. Повторное воспроизведение
      // произойдёт автоматически после следующего user gesture.
    });
  }

  async start(params: {
    clientSecret?: string | null;
    webrtcUrl: string;
    onEvent: (event: RealtimeVoiceServerEvent) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    requestHeaders?: Record<string, string>;
    audioConstraints?: MediaTrackConstraints | boolean;
  }) {
    const support = getRealtimeVoiceSupport();
    if (!support.isSecureContext) {
      throw new Error(
        `Realtime voice requires a secure context. Current origin: ${support.origin || 'unknown'}`
      );
    }

    if (!support.isSupported) {
      throw new Error('Realtime voice is not supported on this device');
    }

    await this.stop();

    const PeerConnection = getRealtimeVoicePeerConnectionCtor();
    if (!PeerConnection) {
      throw new Error('Realtime voice peer connection API is unavailable');
    }

    const peerConnection = new PeerConnection();
    const dataChannel = peerConnection.createDataChannel('oai-events');
    const localStream = await requestRealtimeVoiceUserMedia({
      audio: params.audioConstraints ?? true,
    });
    this.peerConnection = peerConnection;
    this.dataChannel = dataChannel;
    this.localStream = localStream;

    peerConnection.addEventListener('connectionstatechange', () => {
      params.onConnectionStateChange?.(peerConnection.connectionState);
    });

    peerConnection.addEventListener('track', (event) => {
      const [eventStream] = event.streams;
      const stream =
        eventStream ||
        (typeof MediaStream !== 'undefined'
          ? new MediaStream([event.track])
          : null);
      if (!stream) {
        return;
      }

      console.info('[RealtimeVoiceTransport] Remote audio track received', {
        trackKind: event.track?.kind || 'unknown',
        streamId: stream.id || 'unknown',
      });
      void this.attachRemoteAudioStream(stream);
    });

    dataChannel.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}'));
        params.onEvent(payload);
      } catch (error) {
        console.error(
          '[RealtimeVoiceTransport] Failed to parse realtime event:',
          error
        );
      }
    });

    for (const track of localStream.getTracks()) {
      peerConnection.addTrack(track, localStream);
    }

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
    });
    await peerConnection.setLocalDescription(offer);
    await waitForIceGatheringComplete(peerConnection);

    const localDescription = peerConnection.localDescription;
    if (!localDescription?.sdp) {
      throw new Error('Realtime voice offer SDP is empty');
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(params.requestHeaders || {})) {
      if (typeof value === 'string' && value.trim().length > 0) {
        headers.set(name, value);
      }
    }
    if (typeof params.clientSecret === 'string' && params.clientSecret.trim()) {
      headers.set('Authorization', `Bearer ${params.clientSecret.trim()}`);
    }
    headers.set('Content-Type', 'application/sdp');

    const response = await fetch(params.webrtcUrl, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: localDescription.sdp,
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      const normalizedResponseText = responseText.trim();

      throw new Error(
        normalizedResponseText
          ? `Realtime WebRTC handshake failed: ${response.status} ${normalizedResponseText}`
          : `Realtime WebRTC handshake failed: ${response.status}`
      );
    }

    const answerSdp = await response.text();

    await peerConnection.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    });
  }

  sendEvent(event: Record<string, unknown>) {
    if (this.dataChannel?.readyState !== 'open') {
      return;
    }

    this.dataChannel.send(JSON.stringify(event));
  }

  interrupt(responseId?: string | null) {
    this.sendEvent({
      type: 'response.cancel',
      ...(responseId ? { response_id: responseId } : {}),
    });
    this.sendEvent({
      type: 'output_audio_buffer.clear',
    });
  }

  async stop() {
    try {
      this.dataChannel?.close();
    } catch (error) {
      console.error(
        '[RealtimeVoiceTransport] Failed to close data channel:',
        error
      );
    } finally {
      this.dataChannel = null;
    }

    try {
      this.peerConnection?.close();
    } catch (error) {
      console.error(
        '[RealtimeVoiceTransport] Failed to close peer connection:',
        error
      );
    } finally {
      this.peerConnection = null;
    }

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        try {
          track.stop();
        } catch (error) {
          console.error(
            '[RealtimeVoiceTransport] Failed to stop media track:',
            error
          );
        }
      }
      this.localStream = null;
    }

    if (this.remoteAudioElement) {
      try {
        this.remoteAudioElement.pause();
        this.remoteAudioElement.srcObject = null;
        this.remoteAudioElement.src = '';
      } catch (error) {
        console.error(
          '[RealtimeVoiceTransport] Failed to reset remote audio:',
          error
        );
      }
      this.remoteAudioElement = null;
    }
  }
}
