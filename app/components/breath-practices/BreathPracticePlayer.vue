<template>
  <div class="flex flex-col space-y-2 justify-between h-full">
    <div class="flex flex-col items-center gap-2 text-center">
      <p class="max-w-xl text-sm text-white/85 text-elevated">
        {{ practice.description }}
      </p>
      <p class="text-xs text-white/60">{{ practice.pattern }}</p>
    </div>

    <div class="flex flex-col items-center gap-2 justify-center">
      <BreathOrb
        :current-phase="currentPhase"
        :phase-remaining-seconds="phaseRemainingSeconds"
        :is-running="isRunning"
        :prep-countdown="prepCountdown"
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
            :style="{ width: `${sessionProgress}%` }"
          />
        </div>
        <div class="flex items-center justify-between text-xs text-white/70">
          <span>Осталось: {{ sessionRemainingLabel }}</span>
          <span>{{ sessionTotalLabel }}</span>
        </div>
      </div>

      <div :class="['grid gap-3', controlsGridClass]">
        <button
          v-if="showSettings"
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          :disabled="Boolean(prepCountdown)"
          @click="settingsOpen = true"
        >
          <IconSettings class="h-5 w-5" />
        </button>

        <button
          v-if="showNavigation"
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          @click="emit('navigate-prev')"
        >
          <IconSkipBack class="h-5 w-5" />
        </button>

        <button
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          :disabled="!isRunning"
          @click="stopSession"
        >
          <IconSquare class="h-5 w-5" />
        </button>

        <button
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-primary/80 text-primary-foreground shadow-lg transition hover:bg-primary disabled:cursor-not-allowed disabled:opacity-70"
          :disabled="Boolean(prepCountdown)"
          @click="togglePlayback"
        >
          <IconPause v-if="isActive" class="h-5 w-5" />
          <IconPlay v-else class="h-5 w-5" />
        </button>

        <button
          v-if="showNavigation"
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          @click="emit('navigate-next')"
        >
          <IconSkipForward class="h-5 w-5" />
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="prepCountdown"
        class="fixed inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur"
        :style="{ zIndex: overlayZIndex }"
      >
        <p class="text-sm uppercase tracking-[0.2em] text-white/70">
          {{ prepPromptText }}
        </p>
        <p class="text-5xl font-semibold">{{ prepCountdown }}</p>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <div
      v-if="showCompletionOverlay && isCompleted"
      class="fixed inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/50 text-white backdrop-blur"
      :style="{ zIndex: overlayZIndex }"
    >
      <p class="text-lg font-semibold">Сеанс завершён</p>
      <div class="flex gap-3">
        <Button size="lg" @click="restartSession">Повторить</Button>
        <Button size="lg" variant="ghost" @click="stopSession">Готово</Button>
      </div>
    </div>
  </Teleport>

  <Dialog v-if="showSettings" v-model:open="settingsOpen">
    <DialogContent
      :overlay-class="props.settingsOverlayClass"
      :class="[
        'max-w-lg bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white border-white/10 overflow-visible',
        props.settingsDialogClass,
      ]"
    >
      <div id="breath-practice-settings-portal" class="relative z-[60] h-0" />
      <DialogHeader>
        <DialogTitle>Настройки практики</DialogTitle>
      </DialogHeader>

      <div class="space-y-5">
        <div class="space-y-2">
          <TimePicker
            v-model="sessionMinutes"
            mode="minutes"
            :label="'Длительность'"
            :minute-min="1"
            :minute-max="60"
            portal-to="#breath-practice-settings-portal"
          >
            <template #trigger="{ formattedTime }">
              <Button
                variant="outline"
                class="w-full justify-between rounded-full border-white/20 bg-white/5 text-white/90 hover:bg-white/10"
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
              <p class="text-xs text-white/60">
                Озвучка фаз: вдох, задержка, выдох, задержка
              </p>
            </div>
            <Switch
              :checked="voiceEnabled"
              :loading="voiceSaving"
              @update:checked="onVoiceEnabledChange"
            />
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold">Звуковые сигналы</p>
            </div>
            <Switch
              :checked="soundEnabled"
              :loading="soundSaving"
              @update:checked="onSoundEnabledChange"
            />
          </div>
          <div class="space-y-2">
            <div
              class="flex items-center justify-between text-xs text-white/60"
            >
              <span>Громкость</span>
              <span>{{ soundVolume }}%</span>
            </div>
            <input
              v-model.number="soundVolume"
              type="range"
              min="0"
              max="100"
              step="1"
              class="w-full accent-cyan-300"
              :disabled="!soundEnabled"
            />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold">Вибрация</p>
          </div>
          <Switch
            :checked="hapticsEnabled"
            :loading="hapticsSaving"
            @update:checked="onHapticsEnabledChange"
          />
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BreathPractice } from '@/app/lib/breathPracticesCatalog';
import BreathOrb from '@/app/components/breath-practices/BreathOrb.vue';
import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/shadcn/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSkipBack from '~icons/lucide/skip-back';
import IconSkipForward from '~icons/lucide/skip-forward';
import IconSquare from '~icons/lucide/square';
import IconSettings from '~icons/lucide/settings';
import IconClock from '~icons/lucide/clock';
import {
  loadBreathPracticeSettings,
  saveBreathPracticeSettings,
} from '@/app/utils/breathPracticeSettings';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useBreathPracticePlayer } from '@/app/composables/useBreathPracticePlayer';
import { useBreathPracticeAudio } from '@/app/composables/useBreathPracticeAudio';
import { useBreathPracticeVoice } from '@/app/composables/useBreathPracticeVoice';
import { useBreathPracticeHaptics } from '@/app/composables/useBreathPracticeHaptics';
import TimePicker from '@/app/components/TimePicker.vue';

const props = withDefaults(
  defineProps<{
    practice: BreathPractice;
    showNavigation?: boolean;
    showSettings?: boolean;
    sessionMinutes?: number;
    autoStart?: boolean;
    showCompletionOverlay?: boolean;
    overlayZIndex?: number;
    settingsDialogClass?: string;
    settingsOverlayClass?: string;
  }>(),
  {
    showNavigation: false,
    showSettings: true,
    showCompletionOverlay: true,
    overlayZIndex: 30,
  }
);

const emit = defineEmits<{
  (e: 'navigate-prev'): void;
  (e: 'navigate-next'): void;
  (e: 'complete'): void;
}>();

const showNavigation = computed(() => props.showNavigation);
const showSettings = computed(() => props.showSettings);
const showCompletionOverlay = computed(() => props.showCompletionOverlay);
const overlayZIndex = computed(() => props.overlayZIndex);
const hasFixedSessionMinutes = computed(
  () => typeof props.sessionMinutes === 'number'
);
type Addressing = 'informal' | 'formal';

const { fetchGlobalPreferences } = useNotificationsSettings();
const prepAddressing = ref<Addressing>('formal');
const prepPromptText = computed(() =>
  prepAddressing.value === 'formal' ? 'Приготовьтесь' : 'Приготовься'
);

const controlsGridClass = computed(() => {
  if (showSettings.value && showNavigation.value) return 'grid-cols-5';
  if (showSettings.value && !showNavigation.value) return 'grid-cols-3';
  if (!showSettings.value && showNavigation.value) return 'grid-cols-4';
  return 'grid-cols-2';
});

const {
  playCue,
  prepare: prepareAudio,
  stopAll: stopAudio,
  setVolume,
} = useBreathPracticeAudio();
const {
  prepare: prepareVoice,
  play: playVoice,
  stop: stopVoice,
} = useBreathPracticeVoice();
const { trigger: triggerHaptic } = useBreathPracticeHaptics();

const player = useBreathPracticePlayer({
  onPhaseStart: async (phase) => {
    if (voiceEnabled.value) {
      await playVoice(phase.type, prepAddressing.value);
    }
    if (soundEnabled.value) {
      await playCue(phase.cue, soundVolume.value / 100);
    }
    if (hapticsEnabled.value) {
      await triggerHaptic();
    }
  },
  onSessionComplete: () => {
    emit('complete');
  },
});

const {
  currentPhase,
  phaseRemainingSeconds,
  sessionRemainingSeconds,
  sessionDurationSeconds,
  prepCountdown,
  isRunning,
  isPaused,
  isCompleted,
  sessionProgress,
} = player;

const isActive = computed(() => isRunning.value && !isPaused.value);

function formatSeconds(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

const sessionRemainingLabel = computed(() =>
  formatSeconds(sessionRemainingSeconds.value)
);
const sessionTotalLabel = computed(() =>
  formatSeconds(sessionDurationSeconds.value)
);

const settingsOpen = ref(false);
const voiceEnabled = ref(false);
const soundEnabled = ref(true);
const soundVolume = ref(70);
const hapticsEnabled = ref(true);
const sessionMinutes = ref(5);
const voiceSaving = ref(false);
const soundSaving = ref(false);
const hapticsSaving = ref(false);

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

function togglePlayback() {
  if (!props.practice) return;
  if (!isRunning.value) {
    player.start();
    return;
  }
  if (isPaused.value) {
    player.resume();
  } else {
    stopAudio(120);
    stopVoice();
    player.pause();
  }
}

function stopSession() {
  stopAudio(120);
  stopVoice();
  player.stop();
}

function restartSession() {
  player.start();
}

async function onSoundEnabledChange(value: boolean) {
  soundSaving.value = true;
  try {
    await saveBreathPracticeSettings({ soundEnabled: value });
    soundEnabled.value = value;
    if (value) {
      await prepareAudio();
      setVolume(soundVolume.value / 100);
    }
  } finally {
    soundSaving.value = false;
  }
}

async function onVoiceEnabledChange(value: boolean) {
  voiceSaving.value = true;
  try {
    await saveBreathPracticeSettings({ voiceEnabled: value });
    voiceEnabled.value = value;
    if (value) {
      await prepareVoice(prepAddressing.value);
      if (prepCountdown.value > 0) {
        await playVoice('intro', prepAddressing.value);
      }
      return;
    }
    stopVoice();
  } finally {
    voiceSaving.value = false;
  }
}

async function onHapticsEnabledChange(value: boolean) {
  hapticsSaving.value = true;
  try {
    await saveBreathPracticeSettings({ hapticsEnabled: value });
    hapticsEnabled.value = value;
  } finally {
    hapticsSaving.value = false;
  }
}

async function loadPrepAddressing() {
  const prefs = await fetchGlobalPreferences();
  const next = prefs?.addressing;
  if (next === 'informal' || next === 'formal') {
    prepAddressing.value = next;
  }
}

onMounted(async () => {
  await loadPrepAddressing();
  const settings = await loadBreathPracticeSettings();
  voiceEnabled.value = settings.voiceEnabled;
  soundEnabled.value = settings.soundEnabled;
  soundVolume.value = settings.volume;
  hapticsEnabled.value = settings.hapticsEnabled;
  if (hasFixedSessionMinutes.value) {
    sessionMinutes.value = clampNumber(Number(props.sessionMinutes), 1, 60);
  } else {
    sessionMinutes.value = clampNumber(settings.sessionMinutes, 1, 60);
  }

  if (soundEnabled.value) {
    await prepareAudio();
  }
  if (voiceEnabled.value) {
    await prepareVoice(prepAddressing.value);
  }

  player.setPhases(props.practice.phases);
  player.setSessionDuration(sessionMinutes.value * 60);

  if (props.autoStart) {
    player.start();
  }
});

watch(
  () => props.practice.phases,
  (value) => {
    if (!value) return;
    stopVoice();
    player.stop();
    player.setPhases(value);
  }
);

watch(
  () => sessionMinutes.value,
  (value) => {
    const safe = clampNumber(value, 1, 60);
    if (safe !== value) {
      sessionMinutes.value = safe;
      return;
    }
    player.setSessionDuration(safe * 60);
    if (!hasFixedSessionMinutes.value) {
      void saveBreathPracticeSettings({ sessionMinutes: safe });
    }
  }
);

watch(
  () => props.sessionMinutes,
  (value) => {
    if (typeof value !== 'number') return;
    const safe = clampNumber(value, 1, 60);
    sessionMinutes.value = safe;
    player.setSessionDuration(safe * 60);
  }
);

watch(soundVolume, (value) => {
  setVolume(clampNumber(value, 0, 100) / 100);
  void saveBreathPracticeSettings({ volume: clampNumber(value, 0, 100) });
});

watch(
  () => prepCountdown.value,
  (value, prevValue) => {
    // Intro звучит в момент появления prep-оверлея.
    if (!voiceEnabled.value) return;
    if (value > 0 && prevValue === 0) {
      void playVoice('intro', prepAddressing.value);
    }
  }
);

watch(
  () => prepAddressing.value,
  (nextAddressing) => {
    if (!voiceEnabled.value) return;
    void prepareVoice(nextAddressing);
  }
);

onBeforeUnmount(() => {
  stopAudio(0);
  stopVoice();
  player.stop();
});
</script>
