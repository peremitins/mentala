<template>
  <section class="glass-deep overflow-hidden p-4">
    <div
      v-if="!meditationsAccess.available"
      class="space-y-4 text-center"
      @click="openPaywall"
    >
      <div
        class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/8 text-2xl"
      >
        {{ getPlanBadgeEmoji(meditationsAccess.requiredPlan) }}
      </div>
      <div class="space-y-1">
        <h3 class="text-lg font-semibold text-foreground">
          Медитации доступны на {{ requiredPlanLabel }}
        </h3>
        <p class="text-sm text-foreground/70">
          Открой тариф, чтобы запустить аудио-практику и продолжить шаг.
        </p>
      </div>
      <Button type="button" class="rounded-full" @click.stop="openPaywall">
        Открыть тарифы
      </Button>
    </div>

    <div v-else-if="isLoading" class="xs:space-y-3 space-y-1">
      <div class="h-28 animate-pulse rounded-2xl bg-white/8" />
      <div class="h-20 animate-pulse rounded-2xl bg-white/8" />
    </div>

    <div v-else-if="!track" class="glass-deep space-y-1 p-4">
      <p class="text-sm font-medium text-foreground">Медитация недоступна</p>
      <p class="text-xs leading-relaxed text-foreground/60">
        Не удалось сопоставить шаг с аудио-практикой из каталога.
      </p>
    </div>

    <div v-else class="space-y-4">
      <!-- Инструкция перед плеером: без неё юзер видит только обложку трека
           и контролы, и неясно «что мне делать пока играет?». Источник —
           action.prompt из blueprint. -->
      <div
        v-if="instructionText"
        class="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-foreground/80"
      >
        {{ instructionText }}
      </div>

      <div class="flex items-center gap-3">
        <div class="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
          <div
            v-if="!track.coverPath"
            class="absolute inset-0 bg-gradient-to-br from-emerald-500 via-cyan-500 to-indigo-600"
          />
          <img
            v-else
            :src="resolveMediaUrl(track.coverPath)"
            :alt="track.title"
            class="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs text-foreground/55">{{ topicName }}</p>
          <h3 class="text-lg font-semibold leading-tight text-foreground">
            {{ track.title }}
          </h3>
          <p
            class="mt-1 line-clamp-2 text-xs leading-relaxed text-foreground/65"
          >
            {{
              track.description || 'Мягкая аудио-пауза для спокойного фокуса.'
            }}
          </p>
        </div>
      </div>

      <!-- Внутри roadmap скрываем шкалу прогресса и временные метки: задача
           шага — практика, а не «доиграть трек». Полный плеер с таймлайном
           остаётся на странице медитаций (см. ProgramMeditationAction
           используется только embedded). -->

      <div class="grid grid-cols-2 gap-3">
        <button
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-foreground transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="!isActive"
          @click="stopPlayback"
        >
          <IconSquare class="h-5 w-5" />
        </button>

        <button
          type="button"
          class="flex h-12 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-70"
          :disabled="isBuffering"
          :aria-busy="isBuffering"
          @click="togglePlayback"
        >
          <IconLoader2 v-if="isBuffering" class="h-5 w-5 animate-spin" />
          <IconPause v-else-if="isActive && isPlaying" class="h-5 w-5" />
          <IconPlay v-else class="h-5 w-5" />
        </button>
      </div>
    </div>

    <FeaturePaywallModal
      v-model:open="paywallOpen"
      feature-key="meditations.library.full"
      :required-plan="meditationsAccess.requiredPlan || null"
      :paywall="meditationsAccess.paywall || null"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import IconPlay from '~icons/lucide/play';
import IconPause from '~icons/lucide/pause';
import IconSquare from '~icons/lucide/square';
import IconLoader2 from '~icons/lucide/loader-2';
import { Button } from '@/app/components/ui/button';
import FeaturePaywallModal from '@/app/components/subscription/FeaturePaywallModal.vue';
import { useEntitlements } from '@/app/composables/useEntitlements';
import { useMeditationPlayer } from '@/app/composables/useMeditationPlayer';
import { useMeditationsStore } from '@/app/stores/meditations';
import { resolveMediaUrl } from '@/app/utils/media';
import { getLocalizedRequiredPlanLabel } from '@/app/utils/planI18n';
import {
  isMeditationTopicKey,
  MEDITATION_TOPICS,
} from '@/shared/constants/meditations';
import type { MeditationTrackDto } from '@/shared/dto/meditations';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'complete'): void;
  (e: 'start'): void;
  (e: 'pause'): void;
  (e: 'stop'): void;
}>();

const { t } = useI18n();
const { getFeatureAccess } = useEntitlements();
const meditationsStore = useMeditationsStore();
const {
  currentTrack,
  isPlaying,
  isBuffering,
  sessionEnded,
  play,
  pause,
  stop,
  acknowledgeSession,
  setQueue,
} = useMeditationPlayer();

const paywallOpen = ref(false);
const isLoading = ref(false);
const track = ref<MeditationTrackDto | null>(null);
const wasStartedHere = ref(false);

const meditationsAccess = computed(() =>
  getFeatureAccess('meditations.library.full')
);
const requiredPlanLabel = computed(() =>
  getLocalizedRequiredPlanLabel(meditationsAccess.value.requiredPlan, t)
);
// Маппинг program-шаблонов медитаций (observe-reaction, body-scan-soft и т.д.)
// в существующие topic-keys каталога (sleep / anxiety / stress). Без этого
// все шаблоны программы фолбэчатся в `anxiety` и юзер слышит один и тот же
// трек на каждой медитации. Каталог пока ограничен тремя topic'ами, поэтому
// здесь мы только обеспечиваем чередование между ними — полное расширение
// каталога медитаций потребует отдельной задачи на ассеты.
const PROGRAM_MEDITATION_TOPIC_MAP: Record<
  string,
  'sleep' | 'anxiety' | 'stress'
> = {
  'observe-reaction': 'anxiety',
  'body-scan-soft': 'stress',
  'thought-observer': 'anxiety',
  // uncertainty-observer — медитация про переносимость неопределённости.
  // Раньше фолбэк в 'anxiety' подтягивал природный трек «Сад во время дождя»,
  // который не подходил по теме шага. Стресс-категория даёт более
  // уравновешенный фоновый трек, без выраженной природной сцены.
  'uncertainty-observer': 'stress',
  'kind-observer': 'stress',
  'steady-action': 'stress',
  'problem-solving': 'anxiety',
  'hard-day-plan': 'stress',
  'garden-completion': 'sleep',
};

const resolvedTopicKey = computed(() => {
  const template = props.action.template?.trim();
  if (!template) return 'anxiety';
  if (isMeditationTopicKey(template)) return template;
  const mapped = PROGRAM_MEDITATION_TOPIC_MAP[template];
  return mapped ?? 'anxiety';
});
const topicName = computed(
  () =>
    MEDITATION_TOPICS.find((topic) => topic.key === resolvedTopicKey.value)
      ?.name || 'Медитация'
);
const instructionText = computed<string | null>(() => {
  const prompt = props.action.prompt?.trim();
  return prompt && prompt.length > 0 ? prompt : null;
});
const ROADMAP_MEDITATION_PLAYBACK_OPTIONS = {
  timerMinutes: 60,
  persistPreferredTimer: false,
} as const;
const isActive = computed(() => currentTrack.value?.id === track.value?.id);

function getPlanBadgeEmoji(plan: string | null | undefined) {
  return plan === 'premium' ? '💎' : '⭐';
}

function openPaywall() {
  paywallOpen.value = true;
}

function trackTopics(source: MeditationTrackDto) {
  const topics = new Set<string>();
  if (source.topicKey) topics.add(source.topicKey);
  source.topicKeys?.forEach((topic) => topics.add(topic));
  return topics;
}

// Стабильный 32-бит хеш строки (FNV-1a). Используется чтобы детерминированно
// разводить разные program-шаблоны по разным трекам внутри одного topic'а —
// то есть две `anxiety`-медитации в программе не играют один и тот же файл,
// если в каталоге есть несколько `anxiety`-треков.
function hashTemplateKey(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function loadTrack() {
  if (!meditationsAccess.value.available) return;
  isLoading.value = true;

  try {
    if (props.action.targetId) {
      track.value = await meditationsStore.fetchTrack(props.action.targetId);
      return;
    }

    await meditationsStore.fetchAll();
    const topicMatched = meditationsStore.tracks.filter((item) =>
      trackTopics(item).has(resolvedTopicKey.value)
    );
    if (topicMatched.length > 0) {
      const template = props.action.template?.trim() || resolvedTopicKey.value;
      const index = hashTemplateKey(template) % topicMatched.length;
      track.value = topicMatched[index] ?? topicMatched[0] ?? null;
      return;
    }
    track.value = meditationsStore.tracks[0] || null;
  } catch (error) {
    console.error(
      '[ProgramMeditationAction] Не удалось загрузить медитацию:',
      error
    );
    track.value = null;
  } finally {
    isLoading.value = false;
  }
}

async function togglePlayback() {
  if (!meditationsAccess.value.available) {
    openPaywall();
    return;
  }
  if (!track.value) return;

  if (!isActive.value) {
    setQueue([track.value.id], resolvedTopicKey.value);
    wasStartedHere.value = true;
    acknowledgeSession();
    await play(track.value, ROADMAP_MEDITATION_PLAYBACK_OPTIONS);
    emit('start');
    return;
  }

  if (isPlaying.value) {
    await pause();
    emit('pause');
    return;
  }

  wasStartedHere.value = true;
  acknowledgeSession();
  await play(track.value, ROADMAP_MEDITATION_PLAYBACK_OPTIONS);
  emit('start');
}

async function stopPlayback() {
  if (!isActive.value) return;
  wasStartedHere.value = false;
  await stop(false);
  emit('stop');
}

watch(sessionEnded, (ended) => {
  if (!ended || !wasStartedHere.value) return;
  wasStartedHere.value = false;
  acknowledgeSession();
  emit('complete');
});

watch(
  () => meditationsAccess.value.available,
  (available) => {
    if (available && !track.value) {
      void loadTrack();
    }
  }
);

onMounted(() => {
  acknowledgeSession();
  void loadTrack();
});

onBeforeUnmount(() => {
  if (wasStartedHere.value && isActive.value) {
    // Внутри roadmap аудио не должно продолжать играть после ухода с action.
    void stop(false);
    emit('stop');
  }
});
</script>
