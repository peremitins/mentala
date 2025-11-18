<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
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
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { findHabitByKey, type HabitCatalogItem } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import type {
  HabitDto,
  TherapyTopicDto,
  Addressing,
  Directness,
  HabitSubtype,
  NotificationPreferencesDto,
  Tone,
  UpdateNotificationPreferencesDto,
  UserPreferencesDto,
} from '@/shared/dto/notifications';
import {
  MAX_CUSTOM_NOTIFICATION_TEXTS,
  MAX_NOTIFICATION_TEXT_LENGTH,
} from '@/shared/dto/notifications';

const props = defineProps<{
  mentaiMode: 'habits' | 'therapy';
  entityKey: string;
}>();

const route = useRoute();

const isHabits = computed(() => props.mentaiMode === 'habits');

type HabitEntity = HabitCatalogItem;
type TherapyCatalogEntity = (typeof THERAPY_TOPICS)[number];
type TherapyEntity = TherapyCatalogEntity | TherapyTopicDto;

const catalogHabit = computed<HabitEntity | null>(() =>
  isHabits.value ? (findHabitByKey(props.entityKey) ?? null) : null
);
const customHabit = ref<HabitDto | null>(null);

const catalogTherapy = computed<TherapyEntity | null>(() =>
  !isHabits.value
    ? (THERAPY_TOPICS.find((t) => t.key === props.entityKey) ?? null)
    : null
);
const customTherapy = ref<TherapyTopicDto | null>(null);

if (isHabits.value && !catalogHabit.value) {
  try {
    const { $api } = useNuxtApp();
    customHabit.value = await $api<HabitDto>(`/api/habits/${props.entityKey}`);
  } catch (error) {
    console.error('[NotificationSettings] custom habit fetch error:', error);
    throw createError({ statusCode: 404, message: 'Привычка не найдена' });
  }
}

if (!isHabits.value && !catalogTherapy.value) {
  try {
    const { $api } = useNuxtApp();
    customTherapy.value = await $api<TherapyTopicDto>(
      `/api/therapy/custom/${props.entityKey}`
    );
  } catch (error) {
    console.error('[NotificationSettings] custom therapy fetch error:', error);
    throw createError({
      statusCode: 404,
      message: 'Тема поддержки не найдена',
    });
  }
}

const habitEntity = computed(() =>
  isHabits.value ? (catalogHabit.value ?? customHabit.value ?? null) : null
);
const therapyEntity = computed(() =>
  !isHabits.value ? (catalogTherapy.value ?? customTherapy.value ?? null) : null
);

const isCustomHabit = computed(
  () => isHabits.value && !catalogHabit.value && !!customHabit.value
);
const isCustomTherapy = computed(
  () => !isHabits.value && !catalogTherapy.value && !!customTherapy.value
);
const entityIntent = computed(() =>
  isHabits.value ? (habitEntity.value?.intent ?? 'build') : null
);
const resolvedIntentForFilters = computed(() => {
  if (!isHabits.value) return null;
  const raw = entityIntent.value || 'build';
  return raw === 'custom' ? 'build' : raw;
});
const entityName = computed(() =>
  isHabits.value
    ? (habitEntity.value?.name ?? 'Привычка')
    : (therapyEntity.value?.name ?? 'Тема поддержки')
);
const entityEmoji = computed(() =>
  isHabits.value
    ? (habitEntity.value?.emoji ?? '✨')
    : (therapyEntity.value?.emoji ?? '💬')
);

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
const habitGradients: Record<string, string> = {
  build: 'from-blue-500 to-purple-500',
  quit: 'from-red-500 to-orange-500',
  custom: 'from-gray-500 to-slate-500',
};

const headerGradient = computed(() => {
  if (isHabits.value) {
    const intentKey = entityIntent.value ?? 'build';
    return habitGradients[intentKey] ?? 'from-blue-500 to-purple-500';
  }
  const topic = therapyEntity.value;
  if (topic && 'color' in topic && topic.color) {
    return colorSchemes[topic.color] ?? 'from-blue-500 to-purple-500';
  }
  return 'from-blue-500 to-purple-500';
});

const notificationsStore = useNotificationsStore();
const userHabitsStore = useUserHabitsStore();
const therapyTopicsStore = useTherapyTopicsStore();

const enabled = ref(false);
const timesPerDay = ref(3);
const timesPerDaySlider = computed({
  get: () => [timesPerDay.value],
  set: (value) => {
    if (!value?.length || value[0] === undefined) return;
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
const customTexts = ref<string[]>(['']);
const canAddCustomText = computed(
  () => customTexts.value.length < MAX_CUSTOM_NOTIFICATION_TEXTS
);
const customTextErrors = computed(() =>
  customTexts.value.map((text) =>
    text.trim().length > MAX_NOTIFICATION_TEXT_LENGTH
      ? `Максимум ${MAX_NOTIFICATION_TEXT_LENGTH} символов`
      : ''
  )
);
const normalizedCustomTexts = computed(() =>
  customTexts.value.map((text) => text.trim()).filter((text) => text.length > 0)
);
const hasCustomTextError = computed(() =>
  customTextErrors.value.some((msg) => Boolean(msg))
);
const hasCustomTexts = computed(() => normalizedCustomTexts.value.length > 0);
const canSubmitCustomTexts = computed(
  () => hasCustomTexts.value && !hasCustomTextError.value
);

const isCustomEntity = computed(() =>
  isHabits.value ? isCustomHabit.value : isCustomTherapy.value
);
const canEditCustomEntity = computed(() => {
  if (isHabits.value) {
    return isCustomHabit.value && !!customHabit.value;
  }
  return isCustomTherapy.value && !!customTherapy.value;
});
const isEditingTitle = ref(false);
const isEditingSubtitle = ref(false);
const titleDraft = ref('');
const subtitleDraft = ref('');
const titleInputRef = ref<HTMLInputElement | null>(null);
const subtitleInputRef = ref<HTMLTextAreaElement | null>(null);
const inlineTitleLoading = ref(false);
const inlineSubtitleLoading = ref(false);

const {
  slots: slotControls,
  hasCustomTimes,
  setManualTime,
  resetAllSlotTimes,
} = useTimeSlotControls(timesPerDay, timeRange, customSlotTimes);

function addCustomText() {
  if (!canAddCustomText.value) return;
  customTexts.value.push('');
}

function removeCustomText(index: number) {
  if (customTexts.value.length === 1) {
    customTexts.value[0] = '';
    return;
  }
  customTexts.value.splice(index, 1);
}

function moveCustomText(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (
    targetIndex < 0 ||
    targetIndex >= customTexts.value.length ||
    targetIndex === index
  ) {
    return;
  }
  const texts = [...customTexts.value];
  const [moved] = texts.splice(index, 1);
  if (moved === undefined) return;
  texts.splice(targetIndex, 0, moved);
  customTexts.value = texts;
}

function startEditTitle() {
  if (!canEditCustomEntity.value) return;
  const target = isHabits.value ? customHabit.value : customTherapy.value;
  if (!target) return;
  titleDraft.value = target.name;
  isEditingTitle.value = true;
  nextTick(() => {
    titleInputRef.value?.focus();
  });
}

function cancelTitleEdit() {
  isEditingTitle.value = false;
  titleDraft.value = '';
}

async function saveTitleEdit() {
  if (!canEditCustomEntity.value) return;
  const newName = titleDraft.value.trim();
  if (!newName) {
    useToast(
      isHabits.value ? 'Введите название привычки' : 'Введите название темы',
      'error'
    );
    return;
  }
  inlineTitleLoading.value = true;
  try {
    const { $api } = useNuxtApp();
    if (isHabits.value && customHabit.value) {
      const updated = await $api<HabitDto>(
        `/api/habits/${customHabit.value.id}`,
        {
          method: 'PUT',
          body: { name: newName },
        }
      );
      customHabit.value = updated;
      userHabitsStore.updateLocal(updated);
    } else if (!isHabits.value && customTherapy.value) {
      const updated = await $api<TherapyTopicDto>(
        `/api/therapy/custom/${customTherapy.value.id}`,
        {
          method: 'PUT',
          body: { name: newName },
        }
      );
      customTherapy.value = updated;
      therapyTopicsStore.updateLocal(updated);
    }
    useToast('Название обновлено', 'success');
    isEditingTitle.value = false;
  } catch (error: any) {
    console.error('[NotificationSettings] Failed to update title:', error);
    useToast(error?.message || 'Не удалось обновить название', 'error');
  } finally {
    inlineTitleLoading.value = false;
  }
}

function startEditSubtitle() {
  if (!canEditCustomEntity.value) return;
  const target = isHabits.value ? customHabit.value : customTherapy.value;
  if (!target) return;
  subtitleDraft.value = target.description ?? '';
  isEditingSubtitle.value = true;
  nextTick(() => {
    subtitleInputRef.value?.focus();
  });
}

function cancelSubtitleEdit() {
  isEditingSubtitle.value = false;
  subtitleDraft.value = '';
}

async function saveSubtitleEdit() {
  if (!canEditCustomEntity.value) return;
  inlineSubtitleLoading.value = true;
  try {
    const nextDescription = subtitleDraft.value.trim();
    const { $api } = useNuxtApp();
    if (isHabits.value && customHabit.value) {
      const updated = await $api<HabitDto>(
        `/api/habits/${customHabit.value.id}`,
        {
          method: 'PUT',
          body: { description: nextDescription || null },
        }
      );
      customHabit.value = updated;
      userHabitsStore.updateLocal(updated);
    } else if (!isHabits.value && customTherapy.value) {
      const updated = await $api<TherapyTopicDto>(
        `/api/therapy/custom/${customTherapy.value.id}`,
        {
          method: 'PUT',
          body: { description: nextDescription || null },
        }
      );
      customTherapy.value = updated;
      therapyTopicsStore.updateLocal(updated);
    }
    useToast('Описание обновлено', 'success');
    isEditingSubtitle.value = false;
  } catch (error: any) {
    console.error(
      '[NotificationSettings] Failed to update description:',
      error
    );
    useToast(error?.message || 'Не удалось обновить описание', 'error');
  } finally {
    inlineSubtitleLoading.value = false;
  }
}

watch(isCustomEntity, (value) => {
  if (!value) {
    isEditingTitle.value = false;
    isEditingSubtitle.value = false;
  }
});

const initialStateSignature = ref('');

function computeStateSignature() {
  const hasManualSlotsLocal = customSlotTimes.value.some(
    (value) => value !== null
  );
  return JSON.stringify({
    enabled: enabled.value,
    timesPerDay: timesPerDay.value,
    directness: directness.value,
    timezone: timezone.value,
    activeDays: [...activeDays.value].slice().sort((a, b) => a - b),
    timeRangeStart: timeRange.value.start,
    timeRangeEnd: timeRange.value.end,
    customSlotTimes: hasManualSlotsLocal
      ? customSlotTimes.value.map((value) =>
          value === null || value === undefined ? null : value
        )
      : null,
    subtype: isHabits.value
      ? isCustomHabit.value
        ? null
        : subtype.value
      : null,
    customTexts: isCustomEntity.value ? normalizedCustomTexts.value : null,
  });
}

const isDirty = computed(() => {
  if (!initialStateSignature.value) {
    return false;
  }
  return computeStateSignature() !== initialStateSignature.value;
});

const isSaveDisabled = computed(
  () =>
    loading.value ||
    !isDirty.value ||
    (isCustomEntity.value && !canSubmitCustomTexts.value)
);

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
  const intent = resolvedIntentForFilters.value ?? 'build';
  return intent === 'quit' ? SUBTYPE_OPTIONS_QUIT : SUBTYPE_OPTIONS_BUILD;
});

const previewKey = computed(() => {
  if (isHabits.value) {
    const customSignature = normalizedCustomTexts.value.join('|');
    return `${addressing.value}-${tone.value}-${directness.value}-${subtype.value}-${props.entityKey}-${customSignature}`;
  }
  return `${addressing.value}-${tone.value}-${directness.value}-${props.entityKey}`;
});

const currentTotalPerDay = computed(() => {
  const otherPreferences = notificationsStore.preferences.filter((p) => {
    if (!p.enabled) return false;
    if (p.kind === 'therapy' && !p.topicKey) return false;
    if (p.kind === 'habits' && !p.habitId) return false;

    if (
      isHabits.value &&
      p.kind === 'habits' &&
      p.habitId === props.entityKey
    ) {
      return false;
    }
    if (
      !isHabits.value &&
      p.kind === 'therapy' &&
      p.topicKey === props.entityKey
    ) {
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
      if (isCustomEntity.value) {
        const storedTexts = pref.meta?.customTexts ?? null;
        customTexts.value =
          storedTexts && storedTexts.length ? [...storedTexts] : [''];
      }
    } else if (isCustomEntity.value) {
      customTexts.value = [''];
    }
    initialStateSignature.value = computeStateSignature();
  } catch (error) {
    console.error('Failed to load preferences:', error);
  } finally {
    if (!initialStateSignature.value) {
      initialStateSignature.value = computeStateSignature();
    }
  }
});

async function saveSettings() {
  if (isCustomEntity.value && !canSubmitCustomTexts.value) {
    useToast('Добавьте хотя бы один корректный текст уведомления', 'error');
    return;
  }
  loading.value = true;
  try {
    const hasManualSlots = customSlotTimes.value.some(
      (value) => value !== null
    );

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
          subtype: isCustomHabit.value ? null : subtype.value,
          ...(isCustomHabit.value && {
            meta: {
              customTexts: normalizedCustomTexts.value,
            },
          }),
        }
      : {
          ...baseData,
          topicKey: props.entityKey,
          ...(isCustomTherapy.value && {
            meta: {
              customTexts: normalizedCustomTexts.value,
            },
          }),
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
    initialStateSignature.value = computeStateSignature();
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
        response.message ||
          'Тестовое уведомление запланировано через 1 минуту!',
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
    const intentFromQuery = route.query.intent as
      | 'build'
      | 'quit'
      | 'custom'
      | undefined;
    const intent = intentFromQuery || resolvedIntentForFilters.value || 'build';
    navigateTo(`/habits?intent=${intent}`);
  } else {
    navigateTo('/therapy');
  }
}

const descriptionPlaceholder = computed(
  () =>
    'Добавьте детали, чтобы ИИ мог создавать более персональные и точные уведомления.'
);

const descriptionText = computed(() => {
  if (isHabits.value) {
    return habitEntity.value?.description || descriptionPlaceholder.value;
  }
  return therapyEntity.value?.description || descriptionPlaceholder.value;
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
        <svg
          class="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
      </button>

      <div class="flex items-center gap-3 flex-1">
        <div
          class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-2xl shadow-sm"
          :class="headerGradient"
        >
          {{ entityEmoji }}
        </div>
        <div class="flex-1 min-w-0 space-y-1.5">
          <div class="flex items-center gap-2">
            <template v-if="isEditingTitle">
              <input
                ref="titleInputRef"
                v-model="titleDraft"
                type="text"
                class="flex-1 rounded-lg border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100"
                maxlength="120"
                @keydown.enter.prevent="saveTitleEdit"
                @keydown.esc.prevent="cancelTitleEdit"
              />
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="rounded-lg bg-blue-600 px-2 py-1 text-white text-xs disabled:opacity-50"
                  :disabled="inlineTitleLoading"
                  @click="saveTitleEdit"
                >
                  ✓
                </button>
                <button
                  type="button"
                  class="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-600 dark:border-gray-600 dark:text-gray-300"
                  @click="cancelTitleEdit"
                >
                  ✕
                </button>
              </div>
            </template>
            <template v-else>
              <h1
                class="text-xl font-bold text-gray-900 dark:text-gray-100 truncate"
              >
                {{ entityName }}
              </h1>
              <button
                v-if="canEditCustomEntity"
                type="button"
                class="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition"
                @click="startEditTitle"
                aria-label="Редактировать название"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 013.536 3.536L6.5 20.5 3 21l.5-3.5L16.732 3.732z"
                  />
                </svg>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <div class="px-2">
      <div v-if="isEditingSubtitle" class="space-y-2">
        <textarea
          ref="subtitleInputRef"
          v-model="subtitleDraft"
          rows="3"
          class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100"
          placeholder="Добавьте описание"
          @keydown.esc.prevent="cancelSubtitleEdit"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-3 py-1.5 text-white text-xs font-medium disabled:opacity-50"
            :disabled="inlineSubtitleLoading"
            @click="saveSubtitleEdit"
          >
            Сохранить
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:text-gray-300"
            @click="cancelSubtitleEdit"
          >
            Отмена
          </button>
        </div>
      </div>
      <div
        v-else
        class="flex items-start gap-3 rounded-2xl bg-gray-50/80 p-3 dark:bg-gray-900/60"
      >
        <p
          class="text-sm text-gray-700 dark:text-gray-300 flex-1 leading-relaxed"
        >
          {{ descriptionText }}
        </p>
        <button
          v-if="canEditCustomEntity"
          type="button"
          class="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition mt-1"
          @click="startEditSubtitle"
          aria-label="Редактировать описание"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 013.536 3.536L6.5 20.5 3 21l.5-3.5L16.732 3.732z"
            />
          </svg>
        </button>
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
                  class="flex flex-col items-center text-[11px] font-medium w-[32px] flex-shrink-0"
                >
                  <TimePicker
                    :model-value="slot.minutes ?? timeRange.start"
                    label=""
                    @update:modelValue="
                      (value) => setManualTime(slot.index, value)
                    "
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
                  class="flex flex-col items-center gap-1 text-[10px] font-medium text-gray-500 opacity-50 w-[32px] flex-shrink-0"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-400 text-sm"
                  >
                    {{ slot.number }}
                  </span>
                  <span class="text-center leading-tight whitespace-nowrap">
                    Выкл
                  </span>
                </div>
              </template>
            </div>
            <div
              class="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-400"
            >
              <span>
                Точное время уведомлений: по умолчанию равномерно, но можно
                задать своё.
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

        <div
          v-if="isCustomEntity"
          class="space-y-3 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-4 bg-white/70 dark:bg-gray-900/50 transition-all"
        >
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Тексты уведомлений
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                До {{ MAX_CUSTOM_NOTIFICATION_TEXTS }} вариантов, максимум
                {{ MAX_NOTIFICATION_TEXT_LENGTH }} символов. Можно использовать
                {`{name}`}
              </p>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-30"
              :disabled="!canAddCustomText"
              @click="addCustomText"
            >
              <span>+</span> Добавить текст
            </button>
          </div>

          <TransitionGroup name="fade" tag="div" class="space-y-3">
            <div
              v-for="(text, index) in customTexts"
              :key="`custom-text-${index}`"
              class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/50 p-3 shadow-sm transition-all"
            >
              <textarea
                v-model="customTexts[index]"
                rows="3"
                class="w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-0 dark:text-gray-100"
                :maxlength="MAX_NOTIFICATION_TEXT_LENGTH"
                placeholder="Например: «{name}, сделай вдох и выпей стакан воды»"
              />
              <div class="flex items-center justify-between text-xs mt-2">
                <div class="flex items-center gap-2">
                  <span
                    :class="[
                      customTextErrors[index]
                        ? 'text-red-500'
                        : 'text-gray-500 dark:text-gray-400',
                    ]"
                  >
                    {{
                      customTextErrors[index] ||
                      `${customTexts[index]?.trim().length}/${MAX_NOTIFICATION_TEXT_LENGTH}`
                    }}
                  </span>
                  <div
                    v-if="customTexts.length > 1"
                    class="flex items-center gap-1 text-gray-400"
                  >
                    <button
                      type="button"
                      :class="[
                        'p-1 rounded-md border border-transparent hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-200 transition',
                        index === 0 ? 'opacity-40 cursor-not-allowed' : '',
                      ]"
                      :disabled="index === 0"
                      @click="moveCustomText(index, 'up')"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      :class="[
                        'p-1 rounded-md border border-transparent hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-200 transition',
                        index === customTexts.length - 1
                          ? 'opacity-40 cursor-not-allowed'
                          : '',
                      ]"
                      :disabled="index === customTexts.length - 1"
                      @click="moveCustomText(index, 'down')"
                    >
                      ↓
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  class="text-gray-500 hover:text-red-500 transition text-xs"
                  @click="removeCustomText(index)"
                >
                  Удалить
                </button>
              </div>
            </div>
          </TransitionGroup>

          <p v-if="!hasCustomTexts" class="text-xs text-red-500 font-medium">
            Добавьте хотя бы один текст
          </p>
        </div>

        <div v-if="isHabits && !isCustomHabit" class="space-y-2">
          <label class="text-sm font-medium">Тип уведомления</label>
          <Combobox
            v-model="subtype"
            :options="subtypeOptions"
            placeholder="Выберите тип"
            class="max-w-[200px]"
          />
          <p
            v-if="
              subtypeOptions.find((opt) => opt.value === subtype)?.description
            "
            class="text-xs text-muted-foreground mt-1"
          >
            {{
              subtypeOptions.find((opt) => opt.value === subtype)?.description
            }}
          </p>
        </div>

        <div
          v-if="(!isHabits || subtype !== 'informational') && !isCustomHabit"
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
            :key="`habits-${previewKey}`"
            kind="habits"
            :addressing="addressing"
            :tone="tone"
            :directness="directness"
            :habit-id="entityKey"
            :subtype="subtype"
            :custom-texts="isCustomEntity ? normalizedCustomTexts : undefined"
          />
          <NotificationPreview
            v-else
            :key="`therapy-${previewKey}`"
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
          :disabled="isSaveDisabled"
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

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
