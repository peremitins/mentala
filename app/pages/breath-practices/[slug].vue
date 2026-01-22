<template>
  <div
    class="space-y-2 h-dvh overflow-y-auto no-scrollbar pb-[100px] rounded-lg"
  >
    <div
      class="flex h-full flex-col justify-between space-y-4 overflow-y-auto no-scrollbar"
    >
      <PageHeader
        :title="headerTitle"
        :show-back-button="true"
        @go-back="goBack"
      />

      <div v-if="isBuilder" class="flex flex-col space-y-2 h-full">
        <div class="glass-deep relative p-4">
          <div class="flex space-x-2 relative z-10 space-y-3">
            <div class="text-xl">✨</div>
            <div class="space-y-1">
              <h2 class="text-xl font-semibold text-foreground">
                Своя дыхательная практика
              </h2>
              <p class="text-sm text-foreground/70">
                Выбери 2–4 фазы, укажи секунды и сохрани. Практика всегда будет
                под рукой.
              </p>
            </div>
          </div>
        </div>

        <div class="glass-deep space-y-4 p-4">
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Название практики
            </p>
            <Input
              v-model="customName"
              type="text"
              class="h-10"
              :maxlength="60"
              placeholder="Например, «Спокойствие перед сном»"
            />
          </div>

          <div class="space-y-2">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Количество фаз
            </p>
            <ToggleGroup
              type="single"
              :model-value="String(phaseCount)"
              class="grid grid-cols-3 gap-2"
              @update:model-value="handlePhaseCount"
            >
              <ToggleGroupItem value="2" class="h-9">2 фазы</ToggleGroupItem>
              <ToggleGroupItem value="3" class="h-9">3 фазы</ToggleGroupItem>
              <ToggleGroupItem value="4" class="h-9">4 фазы</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div class="space-y-3">
            <p class="text-xs uppercase tracking-[0.08em] text-white/60">
              Тайминг фаз
            </p>
            <div class="space-y-3">
              <div
                v-for="(phase, index) in customPhases"
                :key="`${phase.type}-${index}`"
                class="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 p-3"
              >
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-white">
                    {{ phase.label }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="h-8 w-8 flex-shrink-0 justify-center items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    @click="adjustPhase(index, -1)"
                  >
                    -
                  </button>
                  <Input
                    v-model.number="customPhases[index]!.seconds"
                    type="number"
                    :min="1"
                    :max="MAX_CUSTOM_SECONDS"
                    @change="clampPhase(index)"
                  />
                  <button
                    type="button"
                    class="h-8 w-8 flex-shrink-0 justify-center items-center rounded-full border border-white/20 text-white/70 transition hover:border-white/40 hover:text-white"
                    @click="adjustPhase(index, 1)"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
            <p v-if="showHoldWarning" class="text-xs text-amber-200/80">
              Если чувствуешь дискомфорт — уменьши задержку или паузу.
            </p>
          </div>
          <Button class="w-full" size="lg" @click="saveCustom">
            Сохранить практику
          </Button>
        </div>
      </div>

      <div
        v-else-if="practice"
        class="flex flex-col space-y-2 justify-between h-full"
      >
        <div class="flex flex-col items-center gap-2 text-center">
          <p class="max-w-xl text-sm text-white/85 text-elevated">
            {{ practice.description }}
          </p>
          <p class="text-xs text-white/60">{{ practice.pattern }}</p>
        </div>

        <div class="flex flex-col items-center gap-2 justify-center">
          <div class="relative flex items-center justify-center">
            <div class="breath-orb" :class="phaseClass" :style="sphereStyle">
              <div class="breath-orb__glow" />
            </div>
          </div>

          <div v-if="isRunning" class="absolute text-center">
            <p class="text-xs uppercase tracking-[0.2em] text-white/60">
              {{ phaseLabel }}
            </p>
            <div class="text-4xl font-semibold text-white">
              {{ phaseRemainingLabel }}
            </div>
          </div>
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
            <div
              class="flex items-center justify-between text-xs text-white/70"
            >
              <span>Осталось: {{ sessionRemainingLabel }}</span>
              <span>{{ sessionTotalLabel }}</span>
            </div>
          </div>

          <div
            :class="[
              'grid gap-3',
              canNavigateGroup ? 'grid-cols-5' : 'grid-cols-3',
            ]"
          >
            <button
              type="button"
              class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              :disabled="Boolean(prepCountdown)"
              @click="settingsOpen = true"
            >
              <IconSettings class="h-5 w-5" />
            </button>

            <button
              v-if="canNavigateGroup"
              type="button"
              class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              @click="goToPrevPractice"
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
              v-if="canNavigateGroup"
              type="button"
              class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              @click="goToNextPractice"
            >
              <IconSkipForward class="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div v-else class="px-4">
        <StateBlock state="error" class="px-4">
          <p class="text-sm text-center">Практика не найдена</p>
        </StateBlock>
      </div>
    </div>
    <Transition name="fade">
      <div
        v-if="prepCountdown"
        class="fixed inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/70 text-white backdrop-blur"
      >
        <p class="text-sm uppercase tracking-[0.2em] text-white/70">
          Подготовьтесь
        </p>
        <p class="text-5xl font-semibold">{{ prepCountdown }}</p>
      </div>
    </Transition>

    <div
      v-if="isCompleted"
      class="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 text-white backdrop-blur"
    >
      <p class="text-lg font-semibold">Сеанс завершён</p>
      <div class="flex gap-3">
        <Button size="lg" @click="restartSession">Повторить</Button>
        <Button size="lg" variant="ghost" @click="stopSession">Готово</Button>
      </div>
    </div>

    <Dialog v-model:open="settingsOpen">
      <DialogContent
        class="max-w-lg bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 text-white border-white/10 overflow-visible"
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
                <p class="text-sm font-semibold">Звуковые сигналы</p>
              </div>
              <Switch v-model:checked="soundEnabled" />
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
            <Switch v-model:checked="hapticsEnabled" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import PageHeader from '@/app/components/PageHeader.vue';
import StateBlock from '@/app/components/StateBlock.vue';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/shadcn/input';
import { Switch } from '@/app/components/ui/shadcn/switch';
import { ToggleGroup, ToggleGroupItem } from '@/app/components/ui/toggle-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSkipBack from '~icons/lucide/skip-back';
import IconSkipForward from '~icons/lucide/skip-forward';
import IconSquare from '~icons/lucide/square';
import IconSettings from '~icons/lucide/settings';
import { useToast } from '@/app/composables/useToast';
import { useBreathPracticesStore } from '@/app/stores/breathPractices';
import {
  loadBreathPracticeSettings,
  saveBreathPracticeSettings,
} from '@/app/utils/breathPracticeSettings';
import {
  BREATH_PRACTICES,
  buildCustomPhases,
  findBreathPractice,
  formatBreathSteps,
  mapCustomPractice,
  type BreathPracticeTag,
  type BreathPhase,
} from '@/app/lib/breathPracticesCatalog';
import { useBreathPracticePlayer } from '@/app/composables/useBreathPracticePlayer';
import { useBreathPracticeAudio } from '@/app/composables/useBreathPracticeAudio';
import { useBreathPracticeHaptics } from '@/app/composables/useBreathPracticeHaptics';
import { navigateTo } from '#app';
import TimePicker from '@/app/components/TimePicker.vue';
import IconClock from '~icons/lucide/clock';

const MAX_CUSTOM_SECONDS = 30;

const route = useRoute();
const store = useBreathPracticesStore();
const {
  playCue,
  prepare: prepareAudio,
  stopAll: stopAudio,
  setVolume,
} = useBreathPracticeAudio();
const { trigger: triggerHaptic } = useBreathPracticeHaptics();

const slug = computed(() => String(route.params.slug || ''));
const isBuilder = computed(() => slug.value === 'custom');
const customId = computed(() =>
  slug.value.startsWith('custom-') ? slug.value.slice('custom-'.length) : null
);

type BreathPracticeGroupKey = BreathPracticeTag | 'custom';

const groupKey = computed<BreathPracticeGroupKey | null>(() => {
  const raw = route.query.group;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized === 'custom') return 'custom';
  if (['popular', 'sleep', 'anxiety', 'focus'].includes(normalized)) {
    return normalized as BreathPracticeTag;
  }
  return null;
});

const groupSlugs = computed(() => {
  const key = groupKey.value;
  if (!key) return [];
  if (key === 'custom') {
    return store.customPractices.map((practice) => `custom-${practice.id}`);
  }
  // Здесь key уже строго BreathPracticeTag.
  return BREATH_PRACTICES.filter((practice) => practice.tags.includes(key)).map(
    (practice) => practice.slug
  );
});

const groupIndex = computed(() => groupSlugs.value.indexOf(slug.value));
const canNavigateGroup = computed(
  () => !isBuilder.value && groupSlugs.value.length > 1 && groupIndex.value >= 0
);

const builtInPractice = computed(() =>
  isBuilder.value ? null : findBreathPractice(slug.value)
);

const customPractice = computed(() =>
  customId.value ? store.customById(customId.value) : null
);

const practice = computed(() => {
  if (builtInPractice.value) return builtInPractice.value;
  if (customPractice.value) return mapCustomPractice(customPractice.value);
  return null;
});

const player = useBreathPracticePlayer({
  onPhaseStart: async (phase) => {
    if (soundEnabled.value) {
      await playCue(phase.cue, soundVolume.value / 100);
    }
    if (hapticsEnabled.value) {
      await triggerHaptic();
    }
  },
});

// Вытаскиваем refs наружу, чтобы шаблон корректно их разворачивал.
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

const phaseLabel = computed(() => currentPhase.value?.label || 'Готовимся');
const phaseRemainingLabel = computed(() =>
  String(phaseRemainingSeconds.value || 0)
);

const isActive = computed(() => isRunning.value && !isPaused.value);

const sessionRemainingLabel = computed(() =>
  formatSeconds(sessionRemainingSeconds.value)
);
const sessionTotalLabel = computed(() =>
  formatSeconds(sessionDurationSeconds.value)
);

const phaseClass = computed(() => {
  const type = currentPhase.value?.type || 'inhale';
  return `breath-orb--${type}`;
});

const sphereStyle = computed(() => {
  const duration = currentPhase.value?.seconds || 0;
  const type = currentPhase.value?.type || 'inhale';
  // Держим сферу компактной до старта, а затем увеличиваем на вдохе/задержке.
  const isPhaseActive = isRunning.value && prepCountdown.value === 0;
  const scale = !isPhaseActive
    ? 0.4
    : type === 'inhale' || type === 'hold'
      ? 1
      : 0.4;

  return {
    transform: `scale(${scale})`,
    transitionDuration: `${Math.max(0.6, duration)}s`,
  };
});

const settingsOpen = ref(false);
const soundEnabled = ref(true);
const soundVolume = ref(70);
const hapticsEnabled = ref(true);
const sessionMinutes = ref(5);

const headerTitle = computed(() => {
  if (isBuilder.value) return 'Своя практика';
  return practice.value?.title || 'Практика';
});

const phaseCount = ref<2 | 3 | 4>(3);
const customPhases = ref<BreathPhase[]>(buildCustomPhases(3));
const customName = ref('');

const previewSteps = computed(() => formatBreathSteps(customPhases.value));
const showHoldWarning = computed(() =>
  customPhases.value.some(
    (phase) =>
      (phase.type === 'hold' || phase.type === 'pause') && phase.seconds >= 20
  )
);

function goBack() {
  navigateTo('/breath-practices');
}

// Перелистываем практики внутри выбранной группы без выхода из плеера.
async function goToGroupSibling(direction: 1 | -1) {
  if (!canNavigateGroup.value) return;
  const list = groupSlugs.value;
  const currentIndex = groupIndex.value;
  if (!list.length || currentIndex < 0) return;
  const nextIndex = (currentIndex + direction + list.length) % list.length;
  const nextSlug = list[nextIndex];
  const query = groupKey.value ? { group: groupKey.value } : undefined;
  await navigateTo({ path: `/breath-practices/${nextSlug}`, query });
}

function goToPrevPractice() {
  void goToGroupSibling(-1);
}

function goToNextPractice() {
  void goToGroupSibling(1);
}

function formatSeconds(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function togglePlayback() {
  if (!practice.value) return;
  if (!isRunning.value) {
    player.start();
    return;
  }
  if (isPaused.value) {
    player.resume();
  } else {
    // Быстро и плавно гасим звук при паузе.
    stopAudio(120);
    player.pause();
  }
}

function stopSession() {
  // Быстро и плавно гасим звук при остановке.
  stopAudio(120);
  player.stop();
}

function restartSession() {
  player.start();
}

function handlePhaseCount(value?: string | string[]) {
  const nextValue = Array.isArray(value) ? value[0] : value;
  if (!nextValue) return;
  const parsed = Number(nextValue) as 2 | 3 | 4;
  if (![2, 3, 4].includes(parsed)) return;

  phaseCount.value = parsed;
  const next = buildCustomPhases(parsed);

  // Сохраняем секунды из уже заполненных фаз.
  customPhases.value = next.map((phase) => {
    const existing = customPhases.value.find(
      (item) => item.type === phase.type
    );
    return existing ? { ...phase, seconds: existing.seconds } : phase;
  });
}

function clampPhase(index: number) {
  const phase = customPhases.value[index];
  if (!phase) return;
  const numeric = Number(phase.seconds);
  const safe = clampNumber(numeric, 1, MAX_CUSTOM_SECONDS);
  customPhases.value[index] = { ...phase, seconds: safe };
}

function adjustPhase(index: number, delta: number) {
  const phase = customPhases.value[index];
  if (!phase) return;
  const numeric = Number(phase.seconds);
  const safe = clampNumber(numeric + delta, 1, MAX_CUSTOM_SECONDS);
  customPhases.value[index] = { ...phase, seconds: safe };
}

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

async function saveCustom() {
  const trimmed = customName.value.trim();
  if (!trimmed) {
    useToast('Нужно название практики', 'Напиши короткое имя.', 'warning');
    return;
  }

  const normalizedPhases = customPhases.value.map((phase) => ({
    ...phase,
    seconds: clampNumber(Number(phase.seconds), 1, MAX_CUSTOM_SECONDS),
  }));

  const created = await store.addCustom(trimmed, normalizedPhases);
  useToast('Практика сохранена', 'Можно запускать сразу.', 'success');
  navigateTo(`/breath-practices/custom-${created.id}`);
}

onMounted(async () => {
  await store.load();

  // Загружаем настройки из локального хранилища
  const settings = await loadBreathPracticeSettings();
  soundEnabled.value = settings.soundEnabled;
  soundVolume.value = settings.volume;
  hapticsEnabled.value = settings.hapticsEnabled;
  sessionMinutes.value = clampNumber(settings.sessionMinutes, 1, 60);

  if (soundEnabled.value) {
    await prepareAudio();
  }

  if (practice.value) {
    player.setPhases(practice.value.phases);
  }
  player.setSessionDuration(sessionMinutes.value * 60);
});

watch(
  () => practice.value?.phases,
  (value) => {
    if (!value) return;
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
    void saveBreathPracticeSettings({ sessionMinutes: safe });
  }
);

watch(soundEnabled, (value) => {
  void saveBreathPracticeSettings({ soundEnabled: value });
  if (value) {
    void prepareAudio();
    setVolume(soundVolume.value / 100);
  }
});

watch(soundVolume, (value) => {
  setVolume(clampNumber(value, 0, 100) / 100);
  void saveBreathPracticeSettings({ volume: clampNumber(value, 0, 100) });
});

watch(hapticsEnabled, (value) => {
  void saveBreathPracticeSettings({ hapticsEnabled: value });
});

onBeforeUnmount(() => {
  stopAudio(0);
  player.stop();
});
</script>

<style scoped>
.breath-orb {
  position: relative;
  width: 240px;
  height: 240px;
  border-radius: 9999px;
  background: radial-gradient(
    circle at 30% 20%,
    rgba(56, 189, 248, 0.7),
    rgba(79, 70, 229, 0.45),
    rgba(15, 23, 42, 0.6)
  );
  box-shadow:
    0 0 40px rgba(56, 189, 248, 0.35),
    inset 0 0 40px rgba(255, 255, 255, 0.12);
  transition-property: transform, box-shadow, filter;
  transition-timing-function: ease-in-out;
}

.breath-orb__glow {
  position: absolute;
  inset: -20%;
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.3), transparent 70%);
  filter: blur(12px);
  animation: orb-float 8s ease-in-out infinite;
}

.breath-orb--inhale {
  filter: saturate(1.25) brightness(1.08);
  box-shadow:
    0 0 60px rgba(56, 189, 248, 0.5),
    inset 0 0 50px rgba(255, 255, 255, 0.18);
}

.breath-orb--exhale {
  filter: saturate(0.7) brightness(0.9);
  box-shadow:
    0 0 26px rgba(56, 189, 248, 0.25),
    inset 0 0 28px rgba(255, 255, 255, 0.08);
}

.breath-orb--hold,
.breath-orb--pause {
  filter: saturate(0.9) brightness(0.98);
  box-shadow:
    0 0 36px rgba(56, 189, 248, 0.35),
    inset 0 0 36px rgba(255, 255, 255, 0.12);
}

@keyframes orb-float {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  50% {
    transform: translate3d(0, -12px, 0);
  }
}
</style>
