<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg">
    <PageHeader :title="entityName" :show-back-button="true" @go-back="goBack">
      <template #custom>
        <div class="flex items-center gap-2 flex-1 overflow-hidden">
          <div class="flex flex-shrink-0 items-center justify-center text-2xl">
            {{ entityEmoji }}
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <div ref="titleInputContainerRef" class="flex items-center gap-2">
              <template v-if="isEditingTitle">
                <Input
                  ref="titleInputRef"
                  v-model="titleDraft"
                  type="text"
                  class="flex-1 h-8"
                  :maxlength="120"
                  :show-clear-button="true"
                  @keydown.esc.prevent="finishTitleEdit"
                />
              </template>
              <template v-else>
                <h1 class="text-xl font-bold text-foreground w-full truncate">
                  {{ entityName }}
                </h1>
                <button
                  v-if="canEditCustomEntity"
                  type="button"
                  class="text-foreground hover:text-foreground transition"
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

    <div class="space-y-3 pb-[120px] animate-fade-in">
      <!-- Карточка описания -->
      <section class="glass-deep p-3 space-y-3">
        <p class="text-sm font-semibold">Описание</p>
        <div
          ref="subtitleInputContainerRef"
          v-if="isEditingSubtitle"
          class="space-y-2 rounded-2xl border border-white/10 bg-background/20 p-2"
        >
          <TextareaResize
            ref="subtitleInputRef"
            v-model="subtitleDraft"
            variant="form"
            :placeholder="descriptionPlaceholder"
            @esc-pressed="finishSubtitleEdit"
          />
        </div>
        <div
          v-else
          class="flex items-start gap-3 rounded-2xl border border-white/10 bg-background/20 px-3 py-2"
        >
          <p
            class="text-sm text-foreground/90 flex-1 border-2 border-transparent leading-relaxed"
            v-html="descriptionText"
          />
          <button
            v-if="canEditCustomEntity"
            type="button"
            class="text-foreground hover:text-foreground transition mt-1"
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
      </section>

      <!-- Карточка расписания уведомлений -->
      <section class="glass-deep p-3 space-y-4">
        <div class="flex items-center justify-between">
          <div class="space-y-1">
            <h3 class="text-sm font-semibold">
              {{ 'Уведомления' }}
              <span class="text-xs font-normal">
                ({{ enabled ? 'включены' : 'выключены' }})
              </span>
            </h3>
            <p class="text-xs text-foreground">Дни, время и частота отправки</p>
          </div>
          <Switch
            v-model:checked="enabled"
            :loading="loading"
          />
        </div>

        <div class="space-y-4">
          <div class="rounded-2xl border border-white/10 bg-background/20 p-3">
            <WeekdaySelector v-model="activeDays" />
          </div>
          <div class="rounded-2xl border border-white/10 bg-background/20 p-3">
            <TimeRangeSelector v-model="timeRange" />
          </div>

          <div
            class="rounded-2xl border border-white/10 bg-background/20 p-3 space-y-2"
          >
            <label class="text-sm font-medium text-foreground/90">
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
                  class="relative h-2 w-full grow rounded-full bg-primary-ui/20"
                >
                  <SliderRange
                    class="absolute h-full rounded-full bg-gradient-to-r from-primary-ui to-primary-ui"
                  />
                </SliderTrack>
                <SliderThumb
                  class="block h-5 w-5 rounded-full border-2 border-primary-ui/10 bg-primary-ui shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ui focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
                              'flex h-8 w-8 items-center justify-center rounded-full border text-sm transition-all',
                              slot.isManual
                                ? 'border-primary-ui  text-surface-raised-foreground hover:opacity-75'
                                : 'border-border  text-surface-inactive-foreground hover:border-primary-ui hover:text-surface-raised-foreground',
                            ]"
                          >
                            {{ slot.number }}
                          </span>
                          <span
                            :class="[
                              'text-center leading-tight text-[10px]',
                              slot.isManual
                                ? 'text-surface-raised-foreground'
                                : 'text-surface-inactive-foreground',
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
                    class="flex flex-col items-center gap-1 text-[10px] font-medium text-foreground opacity-50 w-[32px] flex-shrink-0"
                  >
                    <span
                      class="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border text-sm"
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
                class="flex items-center justify-between text-[11px] text-foreground"
              >
                <span>
                  Точное время уведомлений: по умолчанию равномерно, но можно
                  задать своё.
                </span>
                <button
                  v-if="hasCustomTimes"
                  type="button"
                  class="text-primary-ui"
                  @click="resetAllSlotTimes"
                >
                  Сбросить
                </button>
              </div>
            </div>
          </div>

          <OverloadBanner :total-per-day="currentTotalPerDay" />
        </div>
      </section>

      <!-- Карточка контента уведомлений -->
      <section class="space-y-3">
        <div class="glass-deep p-3">
          <div class="space-y-2 mb-2">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-foreground">
                  Фокус уведомлений
                </p>
                <!-- <p class="text-xs text-foreground">
                  Выберите фокус и тип уведомлений
                </p> -->
              </div>
            </div>

            <ToggleGroup
              :model-value="subtype || ''"
              type="single"
              class="inline-flex w-full gap-2 overflow-auto"
              @update:model-value="
                (value) => {
                  if (value && typeof value === 'string')
                    subtype = value as NotificationSubtype;
                }
              "
            >
              <ToggleGroupItem
                v-for="option in subtypeOptions"
                :key="option.value"
                :value="option.value"
                class="flex-1 rounded-lg px-2 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
              >
                {{ option.icon }}&nbsp;{{ option.label }}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <!-- Информационный блок про фокус уведомлений -->
          <div
            v-if="selectedSubtypeOption"
            class="rounded-2xl border bg-muted/60 border-border/60 px-3 py-2"
          >
            <div class="flex items-baseline gap-2">
              <span class="">{{ selectedSubtypeOption.icon }}</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-foreground">
                  {{ selectedSubtypeOption.label }}
                </p>
                <p class="text-xs text-foreground mt-1">
                  {{ selectedSubtypeOption.description }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Стиль уведомлений -->
        <div class="glass-deep p-3">
          <div class="space-y-2 mb-2">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-foreground">
                  Стиль уведомлений
                </p>
                <!-- <p class="text-xs text-foreground">
                  Выберите стиль общения в уведомлениях
                </p> -->
              </div>
            </div>

            <ToggleGroup
              :model-value="directness"
              type="single"
              class="inline-flex w-full gap-2 overflow-auto"
              @update:model-value="
                (value) => {
                  if (value && typeof value === 'string')
                    directness = value as Directness;
                }
              "
            >
              <ToggleGroupItem
                v-for="option in DIRECTNESS_OPTIONS"
                :key="option.value"
                :value="option.value"
                class="flex-1 rounded-lg px-2 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
              >
                {{ option.icon }} {{ option.label }}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <!-- Информационный блок про стиль уведомлений -->
          <div
            v-if="selectedDirectnessOption"
            class="rounded-2xl border bg-muted/60 border-border/60 px-3 py-2"
          >
            <div class="flex items-baseline gap-2">
              <span class="">💬</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-foreground">
                  {{ selectedDirectnessOption.label }}
                </p>
                <p class="text-xs text-foreground mt-1">
                  {{ selectedDirectnessOption.description }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Способ создания уведомлений  -->
        <div class="glass-deep p-3">
          <div class="space-y-2 mb-2">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-semibold text-foreground">
                  Способ создания
                </p>
                <!-- <p class="text-xs text-foreground">
                  Выберите способ создания текстов уведомлений
                </p> -->
              </div>
            </div>

            <ToggleGroup
              v-model="textSource"
              type="single"
              class="inline-flex w-full gap-2 overflow-auto"
            >
              <ToggleGroupItem
                value="templates"
                class="flex-1 rounded-lg px-3 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
              >
                ✍️ Шаблоны
              </ToggleGroupItem>
              <ToggleGroupItem
                value="ai"
                class="flex-1 rounded-lg px-3 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
              >
                ✨ ИИ
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <!-- Информационный блок для Шаблонов -->
          <div
            v-if="textSource === 'templates'"
            class="rounded-2xl border bg-muted/60 border-border/60 px-3 py-2"
          >
            <div class="flex items-baseline gap-2">
              <span class="">✍️</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-foreground">
                  Использование шаблонов
                </p>
                <p class="text-xs text-foreground mt-1">
                  Тексты уведомлений будут браться из готовых шаблонов с учетом
                  всех параметров настроек (фокус, стиль, обращение).
                </p>
              </div>
            </div>
          </div>

          <!-- Информационный блок для ИИ -->
          <div
            v-if="textSource === 'ai'"
            class="rounded-2xl border bg-muted/60 border-border/60 px-3 py-2"
          >
            <div class="flex items-baseline gap-2">
              <span class="">✨</span>
              <div class="flex-1">
                <p class="text-sm font-semibold text-foreground">
                  Генерация через ИИ
                </p>
                <p class="text-xs text-foreground mt-1">
                  Тексты уведомлений будут генерироваться ИИ с учетом всех
                  параметров настроек (фокус, стиль, обращение).
                </p>
              </div>
            </div>
          </div>

          <!-- Блок управления текстами -->
          <div
            v-if="textSource === 'templates'"
            class="rounded-2xl border border-white/10 bg-background/20 p-3 mt-2"
          >
            <button
              type="button"
              class="btn btn-outline w-full"
              @click="goToTextsEditor"
            >
              🔧 Управлять текстами уведомлений
            </button>
          </div>
        </div>
      </section>

      <!-- Карточка сохранения -->
      <section class="glass-deep p-3">
        <button
          type="button"
          class="rounded-lg px-4 py-3 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 w-full"
          :disabled="isSaveDisabled"
          @click="saveSettings"
        >
          {{ loading ? 'Сохранение...' : 'Сохранить' }}
        </button>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';
import { useToast } from '@/app/composables/useToast';
import OverloadBanner from '@/app/components/notifications/OverloadBanner.vue';
import Combobox from '@/app/components/Combobox.vue';
import WeekdaySelector from '@/app/components/WeekdaySelector.vue';
import TimeRangeSelector from '@/app/components/TimeRangeSelector.vue';
import TimePicker from '@/app/components/TimePicker.vue';
import { useTimeSlotControls } from '@/app/composables/useTimeSlotControls';
import {
  SUBTYPE_OPTIONS,
  SUBTYPE_OPTIONS_BUILD,
  SUBTYPE_OPTIONS_QUIT,
  TEXT_SOURCE_OPTIONS,
  DIRECTNESS_OPTIONS,
} from '@/app/constants/select-options';
import ToggleGroup from '@/app/components/ui/toggle-group/ToggleGroup.vue';
import ToggleGroupItem from '@/app/components/ui/toggle-group/ToggleGroupItem.vue';
import { Input } from '@/app/components/ui/shadcn/input';
import InputComponent from '@/app/components/ui/shadcn/input/Input.vue';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { Switch } from '@/app/components/ui/shadcn/switch';
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
  NotificationSubtype,
  NotificationPreferencesDto,
  Tone,
  UpdateNotificationPreferencesDto,
  UserPreferencesDto,
} from '@/shared/dto/notifications';
import { MAX_NOTIFICATION_TEXT_LENGTH } from '@/shared/dto/notifications';

const props = defineProps<{
  mentaiMode: 'habits' | 'therapy';
  entityKey: string;
}>();

const route = useRoute();
const router = useRouter();

// Навигация к редактору текстов с передачей фильтров
function goToTextsEditor() {
  const query: Record<string, string> = {};

  // Передаем subtype, если он выбран
  if (subtype.value) {
    query.subtype = subtype.value;
  }

  // Передаем directness, если он не равен дефолтному
  if (directness.value && directness.value !== 'moderate') {
    query.directness = directness.value;
  }

  router.push({
    path: `/notifications/${props.mentaiMode}/${props.entityKey}/texts`,
    query,
  });
}

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
const entityName = computed(() => {
  // При редактировании показываем значение из titleDraft
  if (isEditingTitle.value && titleDraft.value) {
    return titleDraft.value.trim();
  }

  // Иначе используем сохраненное значение из сущности
  return isHabits.value
    ? (habitEntity.value?.name ?? 'Привычка')
    : (therapyEntity.value?.name ?? 'Тема поддержки');
});
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
const subtype = ref<NotificationSubtype>('mixed');
const timezone = ref('Europe/Moscow');
const activeDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6]);
const timeRange = ref({ start: 540, end: 1350 });
const customSlotTimes = ref<(number | null)[]>([]);
const loading = ref(false);
const addressing = ref<Addressing>('informal');
const tone = ref<Tone>('neutral');
const textSource = ref<'templates' | 'ai'>('templates');

// Условное отображение информационного блока про AI
const showAiInfo = computed(() => {
  const source = textSource.value;
  return source === 'ai';
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
const titleInputRef = ref<InstanceType<typeof InputComponent> | null>(null);
const titleInputContainerRef = ref<HTMLElement | null>(null);
const subtitleInputRef = ref<InstanceType<typeof TextareaResize> | null>(null);
const subtitleInputContainerRef = ref<HTMLElement | null>(null);
const inlineTitleLoading = ref(false);
const inlineSubtitleLoading = ref(false);

const {
  slots: slotControls,
  hasCustomTimes,
  setManualTime,
  resetAllSlotTimes,
} = useTimeSlotControls(timesPerDay, timeRange, customSlotTimes);

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

function finishTitleEdit() {
  // Сохраняем введенное значение в реальную сущность для отображения
  // Это позволяет показывать обновленное имя даже после выхода из режима редактирования
  const trimmedName = titleDraft.value.trim();
  if (trimmedName && canEditCustomEntity.value) {
    const target = isHabits.value ? customHabit.value : customTherapy.value;
    if (target) {
      target.name = trimmedName;
    }
  }
  // Выходим из режима редактирования
  isEditingTitle.value = false;
}

// Обработка клика вне инпута при редактировании заголовка
onClickOutside(titleInputContainerRef, () => {
  if (isEditingTitle.value) {
    finishTitleEdit();
  }
});

// Обработка клика вне textarea при редактировании описания
onClickOutside(subtitleInputContainerRef, () => {
  if (isEditingSubtitle.value) {
    finishSubtitleEdit();
  }
});

function startEditSubtitle() {
  if (!canEditCustomEntity.value) return;
  const target = isHabits.value ? customHabit.value : customTherapy.value;
  if (!target) return;
  // Инициализируем с текущим описанием или пустой строкой (не null)
  subtitleDraft.value = target.description || '';
  isEditingSubtitle.value = true;
  nextTick(() => {
    subtitleInputRef.value?.textarea?.focus();
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

function finishSubtitleEdit() {
  // Сохраняем введенное значение в реальную сущность для отображения
  // Это позволяет показывать обновленное описание даже после выхода из режима редактирования
  const trimmedDescription =
    (subtitleDraft.value != null ? String(subtitleDraft.value).trim() : null) ||
    null;
  if (canEditCustomEntity.value) {
    const target = isHabits.value ? customHabit.value : customTherapy.value;
    if (target) {
      target.description = trimmedDescription;
    }
  }
  // Выходим из режима редактирования
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
    ? (subtitleDraft.value != null
        ? String(subtitleDraft.value).trim()
        : null) || null
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
    subtype: subtype.value ?? null,
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
  // Разрешаем сохранять настройки без текстов
  // Пользователь может добавить тексты позже через редактор текстов
);

// Описания стилей для разных фокусов уведомлений
const directnessOptions = computed(() => {
  const baseOptions = [
    {
      value: 'soft' as Directness,
      label: 'Мягкий',
    },
    {
      value: 'moderate' as Directness,
      label: 'Сдержанный',
    },
    {
      value: 'hard' as Directness,
      label: 'Жесткий',
    },
  ];

  // Определяем описание в зависимости от фокуса уведомлений
  let descriptions: Record<Directness, string> = {
    soft: 'Тёплый, мягкий стиль без давления',
    moderate: 'Корректные, нейтральные формулировки без лишних эмоций',
    hard: 'Прямые, настойчивые сообщения для тех, кому важен чёткий фокус',
  };

  // Если это привычки и выбран фокус, используем специфичные описания
  if (isHabits.value && subtype.value) {
    switch (subtype.value) {
      case 'informational':
        // Разные описания для quit и build привычек
        if (resolvedIntentForFilters.value === 'quit') {
          descriptions = {
            soft: 'Факты о влиянии на самочувствие и качество жизни, без упоминания тяжелых последствий',
            moderate:
              'Честные медицинские факты о механизмах вреда, без драматизации',
            hard: 'Прямые факты о серьезных последствиях, включая статистику смертности',
          };
        } else {
          // build привычки - только позитивные факты
          descriptions = {
            soft: 'Позитивные факты о пользе, акцент на чувствах и ощущениях',
            moderate: 'Фактические данные о пользе с научными доказательствами',
            hard: 'Прямые факты о конкретных выгодах и улучшениях здоровья',
          };
        }
        break;
      case 'motivational':
        descriptions = {
          soft: 'Теплые, мягкие слова поддержки и ободрения',
          moderate: 'Нейтральные, сдержанные фразы поддержки',
          hard: 'Прямые, решительные слова мотивации',
        };
        break;
      case 'reminder':
        descriptions = {
          soft: 'Мягкие, ненавязчивые напоминания',
          moderate: 'Нейтральные, фактические напоминания',
          hard: 'Прямые, категоричные напоминания',
        };
        break;
      case 'mixed':
        descriptions = {
          soft: 'Мягкий, деликатный тон в сочетании разных типов уведомлений',
          moderate:
            'Сдержанный, нейтральный тон в сочетании разных типов уведомлений',
          hard: 'Прямой, решительный тон в сочетании разных типов уведомлений',
        };
        break;
    }
  }

  return baseOptions.map((opt) => ({
    ...opt,
    description: descriptions[opt.value],
  }));
});

const subtypeOptions = computed(() => {
  // Для терапии - все опции
  if (!isHabits.value) return SUBTYPE_OPTIONS;

  // Для привычек - фильтруем по intent
  const intent = resolvedIntentForFilters.value ?? 'build';
  return intent === 'quit' ? SUBTYPE_OPTIONS_QUIT : SUBTYPE_OPTIONS_BUILD;
});

const selectedDirectnessOption = computed(() =>
  directnessOptions.value.find((opt) => opt.value === directness.value)
);

const selectedSubtypeOption = computed(() => {
  if (!subtype.value) return null;
  return subtypeOptions.value.find((opt) => opt.value === subtype.value);
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
      tone.value =
        globalPrefs.tone === 'unknown' ? 'neutral' : globalPrefs.tone;
    }

    const prefsUrl = isHabits.value
      ? `/api/notifications/prefs/habits?entityKey=${props.entityKey}`
      : `/api/notifications/prefs/therapy?entityKey=${props.entityKey}`;

    const pref = await $api<NotificationPreferencesDto | null>(prefsUrl);

    if (pref) {
      enabled.value = pref.enabled;
      timesPerDay.value = pref.timesPerDay;
      directness.value = pref.directness;
      subtype.value = pref.subtype ?? 'mixed'; // Загружаем subtype для всех типов
      timezone.value = pref.timezone;
      activeDays.value = pref.activeDays ?? [0, 1, 2, 3, 4, 5, 6];
      timeRange.value = {
        start: pref.timeRangeStart,
        end: pref.timeRangeEnd,
      };
      customSlotTimes.value = pref.customSlotTimes ?? [];
      textSource.value = pref.meta?.textSource === 'ai' ? 'ai' : 'templates';
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
  // Разрешаем сохранять настройки без текстов
  // Пользователь может добавить тексты позже через редактор текстов
  loading.value = true;
  try {
    const { $api } = useNuxtApp();

    // Определяем изменения названия и описания
    let nameChanged = false;
    let descriptionChanged = false;
    let newName: string | undefined = undefined;
    let newDescription: string | null | undefined = undefined;

    if (canEditCustomEntity.value) {
      const target = isHabits.value ? customHabit.value : customTherapy.value;

      // Проверяем изменения названия
      // Проверяем независимо от того, активно ли редактирование,
      // так как пользователь мог выйти из режима редактирования через ESC или клик вне
      if (target) {
        // Получаем текущее значение из titleDraft (если было редактирование)
        // или из самой сущности (если редактирование уже завершено и значение обновлено)
        const currentNameFromDraft = titleDraft.value?.trim() || '';
        const currentNameFromEntity = target.name || '';

        // Используем значение из draft, если оно есть и не пустое, иначе из сущности
        const nameToCheck = currentNameFromDraft || currentNameFromEntity;

        // Сравниваем с исходным значением при загрузке страницы
        const originalName = initialEntityName.value || '';

        // Проверяем, изменилось ли название по сравнению с исходным
        if (nameToCheck && nameToCheck !== originalName) {
          newName = nameToCheck;
          nameChanged = true;
          // Обновляем локальное значение для отображения
          target.name = nameToCheck;
        } else if (!nameToCheck) {
          // Если поле пустое - показываем ошибку
          useToast(
            isHabits.value
              ? 'Введите название привычки'
              : 'Введите название темы'
          );
          loading.value = false;
          return;
        }
      }

      // Выходим из режима редактирования после проверки
      if (isEditingTitle.value) {
        isEditingTitle.value = false;
      }

      // Проверяем изменения описания
      // Проверяем независимо от того, активно ли редактирование,
      // так как пользователь мог выйти из режима редактирования через ESC или клик вне
      if (target) {
        // Получаем текущее значение из subtitleDraft (если было редактирование)
        // или из самой сущности (если редактирование уже завершено и значение обновлено)
        const descriptionFromDraft =
          (subtitleDraft.value != null
            ? String(subtitleDraft.value).trim()
            : null) || null;
        const descriptionFromEntity = target.description || null;

        // Используем значение из draft, если оно есть, иначе из сущности
        const descriptionToCheck =
          descriptionFromDraft ?? descriptionFromEntity;

        // Сравниваем с исходным значением при загрузке страницы
        const originalDescription = initialEntityDescription.value;

        // Проверяем, изменилось ли описание по сравнению с исходным
        if (descriptionToCheck !== originalDescription) {
          newDescription = descriptionToCheck;
          descriptionChanged = true;
          // Убеждаемся, что локальное значение обновлено
          if (target.description !== descriptionToCheck) {
            target.description = descriptionToCheck;
          }
        }
      }

      // Выходим из режима редактирования после проверки
      if (isEditingSubtitle.value) {
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

    // Упрощенная логика: все настройки сохраняются одинаково для всех типов
    const isCustomEntity = isHabits.value
      ? isCustomHabit.value
      : isCustomTherapy.value;

    const updateData: UpdateNotificationPreferencesDto = {
      ...baseData,
      entityKey: props.entityKey,
      subtype: subtype.value, // Всегда сохраняем subtype для всех типов
      meta: {
        textSource: textSource.value,
      },
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
  if (isHabits.value) {
    navigateTo(`/habits/${props.entityKey}`);
  } else {
    navigateTo(`/therapy/${props.entityKey}`);
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
