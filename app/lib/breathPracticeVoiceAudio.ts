import type { BreathPhaseType } from '@/app/lib/breathPracticesCatalog';

export type BreathVoiceAddressing = 'informal' | 'formal';
export type BreathVoiceKey = BreathPhaseType | 'intro';

export const BREATH_PRACTICE_VOICE_AUDIO: Record<
  BreathVoiceAddressing,
  Record<BreathVoiceKey, string>
> = {
  informal: {
    intro: '/breath/voice/informal/intro.mp3',
    inhale: '/breath/voice/informal/inhale.mp3',
    hold: '/breath/voice/informal/hold.mp3',
    exhale: '/breath/voice/informal/exhale.mp3',
    // Для вторичной задержки в цикле используем ту же озвучку "Задержка".
    pause: '/breath/voice/informal/hold.mp3',
  },
  formal: {
    intro: '/breath/voice/formal/intro.mp3',
    inhale: '/breath/voice/formal/inhale.mp3',
    hold: '/breath/voice/formal/hold.mp3',
    exhale: '/breath/voice/formal/exhale.mp3',
    // Для вторичной задержки в цикле используем ту же озвучку "Задержка".
    pause: '/breath/voice/formal/hold.mp3',
  },
};
