/**
 * Пути к аудиофразам SOS-практики "Сильное напряжение" (файлы лежат в public).
 * При замене аудиофайлов увеличь SOS_TENSION_AUDIO_VERSION, чтобы браузер подгрузил новые.
 */
const SOS_TENSION_AUDIO_VERSION = 3;

function withCacheBust(path: string): string {
  return `${path}?v=${SOS_TENSION_AUDIO_VERSION}`;
}

export type SosTensionAudioKey = 'intro' | 'clench' | 'release' | 'finish';

export type SosTensionAddressing = 'informal' | 'formal';

export const SOS_TENSION_AUDIO: Record<
  SosTensionAddressing,
  Record<SosTensionAudioKey, string>
> = {
  informal: {
    intro: withCacheBust('/sos/tension/informal/intro.mp3'),
    clench: withCacheBust('/sos/tension/informal/clench.mp3'),
    release: withCacheBust('/sos/tension/informal/release.mp3'),
    finish: withCacheBust('/sos/tension/informal/finish.mp3'),
  },
  formal: {
    intro: withCacheBust('/sos/tension/formal/intro.mp3'),
    clench: withCacheBust('/sos/tension/formal/clench.mp3'),
    release: withCacheBust('/sos/tension/formal/release.mp3'),
    finish: withCacheBust('/sos/tension/formal/finish.mp3'),
  },
};
