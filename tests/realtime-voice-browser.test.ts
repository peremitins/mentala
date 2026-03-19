import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRealtimeVoiceSupport,
  requestRealtimeVoiceUserMedia,
} from '../app/services/realtime/realtimeVoiceBrowser';

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

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).navigator;
});

describe('realtime voice browser helper', () => {
  it('считает legacy WebRTC API валидной поддержкой', () => {
    const fakePeerConnection = vi.fn();

    setWindow({
      webkitRTCPeerConnection: fakePeerConnection,
    });
    setNavigator({
      webkitGetUserMedia: vi.fn(),
    });

    expect(getRealtimeVoiceSupport()).toEqual({
      hasPeerConnection: true,
      hasUserMedia: true,
      isSecureContext: false,
      origin: null,
      isSupported: true,
    });
  });

  it('считает localhost доверенным origin даже если WebView не пометил контекст secure', () => {
    const fakePeerConnection = vi.fn();

    setWindow({
      isSecureContext: false,
      location: {
        origin: 'http://localhost',
      },
      RTCPeerConnection: fakePeerConnection,
    });
    setNavigator({
      mediaDevices: {
        getUserMedia: vi.fn(),
      },
    });

    expect(getRealtimeVoiceSupport()).toEqual({
      hasPeerConnection: true,
      hasUserMedia: true,
      isSecureContext: true,
      origin: 'http://localhost',
      isSupported: true,
    });
  });

  it('оборачивает legacy getUserMedia в Promise', async () => {
    const fakeStream = { id: 'stream_1' } as MediaStream;

    setNavigator({
      getUserMedia: vi.fn(
        (
          _constraints: MediaStreamConstraints,
          onSuccess: (stream: MediaStream) => void
        ) => {
          onSuccess(fakeStream);
        }
      ),
    });

    await expect(
      requestRealtimeVoiceUserMedia({
        audio: true,
      })
    ).resolves.toBe(fakeStream);
  });
});
