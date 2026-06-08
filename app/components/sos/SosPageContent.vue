<template>
  <div class="flex items-center justify-center min-h-0 flex-1 overflow-auto">
    <section
      v-if="step === 'select'"
      class="flex flex-col items-center justify-center space-y-4 w-full"
    >
      <div class="w-full xs:space-y-3 space-y-1">
        <button
          v-for="card in quickHelpCards"
          :key="card.id"
          type="button"
          class="glass-deep w-full rounded-xl p-4 text-left transition hover:border-white/30"
          @click="handleQuickHelpCardClick(card)"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-base font-semibold text-foreground">
                {{ card.title }}
              </p>
              <p class="mt-1 text-sm text-foreground/80">
                {{ card.subtitle }}
              </p>
            </div>
            <span
              v-if="getCardRequiredPlan(card)"
              class="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/45 text-sm leading-none"
            >
              {{ getPlanBadgeEmoji(getCardRequiredPlan(card) || 'pro') }}
            </span>
          </div>
        </button>
      </div>
    </section>

    <section
      v-else-if="step === 'panic-grounding'"
      class="glass-deep p-3 flex flex-col items-center justify-center space-y-4 w-full"
    >
      <div class="space-y-1 text-center">
        <p class="text-sm text-foreground/70">5-4-3-2-1</p>
        <h3 class="text-xl font-semibold text-foreground">
          {{ groundingCurrent.title }}
        </h3>
      </div>

      <div class="w-full space-y-2">
        <div class="rounded-2xl border border-white/10 bg-background/20 p-3">
          <p class="text-sm text-center text-foreground/80">
            {{ groundingCurrent.description }}
          </p>
        </div>

        <div
          class="flex items-center justify-between gap-4 text-sm text-foreground/80"
        >
          <span
            >Шаг {{ groundingIndex + 1 }} из {{ groundingSteps.length }}</span
          >
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-foreground/70">Голос</span>
            <Switch
              :checked="tensionVoiceEnabled"
              :loading="tensionVoiceSaving"
              @update:checked="onGroundingVoiceChange"
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            class="w-full"
            :disabled="groundingIndex === 0"
            @click="groundingPrev"
          >
            Назад
          </Button>
          <Button class="w-full" @click="groundingNext">
            {{
              groundingIndex === groundingSteps.length - 1
                ? 'Завершить'
                : 'Дальше'
            }}
          </Button>
        </div>
      </div>
    </section>

    <section
      v-else-if="step === 'panic-breathing' && panicBreathingPractice"
      class="relative h-full w-full"
    >
      <BreathPracticePlayer
        :practice="panicBreathingPractice"
        :show-navigation="false"
        :show-settings="true"
        :show-completion-overlay="false"
        :session-minutes="2"
        :auto-start="true"
        :overlay-z-index="140"
        settings-dialog-class="z-[160]"
        settings-overlay-class="z-[150]"
        @complete="handlePracticeComplete('panic')"
      />
    </section>

    <section
      v-else-if="step === 'tension-practice'"
      class="relative h-full w-full"
    >
      <div class="flex h-full flex-col justify-between space-y-2">
        <div
          class="glass-deep p-3 flex flex-col items-center gap-2 text-center"
        >
          <p
            class="text-sm font-semibold text-foreground min-h-[40px] px-[5vw]"
          >
            {{ tensionInstruction }}
          </p>
          <p class="text-xs text-foreground/60">
            Подход {{ tensionCurrentCycle }} / {{ tensionTotalCycles }}
          </p>
        </div>

        <div class="flex flex-col items-center gap-2 justify-center">
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

          <div class="grid grid-cols-3 gap-3">
            <button
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
              class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 opacity-100"
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
    </section>

    <section
      v-else-if="step === 'finish'"
      class="glass-deep p-3 flex flex-col items-center justify-center space-y-4 w-full"
    >
      <div class="space-y-1 text-center">
        <p class="text-sm text-foreground/70">Практика завершена</p>
        <h3 class="text-2xl font-semibold text-foreground">Следующий шаг</h3>
      </div>

      <div class="w-full space-y-2">
        <Button
          variant="outline"
          class="w-full"
          size="lg"
          @click="goToChat(finishEntry, true)"
        >
          <span class="inline-flex items-center gap-2">
            <span>Продолжить в чате</span>
            <span
              v-if="!chatHandoffAccess.available"
              class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/45 text-sm leading-none"
            >
              {{ getPlanBadgeEmoji(chatHandoffAccess.requiredPlan) }}
            </span>
          </span>
        </Button>
        <Button
          variant="ghost"
          class="w-full"
          size="lg"
          @click="repeatLastPractice"
        >
          Повторить
        </Button>
        <Button
          variant="ghost"
          class="w-full"
          size="lg"
          @click="setStep('select')"
        >
          Выбрать другую технику
        </Button>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="step === 'tension-practice' && tensionPrepCountdown"
          class="fixed inset-0 z-[140] flex flex-col items-center justify-center gap-2 bg-black/50 text-foreground backdrop-blur"
        >
          <p class="text-sm uppercase tracking-[0.2em] text-foreground/70">
            {{ tensionPrepPromptText }}
          </p>
          <p class="text-5xl font-semibold">{{ tensionPrepCountdown }}</p>
        </div>
      </Transition>
    </Teleport>

    <Dialog
      v-if="step === 'tension-practice'"
      v-model:open="tensionSettingsOpen"
    >
      <DialogContent
        overlay-class="z-[150]"
        class="z-[160] max-w-lg overflow-visible"
      >
        <div id="sos-tension-settings-portal" class="relative z-[60] h-0" />
        <DialogHeader>
          <DialogTitle>Настройки практики</DialogTitle>
        </DialogHeader>

        <div class="space-y-5">
          <div class="space-y-2">
            <TimePicker
              v-model="tensionSessionMinutes"
              mode="minutes"
              :label="'Длительность'"
              :minute-min="1"
              :minute-max="60"
              portal-to="#sos-tension-settings-portal"
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
                <p class="text-xs text-foreground/60">
                  Короткие сигналы inhale/exhale
                </p>
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

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      :feature-key="paywallFeatureKey"
      :required-plan="paywallAccess?.requiredPlan || null"
      :paywall="paywallAccess?.paywall || null"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { navigateTo } from '#app';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSquare from '~icons/lucide/square';
import IconSettings from '~icons/lucide/settings';
import IconClock from '~icons/lucide/clock';
import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/shadcn/switch';
import { findBreathPractice } from '@/app/lib/breathPracticesCatalog';
import type { BreathPhase } from '@/app/lib/breathPracticesCatalog';
import BreathPracticePlayer from '@/app/components/breath-practices/BreathPracticePlayer.vue';
import BreathOrb from '@/app/components/breath-practices/BreathOrb.vue';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import TimePicker from '@/app/components/TimePicker.vue';
import { useSos, type SosEntry, type SosStep } from '@/app/composables/useSos';
import { useChatStore } from '@/app/stores/chat';
import {
  QUICK_HELP_CARDS,
  type QuickHelpCard,
} from '@/app/lib/quickHelpCatalog';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useToast } from '@/app/composables/useToast';
import { useBreathPracticeAudio } from '@/app/composables/useBreathPracticeAudio';
import { useBreathPracticeHaptics } from '@/app/composables/useBreathPracticeHaptics';
import { useHaptics } from '@/app/composables/useHaptics';
import { isDocumentAvailable } from '@/app/utils/document';
import {
  loadSosVoiceSettings,
  saveSosVoiceSettings,
} from '@/app/utils/sosVoiceSettings';
import {
  loadSosTensionPracticeSettings,
  saveSosTensionPracticeSettings,
} from '@/app/utils/sosTensionPracticeSettings';
import {
  SOS_TENSION_AUDIO,
  type SosTensionAddressing,
  type SosTensionAudioKey,
} from '@/app/lib/sosPracticeAudio';
import {
  SOS_GROUNDING_AUDIO,
  type SosGroundingStepKey,
} from '@/app/lib/sosGroundingAudio';
import {
  SOS_GROUNDING_STEPS,
  SOS_TENSION_INSTRUCTIONS,
} from '@/app/lib/sosTemplates';

type Addressing = 'informal' | 'formal';

const TENSION_CLENCH_SECONDS = 5;
const TENSION_RELEASE_SECONDS = 10;
const TENSION_CYCLE_SECONDS = TENSION_CLENCH_SECONDS + TENSION_RELEASE_SECONDS;

const groundingSteps = SOS_GROUNDING_STEPS;

const { step, finish, close, setStep, setFinish } = useSos();
const chat = useChatStore();
const { fetchGlobalPreferences } = useNotificationsSettings();
const { getFeatureAccess } = useEntitlements();
const {
  playCue: playTensionCue,
  prepare: prepareTensionCueAudio,
  stopAll: stopTensionCueAudio,
  setVolume: setTensionCueVolume,
} = useBreathPracticeAudio();
const { trigger: triggerTensionHaptic } = useBreathPracticeHaptics();
const { triggerLight, triggerSuccess } = useHaptics();

const addressing = ref<Addressing>('informal');

const panicBreathingPractice = computed(() =>
  findBreathPractice('box-breathing')
);
const quickHelpCards = QUICK_HELP_CARDS;
const finishEntry = computed<SosEntry>(() => finish.value?.entry ?? 'panic');
const lastCompletedStep = ref<SosStep | null>(null);

const groundingIndex = ref(0);
const paywallOpen = ref(false);
const paywallFeatureKey = ref<string | null>(null);

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
let groundingCurrentAudio: HTMLAudioElement | null = null;
let groundingHintTimerId: ReturnType<typeof setTimeout> | null = null;
let tensionCuePreparePromise: Promise<void> | null = null;
let tensionCuePrepared = false;
const tensionVoiceCache = new Map<string, HTMLAudioElement>();
const tensionVoicePreloaded = new Set<string>();
const tensionVoicePreloadInFlight = new Set<string>();
const tensionVoiceScheduleTimers = new Set<number>();

const groundingCurrent = computed(() => {
  const s = groundingSteps[groundingIndex.value] ?? groundingSteps[0];
  const addr = addressing.value;
  return {
    title: s.title[addr],
    description: s.description[addr],
  };
});

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
const paywallAccess = computed(() =>
  paywallFeatureKey.value ? getFeatureAccess(paywallFeatureKey.value) : null
);
const chatHandoffAccess = computed(() => getFeatureAccess('sos.chat_handoff'));
const quickHelpPracticeAccess = computed(() =>
  getFeatureAccess('quick_help.practice')
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
    console.error('[SOS Voice] Failed to stop playback:', error);
  } finally {
    tensionCurrentAudio = null;
  }
}

function clearGroundingHintTimer() {
  if (groundingHintTimerId !== null) {
    clearTimeout(groundingHintTimerId);
    groundingHintTimerId = null;
  }
}

function stopGroundingVoicePlayback() {
  clearGroundingHintTimer();
  if (!groundingCurrentAudio) return;
  try {
    groundingCurrentAudio.pause();
    groundingCurrentAudio.currentTime = 0;
  } catch (error) {
    console.error('[SOS Grounding] Failed to stop playback:', error);
  } finally {
    groundingCurrentAudio = null;
  }
}

const GROUNDING_STEP1_HINT_DELAY_MS = 2000;

const GROUNDING_STEP_KEYS: SosGroundingStepKey[] = [
  'step1',
  'step2',
  'step3',
  'step4',
  'step5',
];

async function playGroundingVoice(stepIndex: number) {
  if (
    !tensionVoiceEnabled.value ||
    import.meta.server ||
    !isDocumentAvailable() ||
    typeof Audio === 'undefined'
  ) {
    return;
  }
  const key = GROUNDING_STEP_KEYS[stepIndex];
  if (!key) return;
  const addr = addressing.value === 'formal' ? 'formal' : 'informal';
  const src = SOS_GROUNDING_AUDIO[addr][key];
  stopGroundingVoicePlayback();
  const audio = new Audio(src);
  groundingCurrentAudio = audio;
  try {
    audio.currentTime = 0;
    await audio.play();
    if (stepIndex === 0) {
      audio.addEventListener(
        'ended',
        () => {
          groundingHintTimerId = setTimeout(() => {
            groundingHintTimerId = null;
            if (groundingIndex.value !== 0 || !tensionVoiceEnabled.value)
              return;
            const hintSrc = SOS_GROUNDING_AUDIO[addr]['step1_hint'];
            const hintAudio = new Audio(hintSrc);
            groundingCurrentAudio = hintAudio;
            hintAudio.currentTime = 0;
            void hintAudio.play().catch((err: unknown) => {
              if ((err as Error)?.name !== 'AbortError') {
                console.error('[SOS Grounding] Failed to play hint:', err);
              }
            });
          }, GROUNDING_STEP1_HINT_DELAY_MS);
        },
        { once: true }
      );
    }
  } catch (error: unknown) {
    if ((error as Error)?.name === 'AbortError') return;
    console.error('[SOS Grounding] Failed to play clip:', error);
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

async function preloadTensionVoiceClip(
  audioKey: SosTensionAudioKey,
  voiceAddressing: SosTensionAddressing
) {
  const key = tensionVoiceCacheKey(audioKey, voiceAddressing);
  if (tensionVoicePreloaded.has(key) || tensionVoicePreloadInFlight.has(key)) {
    return;
  }

  const audio = getOrCreateTensionAudio(audioKey, voiceAddressing);
  if (!audio) return;

  tensionVoicePreloadInFlight.add(key);
  try {
    await new Promise<void>((resolve) => {
      const markDone = () => {
        tensionVoicePreloaded.add(key);
        cleanup();
        resolve();
      };
      const cleanup = () => {
        audio.removeEventListener('canplaythrough', markDone);
        audio.removeEventListener('error', markDone);
      };

      audio.addEventListener('canplaythrough', markDone, { once: true });
      audio.addEventListener('error', markDone, { once: true });
      audio.load();
    });
  } catch (error) {
    console.error('[SOS Voice] Preload failed:', error);
  } finally {
    tensionVoicePreloadInFlight.delete(key);
  }
}

async function preloadTensionVoice(voiceAddressing: SosTensionAddressing) {
  if (!canUseTensionVoicePlayback() || !tensionVoiceEnabled.value) return;

  const keys = Object.keys(
    SOS_TENSION_AUDIO[voiceAddressing]
  ) as SosTensionAudioKey[];
  await Promise.allSettled(
    keys.map((audioKey) => preloadTensionVoiceClip(audioKey, voiceAddressing))
  );
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
    console.error('[SOS Voice] Failed to play clip:', error);
  }
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

  if (!shouldPlayCue) {
    return;
  }

  const cue = audioKey === 'clench' ? 'inhale' : 'exhale';
  void playTensionCue(cue, clampNumber(tensionSoundVolume.value, 0, 100) / 100);

  if (tensionHapticsEnabled.value) {
    void triggerTensionHaptic();
  }
}

function scheduleTensionStage(audioKey: SosTensionAudioKey, delayMs: number) {
  const timerId = window.setTimeout(() => {
    tensionVoiceScheduleTimers.delete(timerId);
    void announceTensionStage(audioKey);
  }, delayMs);
  tensionVoiceScheduleTimers.add(timerId);
}

function scheduleClenchPhaseVoice(offsetMs = 0) {
  scheduleTensionStage('clench', offsetMs);
}

function clearAllTimers() {
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionVoicePlayback();
  stopGroundingVoicePlayback();
  stopTensionCueAudio(120);
  tensionVoiceCache.clear();
  tensionVoicePreloaded.clear();
  tensionIsRunning.value = false;
  tensionIsPaused.value = false;
  tensionPrepCountdown.value = 0;
  tensionStage.value = 'intro';
}

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

function applyTensionCueVolume() {
  setTensionCueVolume(clampNumber(tensionSoundVolume.value, 0, 100) / 100);
}

async function ensureTensionCueAudioReady() {
  if (tensionCuePrepared) {
    applyTensionCueVolume();
    return;
  }

  if (!tensionCuePreparePromise) {
    // В production WebView первый cue может потеряться, если Howler/HTML5 Audio
    // ещё не прогрет к моменту первой фазы. Готовим route один раз заранее.
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

function repeatLastPractice() {
  clearAllTimers();

  if (lastCompletedStep.value === 'panic-grounding') {
    setStep('panic-grounding');
    return;
  }
  if (lastCompletedStep.value === 'panic-breathing') {
    setStep('panic-breathing');
    return;
  }
  if (lastCompletedStep.value === 'tension-practice') {
    setStep('tension-practice');
    return;
  }

  if (finishEntry.value === 'tension') {
    setStep('tension-practice');
    return;
  }
  setStep('panic-grounding');
}

async function loadAddressing() {
  const prefs = await fetchGlobalPreferences();
  const next = prefs?.addressing;
  if (next === 'informal' || next === 'formal') {
    addressing.value = next;
  }
}

async function loadTensionVoicePreference() {
  const settings = await loadSosVoiceSettings();
  tensionVoiceEnabled.value = settings.voiceEnabled;
}

async function loadTensionPracticeSettings() {
  const settings = await loadSosTensionPracticeSettings();
  tensionSessionMinutes.value = clampNumber(settings.sessionMinutes, 1, 60);
  tensionSoundEnabled.value = settings.soundEnabled;
  tensionSoundVolume.value = clampNumber(settings.volume, 0, 100);
  tensionHapticsEnabled.value = settings.hapticsEnabled;

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

async function onGroundingVoiceChange(next: boolean) {
  tensionVoiceEnabled.value = next;
  tensionVoiceSaving.value = true;
  try {
    await saveSosVoiceSettings({ voiceEnabled: next });
    if (!next) {
      stopGroundingVoicePlayback();
      return;
    }
    if (step.value === 'panic-grounding') {
      void playGroundingVoice(groundingIndex.value);
    }
  } finally {
    tensionVoiceSaving.value = false;
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
      stopGroundingVoicePlayback();
      return;
    }
    await preloadTensionVoice(resolveTensionAddressing());
    if (step.value === 'tension-practice') {
      if (tensionPrepCountdown.value > 0) {
        void playTensionVoice('intro');
        return;
      }
      void playTensionVoice(tensionStage.value);
    }
  } finally {
    tensionVoiceSaving.value = false;
  }
}

function openPaywall(featureKey: string) {
  paywallFeatureKey.value = featureKey;
  paywallOpen.value = true;
}

function getPlanBadgeEmoji(plan: string) {
  return plan === 'premium' ? '💎' : '⭐';
}

function isQuickHelpPracticeCard(card: QuickHelpCard) {
  return card.action.type === 'set_step' || card.action.type === 'navigate';
}

function getCardRequiredPlan(card: QuickHelpCard) {
  if (card.action.type === 'go_chat' && !chatHandoffAccess.value.available) {
    return chatHandoffAccess.value.requiredPlan;
  }

  if (
    isQuickHelpPracticeCard(card) &&
    !quickHelpPracticeAccess.value.available
  ) {
    return quickHelpPracticeAccess.value.requiredPlan;
  }

  return null;
}

async function handleQuickHelpCardClick(card: QuickHelpCard) {
  if (
    isQuickHelpPracticeCard(card) &&
    !quickHelpPracticeAccess.value.available
  ) {
    openPaywall('quick_help.practice');
    return;
  }

  if (card.action.type === 'set_step') {
    setStep(card.action.step);
    return;
  }

  if (card.action.type === 'go_chat') {
    await goToChat(card.action.entry);
    return;
  }

  await navigateTo(card.action.to);
}

async function goToChat(entry: SosEntry, afterPractice = false) {
  if (!chatHandoffAccess.value.available) {
    openPaywall('sos.chat_handoff');
    return;
  }

  try {
    clearAllTimers();
    close();
    chat.entryContext = {
      type: 'sos',
      sos_entry: entry,
      after_practice: afterPractice || undefined,
    };
    await navigateTo('/chat');
    void chat.startConversation();
  } catch (error: unknown) {
    console.error('[SOS] Failed to open chat from SOS:', error);
    useToast(
      'Не удалось открыть чат',
      (error as Error)?.message || 'Попробуйте еще раз.'
    );
  }
}

function handlePracticeComplete(entry: 'panic' | 'tension') {
  if (
    step.value === 'panic-grounding' ||
    step.value === 'panic-breathing' ||
    step.value === 'tension-practice'
  ) {
    lastCompletedStep.value = step.value;
  }
  if (entry === 'tension') {
    clearTensionVoiceSchedule();
    announceTensionStage('finish');
  }
  setFinish(entry);
}

function startTensionExerciseLoop() {
  if (tensionTimerId !== null) return;

  tensionIsRunning.value = true;
  tensionIsPaused.value = false;
  tensionPrepCountdown.value = 0;
  scheduleClenchPhaseVoice(0);
  tensionTimerId = window.setInterval(() => {
    tensionTotalRemaining.value = Math.max(0, tensionTotalRemaining.value - 1);
    if (tensionTotalRemaining.value <= 0) {
      clearTensionTimer();
      handlePracticeComplete('tension');
      return;
    }

    if (tensionStepRemaining.value <= 1) {
      if (tensionStepType.value === 'clench') {
        tensionStepType.value = 'release';
        tensionStepRemaining.value = TENSION_RELEASE_SECONDS;
        clearTensionVoiceSchedule();
        announceTensionStage('release');
      } else {
        tensionCycleIndex.value += 1;
        tensionStepType.value = 'clench';
        tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
        clearTensionVoiceSchedule();
        scheduleClenchPhaseVoice(0);
      }
    } else {
      tensionStepRemaining.value -= 1;
    }
  }, 1000);
}

function groundingNext() {
  if (groundingIndex.value >= groundingSteps.length - 1) {
    void triggerSuccess();
    handlePracticeComplete('panic');
    return;
  }
  groundingIndex.value += 1;
  void triggerLight();
}

function groundingPrev() {
  if (groundingIndex.value === 0) return;
  groundingIndex.value = Math.max(0, groundingIndex.value - 1);
  void triggerLight();
}

function startTensionPractice() {
  stopTensionCueAudio(120);
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  tensionIsRunning.value = true;
  tensionIsPaused.value = false;
  tensionCycleIndex.value = 0;
  tensionStepType.value = 'clench';
  tensionStage.value = 'clench';
  tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
  tensionTotalRemaining.value = tensionSessionDurationSeconds.value;
  void preloadTensionVoice(resolveTensionAddressing());
  if (tensionSoundEnabled.value) {
    void ensureTensionCueAudioReady();
  }

  tensionPrepCountdown.value = 3;
  if (tensionVoiceEnabled.value) {
    void playTensionVoice('intro');
  }
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
  stopTensionCueAudio(120);
  clearAllTimers();
  tensionCycleIndex.value = 0;
  tensionStepType.value = 'clench';
  tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
  tensionTotalRemaining.value = tensionSessionDurationSeconds.value;
}

function pauseTensionSession() {
  if (!tensionIsRunning.value || tensionIsPaused.value) return;
  tensionIsPaused.value = true;
  clearTensionTimer();
  clearTensionPrepTimer();
  clearTensionVoiceSchedule();
  stopTensionVoicePlayback();
  stopTensionCueAudio(120);
}

function resumeTensionSession() {
  if (!tensionIsRunning.value || !tensionIsPaused.value) return;
  tensionIsPaused.value = false;

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

onMounted(() => {
  void loadAddressing();
  void loadTensionPracticeSettings();
  void loadTensionVoicePreference();
});

watch(
  () => addressing.value,
  (nextAddressing) => {
    if (step.value !== 'tension-practice') return;
    if (!tensionVoiceEnabled.value) return;
    const voiceAddressing: SosTensionAddressing =
      nextAddressing === 'formal' ? 'formal' : 'informal';
    void preloadTensionVoice(voiceAddressing);
  }
);

watch(
  () => step.value,
  (next) => {
    clearTensionTimer();
    clearTensionPrepTimer();
    clearTensionVoiceSchedule();
    stopTensionCueAudio(120);
    if (next !== 'finish') {
      stopTensionVoicePlayback();
    }
    if (next !== 'panic-grounding') {
      stopGroundingVoicePlayback();
    }
    tensionIsRunning.value = false;
    tensionIsPaused.value = false;
    tensionPrepCountdown.value = 0;
    tensionSettingsOpen.value = false;
    tensionStage.value = 'intro';
    if (next === 'panic-grounding') {
      groundingIndex.value = 0;
      return;
    }
    if (next === 'tension-practice') {
      startTensionPractice();
    }
  }
);

watch([() => step.value, () => groundingIndex.value], ([nextStep, idx]) => {
  if (nextStep !== 'panic-grounding') return;
  void playGroundingVoice(idx);
});

watch(
  () => tensionSessionMinutes.value,
  (value) => {
    const safe = clampNumber(value, 1, 60);
    if (safe !== value) {
      tensionSessionMinutes.value = safe;
      return;
    }
    void saveSosTensionPracticeSettings({ sessionMinutes: safe });
    tensionTotalRemaining.value = safe * 60;
    tensionCycleIndex.value = 0;
    tensionStepType.value = 'clench';
    tensionStepRemaining.value = TENSION_CLENCH_SECONDS;
  }
);

watch(
  () => tensionSoundVolume.value,
  (value) => {
    const safe = clampNumber(value, 0, 100);
    if (safe !== value) {
      tensionSoundVolume.value = safe;
      return;
    }
    applyTensionCueVolume();
    void saveSosTensionPracticeSettings({ volume: safe });
  }
);

onBeforeUnmount(() => {
  clearAllTimers();
});
</script>
