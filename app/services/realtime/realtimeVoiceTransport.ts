import {
  getRealtimeVoicePeerConnectionCtor,
  getRealtimeVoiceSupport,
  requestRealtimeVoiceUserMedia,
} from '@/app/services/realtime/realtimeVoiceBrowser';

type RealtimeVoiceServerEvent = {
  type: string;
  [key: string]: any;
};

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

  async start(params: {
    clientSecret?: string | null;
    webrtcUrl: string;
    onEvent: (event: RealtimeVoiceServerEvent) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    requestHeaders?: Record<string, string>;
    audioConstraints?: MediaTrackConstraints | boolean;
  }) {
    if (!getRealtimeVoiceSupport().isSupported) {
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
    const remoteAudioElement = new Audio();
    remoteAudioElement.autoplay = true;
    remoteAudioElement.setAttribute('playsinline', 'true');

    this.peerConnection = peerConnection;
    this.dataChannel = dataChannel;
    this.localStream = localStream;
    this.remoteAudioElement = remoteAudioElement;

    peerConnection.addEventListener('connectionstatechange', () => {
      params.onConnectionStateChange?.(peerConnection.connectionState);
    });

    peerConnection.addEventListener('track', (event) => {
      const [stream] = event.streams;
      if (!stream) {
        return;
      }

      remoteAudioElement.srcObject = stream;
      void remoteAudioElement.play().catch(() => {
        // Автоплей может быть ограничен браузером. Повторное воспроизведение
        // произойдёт автоматически после следующего user gesture.
      });
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
