import { Capacitor } from '@capacitor/core';
import type {
  BreathCueType,
  BreathPhaseType,
} from '@/app/lib/breathPracticesCatalog';

type BreathSessionPluginPhase = {
  phaseId: string;
  phaseType: BreathPhaseType;
  cueType: BreathCueType;
  durationMs: number;
  cueAudioSource?: string;
  voiceAudioSource?: string;
  friendlyTitle: string;
};

type BreathSessionStartParams = {
  sessionId: string;
  phases: BreathSessionPluginPhase[];
  soundEnabled: boolean;
  voiceEnabled: boolean;
  cueVolume: number;
  sessionEndsAtMs?: number;
};

type BreathSessionUpdateParams = {
  sessionId: string;
  soundEnabled?: boolean;
  voiceEnabled?: boolean;
  cueVolume?: number;
  sessionEndsAtMs?: number;
};

type BreathSessionPlugin = {
  startBreathingSession?: (params: BreathSessionStartParams) => Promise<void>;
  pauseBreathingSession?: (params: { sessionId: string }) => Promise<void>;
  resumeBreathingSession?: (params: { sessionId: string }) => Promise<void>;
  stopBreathingSession?: (params: { sessionId: string }) => Promise<void>;
  updateBreathingSessionConfig?: (
    params: BreathSessionUpdateParams
  ) => Promise<void>;
};

export type NativeBreathSessionPhase = {
  type: BreathPhaseType;
  cue: BreathCueType;
  label: string;
  seconds: number;
  cueAudioSource?: string;
  voiceAudioSource?: string;
};

export type NativeBreathSessionConfig = {
  phases: NativeBreathSessionPhase[];
  soundEnabled: boolean;
  voiceEnabled: boolean;
  cueVolume: number;
  sessionEndsAtMs: number | null;
};

const BREATH_SESSION_ID = 'breathing_main_session';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeCueVolume(value: number) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1);
}

function toPluginPhases(
  phases: NativeBreathSessionPhase[]
): BreathSessionPluginPhase[] {
  return phases.map((phase, index) => ({
    phaseId: `phase_${index}_${phase.type}`,
    phaseType: phase.type,
    cueType: phase.cue,
    durationMs: Math.max(0, Math.floor(phase.seconds * 1000)),
    cueAudioSource: phase.cueAudioSource,
    voiceAudioSource: phase.voiceAudioSource,
    friendlyTitle: phase.label,
  }));
}

export class NativeBreathSessionService {
  private plugin: BreathSessionPlugin | null = null;
  private initialized = false;
  private commandId = 0;
  private commandQueue = Promise.resolve();
  private active = false;
  private paused = false;
  private config: NativeBreathSessionConfig | null = null;

  async init() {
    if (this.initialized) return;

    const module = await import('@mediagrid/capacitor-native-audio');
    this.plugin = module.AudioPlayer as BreathSessionPlugin;
    this.initialized = true;
  }

  isSupported() {
    return (
      Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AudioPlayer')
    );
  }

  isActive() {
    return this.active;
  }

  isPaused() {
    return this.paused;
  }

  getConfig() {
    return this.config;
  }

  private nextCommandId() {
    this.commandId += 1;
    return this.commandId;
  }

  private isCommandActive(commandId: number) {
    return this.commandId === commandId;
  }

  private async enqueue<T>(task: () => Promise<T>) {
    const run = this.commandQueue.then(task);
    this.commandQueue = run.catch(() => undefined);
    return run;
  }

  async startSession(config: NativeBreathSessionConfig) {
    await this.init();
    if (!this.plugin?.startBreathingSession) {
      throw new Error('AudioPlayer.startBreathingSession is not available');
    }

    const commandId = this.nextCommandId();
    const normalizedConfig: NativeBreathSessionConfig = {
      ...config,
      cueVolume: normalizeCueVolume(config.cueVolume),
      sessionEndsAtMs:
        typeof config.sessionEndsAtMs === 'number'
          ? Math.max(0, Math.floor(config.sessionEndsAtMs))
          : null,
    };

    this.config = normalizedConfig;

    return this.enqueue(async () => {
      if (!this.isCommandActive(commandId)) return;

      await this.plugin?.startBreathingSession?.({
        sessionId: BREATH_SESSION_ID,
        phases: toPluginPhases(normalizedConfig.phases),
        soundEnabled: normalizedConfig.soundEnabled,
        voiceEnabled: normalizedConfig.voiceEnabled,
        cueVolume: normalizedConfig.cueVolume,
        sessionEndsAtMs: normalizedConfig.sessionEndsAtMs ?? undefined,
      });

      if (!this.isCommandActive(commandId)) return;
      this.active = true;
      this.paused = false;
      return Date.now();
    });
  }

  async pauseSession() {
    await this.init();
    if (!this.active || this.paused) return;
    if (!this.plugin?.pauseBreathingSession) return;

    const commandId = this.nextCommandId();
    await this.enqueue(async () => {
      if (!this.isCommandActive(commandId)) return;
      await this.plugin?.pauseBreathingSession?.({
        sessionId: BREATH_SESSION_ID,
      });
      if (!this.isCommandActive(commandId)) return;
      this.paused = true;
    });
  }

  async resumeSession() {
    await this.init();
    if (!this.active || !this.paused) return;
    if (!this.plugin?.resumeBreathingSession) return;

    const commandId = this.nextCommandId();
    await this.enqueue(async () => {
      if (!this.isCommandActive(commandId)) return;
      await this.plugin?.resumeBreathingSession?.({
        sessionId: BREATH_SESSION_ID,
      });
      if (!this.isCommandActive(commandId)) return;
      this.paused = false;
    });
  }

  async updateSessionConfig(
    partial: Partial<
      Pick<
        NativeBreathSessionConfig,
        'soundEnabled' | 'voiceEnabled' | 'cueVolume' | 'sessionEndsAtMs'
      >
    >
  ) {
    await this.init();
    if (!this.active || !this.plugin?.updateBreathingSessionConfig) {
      if (this.config) {
        this.config = {
          ...this.config,
          ...partial,
          cueVolume:
            typeof partial.cueVolume === 'number'
              ? normalizeCueVolume(partial.cueVolume)
              : this.config.cueVolume,
        };
      }
      return;
    }

    this.config = this.config
      ? {
          ...this.config,
          ...partial,
          cueVolume:
            typeof partial.cueVolume === 'number'
              ? normalizeCueVolume(partial.cueVolume)
              : this.config.cueVolume,
        }
      : null;

    const commandId = this.nextCommandId();
    const payload: BreathSessionUpdateParams = {
      sessionId: BREATH_SESSION_ID,
    };

    if (typeof partial.soundEnabled === 'boolean') {
      payload.soundEnabled = partial.soundEnabled;
    }
    if (typeof partial.voiceEnabled === 'boolean') {
      payload.voiceEnabled = partial.voiceEnabled;
    }
    if (typeof partial.cueVolume === 'number') {
      payload.cueVolume = normalizeCueVolume(partial.cueVolume);
    }
    if (partial.sessionEndsAtMs === null) {
      payload.sessionEndsAtMs = 0;
    } else if (typeof partial.sessionEndsAtMs === 'number') {
      payload.sessionEndsAtMs = Math.max(
        0,
        Math.floor(partial.sessionEndsAtMs)
      );
    }

    await this.enqueue(async () => {
      if (!this.isCommandActive(commandId)) return;
      await this.plugin?.updateBreathingSessionConfig?.(payload);
    });
  }

  async stopSession() {
    await this.init();
    if (!this.active && !this.config) return;

    const commandId = this.nextCommandId();
    await this.enqueue(async () => {
      await this.plugin?.stopBreathingSession?.({
        sessionId: BREATH_SESSION_ID,
      });
      if (!this.isCommandActive(commandId)) return;
      this.active = false;
      this.paused = false;
      this.config = null;
    });
  }

  async destroy() {
    await this.stopSession();
  }
}
