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
  TEXT_SOURCE_OPTIONS,
} from '@/app/constants/select-options';
import ToggleGroup from '@/app/components/ui/toggle-group/ToggleGroup.vue';
import ToggleGroupItem from '@/app/components/ui/toggle-group/ToggleGroupItem.vue';
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
const textSource = ref<'templates' | 'ai' | 'hybrid'>('templates');
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
const canSubmitCustomTexts = computed(() => {
  // Для режимов templates и hybrid требуется хотя бы один текст
  if (isCustomEntity.value) {
    const source = textSource.value;
    if (source === 'templates' || source === 'hybrid') {
      return hasCustomTexts.value && !hasCustomTextError.value;
    }
    // Для режима ai тексты не требуются
    return true;
  }
  return hasCustomTexts.value && !hasCustomTextError.value;
});

// Условное отображение секции текстов для кастомных
const showCustomTextsSection = computed(() => {
  if (!isCustomEntity.value) return false;
  const source = textSource.value;
  return source === 'templates' || source === 'hybrid';
});

// Условное отображение информационного блока про AI
const showAiInfo = computed(() => {
  const source = textSource.value;
  return source === 'ai' || source === 'hybrid';
});

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
  // Восстанавливаем исходное значение
  const target = isHabits.value ? customHabit.value : customTherapy.value;
  if (target) {
    titleDraft.value = target.name;
  }
  isEditingTitle.value = false;
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
  // Восстанавливаем исходное значение
  const target = isHabits.value ? customHabit.value : customTherapy.value;
  if (target) {
    subtitleDraft.value = target.description ?? '';
  }
  isEditingSubtitle.value = false;
}

watch(isCustomEntity, (value) => {
  if (!value) {
    isEditingTitle.value = false;
    isEditingSubtitle.value = false;
  }
});

const initialStateSignature = ref('');

// Исходные значения названия и описания для отслеживания изменений
const initialEntityName = ref<string>('');
const initialEntityDescription = ref<string | null>(null);

function computeStateSignature() {
  const hasManualSlotsLocal = customSlotTimes.value.some(
    (value) => value !== null
  );

  // Получаем текущие значения названия и описания
  // Если идет редактирование, используем draft значения, иначе - сохраненные
  const currentName = isEditingTitle.value
    ? titleDraft.value.trim()
    : isHabits.value
      ? customHabit.value?.name || catalogHabit.value?.name || ''
      : customTherapy.value?.name || catalogTherapy.value?.name || '';

  const currentDescription = isEditingSubtitle.value
    ? subtitleDraft.value.trim() || null
    : isHabits.value
      ? customHabit.value?.description ||
        catalogHabit.value?.description ||
        null
      : customTherapy.value?.description ||
        catalogTherapy.value?.description ||
        null;

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
    textSource: textSource.value,
    // Добавляем название и описание для отслеживания изменений
    // Сравниваем с исходными значениями
    entityName: currentName,
    entityDescription: currentDescription || null,
  });
}

const isDirty = computed(() => {
  if (!initialStateSignature.value) {
    return false;
  }
  return computeStateSignature() !== initialStateSignature.value;
});

const isSaveDisabled = computed(
  () => loading.value || !isDirty.value
  // Убрали проверку canSubmitCustomTexts - разрешаем сохранять настройки без текстов
  // Пользователь может добавить тексты позже
);

const directnessOptions = [
  {
    value: 'soft' as Directness,
    label: 'Поддерживающий',
    description: 'Тёплый, мягкий стиль без давления',
  },
  {
    value: 'moderate' as Directness,
    label: 'Сдержанный',
    description: 'Корректные, нейтральные формулировки без лишних эмоций',
  },
  {
    value: 'hard' as Directness,
    label: 'Требовательный',
    description:
      'Прямые, настойчивые сообщения для тех, кому важен чёткий фокус',
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
  // ВАЖНО: Фильтруем только активные (enabled: true) настройки
  const otherPreferences = notificationsStore.preferences.filter((p) => {
    // Пропускаем неактивные настройки
    if (!p.enabled) return false;

    // Игнорируем legacy данные (без entityKey)
    if (!p.entityKey) return false;

    // Исключаем текущую настройку (чтобы не считать её дважды)
    if (p.entityKey === props.entityKey) {
      return false;
    }
    return true;
  });

  // Суммируем только активные настройки с валидными значениями
  // Максимальное разумное значение timesPerDay (например, 30 уведомлений в день)
  const MAX_REASONABLE_TIMES_PER_DAY = 30;

  let total = otherPreferences.reduce((sum, p) => {
    // Дополнительная проверка на всякий случай
    if (!p.enabled) return sum;
    // Проверяем, что timesPerDay - валидное положительное число
    const times = Number(p.timesPerDay);
    if (isNaN(times) || times < 0) {
      console.warn(
        `[NotificationSettings] Invalid timesPerDay for preference ${p.id}:`,
        p.timesPerDay
      );
      return sum;
    }
    // Проверяем на разумное значение (защита от некорректных данных)
    if (times > MAX_REASONABLE_TIMES_PER_DAY) {
      console.warn(
        `[NotificationSettings] Unreasonably high timesPerDay for preference ${p.id}:`,
        `${times} (max reasonable: ${MAX_REASONABLE_TIMES_PER_DAY}), skipping`
      );
      return sum;
    }
    return sum + times;
  }, 0);

  // Добавляем текущую настройку, используя локальные значения (то, что пользователь видит)
  // ВАЖНО: otherPreferences уже исключает текущую настройку, поэтому мы добавляем её отдельно
  // Используем enabled.value и timesPerDay.value для отображения актуального состояния
  // Счетчик обновляется динамически через computed, но учитывает только включенные уведомления
  if (enabled.value) {
    const currentTimes = Number(timesPerDay.value);
    if (
      !isNaN(currentTimes) &&
      currentTimes >= 0 &&
      currentTimes <= MAX_REASONABLE_TIMES_PER_DAY
    ) {
      total += currentTimes;
    }
  }

  // Логирование для отладки (только в dev режиме)
  if (process.dev) {
    const otherTotal = otherPreferences.reduce((s, p) => {
      const times = Number(p.timesPerDay);
      return s + (isNaN(times) || times < 0 ? 0 : times);
    }, 0);

    // Детальная разбивка по каждой настройке
    const preferencesBreakdown = otherPreferences.map((p) => {
      const times = Number(p.timesPerDay);
      const isValid = !isNaN(times) && times >= 0;
      return {
        id: p.id,
        kind: p.kind,
        entityKey: p.entityKey,
        enabled: p.enabled,
        timesPerDay: p.timesPerDay,
        timesPerDayNumber: times,
        isValid,
        contribution: isValid ? times : 0,
      };
    });

    // Сортируем по вкладу (от большего к меньшему)
    preferencesBreakdown.sort((a, b) => b.contribution - a.contribution);

    console.log(`[NotificationSettings] currentTotalPerDay calculation:`, {
      allPreferencesCount: notificationsStore.preferences.length,
      enabledPreferencesCount: notificationsStore.preferences.filter(
        (p) => p.enabled
      ).length,
      otherPreferencesCount: otherPreferences.length,
      otherPreferencesTotal: otherTotal,
      currentEnabled: enabled.value,
      currentTimesPerDay: timesPerDay.value,
      finalTotal: total,
      breakdown: preferencesBreakdown,
      topContributors: preferencesBreakdown.slice(0, 10), // Топ-10 вкладчиков
    });
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

    // Сохраняем исходные значения названия и описания
    if (isHabits.value) {
      initialEntityName.value =
        customHabit.value?.name || catalogHabit.value?.name || '';
      initialEntityDescription.value =
        customHabit.value?.description ||
        catalogHabit.value?.description ||
        null;
    } else {
      initialEntityName.value =
        customTherapy.value?.name || catalogTherapy.value?.name || '';
      initialEntityDescription.value =
        customTherapy.value?.description ||
        catalogTherapy.value?.description ||
        null;
    }
    if (globalPrefs) {
      addressing.value = globalPrefs.addressing;
      tone.value = globalPrefs.tone;
    }

    const prefsUrl = isHabits.value
      ? `/api/notifications/prefs/habits?entityKey=${props.entityKey}`
      : `/api/notifications/prefs/therapy?entityKey=${props.entityKey}`;

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
        textSource.value = pref.meta?.textSource ?? 'templates';
      } else {
        textSource.value = pref.meta?.textSource ?? 'templates';
      }
    } else if (isCustomEntity.value) {
      customTexts.value = [''];
      textSource.value = 'templates';
    } else {
      textSource.value = 'templates';
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
  // Убрали проверку canSubmitCustomTexts - разрешаем сохранять настройки без текстов
  // Пользователь может добавить тексты позже
  loading.value = true;
  try {
    const { $api } = useNuxtApp();

    // Определяем изменения названия и описания
    let nameChanged = false;
    let descriptionChanged = false;
    let newName: string | undefined = undefined;
    let newDescription: string | null | undefined = undefined;

    if (canEditCustomEntity.value) {
      // Проверяем изменения названия
      if (isEditingTitle.value) {
        const nameDraft = titleDraft.value.trim();
        const currentName = isHabits.value
          ? customHabit.value?.name || ''
          : customTherapy.value?.name || '';

        if (nameDraft && nameDraft !== currentName) {
          newName = nameDraft;
          nameChanged = true;
        } else if (!nameDraft) {
          useToast(
            isHabits.value
              ? 'Введите название привычки'
              : 'Введите название темы'
          );
          loading.value = false;
          return;
        }
        isEditingTitle.value = false;
      }

      // Проверяем изменения описания
      if (isEditingSubtitle.value) {
        const descriptionDraft = subtitleDraft.value.trim();
        const currentDescription = isHabits.value
          ? customHabit.value?.description || null
          : customTherapy.value?.description || null;

        const descriptionDraftNormalized = descriptionDraft || null;
        if (descriptionDraftNormalized !== currentDescription) {
          newDescription = descriptionDraftNormalized;
          descriptionChanged = true;
        }
        isEditingSubtitle.value = false;
      }
    }

    // Сохраняем настройки уведомлений вместе с названием и описанием в одном запросе
    // При изменении названия/описания AI-тексты пересоздадутся автоматически
    // через prefs/[kind].put.ts, так как хеш конфигурации изменится
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

    const updateData: UpdateNotificationPreferencesDto = {
      ...baseData,
      entityKey: props.entityKey,
      ...(isHabits.value
        ? {
            subtype: isCustomHabit.value ? null : subtype.value,
            ...(isCustomHabit.value
              ? {
                  meta: {
                    // Для режима AI не отправляем customTexts (или отправляем пустой массив)

                    customTexts:
                      textSource.value === 'ai'
                        ? []
                        : normalizedCustomTexts.value,
                    textSource: textSource.value,
                  },
                }
              : {
                  meta: {
                    textSource: textSource.value,
                  },
                }),
          }
        : {
            ...(isCustomTherapy.value
              ? {
                  meta: {
                    // Для режима AI не отправляем customTexts (или отправляем пустой массив)

                    customTexts:
                      textSource.value === 'ai'
                        ? []
                        : normalizedCustomTexts.value,
                    textSource: textSource.value,
                  },
                }
              : {
                  meta: {
                    textSource: textSource.value,
                  },
                }),
          }),
      // Добавляем название и описание, если они изменены
      ...(nameChanged && newName !== undefined ? { name: newName } : {}),
      ...(descriptionChanged && newDescription !== undefined
        ? { description: newDescription }
        : {}),
    };

    const prefsUrl = isHabits.value
      ? '/api/notifications/prefs/habits'
      : '/api/notifications/prefs/therapy';

    const updated = await $api<NotificationPreferencesDto>(prefsUrl, {
      method: 'PUT',
      body: updateData,
    });

    notificationsStore.updateLocal(updated);

    // Обновляем локальные данные привычки/терапии, если изменились название/описание
    // ВАЖНО: Название и описание уже обновлены в БД через prefs/[kind].put.ts
    // Обновляем локальные данные напрямую, без дополнительных запросов
    if (nameChanged || descriptionChanged) {
      if (isHabits.value && customHabit.value) {
        // Обновляем локальные данные напрямую
        if (newName !== undefined) {
          customHabit.value.name = newName;
        }
        if (newDescription !== undefined) {
          customHabit.value.description = newDescription;
        }
        userHabitsStore.updateLocal(customHabit.value);
        initialEntityName.value = customHabit.value.name;
        initialEntityDescription.value = customHabit.value.description || null;
      } else if (!isHabits.value && customTherapy.value) {
        // Обновляем локальные данные напрямую
        if (newName !== undefined) {
          customTherapy.value.name = newName;
        }
        if (newDescription !== undefined) {
          customTherapy.value.description = newDescription;
        }
        therapyTopicsStore.updateLocal(customTherapy.value);
        initialEntityName.value = customTherapy.value.name;
        initialEntityDescription.value =
          customTherapy.value.description || null;
      }
    }

    // Формируем сообщение об успехе
    const successMessages = [];
    if (nameChanged) successMessages.push('название');
    if (descriptionChanged) successMessages.push('описание');
    if (nameChanged || descriptionChanged) {
      successMessages.push('настройки');
    } else {
      successMessages.push('настройки');
    }

    useToast('Сохранено', successMessages.join(', ') + ' успешно сохранены');

    // Обновляем исходные значения и сигнатуру состояния
    if (isHabits.value && customHabit.value) {
      initialEntityName.value = customHabit.value.name;
      initialEntityDescription.value = customHabit.value.description || null;
    } else if (!isHabits.value && customTherapy.value) {
      initialEntityName.value = customTherapy.value.name;
      initialEntityDescription.value = customTherapy.value.description || null;
    }

    initialStateSignature.value = computeStateSignature();
  } catch (err) {
    console.error('[Client] Failed to save preferences:', err);
    useToast('Ошибка при сохранении');
  } finally {
    loading.value = false;
  }
}

function goBack() {
  console.log('goBack');
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
</script>

<template>
  <div class="space-y-6 h-full overflow-y-auto rounded-sm pb-[100px]">
    <PageHeader :title="entityName" :show-back-button="true" @go-back="goBack">
      <template #custom>
        <div class="flex items-center gap-2 flex-1 overflow-hidden">
          <div class="flex flex-shrink-0 items-center justify-center text-2xl">
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
                  @keydown.esc.prevent="cancelTitleEdit"
                />
              </template>
              <template v-else>
                <h1
                  class="text-xl font-bold text-gray-900 dark:text-gray-100 w-full truncate"
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
      </template>
    </PageHeader>

    <div class="">
      <div v-if="isEditingSubtitle" class="space-y-2">
        <textarea
          ref="subtitleInputRef"
          v-model="subtitleDraft"
          rows="3"
          class="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900/60 dark:text-gray-100"
          placeholder="Добавьте описание"
          @keydown.esc.prevent="cancelSubtitleEdit"
        />
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

    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">{{ 'Уведомления' }}</h3>
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

        <div v-if="isHabits && !isCustomHabit" class="space-y-2">
          <label class="text-sm font-medium">Фокус уведомлений</label>
          <Combobox
            v-model="subtype"
            :options="subtypeOptions"
            placeholder="Выберите тип"
            class="max-w-[258px]"
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
          <label class="text-sm font-medium">Стиль уведомлений</label>
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

        <!-- Способ создания уведомлений  -->
        <div class="space-y-2 mb-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Способ создания
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                Выберите способ создания текстов уведомлений
              </p>
            </div>
          </div>

          <ToggleGroup
            v-model="textSource"
            type="single"
            class="inline-flex w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-1"
          >
            <ToggleGroupItem
              value="templates"
              class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
            >
              ✍️ Шаблоны
            </ToggleGroupItem>
            <ToggleGroupItem
              value="ai"
              class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
            >
              ✨ ИИ
            </ToggleGroupItem>
            <ToggleGroupItem
              value="hybrid"
              class="flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all data-[state=on]:bg-white data-[state=on]:shadow-sm data-[state=on]:text-blue-600 dark:data-[state=on]:bg-gray-700 dark:data-[state=on]:text-blue-400"
            >
              🔀 Гибридный
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <!-- Информационный блок про AI -->
        <div
          v-if="showAiInfo"
          class="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 p-4"
        >
          <div class="flex items-start gap-3">
            <span class="text-2xl">✨</span>
            <div class="flex-1">
              <p
                class="text-sm font-semibold text-purple-900 dark:text-purple-100"
              >
                Генерация через ИИ
              </p>
              <p class="text-xs text-purple-700 dark:text-purple-300 mt-1">
                <template v-if="textSource">
                  <template v-if="textSource === 'ai'">
                    Тексты уведомлений будут генерироваться ИИ с учетом всех
                    параметров настроек (фокус, стиль, обращение).
                  </template>
                  <template v-else-if="textSource === 'hybrid'">
                    Тексты уведомлений будут чередоваться: часть будет взята из
                    готовых шаблонов, часть создаст ИИ с учётом всех параметров
                    настроек.
                  </template>
                </template>
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="isCustomEntity && showCustomTextsSection"
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

        <div class="space-y-2">
          <NotificationPreview
            v-if="isHabits"
            :key="`habits-${previewKey}`"
            kind="habits"
            :addressing="addressing"
            :tone="tone"
            :directness="directness"
            :entity-key="entityKey"
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
            :entity-key="entityKey"
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
      </div>
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
