import { describe, expect, it } from 'vitest';
import {
  buildRealtimeVoiceAudioConstraints,
  shouldInterruptRealtimeAssistantOnSpeechStart,
} from '../app/services/realtime/realtimeVoicePolicy';

describe('realtime voice policy', () => {
  it('включает mobile-friendly audio constraints для микрофона', () => {
    expect(buildRealtimeVoiceAudioConstraints('android')).toEqual({
      channelCount: {
        ideal: 1,
      },
      echoCancellation: {
        ideal: true,
      },
      noiseSuppression: {
        ideal: true,
      },
      autoGainControl: {
        ideal: true,
      },
      latency: {
        ideal: 0,
      },
    });
  });

  it('не делает немедленный interrupt на mobile, пока играет ассистент', () => {
    expect(
      shouldInterruptRealtimeAssistantOnSpeechStart({
        platform: 'android',
        activeResponseId: 'resp_1',
        wasAlreadyInterrupted: false,
        isAssistantAudioPlaying: true,
      })
    ).toBe(false);
  });

  it('полностью отключает client-side interrupt на mobile даже без активного playback ассистента', () => {
    expect(
      shouldInterruptRealtimeAssistantOnSpeechStart({
        platform: 'ios',
        activeResponseId: 'resp_1',
        wasAlreadyInterrupted: false,
        isAssistantAudioPlaying: false,
      })
    ).toBe(false);
  });

  it('сохраняет barge-in на web', () => {
    expect(
      shouldInterruptRealtimeAssistantOnSpeechStart({
        platform: 'web',
        activeResponseId: 'resp_1',
        wasAlreadyInterrupted: false,
        isAssistantAudioPlaying: true,
      })
    ).toBe(true);
  });
});
