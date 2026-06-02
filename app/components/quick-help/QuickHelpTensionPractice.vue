<template>
  <section class="relative h-full min-h-[430px] w-full">
    <div class="flex h-full flex-col justify-between space-y-3">
      <div class="glass-deep p-3 flex flex-col items-center gap-2 text-center">
        <p class="min-h-[40px] px-[5vw] text-sm font-semibold text-foreground">
          {{ tensionInstruction }}
        </p>
        <p class="text-xs text-foreground/60">
          Подход {{ tensionCurrentCycle }} / {{ tensionTotalCycles }}
        </p>
      </div>

      <div class="flex flex-col items-center justify-center gap-2">
        <BreathOrb
          :current-phase="tensionOrbPhase"
          :phase-remaining-seconds="tensionStepRemaining"
          :is-running="tensionIsRunning && !tensionIsPaused"
          :prep-countdown="tensionPrepCountdown"
        />
      </div>

      <div
        class="glass-deep space-y-4 p-4 text-elevated-strong"
        :style="{ backdropFilter: 'blur(1px)' }"
      >
        <div class="space-y-1">
          <div
            class="relative h-2 w-full overflow-hidden rounded-full border border-white/70"
          >
            <div
              class="h-full rounded-full bg-gradient-to-r from-primary-ui via-cyan-400 to-emerald-400 transition-all duration-300"
              :style="{ width: `${tensionSessionProgress}%` }"
            />
          </div>
          <div
            class="flex items-center justify-between text-xs text-foreground/70"
          >
            <span>Осталось: {{ tensionSessionRemainingLabel }}</span>
            <span>{{ tensionSessionTotalLabel }}</span>
          </div>
        </div>

        <div
          :class="['grid gap-3', showSettings ? 'grid-cols-3' : 'grid-cols-2']"
        >
          <button
            v-if="showSettings"
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-foreground transition hover:bg-white/20"
            :disabled="Boolean(tensionPrepCountdown)"
            @click="tensionSettingsOpen = true"
          >
            <IconSettings class="h-5 w-5" />
          </button>

          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-foreground transition hover:bg-white/20"
            :disabled="!tensionIsRunning"
            @click="stopTensionSession"
          >
            <IconSquare class="h-5 w-5" />
          </button>

          <button
            type="button"
            class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            :disabled="Boolean(tensionPrepCountdown)"
            @click="toggleTensionPlayback"
          >
            <IconPause
              v-if="tensionIsRunning && !tensionIsPaused"
              class="h-5 w-5"
            />
            <IconPlay v-else class="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="tensionPrepCountdown"
          class="fixed inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-foreground backdrop-blur"
          :style="{ zIndex: overlayZIndex }"
        >
          <p class="text-sm uppercase tracking-[0.2em] text-foreground/70">
            {{ tensionPrepPromptText }}
          </p>
          <p class="text-5xl font-semibold">{{ tensionPrepCountdown }}</p>
        </div>
      </Transition>
    </Teleport>

    <Dialog v-if="showSettings" v-model:open="tensionSettingsOpen">
      <DialogContent
        :overlay-class="settingsOverlayClass"
        :class="['z-[160] max-w-lg overflow-visible', settingsDialogClass]"
      >
        <div
          id="quick-help-tension-settings-portal"
          class="relative z-[60] h-0"
        />
        <DialogHeader>
          <DialogTitle>Настройки практики</DialogTitle>
        </DialogHeader>

        <div class="space-y-5">
          <div v-if="!hasFixedSessionMinutes" class="space-y-2">
            <TimePicker
              v-model="tensionSessionMinutes"
              mode="minutes"
              :label="'Длительность'"
              :minute-min="1"
              :minute-max="60"
              portal-to="#quick-help-tension-settings-portal"
            >
              <template #trigger="{ formattedTime }">
                <Button
                  variant="outline"
                  class="w-full justify-between rounded-full"
                >
                  <span class="text-sm font-medium">{{ formattedTime }}</span>
                  <IconClock class="h-4 w-4 opacity-70" />
                </Button>
              </template>
            </TimePicker>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold">Голос</p>
                <p class="text-xs text-foreground/60">Озвучка голосом</p>
              </div>
              <Switch
                :checked="tensionVoiceEnabled"
                :loading="tensionVoiceSaving"
                @update:checked="onTensionVoiceEnabledChange"
              />
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold">Звуковые сигналы</p>
                <p class="text-xs text-foreground/60">Короткие сигналы фаз</p>
              </div>
              <Switch
                :checked="tensionSoundEnabled"
                :loading="tensionSoundSaving"
                @update:checked="onTensionSoundEnabledChange"
              />
            </div>
            <div class="space-y-2">
              <div
                class="flex items-center justify-between text-xs text-foreground/60"
              >
                <span>Громкость</span>
                <span>{{ tensionSoundVolume }}%</span>
              </div>
              <input
                v-model.number="tensionSoundVolume"
                type="range"
                min="0"
                max="100"
                step="1"
                class="w-full accent-cyan-300"
                :disabled="!tensionSoundEnabled"
              />
            </div>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold">Вибрация</p>
            </div>
            <Switch
              :checked="tensionHapticsEnabled"
              :loading="tensionHapticsSaving"
              @update:checked="onTensionHapticsEnabledChange"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSquare from '~icons/lucide/square';
import IconSettings from '~icons/lucide/settings';
import IconClock from '~icons/lucide/clock';
import BreathOrb from '@/app/components/breath-practices/BreathOrb.vue';
import TimePicker from '@/app/components/TimePicker.vue';
import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/shadcn/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useBreathPracticeAudio } from '@/app/composables/useBreathPracticeAudio';
import { useBreathPracticeHaptics } from '@/app/composables/useBreathPracticeHaptics';
import { isDocumentAvailable } from '@/app/utils/document';
import {
  SOS_TENSION_AUDIO,
  type SosTensionAddressing,
  type SosTensionAudioKey,
} from '@/app/lib/sosPracticeAudio';
import { SOS_TENSION_INSTRUCTIONS } from '@/app/lib/sosTemplates';
import {
  loadSosVoiceSettings,
  saveSosVoiceSettings,
} from '@/app/utils/sosVoiceSettings';
import {
  loadSosTensionPracticeSettings,
  saveSosTensionPracticeSettings,
} from '@/app/utils/sosTensionPracticeSettings';

const props = withDefaults(
  defineProps<{
    sessionMinutes?: number;
    autoStart?: boolean;
    showSettings?: boolean;
    overlayZIndex?: number;
    settingsDialogClass?: string;
    settingsOverlayClass?: string;
  }>(),
  {
    autoStart: false,
    showSettings: true,
    overlayZIndex: 140,
    settingsDialogClass: '',
    settingsOverlayClass: 'z-[150]',
  }
);

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'stop'): void;
}>();

type Addressing = 'informal' | 'formal';

const TENSION_CLENCH_SECONDS = 5;
const TENSION_RELEASE_SECONDS = 10;
const TENSION_CYCLE_SECONDS = TENSION_CLENCH_SECONDS + TENSION_RELEASE_SECONDS;

const { fetchGlobalPreferences } = useNotificationsSettings();
const {
  playCue: playTensionCue,
  prepare: prepareTensionCueAudio,
  stopAll: stopTensionCueAudio,
  setVolume: setTensionCueVolume,
} = useBreathPracticeAudio();
const { trigger: triggerTensionHaptic } = useBreathPracticeHaptics();

const addressing = ref<Addressing>('informal');
const tensionCycleIndex = ref(0);
const tensionStepType = ref<'clench' | 'release'>('clench');
const tensionStage = ref<SosTensionAudioKey>('intro');
const tensionStepRemaining = ref(TENSION_CLENCH_SECONDS);
const tensionTotalRemaining = ref(2 * 60);
const tensionIsRunning = ref(false);
const tensionIsPaused = ref(false);
const tensionPrepCountdown = ref(0);
const tensionSettingsOpen = ref(false);
const tensionSessionMinutes = ref(2);
const tensionSoundEnabled = ref(true);
const tensionSoundVolume = ref(100);
const tensionHapticsEnabled = ref(true);
const tensionSoundSaving = ref(false);
const tensionHapticsSaving = ref(false);
const tensionVoiceEnabled = ref(false);
const tensionVoiceSaving = ref(false);

let tensionTimerId: number | null = null;
let tensionPrepTimerId: number | null = null;
let tensionCurrentAudio: HTMLAudioElement | null = null;
let tensionCuePreparePromise: Promise<void> | null = null;
let tensionCuePrepared = false;
let completedEmitted = false;
const tensionVoiceCache = new Map<string, HTMLAudioElement>();
const tensionVoiceScheduleTimers = new Set<number>();

const showSettings = computed(() => props.showSettings);
const overlayZIndex = computed(() => props.overlayZIndex);
const settingsDialogClass = computed(() => props.settingsDialogClass);
const settingsOverlayClass = computed(() => props.settingsOverlayClass);
const hasFixedSessionMinutes = computed(
  () => typeof props.sessionMinutes === 'number'
);

const tensionInstruction = computed(() => {
  if (tensionStepType.value === 'clench') {
    return SOS_TENSION_INSTRUCTIONS.clench[addressing.value];
  }
  return SOS_TENSION_INSTRUCTIONS.release[addressing.value];
});

const tensionSessionDurationSeconds = computed(
  () => clampNumber(tensionSessionMinutes.value, 1, 60) * 60
);
const tensionTotalCycles = computed(() =>
  Math.max(
    1,
    Math.floor(tensionSessionDurationSeconds.value / TENSION_CYCLE_SECONDS)
  )
);
const tensionCurrentCycle = computed(() =>
  Math.min(tensionTotalCycles.value, tensionCycleIndex.value + 1)
);
const tensionSessionProgress = computed(() => {
  const total = tensionSessionDurationSeconds.value;
  if (!total) return 0;
  return Math.min(100, ((total - tensionTotalRemaining.value) / total) * 100);
});
const tensionSessionRemainingLabel = computed(() =>
  formatSeconds(tensionTotalRemaining.value)
);
const tensionSessionTotalLabel = computed(() =>
  formatSeconds(tensionSessionDurationSeconds.value)
);
const tensionOrbPhase = computed<BreathPhase>(() => {
  const isClench = tensionStepType.value === 'clench';
  return {
    type: isClench ? 'inhale' : 'exhale',
    cue: isClench ? 'inhale' : 'exhale',
    label: tensionInstruction.value,
    seconds: isClench ? TENSION_CLENCH_SECONDS : TENSION_RELEASE_SECONDS,
  };
});
const tensionPrepPromptText = computed(() =>
  addressing.value === 'formal' ? 'Приготовьтесь' : 'Приготовься'
);

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

function formatSeconds(total: number) {
  const safe = Math.max(0, Math.floor(total));
  const min = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

function clearTensionTimer() {
  if (tensionTimerId === null) return;
  clearInterval(tensionTimerId);
  tensionTimerId = null;
}

function clearTensionPrepTimer() {
  if (tensionPrepTimerId === null) return;
  clearInterval(tensionPrepTimerId);
  tensionPrepTimerId = null;
}

function clearTensionVoiceSchedule() {
  for (const timerId of tensionVoiceScheduleTimers) {
    clearTimeout(timerId);
  }
  tensionVoiceScheduleTimers.clear();
}

function canUseTensionVoicePlayback() {
  return (
    !import.meta.server && isDocumentAvailable() && typeof Audio !== 'undefined'
  );
}

function resolveTensionAddressing(): SosTensionAddressing {
  return addressing.value === 'formal' ? 'formal' : 'informal';
}

function tensionVoiceCacheKey(
  audioKey: SosTensionAudioKey,
  voiceAddressing: SosTensionAddressing
) {
  return `${voiceAddressing}:${audioKey}`;
}

function stopTensionVoicePlayback() {
  if (!tensionCurrentAudio) return;
  try {
    tensionCurrentAudio.pause();
    tensionCurrentAudio.currentTime = 0;
  } catch (error) {
    console.error('[QuickHelpTension] Не удалось остановить голос:', error);
  } finally {
    tensionCurrentAudio = null;
  }
}

function getOrCreateTensionAudio(
  audioKey: SosTensionAudioKey,
  voiceAddressing: SosTensionAddressing
) {
  if (!canUseTensionVoicePlayback()) return null;
  const key = tensionVoiceCacheKey(audioKey, voiceAddressing);
  const cached = tensionVoiceCache.get(key);
  if (cached) return cached;

  const src = SOS_TENSION_AUDIO[voiceAddressing][audioKey];
  const audio = new Audio(src);
  audio.preload = 'auto';
  tensionVoiceCache.set(key, audio);
  return audio;
}

async function playTensionVoice(audioKey: SosTensionAudioKey) {
  if (!tensionVoiceEnabled.value || !canUseTensionVoicePlayback()) return;

  const voiceAddressing = resolveTensionAddressing();
  const audio = getOrCreateTensionAudio(audioKey, voiceAddressing);
  if (!audio) return;

  stopTensionVoicePlayback();
  tensionCurrentAudio = audio;

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch (error: unknown) {
    if ((error as Error)?.name === 'AbortError') return;
    console.error('[QuickHelpTension] Не удалось воспроизвести голос:', error);
  }
}

function applyTensionCueVolume() {
  setTensionCueVolume(clampNumber(tensionSoundVolume.value, 0, 100) / 100);
}

async function ensureTensionCueAudioReady() {
  if (tensionCuePrepared) {
    applyTensionCueVolume();
    return;
  }

  if (!tensionCuePreparePromise) {
    // Первый короткий cue на мобильных WebView может потеряться без прогрева.
    tensionCuePreparePromise = (async () => {
      await prepareTensionCueAudio();
      applyTensionCueVolume();
      tensionCuePrepared = true;
    })().finally(() => {
      tensionCuePreparePromise = null;
    });
  }

  await tensionCuePreparePromise;
}

async function announceTensionStage(audioKey: SosTensionAudioKey) {
  tensionStage.value = audioKey;
  const shouldPlayCue =
    (audioKey === 'clench' || audioKey === 'release') &&
    tensionSoundEnabled.value;

  if (shouldPlayCue) {
    await ensureTensionCueAudioReady();
  }

  void playTensionVoice(audioKey);

  if (!shouldPlayCue) return;

  const cue = audioKey === 'clench' ? 'inhale' : 'exhale';
  void playTensionCue(cue, clampNumber(tensionSoundVolume.value, 0, 100) / 100);

  if (tensionHapticsEnabled.value) {
    void triggerTensionHaptic();
  }
}

function scheduleTensionStage(audioKey: SosTensionAudioKey, delayMs: number) {
  if (typeof window === 'undefined') return;
  const timerId = window.setTimeout(() => {
    tensionVoiceScheduleTimers.delete(timerId);
    void announceTensionStage(audioKey);
  }, delayMs);
  tensionVoiceScheduleTimers.add(timerId);
}

function resetTensionCounters() {
  tensionCycleIndex.value = 0;
  tensionStepType.value = 'clench';
  tensionStage.value = 'intro';
  tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
  tensionTotalRemaining.value = tensionSessionDurationSeconds.value;
}

function clearAllTimers() {
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionVoicePlayback();
  stopTensionCueAudio(120);
  tensionIsRunning.value = false;
  tensionIsPaused.value = false;
  tensionPrepCountdown.value = 0;
  tensionSettingsOpen.value = false;
}

function completeTensionSession() {
  if (completedEmitted) return;
  completedEmitted = true;
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionCueAudio(120);
  tensionIsRunning.value = false;
  tensionIsPaused.value = false;
  tensionPrepCountdown.value = 0;
  void announceTensionStage('finish');
  emit('complete');
}

function startTensionExerciseLoop() {
  if (tensionTimerId !== null || typeof window === 'undefined') return;

  tensionIsRunning.value = true;
  tensionIsPaused.value = false;
  tensionPrepCountdown.value = 0;
  scheduleTensionStage('clench', 0);
  tensionTimerId = window.setInterval(() => {
    tensionTotalRemaining.value = Math.max(0, tensionTotalRemaining.value - 1);
    if (tensionTotalRemaining.value <= 0) {
      completeTensionSession();
      return;
    }

    if (tensionStepRemaining.value <= 1) {
      if (tensionStepType.value === 'clench') {
        tensionStepType.value = 'release';
        tensionStepRemaining.value = TENSION_RELEASE_SECONDS;
        clearTensionVoiceSchedule();
        void announceTensionStage('release');
      } else {
        tensionCycleIndex.value += 1;
        tensionStepType.value = 'clench';
        tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
        clearTensionVoiceSchedule();
        scheduleTensionStage('clench', 0);
      }
    } else {
      tensionStepRemaining.value -= 1;
    }
  }, 1000);
}

function startTensionPractice() {
  stopTensionCueAudio(120);
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionVoicePlayback();
  completedEmitted = false;
  emit('start');
  tensionIsRunning.value = true;
  tensionIsPaused.value = false;
  resetTensionCounters();

  if (tensionSoundEnabled.value) {
    void ensureTensionCueAudioReady();
  }

  tensionPrepCountdown.value = 3;
  void playTensionVoice('intro');

  if (typeof window === 'undefined') return;

  tensionPrepTimerId = window.setInterval(() => {
    if (!tensionIsRunning.value || tensionIsPaused.value) return;
    if (tensionPrepCountdown.value <= 1) {
      clearTensionPrepTimer();
      tensionPrepCountdown.value = 0;
      startTensionExerciseLoop();
      return;
    }

    tensionPrepCountdown.value -= 1;
  }, 1000);
}

function stopTensionSession() {
  clearAllTimers();
  resetTensionCounters();
  emit('stop');
}

function pauseTensionSession() {
  if (!tensionIsRunning.value || tensionIsPaused.value) return;
  tensionIsPaused.value = true;
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionVoicePlayback();
  stopTensionCueAudio(120);
  emit('pause');
}

function resumeTensionSession() {
  if (!tensionIsRunning.value || !tensionIsPaused.value) return;
  tensionIsPaused.value = false;
  emit('start');

  if (tensionPrepCountdown.value > 0) {
    if (typeof window !== 'undefined') {
      clearTensionPrepTimer();
      tensionPrepTimerId = window.setInterval(() => {
        if (!tensionIsRunning.value || tensionIsPaused.value) return;
        if (tensionPrepCountdown.value <= 1) {
          clearTensionPrepTimer();
          tensionPrepCountdown.value = 0;
          startTensionExerciseLoop();
          return;
        }
        tensionPrepCountdown.value -= 1;
      }, 1000);
    }
    return;
  }

  startTensionExerciseLoop();
}

function toggleTensionPlayback() {
  if (!tensionIsRunning.value) {
    startTensionPractice();
    return;
  }
  if (tensionIsPaused.value) {
    resumeTensionSession();
    return;
  }
  pauseTensionSession();
}

async function loadAddressing() {
  const prefs = await fetchGlobalPreferences();
  const next = prefs?.addressing;
  if (next === 'informal' || next === 'formal') {
    addressing.value = next;
  }
}

async function loadVoicePreference() {
  const settings = await loadSosVoiceSettings();
  tensionVoiceEnabled.value = settings.voiceEnabled;
}

async function loadTensionPracticeSettings() {
  const settings = await loadSosTensionPracticeSettings();
  if (hasFixedSessionMinutes.value) {
    tensionSessionMinutes.value = clampNumber(
      Number(props.sessionMinutes),
      1,
      60
    );
  } else {
    tensionSessionMinutes.value = clampNumber(settings.sessionMinutes, 1, 60);
  }
  tensionSoundEnabled.value = settings.soundEnabled;
  tensionSoundVolume.value = clampNumber(settings.volume, 0, 100);
  tensionHapticsEnabled.value = settings.hapticsEnabled;
  resetTensionCounters();

  if (tensionSoundEnabled.value) {
    await ensureTensionCueAudioReady();
  }
}

async function onTensionSoundEnabledChange(value: boolean) {
  tensionSoundSaving.value = true;
  try {
    tensionSoundEnabled.value = value;
    await saveSosTensionPracticeSettings({ soundEnabled: value });
    if (value) {
      await ensureTensionCueAudioReady();
    } else {
      stopTensionCueAudio(120);
    }
  } finally {
    tensionSoundSaving.value = false;
  }
}

async function onTensionHapticsEnabledChange(value: boolean) {
  tensionHapticsSaving.value = true;
  try {
    tensionHapticsEnabled.value = value;
    await saveSosTensionPracticeSettings({ hapticsEnabled: value });
  } finally {
    tensionHapticsSaving.value = false;
  }
}

async function onTensionVoiceEnabledChange(next: boolean) {
  tensionVoiceEnabled.value = next;
  tensionVoiceSaving.value = true;
  try {
    await saveSosVoiceSettings({ voiceEnabled: next });
    if (!next) {
      clearTensionVoiceSchedule();
      stopTensionVoicePlayback();
      return;
    }
    if (tensionIsRunning.value) {
      void playTensionVoice(tensionStage.value);
    }
  } finally {
    tensionVoiceSaving.value = false;
  }
}

watch(
  () => props.sessionMinutes,
  (value) => {
    if (typeof value !== 'number') return;
    tensionSessionMinutes.value = clampNumber(value, 1, 60);
    resetTensionCounters();
  }
);

watch(tensionSessionMinutes, (value) => {
  const safe = clampNumber(value, 1, 60);
  if (safe !== value) {
    tensionSessionMinutes.value = safe;
    return;
  }
  if (!hasFixedSessionMinutes.value) {
    void saveSosTensionPracticeSettings({ sessionMinutes: safe });
  }
  if (!tensionIsRunning.value) {
    resetTensionCounters();
  }
});

watch(tensionSoundVolume, (value) => {
  const safe = clampNumber(value, 0, 100);
  if (safe !== value) {
    tensionSoundVolume.value = safe;
    return;
  }
  applyTensionCueVolume();
  void saveSosTensionPracticeSettings({ volume: safe });
});

onMounted(async () => {
  await Promise.all([
    loadAddressing(),
    loadVoicePreference(),
    loadTensionPracticeSettings(),
  ]);

  if (props.autoStart) {
    startTensionPractice();
  }
});

onBeforeUnmount(() => {
  clearAllTimers();
  tensionVoiceCache.clear();
});
</script>
