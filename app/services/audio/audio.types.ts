export type AudioServiceEvent =
  | { type: 'ready'; trackId: string; durationMs: number }
  | { type: 'playing'; trackId: string; positionMs: number; durationMs: number }
  | { type: 'paused'; trackId: string; positionMs: number }
  | { type: 'stopped'; trackId: string }
  | { type: 'ended'; trackId: string }
  | { type: 'buffering'; trackId: string; isBuffering: boolean }
  | { type: 'error'; trackId: string; message: string; code?: string };

export type AudioServiceEventHandler = (event: AudioServiceEvent) => void;

export type AudioServiceTrack = {
  id: string;
  url: string;
  title: string;
  category: 'meditation' | 'breathing';
  artworkUrl?: string | null;
  durationMs?: number | null;
  isLoop?: boolean;
};

export type AudioServicePlayOptions = {
  loop?: boolean;
  volume?: number;
  rate?: number;
  fadeInMs?: number;
};

export type AudioServicePauseOptions = {
  fadeOutMs?: number;
};

export type AudioServiceResumeOptions = {
  fadeInMs?: number;
};

export type AudioServiceStopOptions = {
  fadeOutMs?: number;
};

export type AudioServiceSnapshot = {
  trackId: string | null;
  positionMs: number;
  durationMs: number;
  isPlaying: boolean;
  isBuffering: boolean;
};

export interface AudioService {
  init(): Promise<void>;
  load(track: AudioServiceTrack): Promise<void>;
  play(
    track: AudioServiceTrack,
    options?: AudioServicePlayOptions
  ): Promise<void>;
  pause(options?: AudioServicePauseOptions): Promise<void>;
  resume(options?: AudioServiceResumeOptions): Promise<void>;
  stop(options?: AudioServiceStopOptions): Promise<void>;
  seek(ms: number): Promise<void>;
  setLoop(enabled: boolean): Promise<void>;
  setVolume(value: number, fadeMs?: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  getSnapshot(): AudioServiceSnapshot;
  subscribe(handler: AudioServiceEventHandler): () => void;
  destroy(): Promise<void>;
}
