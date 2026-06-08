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

// 'play-and-record' совместим с одновременным захватом микрофона (getUserMedia).
// 'playback' конфликтует с audio capture в PWA WebKit и вызывает ошибку
// "AudioSession category is not compatible with audio capture".
const AUDIO_SESSION_PLAY_AND_RECORD = 'play-and-record';
const INPUT_ACTIVITY_VOLUME_THRESHOLD = 4;
const INPUT_ACTIVITY_CHECK_INTERVAL_MS = 750;
const INPUT_ACTIVITY_THROTTLE_MS = 1_500;
const HANDSHAKE_RETRY_DELAY_MS = 800;
const HANDSHAKE_MAX_ATTEMPTS = 2;

// Максимальное программное усиление выходного аудио ассистента через Web Audio.
// remoteAudioElement.volume упирается в 1.0 — выше «родного» уровня источника
// громкость не поднять. GainNode позволяет усилить сверх него. Поверх стоит
// brickwall-лимитер ТОЛЬКО у самого потолка (см. OUTPUT_LIMITER_THRESHOLD_DB),
// поэтому прирост слышно почти линейно, без «пампинга» прежнего мягкого лимитера
// (он сжимал всё выше -6 dB в 12:1 и «съедал» усиление выше ~×1.5 — из-за этого
// смена ×1.5→×2.5 не давала разницы). См. .docs/arch_audio_platforms.md.
const MAX_OUTPUT_GAIN = 3;

// Порог brickwall-лимитера выходного усиления (dBFS). Держим у самого 0, чтобы
// пропускать усиленный сигнал почти линейно и ловить лимитером только клиппинг
// на пиках — иначе агрессивный лимитер нивелирует прирост громкости.
const OUTPUT_LIMITER_THRESHOLD_DB = -1;

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
    if (session.type !== AUDIO_SESSION_PLAY_AND_RECORD) {
      session.type = AUDIO_SESSION_PLAY_AND_RECORD;
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
  private isLocalMicrophoneEnabled = true;
  // Web Audio gain-цепочка для усиления выше 1.0 (см. MAX_OUTPUT_GAIN).
  // Включается только там, где источник звучит тихо (Android native + web/PWA).
  private gainBoostEnabled = false;
  private gainBoostActive = false;
  private outputAudioContext: AudioContext | null = null;
  private outputSourceNode: MediaStreamAudioSourceNode | null = null;
  private outputGainNode: GainNode | null = null;
  private outputLimiterNode: DynamicsCompressorNode | null = null;
  // Диагностический таймер: RMS-зонд после gain подтверждает, что усиленный
  // сигнал реально течёт через граф, и в каком состоянии AudioContext. Помогает
  // на устройстве отделить «граф молчит» от «громко в графе, но маршрут тихий».
  private outputDiagnosticsTimer: number | null = null;

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

  private primeRemoteAudioElement() {
    const remoteAudioElement = this.ensureRemoteAudioElement();
    if (!remoteAudioElement) {
      return;
    }

    ensureRealtimeVoicePlaybackAudioSessionType();
    remoteAudioElement.muted = false;
    remoteAudioElement.volume = 1;
    remoteAudioElement.preload = 'auto';
    try {
      remoteAudioElement.load();
    } catch {
      // MediaStream будет назначен позже в track-event; load() здесь только
      // прогревает HTMLAudioElement в user-initiated цепочке старта.
    }
  }

  private async playRemoteAudioElement(remoteAudioElement: HTMLAudioElement) {
    await remoteAudioElement.play().catch((error) => {
      console.warn(
        '[RealtimeVoiceTransport] Remote audio autoplay was delayed:',
        error
      );
    });
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

    await this.playRemoteAudioElement(remoteAudioElement);

    // Усиление выше 1.0 возможно только через Web Audio. Поднимаем цепочку
    // gain/limiter; muted-элемент остаётся «заводилкой» пайплайна. При любой
    // ошибке остаёмся на прямом воспроизведении — звук не пропадёт.
    if (this.gainBoostEnabled && !this.gainBoostActive) {
      this.trySetupOutputGainChain(stream, remoteAudioElement);
    }

    for (const track of stream.getAudioTracks?.() || []) {
      track.addEventListener?.(
        'unmute',
        () => {
          void this.playRemoteAudioElement(remoteAudioElement);
        },
        { once: true }
      );
    }
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
    enableOutputGainBoost?: boolean;
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

    this.gainBoostEnabled = params.enableOutputGainBoost === true;

    const PeerConnection = getRealtimeVoicePeerConnectionCtor();
    if (!PeerConnection) {
      throw new Error('Realtime voice peer connection API is unavailable');
    }

    const peerConnection = new PeerConnection();
    const dataChannel = peerConnection.createDataChannel('oai-events');
    this.primeRemoteAudioElement();

    // Устанавливаем audioSession = 'play-and-record' ДО getUserMedia.
    // На iOS WebKit в PWA, если session в режиме 'playback' (например, после медитации),
    // вызов getUserMedia() упадёт с "AudioSession category is not compatible with audio capture".
    ensureRealtimeVoicePlaybackAudioSessionType();

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

  /**
   * Поднимает Web Audio цепочку усиления: remote stream -> gain (до ×MAX) ->
   * лимитер (защита от клиппинга) -> destination. remote-элемент глушим: он
   * остаётся «заводилкой» WebRTC-пайплайна (обходит баг Chrome с тишиной
   * createMediaStreamSource на remote-потоке), а слышимый звук идёт через граф.
   * При любой ошибке откатываемся на прямое воспроизведение элемента.
   */
  private trySetupOutputGainChain(
    stream: MediaStream,
    remoteAudioElement: HTMLAudioElement
  ) {
    if (typeof window === 'undefined') {
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
      // latencyHint:'playback' просит «медиа»-путь вывода (на Android это
      // STREAM_MUSIC → громкий динамик), а не низколатентный, который во время
      // активной WebRTC-сессии Chrome может цеплять к тихому разговорному каналу
      // (earpiece). Если конструктор не принимает опции — берём дефолтный.
      let audioContext: AudioContext;
      try {
        audioContext = new AudioContextCtor({ latencyHint: 'playback' });
      } catch {
        audioContext = new AudioContextCtor();
      }

      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      // Фиксированное усиление ×MAX: живую регулировку отдаём аппаратным
      // клавишам (звук теперь на медиа-канале STREAM_MUSIC, см. ниже).
      gainNode.gain.value = MAX_OUTPUT_GAIN;

      // Brickwall-лимитер ТОЛЬКО у самого потолка: пропускает усиленный сигнал
      // почти линейно (прирост реально слышно) и ловит лишь клиппинг на пиках.
      const limiter = audioContext.createDynamicsCompressor();
      limiter.threshold.value = OUTPUT_LIMITER_THRESHOLD_DB;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;

      source.connect(gainNode);
      gainNode.connect(limiter);
      limiter.connect(audioContext.destination);

      const stateBeforeResume = audioContext.state;
      void audioContext.resume?.().catch(() => {
        // Возобновление до user gesture может не сработать — звук поднимется
        // на следующем взаимодействии; не критично для сессии, начатой по тапу.
      });

      // Глушим прямой выход элемента: звук идёт через Web Audio destination,
      // но muted-элемент остаётся «заводилкой» пайплайна — без него
      // createMediaStreamSource на remote-потоке Chrome молчит (cross-origin).
      remoteAudioElement.muted = true;

      this.outputAudioContext = audioContext;
      this.outputSourceNode = source;
      this.outputGainNode = gainNode;
      this.outputLimiterNode = limiter;
      this.gainBoostActive = true;

      console.info('[RealtimeVoiceTransport] Output gain boost active', {
        gain: gainNode.gain.value,
        maxGain: MAX_OUTPUT_GAIN,
        stateBeforeResume,
        sampleRate: audioContext.sampleRate,
        sinkId:
          'sinkId' in audioContext
            ? (audioContext as unknown as { sinkId?: string }).sinkId
            : undefined,
      });

      this.startOutputAudioDiagnostics(audioContext, gainNode);
    } catch (error) {
      console.warn(
        '[RealtimeVoiceTransport] Output gain boost unavailable, falling back to direct playback:',
        error
      );
      this.teardownOutputGainChain();
      remoteAudioElement.muted = false;
      remoteAudioElement.volume = 1;
      this.gainBoostActive = false;
    }
  }

  /**
   * Диагностика на устройстве. RMS-зонд после gain подтверждает, что усиленный
   * звук реально течёт через граф (а не молчит из-за cross-origin бага Chrome
   * на remote-потоке), и логирует состояние контекста + audiooutput-устройства.
   * Так на реальном Android можно однозначно отделить «граф молчит → нужен
   * другой источник» от «громко в графе, но ОС-маршрут тихий (earpiece) → нужен
   * другой выход». На само воспроизведение не влияет.
   */
  private startOutputAudioDiagnostics(
    audioContext: AudioContext,
    gainNode: GainNode
  ) {
    if (
      typeof window === 'undefined' ||
      typeof window.setInterval !== 'function' ||
      typeof audioContext.createAnalyser !== 'function'
    ) {
      return;
    }

    try {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      gainNode.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let maxRms = 0;
      let ticks = 0;

      if (this.outputDiagnosticsTimer) {
        clearInterval(this.outputDiagnosticsTimer);
      }

      this.outputDiagnosticsTimer = window.setInterval(() => {
        ticks += 1;
        analyser.getByteTimeDomainData(buffer);

        let sum = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          const normalized = ((buffer[index] ?? 128) - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / buffer.length);
        if (rms > maxRms) {
          maxRms = rms;
        }

        if (ticks < 12) {
          return;
        }

        if (this.outputDiagnosticsTimer) {
          clearInterval(this.outputDiagnosticsTimer);
          this.outputDiagnosticsTimer = null;
        }
        try {
          analyser.disconnect();
        } catch {
          // мог быть уже отключён
        }

        console.info('[RealtimeVoiceTransport] Output gain diagnostics', {
          graphMaxRms: Number(maxRms.toFixed(4)),
          // > ~0.005 означает, что граф реально звучит (не cross-origin тишина).
          graphAudible: maxRms > 0.005,
          contextState: audioContext.state,
          gain: gainNode.gain.value,
        });

        void this.logAudioOutputDevices();
      }, 250);
    } catch (error) {
      console.warn(
        '[RealtimeVoiceTransport] Output diagnostics unavailable:',
        error
      );
    }
  }

  private async logAudioOutputDevices() {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      console.info('[RealtimeVoiceTransport] Audio output devices', {
        count: outputs.length,
        labels: outputs.map((device) => device.label || '(no-label)'),
        // Если тут есть отдельный «speaker» — его можно форсить через
        // AudioContext.setSinkId; иначе маршрут целиком за ОС.
        audioContextSetSinkIdSupported:
          typeof AudioContext !== 'undefined' &&
          'setSinkId' in AudioContext.prototype,
      });
    } catch (error) {
      console.warn('[RealtimeVoiceTransport] enumerateDevices failed:', error);
    }
  }

  private teardownOutputGainChain() {
    if (this.outputDiagnosticsTimer) {
      clearInterval(this.outputDiagnosticsTimer);
      this.outputDiagnosticsTimer = null;
    }
    try {
      this.outputSourceNode?.disconnect();
    } catch {
      // узел мог быть не подключён
    }
    try {
      this.outputGainNode?.disconnect();
    } catch {
      // узел мог быть не подключён
    }
    try {
      this.outputLimiterNode?.disconnect();
    } catch {
      // узел мог быть не подключён
    }
    if (this.outputAudioContext) {
      void this.outputAudioContext.close().catch(() => {
        // контекст мог быть уже закрыт
      });
    }
    this.outputSourceNode = null;
    this.outputGainNode = null;
    this.outputLimiterNode = null;
    this.outputAudioContext = null;
    this.gainBoostActive = false;
  }

  setMicrophoneEnabled(enabled: boolean) {
    if (this.isLocalMicrophoneEnabled === enabled) {
      return;
    }

    this.isLocalMicrophoneEnabled = enabled;

    for (const track of this.localStream?.getAudioTracks?.() || []) {
      track.enabled = enabled;
    }
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
    this.teardownOutputGainChain();

    if (this.localStream) {
      this.setMicrophoneEnabled(true);
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
    this.isLocalMicrophoneEnabled = true;

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
