/**
 * Пути к озвучке описаний (description) шагов 5-4-3-2-1 (файлы в public).
 * Озвучивается только description, title не озвучивается.
 * При замене аудио увеличь SOS_GROUNDING_AUDIO_VERSION.
 */
const SOS_GROUNDING_AUDIO_VERSION = 1;

function withCacheBust(path: string): string {
  return `${path}?v=${SOS_GROUNDING_AUDIO_VERSION}`;
}

export type SosGroundingStepKey =
  | 'step1'
  | 'step2'
  | 'step3'
  | 'step4'
  | 'step5'
  | 'step1_hint';

export type SosGroundingAddressing = 'informal' | 'formal';

export const SOS_GROUNDING_AUDIO: Record<
  SosGroundingAddressing,
  Record<SosGroundingStepKey, string>
> = {
  informal: {
    step1: withCacheBust('/sos/grounding/informal/step1.mp3'),
    step2: withCacheBust('/sos/grounding/informal/step2.mp3'),
    step3: withCacheBust('/sos/grounding/informal/step3.mp3'),
    step4: withCacheBust('/sos/grounding/informal/step4.mp3'),
    step5: withCacheBust('/sos/grounding/informal/step5.mp3'),
    step1_hint: withCacheBust('/sos/grounding/informal/step1_hint.mp3'),
  },
  formal: {
    step1: withCacheBust('/sos/grounding/formal/step1.mp3'),
    step2: withCacheBust('/sos/grounding/formal/step2.mp3'),
    step3: withCacheBust('/sos/grounding/formal/step3.mp3'),
    step4: withCacheBust('/sos/grounding/formal/step4.mp3'),
    step5: withCacheBust('/sos/grounding/formal/step5.mp3'),
    step1_hint: withCacheBust('/sos/grounding/formal/step1_hint.mp3'),
  },
};
