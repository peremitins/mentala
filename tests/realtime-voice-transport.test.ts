import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRealtimeVoiceSupportMock = vi.fn();
const getRealtimeVoicePeerConnectionCtorMock = vi.fn();
const requestRealtimeVoiceUserMediaMock = vi.fn();

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
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();

  constructor() {
    FakeAudio.instances.push(this);
  }

  setAttribute() {
    return undefined;
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
    requestRealtimeVoiceUserMediaMock.mockResolvedValue({
      getTracks: () => [
        {
          stop: vi.fn(),
        },
      ],
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
    expect(FakeAudio.instances[0]?.play).toHaveBeenCalledTimes(1);
    expect((navigator as any).audioSession.type).toBe('playback');

    await transport.stop();

    expect(FakeAudio.instances[0]?.pause).toHaveBeenCalledTimes(1);
  });
});
