<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';
import { useToast } from '@/app/composables/useToast';
import NotificationPreview from '@/app/components/notifications/NotificationPreview.vue';
import OverloadBanner from '@/app/components/notifications/OverloadBanner.vue';
import Combobox from '@/app/components/Combobox.vue';
import WeekdaySelector from '@/app/components/WeekdaySelector.vue';
import TimeRangeSelector from '@/app/components/TimeRangeSelector.vue';
import TimePicker from '@/app/components/TimePicker.vue';
import { useTimeSlotControls } from '@/app/composables/useTimeSlotControls';
import {
  SUBTYPE_OPTIONS_BUILD,
  SUBTYPE_OPTIONS_QUIT,
} from '@/app/constants/select-options';
import { useNotificationsStore } from '@/app/stores/notifications';
import { findHabitByKey } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import type {
  Addressing,
  Directness,
  HabitSubtype,
  NotificationPreferencesDto,
  Tone,
  UpdateNotificationPreferencesDto,
  UserPreferencesDto,
} from '@/shared/dto/notifications';

const props = defineProps<{
  mentaiMode: 'habits' | 'therapy';
  entityKey: string;
}>();

const route = useRoute();

const isHabits = computed(() => props.mentaiMode === 'habits');

type HabitEntity = NonNullable<ReturnType<typeof findHabitByKey>>;
type TherapyEntity = (typeof THERAPY_TOPICS)[number];

const entity = computed<HabitEntity | TherapyEntity>(() => {
  if (isHabits.value) {
    const habit = findHabitByKey(props.entityKey);
    if (!habit) {
      throw createError({ statusCode: 404, message: 'Привычка не найдена' });
    }
    return habit as HabitEntity;
  }

  const topic = THERAPY_TOPICS.find((t) => t.key === props.entityKey);
  if (!topic) {
    throw createError({ statusCode: 404, message: 'Тема поддержки не найдена' });
  }
  return topic as TherapyEntity;
});

const colorSchemes: Record<string, string> = {
  blue: 'from-blue-500 to-cyan-500',
  gray: 'from-gray-500 to-gray-600',
  yellow: 'from-yellow-500 to-orange-500',
  purple: 'from-purple-500 to-pink-500',
  red: 'from-red-500 to-rose-500',
  pink: 'from-pink-500 to-rose-500',
  green: 'from-green-500 to-emerald-500',
  indigo: 'from-indigo-500 to-purple-500',
  slate: 'from-slate-500 to-gray-500',
  orange: 'from-orange-500 to-red-500',
};

const headerGradient = computed(() => {
  if (isHabits.value) {
    return 'from-blue-500 to-purple-500';
  }
  const topic = entity.value as TherapyEntity;
  return colorSchemes[topic.color] ?? 'from-blue-500 to-purple-500';
});

const notificationsStore = useNotificationsStore();

const enabled = ref(false);
const timesPerDay = ref(3);
const timesPerDaySlider = computed({
  get: () => [timesPerDay.value],
  set: (value) => {
    if (!value?.length) return;
    timesPerDay.value = Math.round(value[0]);
  },
});
const directness = ref<Directness>('moderate');
const subtype = ref<HabitSubtype>('mixed');
const timezone = ref('Europe/Moscow');
const activeDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6]);
const timeRange = ref({ start: 540, end: 1350 });
const customSlotTimes = ref<(number | null)[]>([]);
const loading = ref(false);
const addressing = ref<Addressing>('informal');
const tone = ref<Tone>('neutral');

const {
  slots: slotControls,
  hasCustomTimes,
  setManualTime,
  resetAllSlotTimes,
} = useTimeSlotControls(timesPerDay, timeRange, customSlotTimes);

const directnessOptions = [
  {
    value: 'soft' as Directness,
    label: 'Мягко',
    description: 'Поддержка, без давления',
  },
  {
    value: 'moderate' as Directness,
    label: 'Умеренно',
    description: 'Конкретнее, но корректно',
  },
  {
    value: 'hard' as Directness,
    label: 'Жёстко',
    description: 'Максимальная директивность',
  },
];

const subtypeOptions = computed(() => {
  if (!isHabits.value) return [];
  const goal = entity.value as HabitEntity;
  return goal.intent === 'quit' ? SUBTYPE_OPTIONS_QUIT : SUBTYPE_OPTIONS_BUILD;
});

const previewKey = computed(() => {
  if (isHabits.value) {
    return `${addressing.value}-${tone.value}-${directness.value}-${subtype.value}-${props.entityKey}`;
  }
  return `${addressing.value}-${tone.value}-${directness.value}-${props.entityKey}`;
});

const currentTotalPerDay = computed(() => {
  const otherPreferences = notificationsStore.preferences.filter((p) => {
    if (!p.enabled) return false;
    if (p.kind === 'therapy' && !p.topicKey) return false;
    if (p.kind === 'habits' && !p.habitId) return false;

    if (isHabits.value && p.kind === 'habits' && p.habitId === props.entityKey) {
      return false;
    }
    if (!isHabits.value && p.kind === 'therapy' && p.topicKey === props.entityKey) {
      return false;
    }
    return true;
  });

  let total = otherPreferences.reduce((sum, p) => sum + p.timesPerDay, 0);
  if (enabled.value) {
    total += timesPerDay.value;
  }
  return total;
});

onMounted(async () => {
  try {
    const { $api } = useNuxtApp();
    await notificationsStore.fetchAll();

    const globalPrefs = await $api<UserPreferencesDto>(
      '/api/settings/preferences'
    );
    if (globalPrefs) {
      addressing.value = globalPrefs.addressing;
      tone.value = globalPrefs.tone;
    }

    const prefsUrl = isHabits.value
      ? `/api/notifications/prefs/habits?habitId=${props.entityKey}`
      : `/api/notifications/prefs/therapy?topicKey=${props.entityKey}`;

    const pref = await $api<NotificationPreferencesDto | null>(prefsUrl);

    if (pref) {
      enabled.value = pref.enabled;
      timesPerDay.value = pref.timesPerDay;
      directness.value = pref.directness;
      if (isHabits.value) {
        subtype.value = pref.subtype ?? 'mixed';
      }
      timezone.value = pref.timezone;
      activeDays.value = pref.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
      timeRange.value = {
        start: pref.timeRangeStart,
        end: pref.timeRangeEnd,
      };
      customSlotTimes.value = pref.customSlotTimes ?? [];
    }
  } catch (error) {
    console.error('Failed to load preferences:', error);
  }
});

async function saveSettings() {
  loading.value = true;

  try {
    const hasManualSlots = customSlotTimes.value.some((value) => value !== null);

    const baseData = {
      enabled: enabled.value,
      timesPerDay: timesPerDay.value,
      directness: directness.value,
      timezone: timezone.value,
      activeDays: activeDays.value,
      timeRangeStart: timeRange.value.start,
      timeRangeEnd: timeRange.value.end,
      customSlotTimes: hasManualSlots ? customSlotTimes.value : null,
    } satisfies Partial<UpdateNotificationPreferencesDto>;

    const updateData: UpdateNotificationPreferencesDto = isHabits.value
      ? {
          ...baseData,
          habitId: props.entityKey,
          subtype: subtype.value,
        }
      : {
          ...baseData,
          topicKey: props.entityKey,
        };

    const prefsUrl = isHabits.value
      ? '/api/notifications/prefs/habits'
      : '/api/notifications/prefs/therapy';

    const { $api } = useNuxtApp();
    const updated = await $api<NotificationPreferencesDto>(prefsUrl, {
      method: 'PUT',
      body: updateData,
    });

    notificationsStore.updateLocal(updated);
    useToast('Настройки сохранены', 'success');
  } catch (err) {
    console.error('[Client] Failed to save preferences:', err);
    useToast('Ошибка при сохранении', 'error');
  } finally {
    loading.value = false;
  }
}

async function sendQuickTest() {
  try {
    const { $api } = useNuxtApp();
    const response = await $api<{
      success: boolean;
      slotId: string;
      scheduledAt: string;
      message: string;
    }>('/api/notifications/test-quick', {
      method: 'POST',
      body: { kind: props.mentaiMode },
    });

    if (response?.success) {
      useToast(
        response.message || 'Тестовое уведомление запланировано через 1 минуту!',
        'success'
      );
    } else {
      useToast('Ошибка при создании тестового уведомления', 'error');
    }
  } catch (error: any) {
    console.error('Failed to schedule quick test:', error);
    useToast(
      error?.message || 'Ошибка при создании тестового уведомления',
      'error'
    );
  }
}

function goBack() {
  if (isHabits.value) {
    const habit = entity.value as HabitEntity;
    const intentFromQuery = route.query.intent as 'build' | 'quit' | 'custom' | undefined;
    const intent = intentFromQuery || habit?.intent || 'build';
    navigateTo(`/habits?intent=${intent}`);
  } else {
    navigateTo('/therapy');
  }
}

const descriptionText = computed(() => {
  if (isHabits.value) {
    return 'Персонализированные напоминания о полезных привычках: медитация, сон, питание, движение и другие.';
  }
  const topic = entity.value as TherapyEntity;
  return topic.description;
});

const previewSubtitle = computed(() =>
  isHabits.value ? 'Уведомления: Привычки' : 'Уведомления: Поддержка'
);
</script>

<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="goBack"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </button>

      <div class="flex items-center gap-3 flex-1">
        <div
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm"
          :class="headerGradient"
        >
          {{ entity.emoji }}
        </div>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
            {{ entity.name }}
          </h1>
          <p class="text-xs text-gray-600 dark:text-gray-400">Настройка уведомлений</p>
        </div>
      </div>
    </div>

    <div class="px-2 space-y-6">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ previewSubtitle }}</h3>
        <button
          type="button"
          :class="[
            'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
            enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600',
          ]"
          @click="enabled = !enabled"
        >
          <span
            :class="[
              'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
              enabled ? 'translate-x-6' : 'translate-x-1',
            ]"
          />
        </button>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400">
        {{ descriptionText }}
      </p>

      <div class="space-y-4">
        <WeekdaySelector v-model="activeDays" />
        <TimeRangeSelector v-model="timeRange" />

        <div class="space-y-2">
          <label class="text-sm font-medium">
            Частота: {{ timesPerDay }}
            {{ timesPerDay === 1 ? 'раз' : 'раза' }} в день
          </label>
          <div class="px-[8px]">
            <SliderRoot
              v-model="timesPerDaySlider"
              :min="1"
              :max="5"
              :step="1"
              class="relative flex w-full touch-none select-none items-center py-3"
              aria-label="Частота уведомлений"
            >
              <SliderTrack
                class="relative h-2 w-full grow rounded-full bg-gray-200 dark:bg-gray-700"
              >
                <SliderRange
                  class="absolute h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                />
              </SliderTrack>
              <SliderThumb
                class="block h-5 w-5 rounded-full border-2 border-white bg-blue-600 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-gray-900 dark:focus-visible:ring-offset-gray-900"
              />
            </SliderRoot>
          </div>
          <div class="space-y-1.5">
            <div class="flex flex-wrap justify-between gap-1 sm:gap-2">
              <template v-for="slot in slotControls" :key="slot.index">
                <div
                  v-if="slot.isActive"
                  class="flex flex-col items-center text-[11px] font-medium min-w-[56px] flex-shrink-0"
                >
                  <TimePicker
                    :model-value="slot.minutes ?? timeRange.start"
                    label=""
                    @update:modelValue="(value) => setManualTime(slot.index, value)"
                  >
                    <template #trigger="{ formattedTime }">
                      <button
                        type="button"
                        class="flex flex-col items-center gap-1 text-[10px] font-medium focus:outline-none"
                      >
                        <span
                          :class="[
                            'flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-colors',
                            slot.isManual
                              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900 dark:text-blue-200'
                              : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200',
                          ]"
                        >
                          {{ slot.number }}
                        </span>
                        <span
                          :class="[
                            'text-center leading-tight text-[10px]',
                            slot.isManual
                              ? 'text-gray-900 dark:text-gray-100'
                              : 'text-gray-500 dark:text-gray-400',
                          ]"
                        >
                          {{ slot.isManual ? formattedTime : 'Авто' }}
                        </span>
                      </button>
                    </template>
                  </TimePicker>
                </div>
                <div
                  v-else
                  class="flex flex-col items-center gap-1 text-[10px] font-medium text-gray-500 opacity-50 min-w-[56px] flex-shrink-0"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-400 text-sm"
                  >
                    {{ slot.number }}
                  </span>
                  <span class="text-center leading-tight">Не активно</span>
                </div>
              </template>
            </div>
            <div class="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400">
              <span>
                Точное время уведомлений: по умолчанию равномерно, но можно задать своё.
              </span>
              <button
                v-if="hasCustomTimes"
                type="button"
                class="text-blue-600 hover:text-blue-500 dark:text-blue-400"
                @click="resetAllSlotTimes"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>

        <OverloadBanner :total-per-day="currentTotalPerDay" />

        <div v-if="isHabits" class="space-y-2">
          <label class="text-sm font-medium">Тип уведомления</label>
          <Combobox
            v-model="subtype"
            :options="subtypeOptions"
            placeholder="Выберите тип"
            class="max-w-[200px]"
          />
          <p
            v-if="subtypeOptions.find((opt) => opt.value === subtype)?.description"
            class="text-xs text-muted-foreground mt-1"
          >
            {{ subtypeOptions.find((opt) => opt.value === subtype)?.description }}
          </p>
        </div>

        <div
          v-if="!isHabits || subtype !== 'informational'"
          class="space-y-2"
        >
          <label class="text-sm font-medium">Стиль подачи</label>
          <div class="grid gap-2">
            <button
              v-for="option in directnessOptions"
              :key="option.value"
              type="button"
              :class="[
                'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                directness === option.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900'
                  : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700',
              ]"
              @click="directness = option.value"
            >
              <span class="text-sm font-medium">{{ option.label }}</span>
              <span class="text-xs text-gray-600 dark:text-gray-400">
                {{ option.description }}
              </span>
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <NotificationPreview
            v-if="isHabits"
            :key="previewKey"
            kind="habits"
            :addressing="addressing"
            :tone="tone"
            :directness="directness"
            :habit-id="entityKey"
            :subtype="subtype"
          />
          <NotificationPreview
            v-else
            :key="previewKey"
            kind="therapy"
            :addressing="addressing"
            :tone="tone"
            :directness="directness"
            :topic-key="entityKey"
          />
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="loading"
          @click="saveSettings"
        >
          {{ loading ? 'Сохранение...' : 'Сохранить' }}
        </button>
        <button
          type="button"
          class="w-full rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-500 dark:hover:bg-green-600"
          :disabled="loading"
          @click="sendQuickTest"
        >
          <span>▲ Тест через 1 мин</span>
        </button>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400 text-center">
        Уведомления распределяются равномерно в течение дня (09:00–22:30)
      </p>
    </div>
  </div>
</template>
