import { Capacitor } from '@capacitor/core';
import type { AudioServiceTrack } from '@/app/services/audio/audio.types';

export type NativeAudioPlatformKind = 'ios' | 'android' | 'web';

export type NativeAudioPlatformProfile = {
  kind: NativeAudioPlatformKind;
  nowPlayingPrimeDelayMs: number;
  seekSettleWindowMs: number;
  useProgressPollingFallback: boolean;
  shouldResolveSeekPositionFromNative: boolean;
  shouldUsePositionClockFallback(track: AudioServiceTrack | null): boolean;
  shouldUseSeekPlayFallback(assetIsRemote: boolean): boolean;
};

const IOS_PROFILE: NativeAudioPlatformProfile = {
  kind: 'ios',
  nowPlayingPrimeDelayMs: 0,
  seekSettleWindowMs: 2400,
  useProgressPollingFallback: true,
  shouldResolveSeekPositionFromNative: true,
  shouldUsePositionClockFallback(track: AudioServiceTrack | null) {
    return Boolean(track) && !track?.isLoop;
  },
  shouldUseSeekPlayFallback(assetIsRemote: boolean) {
    return assetIsRemote;
  },
};

const ANDROID_PROFILE: NativeAudioPlatformProfile = {
  kind: 'android',
  nowPlayingPrimeDelayMs: 0,
  seekSettleWindowMs: 2600,
  useProgressPollingFallback: false,
  shouldResolveSeekPositionFromNative: false,
  shouldUsePositionClockFallback() {
    return false;
  },
  shouldUseSeekPlayFallback() {
    return false;
  },
};

const WEB_PROFILE: NativeAudioPlatformProfile = {
  kind: 'web',
  nowPlayingPrimeDelayMs: 0,
  seekSettleWindowMs: 1500,
  useProgressPollingFallback: false,
  shouldResolveSeekPositionFromNative: false,
  shouldUsePositionClockFallback() {
    return false;
  },
  shouldUseSeekPlayFallback() {
    return false;
  },
};

export function resolveNativeAudioPlatformProfile(): NativeAudioPlatformProfile {
  if (!Capacitor.isNativePlatform()) {
    return WEB_PROFILE;
  }

  if (Capacitor.getPlatform() === 'ios') {
    return IOS_PROFILE;
  }

  if (Capacitor.getPlatform() === 'android') {
    return ANDROID_PROFILE;
  }

  return WEB_PROFILE;
}
