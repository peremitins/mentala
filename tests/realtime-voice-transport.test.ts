import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRealtimeVoiceSupportMock = vi.fn();
const getRealtimeVoicePeerConnectionCtorMock = vi.fn();
const requestRealtimeVoiceUserMediaMock = vi.fn();

let audioTrack: { enabled: boolean; stop: ReturnType<typeof vi.fn> };

vi.mock('@/app/services/realtime/realtimeVoiceBrowser', () => ({
  getRealtimeVoiceSupport: () => getRealtimeVoiceSupportMock(),
  getRealtimeVoicePeerConnectionCtor: () =>
    getRealtimeVoicePeerConnectionCtorMock(),
  requestRealtimeVoiceUserMedia: (...args: any[]) =>
    requestRealtimeVoiceUserMediaMock(...args),
}));

class FakeDataChannel {
  readyState: RTCDataChannelState = 'open';

  addEventListener() {
    return undefined;
  }

  close() {
    this.readyState = 'closed';
  }

  send() {
    return undefined;
  }
}

class FakePeerConnection {
  static lastInstance: FakePeerConnection | null = null;

  connectionState: RTCPeerConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescriptionInit | null = null;
  private listeners = new Map<string, Set<(event: any) => void>>();

  constructor() {
    FakePeerConnection.lastInstance = this;
  }

  createDataChannel() {
    return new FakeDataChannel() as unknown as RTCDataChannel;
  }

  addTrack() {
    return undefined;
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const bucket = this.listeners.get(type) || new Set();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  async createOffer() {
    return {
      type: 'offer',
      sdp: 'v=0\r\n',
    } as RTCSessionDescriptionInit;
  }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }

  async setRemoteDescription() {
    return undefined;
  }

  close() {
    this.connectionState = 'closed';
  }

  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

class FakeAudio {
  static instances: FakeAudio[] = [];

  autoplay = false;
  muted = false;
  volume = 1;
  preload = '';
  srcObject: MediaStream | null = null;
  src = '';
  load = vi.fn();
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }

  setAttribute() {
    return undefined;
  }
}

class FakeGainNode {
  gain = { value: 1, setTargetAtTime: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeDynamicsCompressorNode {
  threshold = { value: 0 };
  knee = { value: 0 };
  ratio = { value: 0 };
  attack = { value: 0 };
  release = { value: 0 };
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeMediaStreamSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static failOnSource = false;

  state = 'running';
  currentTime = 0;
  destination = {};
  lastGain: FakeGainNode | null = null;
  createMediaStreamSource = vi.fn(() => {
    if (FakeAudioContext.failOnSource) {
      throw new Error('createMediaStreamSource failed');
    }
    return new FakeMediaStreamSourceNode();
  });
  createGain = vi.fn(() => {
    this.lastGain = new FakeGainNode();
    return this.lastGain;
  });
  createDynamicsCompressor = vi.fn(() => new FakeDynamicsCompressorNode());
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

function setWindow(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value,
  });
}

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('realtime voice transport', () => {
  beforeEach(() => {
    FakeAudio.instances = [];
    FakePeerConnection.lastInstance = null;
    getRealtimeVoiceSupportMock.mockReturnValue({
      hasPeerConnection: true,
      hasUserMedia: true,
      isSecureContext: true,
      origin: 'http://localhost',
      isSupported: true,
    });
    getRealtimeVoicePeerConnectionCtorMock.mockReturnValue(FakePeerConnection);
    audioTrack = {
      enabled: true,
      stop: vi.fn(),
    };
    requestRealtimeVoiceUserMediaMock.mockResolvedValue({
      getAudioTracks: () => [audioTrack],
      getTracks: () => [audioTrack],
    } as unknown as MediaStream);

    setWindow({
      setTimeout,
      clearTimeout,
    });
    setNavigator({
      audioSession: {
        type: 'ambient',
      },
    });

    vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('v=0\r\n', {
          status: 200,
        })
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).navigator;
    delete (globalThis as Record<string, unknown>).Audio;
    delete (globalThis as Record<string, unknown>).fetch;
  });

  it('воспроизводит remote audio через обычный HTMLAudioElement', async () => {
    const { RealtimeVoiceTransport } = await import(
      '../app/services/realtime/realtimeVoiceTransport'
    );

    const transport = new RealtimeVoiceTransport();

    await transport.start({
      webrtcUrl: 'https://api.openai.com/v1/realtime/calls',
      onEvent: vi.fn(),
    });

    const remoteStream = {
      id: 'remote_stream_1',
    } as unknown as MediaStream;

    FakePeerConnection.lastInstance?.emit('track', {
      track: {
        kind: 'audio',
      },
      streams: [remoteStream],
    });

    await Promise.resolve();

    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0]?.srcObject).toBe(remoteStream);
    expect(FakeAudio.instances[0]?.load).toHaveBeenCalledTimes(1);
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(1);
    expect((navigator as any).audioSession.type).toBe('play-and-record');

    await transport.stop();

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledTimes(1);
  });

  it('повторяет transient handshake один раз и успешно подключается со второй попытки', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 'realtime_webrtc_handshake_service_unavailable',
              message:
                'Голосовой сервер временно недоступен. Обычно это разовый сбой, можно попробовать ещё раз.',
              retryable: true,
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          )
        )
        .mockResolvedValueOnce(
          new Response('v=0\r\n', {
            status: 200,
          })
        )
    );

    const { RealtimeVoiceTransport } = await import(
      '../app/services/realtime/realtimeVoiceTransport'
    );

    const transport = new RealtimeVoiceTransport();

    await expect(
      transport.start({
        webrtcUrl: 'https://api.openai.com/v1/realtime/calls',
        onEvent: vi.fn(),
      })
    ).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('позволяет временно выключать и возвращать локальный микрофонный track', async () => {
    const { RealtimeVoiceTransport } = await import(
      '../app/services/realtime/realtimeVoiceTransport'
    );

    const transport = new RealtimeVoiceTransport();

    await transport.start({
      webrtcUrl: 'https://api.openai.com/v1/realtime/calls',
      onEvent: vi.fn(),
    });

    transport.setMicrophoneEnabled(false);
    expect(audioTrack.enabled).toBe(false);

    transport.setMicrophoneEnabled(true);
    expect(audioTrack.enabled).toBe(true);

    await transport.stop();
    expect(audioTrack.enabled).toBe(true);
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it('усиливает громкость через Web Audio (фиксированный gain ×3) при enableOutputGainBoost', async () => {
    FakeAudioContext.instances = [];
    FakeAudioContext.failOnSource = false;
    setWindow({ setTimeout, clearTimeout, AudioContext: FakeAudioContext });

    const { RealtimeVoiceTransport } = await import(
      '../app/services/realtime/realtimeVoiceTransport'
    );

    const transport = new RealtimeVoiceTransport();

    await transport.start({
      webrtcUrl: 'https://api.openai.com/v1/realtime/calls',
      onEvent: vi.fn(),
      enableOutputGainBoost: true,
    });

    FakePeerConnection.lastInstance?.emit('track', {
      track: { kind: 'audio' },
      streams: [{ id: 'remote_stream_boost' } as unknown as MediaStream],
    });
    // Дожидаемся полного флаша: gain-цепочка ставится ПОСЛЕ await play().
    await new Promise((resolve) => setTimeout(resolve, 0));

    const ctx = FakeAudioContext.instances[0];
    expect(ctx).toBeTruthy();
    expect(ctx?.createMediaStreamSource).toHaveBeenCalledTimes(1);
    // Усиление фиксировано на ×MAX (×3); живую регулировку отдаём клавишам.
    expect(ctx?.lastGain?.gain.value).toBe(3);
    // Прямой выход элемента заглушён — звук идёт через Web Audio.
    expect(FakeAudio.instances[0]?.muted).toBe(true);

    await transport.stop();
    expect(ctx?.close).toHaveBeenCalledTimes(1);
  });

  it('откатывается на прямое воспроизведение, если Web Audio недоступна', async () => {
    FakeAudioContext.instances = [];
    FakeAudioContext.failOnSource = true; // createMediaStreamSource бросит
    setWindow({ setTimeout, clearTimeout, AudioContext: FakeAudioContext });

    const { RealtimeVoiceTransport } = await import(
      '../app/services/realtime/realtimeVoiceTransport'
    );

    const transport = new RealtimeVoiceTransport();

    await transport.start({
      webrtcUrl: 'https://api.openai.com/v1/realtime/calls',
      onEvent: vi.fn(),
      enableOutputGainBoost: true,
    });

    FakePeerConnection.lastInstance?.emit('track', {
      track: { kind: 'audio' },
      streams: [{ id: 'remote_stream_fallback' } as unknown as MediaStream],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Fallback: элемент не заглушён, играет напрямую с потолком 1.0.
    expect(FakeAudio.instances[0]?.muted).toBe(false);
    expect(FakeAudio.instances[0]?.volume).toBe(1);

    FakeAudioContext.failOnSource = false;
    await transport.stop();
  });
});
