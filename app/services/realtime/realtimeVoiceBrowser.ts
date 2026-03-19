type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  onSuccess: (stream: MediaStream) => void,
  onError: (error: unknown) => void
) => void;

type RealtimeVoiceWindow = Window &
  typeof globalThis & {
    webkitRTCPeerConnection?: typeof RTCPeerConnection;
    mozRTCPeerConnection?: typeof RTCPeerConnection;
  };

type LegacyNavigator = Navigator & {
  getUserMedia?: LegacyGetUserMedia;
  webkitGetUserMedia?: LegacyGetUserMedia;
  mozGetUserMedia?: LegacyGetUserMedia;
  msGetUserMedia?: LegacyGetUserMedia;
};

export type RealtimeVoiceSupportSnapshot = {
  hasPeerConnection: boolean;
  hasUserMedia: boolean;
  isSecureContext: boolean;
  origin: string | null;
  isSupported: boolean;
};

function isTrustedRealtimeVoiceOrigin(origin: string | null): boolean {
  const normalizedOrigin = String(origin || '').trim();
  if (!normalizedOrigin) {
    return false;
  }

  return /^(https?:|capacitor:|ionic:)\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    normalizedOrigin
  );
}

function resolveLegacyGetUserMedia(): LegacyGetUserMedia | null {
  if (typeof navigator === 'undefined') {
    return null;
  }

  const legacyNavigator = navigator as LegacyNavigator;

  return (
    legacyNavigator.getUserMedia ||
    legacyNavigator.webkitGetUserMedia ||
    legacyNavigator.mozGetUserMedia ||
    legacyNavigator.msGetUserMedia ||
    null
  );
}

export function getRealtimeVoicePeerConnectionCtor():
  | typeof RTCPeerConnection
  | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const browserWindow = window as RealtimeVoiceWindow;

  return (
    browserWindow.RTCPeerConnection ||
    browserWindow.webkitRTCPeerConnection ||
    browserWindow.mozRTCPeerConnection ||
    null
  );
}

export function getRealtimeVoiceSupport(): RealtimeVoiceSupportSnapshot {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      hasPeerConnection: false,
      hasUserMedia: false,
      isSecureContext: false,
      origin: null,
      isSupported: false,
    };
  }

  const hasPeerConnection = Boolean(getRealtimeVoicePeerConnectionCtor());
  const hasModernGetUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const hasLegacyGetUserMedia = Boolean(resolveLegacyGetUserMedia());
  const hasUserMedia = hasModernGetUserMedia || hasLegacyGetUserMedia;
  const origin =
    typeof window.location?.origin === 'string' &&
    window.location.origin.trim().length > 0
      ? window.location.origin
      : null;
  const isSecureContextValue =
    (typeof window.isSecureContext === 'boolean'
      ? window.isSecureContext
      : false) || isTrustedRealtimeVoiceOrigin(origin);

  return {
    hasPeerConnection,
    hasUserMedia,
    isSecureContext: isSecureContextValue,
    origin,
    isSupported: hasPeerConnection && hasUserMedia,
  };
}

export async function requestRealtimeVoiceUserMedia(
  constraints: MediaStreamConstraints
): Promise<MediaStream> {
  if (typeof navigator === 'undefined') {
    throw new Error('Realtime voice navigator API is unavailable');
  }

  if (navigator.mediaDevices?.getUserMedia) {
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  const legacyGetUserMedia = resolveLegacyGetUserMedia();
  if (!legacyGetUserMedia) {
    throw new Error('Realtime voice microphone API is unavailable');
  }

  return await new Promise<MediaStream>((resolve, reject) => {
    legacyGetUserMedia.call(
      navigator as LegacyNavigator,
      constraints,
      (stream) => {
        resolve(stream);
      },
      (error) => {
        reject(error);
      }
    );
  });
}
