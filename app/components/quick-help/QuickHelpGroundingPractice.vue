<template>
  <section
    class="glass-deep p-3 flex flex-col items-center justify-center space-y-4 w-full"
  >
    <div class="space-y-1 text-center">
      <p class="text-sm text-foreground/70">5-4-3-2-1</p>
      <h3 class="text-xl font-semibold text-foreground">
        {{ groundingCurrent.title }}
      </h3>
    </div>

    <div class="w-full space-y-3">
      <div class="rounded-2xl border border-white/10 bg-background/20 p-3">
        <p class="text-center text-sm leading-relaxed text-foreground/80">
          {{ groundingCurrent.description }}
        </p>
      </div>

      <div class="space-y-2">
        <div class="relative h-2 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full bg-gradient-to-r from-primary-ui via-cyan-400 to-emerald-400 transition-all duration-300"
            :style="{ width: `${progressPercent}%` }"
          />
        </div>
        <div
          class="flex items-center justify-between gap-4 text-sm text-foreground/80"
        >
          <span
            >Шаг {{ groundingIndex + 1 }} из {{ groundingSteps.length }}</span
          >
          <div class="flex shrink-0 items-center gap-2">
            <span class="text-foreground/70">Голос</span>
            <Switch
              :checked="voiceEnabled"
              :loading="voiceSaving"
              @update:checked="onVoiceChange"
            />
          </div>
        </div>
      </div>

      <!-- На первом шаге, пока юзер не нажал «Начать», голос ещё не стартовал
           (autoplay policy браузера блокирует play() без user gesture).
           Поэтому до старта показываем одиночную кнопку «Начать» во всю ширину,
           а после — обычный пейджер «Назад / Дальше». -->
      <Button
        v-if="!started"
        class="w-full rounded-full"
        @click="startPractice"
      >
        Начать
      </Button>
      <div v-else class="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          class="w-full rounded-full"
          :disabled="groundingIndex === 0"
          @click="groundingPrev"
        >
          Назад
        </Button>
        <Button class="w-full rounded-full" @click="groundingNext">
          {{
            groundingIndex === groundingSteps.length - 1
              ? 'Завершить'
              : 'Дальше'
          }}
        </Button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Button } from '@/app/components/ui/button';
import { Switch } from '@/app/components/ui/shadcn/switch';
import { useHaptics } from '@/app/composables/useHaptics';
import { useNotificationsSettings } from '@/app/composables/useNotificationsSettings';
import { isDocumentAvailable } from '@/app/utils/document';
import {
  SOS_GROUNDING_AUDIO,
  type SosGroundingStepKey,
} from '@/app/lib/sosGroundingAudio';
import { SOS_GROUNDING_STEPS } from '@/app/lib/sosTemplates';
import {
  loadSosVoiceSettings,
  saveSosVoiceSettings,
} from '@/app/utils/sosVoiceSettings';

type Addressing = 'informal' | 'formal';

const emit = defineEmits<{
  (e: 'complete'): void;
}>();

const GROUNDING_STEP1_HINT_DELAY_MS = 2000;
const GROUNDING_STEP_KEYS: SosGroundingStepKey[] = [
  'step1',
  'step2',
  'step3',
  'step4',
  'step5',
];

const groundingSteps = SOS_GROUNDING_STEPS;
const { fetchGlobalPreferences } = useNotificationsSettings();
const { triggerLight, triggerSuccess } = useHaptics();

const addressing = ref<Addressing>('informal');
const groundingIndex = ref(0);
const voiceEnabled = ref(false);
const voiceSaving = ref(false);
// `started` контролирует переход со стартового экрана с CTA «Начать» к UI шагов.
// Это нужно как user-gesture для browser autoplay policy — без него `play()`
// для первого голосового файла молча отказывает.
const started = ref(false);

let groundingCurrentAudio: HTMLAudioElement | null = null;
let groundingHintTimerId: ReturnType<typeof setTimeout> | null = null;

const groundingCurrent = computed(() => {
  const step = groundingSteps[groundingIndex.value] ?? groundingSteps[0];
  const variant = addressing.value;
  return {
    title: step.title[variant],
    description: step.description[variant],
  };
});

const progressPercent = computed(() => {
  if (!groundingSteps.length) return 0;
  return ((groundingIndex.value + 1) / groundingSteps.length) * 100;
});

function clearGroundingHintTimer() {
  if (groundingHintTimerId === null) return;
  clearTimeout(groundingHintTimerId);
  groundingHintTimerId = null;
}

function stopGroundingVoicePlayback() {
  clearGroundingHintTimer();
  if (!groundingCurrentAudio) return;
  try {
    groundingCurrentAudio.pause();
    groundingCurrentAudio.currentTime = 0;
  } catch (error) {
    console.error('[QuickHelpGrounding] Не удалось остановить голос:', error);
  } finally {
    groundingCurrentAudio = null;
  }
}

async function playGroundingVoice(stepIndex: number) {
  if (
    !voiceEnabled.value ||
    import.meta.server ||
    !isDocumentAvailable() ||
    typeof Audio === 'undefined'
  ) {
    return;
  }

  const key = GROUNDING_STEP_KEYS[stepIndex];
  if (!key) return;

  const voiceAddressing = addressing.value === 'formal' ? 'formal' : 'informal';
  const src = SOS_GROUNDING_AUDIO[voiceAddressing][key];
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
            if (groundingIndex.value !== 0 || !voiceEnabled.value) return;

            const hintSrc = SOS_GROUNDING_AUDIO[voiceAddressing].step1_hint;
            const hintAudio = new Audio(hintSrc);
            groundingCurrentAudio = hintAudio;
            hintAudio.currentTime = 0;
            void hintAudio.play().catch((error: unknown) => {
              if ((error as Error)?.name !== 'AbortError') {
                console.error(
                  '[QuickHelpGrounding] Не удалось воспроизвести подсказку:',
                  error
                );
              }
            });
          }, GROUNDING_STEP1_HINT_DELAY_MS);
        },
        { once: true }
      );
    }
  } catch (error: unknown) {
    if ((error as Error)?.name === 'AbortError') return;
    console.error(
      '[QuickHelpGrounding] Не удалось воспроизвести голос:',
      error
    );
  }
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
  voiceEnabled.value = settings.voiceEnabled;
}

async function onVoiceChange(next: boolean) {
  voiceEnabled.value = next;
  voiceSaving.value = true;

  try {
    await saveSosVoiceSettings({ voiceEnabled: next });
    if (!next) {
      stopGroundingVoicePlayback();
      return;
    }
    await playGroundingVoice(groundingIndex.value);
  } finally {
    voiceSaving.value = false;
  }
}

function groundingNext() {
  if (groundingIndex.value >= groundingSteps.length - 1) {
    stopGroundingVoicePlayback();
    void triggerSuccess();
    emit('complete');
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

async function startPractice() {
  started.value = true;
  void triggerLight();
  // play() здесь происходит в стеке вызова user-инициированного click,
  // поэтому autoplay policy разрешает воспроизведение голоса.
  await playGroundingVoice(groundingIndex.value);
}

onMounted(async () => {
  await Promise.all([loadAddressing(), loadVoicePreference()]);
  // Авто-старт голоса убран — теперь он стартует по клику «Начать»
  // (см. startPractice). Это требование browser autoplay policy и
  // одновременно даёт пользователю время решить, нужен ли голос вообще.
});

watch(groundingIndex, (index) => {
  void playGroundingVoice(index);
});

onBeforeUnmount(() => {
  stopGroundingVoicePlayback();
});
</script>
