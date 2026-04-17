export type SpeechEngineId = 'native' | 'webspeech' | 'whisper' | 'auto';

export interface SpeechEngineOptions {
  language?: string;
  silenceMs?: number;
}

export interface SpeechEngine {
  start(opts?: SpeechEngineOptions): Promise<void>;
  stop(): Promise<void>;
  onPartial(cb: (text: string) => void): void;
  onFinal(cb: (text: string) => void): void;
  onError(cb: (error: unknown) => void): void;
  isAvailable(): boolean;
}
