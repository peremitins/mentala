import {
  getRealtimeVoicePeerConnectionCtor,
  getRealtimeVoiceSupport,
  requestRealtimeVoiceUserMedia,
} from '@/app/services/realtime/realtimeVoiceBrowser';

type RealtimeVoiceServerEvent = {
  type: string;
  [key: string]: any;
};

type RealtimeVoiceWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type NavigatorWithAudioSession = Navigator & {
  audioSession?: {
    type?: string;
  };
};

const AUDIO_SESSION_PLAYBACK = 'playback';
const INPUT_ACTIVITY_VOLUME_THRESHOLD = 4;
const INPUT_ACTIVITY_CHECK_INTERVAL_MS = 750;
const INPUT_ACTIVITY_THROTTLE_MS = 1_500;
const HANDSHAKE_RETRY_DELAY_MS = 800;
const HANDSHAKE_MAX_ATTEMPTS = 2;

type RealtimeHandshakeErrorPayload = {
  code?: string;
  message?: string;
  retryable?: boolean;
  error?: {
    code?: string;
    message?: string;
    details?: {
      retryable?: boolean;
    };
  };
};

type RealtimeTransportError = Error & {
  status?: number;
  data?: RealtimeHandshakeErrorPayload | null;
  response?: {
    status: number;
    _data: RealtimeHandshakeErrorPayload | null;
  };
};

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

function parseRealtimeHandshakeErrorPayload(
  rawValue: string
): RealtimeHandshakeErrorPayload | null {
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized) as RealtimeHandshakeErrorPayload;
  } catch {
    return {
      message: normalized,
    };
  }
}

function buildRealtimeHandshakeTransportError(params: {
  status: number;
  payload: RealtimeHandshakeErrorPayload | null;
}): RealtimeTransportError {
  const message =
    params.payload?.message ||
    params.payload?.error?.message ||
    `Realtime WebRTC handshake failed: ${params.status}`;
  const error = new Error(message) as RealtimeTransportError;

  error.status = params.status;
  error.data = params.payload;
  error.response = {
    status: params.status,
    _data: params.payload,
  };

  return error;
}

function isRetryableRealtimeHandshakeError(error: unknown): boolean {
  const payload = (error as RealtimeTransportError | undefined)?.data;
  if (payload?.retryable === true) {
    return true;
  }

  if (payload?.error?.details?.retryable === true) {
    return true;
  }

  const status = Number((error as RealtimeTransportError | undefined)?.status);
  if (
    Number.isFinite(status) &&
    (status === 408 || status === 502 || status === 503 || status === 504)
  ) {
    return true;
  }

  const normalized =
    `${String((error as any)?.name || '')} ${String((error as any)?.message || '')}`.toLowerCase();
  return (
    normalized.includes('fetch failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('network request failed') ||
    normalized.includes('networkerror when attempting to fetch resource') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('aborterror')
  );
}

async function sleep(ms: number) {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export class RealtimeVoiceTransport {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private inputAudioContext: AudioContext | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private inputAudioSource: MediaStreamAudioSourceNode | null = null;
  private inputActivityInterval: number | null = null;
  private lastInputActivityAtMs = 0;

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

  private startInputActivityMonitor(
    stream: MediaStream,
    onInputAudioActivity: (() => void) | undefined
  ) {
    if (!onInputAudioActivity || typeof window === 'undefined') {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ||
      (window as RealtimeVoiceWindow).webkitAudioContext ||
      null;

    if (!AudioContextCtor) {
      return;
    }

    try {
      this.stopInputActivityMonitor();

      this.inputAudioContext = new AudioContextCtor();
      this.inputAnalyser = this.inputAudioContext.createAnalyser();
      this.inputAnalyser.fftSize = 256;
      this.inputAnalyser.smoothingTimeConstant = 0.8;
      this.inputAudioSource =
        this.inputAudioContext.createMediaStreamSource(stream);
      this.inputAudioSource.connect(this.inputAnalyser);
      this.lastInputActivityAtMs = 0;

      this.inputActivityInterval = window.setInterval(() => {
        if (!this.inputAnalyser) {
          return;
        }

        // Держим idle-session живой по реальному микрофонному сигналу,
        // даже если Realtime provider ещё не прислал speech_stopped/delta события.
        const dataArray = new Uint8Array(this.inputAnalyser.frequencyBinCount);
        this.inputAnalyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let index = 0; index < dataArray.length; index += 1) {
          const sample = dataArray[index] ?? 128;
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const volume = Math.round(rms * 100);
        const now = Date.now();

        if (
          volume > INPUT_ACTIVITY_VOLUME_THRESHOLD &&
          now - this.lastInputActivityAtMs >= INPUT_ACTIVITY_THROTTLE_MS
        ) {
          this.lastInputActivityAtMs = now;
          onInputAudioActivity();
        }
      }, INPUT_ACTIVITY_CHECK_INTERVAL_MS);
    } catch (error) {
      console.warn(
        '[RealtimeVoiceTransport] Failed to start input activity monitor:',
        error
      );
      this.stopInputActivityMonitor();
    }
  }

  private stopInputActivityMonitor() {
    if (this.inputActivityInterval) {
      clearInterval(this.inputActivityInterval);
      this.inputActivityInterval = null;
    }

    if (this.inputAudioSource) {
      try {
        this.inputAudioSource.disconnect();
      } catch (error) {
        console.error(
          '[RealtimeVoiceTransport] Failed to disconnect input audio source:',
          error
        );
      }
      this.inputAudioSource = null;
    }

    if (this.inputAnalyser) {
      try {
        this.inputAnalyser.disconnect();
      } catch (error) {
        console.error(
          '[RealtimeVoiceTransport] Failed to disconnect input analyser:',
          error
        );
      }
      this.inputAnalyser = null;
    }

    if (this.inputAudioContext) {
      void this.inputAudioContext.close().catch((error) => {
        console.error(
          '[RealtimeVoiceTransport] Failed to close input audio context:',
          error
        );
      });
      this.inputAudioContext = null;
    }

    this.lastInputActivityAtMs = 0;
  }

  async start(params: {
    clientSecret?: string | null;
    webrtcUrl: string;
    onEvent: (event: RealtimeVoiceServerEvent) => void;
    onInputAudioActivity?: () => void;
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

    this.startInputActivityMonitor(localStream, params.onInputAudioActivity);

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

    let answerSdp = '';

    for (let attempt = 1; attempt <= HANDSHAKE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(params.webrtcUrl, {
          method: 'POST',
          credentials: 'include',
          headers,
          body: localDescription.sdp,
        });

        if (!response.ok) {
          const responseText = await response.text().catch(() => '');
          throw buildRealtimeHandshakeTransportError({
            status: response.status,
            payload: parseRealtimeHandshakeErrorPayload(responseText),
          });
        }

        answerSdp = await response.text();
        break;
      } catch (error) {
        const shouldRetry =
          attempt < HANDSHAKE_MAX_ATTEMPTS &&
          isRetryableRealtimeHandshakeError(error);

        if (!shouldRetry) {
          throw error;
        }

        // Один быстрый автоповтор покрывает типичный transient сбой relay /
        // апстрима, из-за которого первая попытка на mobile иногда срывается.
        console.warn(
          '[RealtimeVoiceTransport] Retrying failed handshake attempt',
          {
            attempt,
            nextAttempt: attempt + 1,
            status: (error as RealtimeTransportError | undefined)?.status,
            message: String(
              (error as any)?.message || 'Unknown handshake error'
            ),
          }
        );
        await sleep(HANDSHAKE_RETRY_DELAY_MS);
      }
    }

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

    this.stopInputActivityMonitor();

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
