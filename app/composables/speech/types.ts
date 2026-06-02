export type SpeechEngineId = 'native' | 'webspeech' | 'whisper' | 'auto';

export interface SpeechEngineOptions {
  language?: string;
  silenceMs?: number;
  /**
   * Continuous-режим: не останавливать recognition после final-результата,
   * а перезапускать его автоматически на event `end` (мобильные браузеры
   * выдают final быстро и закрывают распознавание после первой фразы).
   * Используется диктовкой в textarea, где пользователь продолжает говорить.
   * Для chat-voice (single-shot transcript) — оставить false.
   */
  continuousMode?: boolean;
}

export interface SpeechEngine {
  start(opts?: SpeechEngineOptions): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onError(cb: (error: unknown) => void): void;
  isAvailable(): boolean;
}
