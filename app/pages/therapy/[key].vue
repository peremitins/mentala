<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useToast } from '@/app/composables/useToast';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import NotificationPreview from '@/app/components/notifications/NotificationPreview.vue';
import OverloadBanner from '@/app/components/notifications/OverloadBanner.vue';
import WeekdaySelector from '@/app/components/WeekdaySelector.vue';
import TimeRangeSelector from '@/app/components/TimeRangeSelector.vue';
import TimePicker from '@/app/components/TimePicker.vue';
import { useTimeSlotControls } from '@/app/composables/useTimeSlotControls';
import { useNotificationsStore } from '@/app/stores/notifications';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack } from 'radix-vue';
import type {
  Directness,
  Addressing,
  Tone,
  NotificationPreferencesDto,
  UpdateNotificationPreferencesDto,
  UserPreferencesDto,
} from '@/shared/dto/notifications';

const route = useRoute();
const topicKey = route.params.key as string;

// Находим тему по ключу
const topic = THERAPY_TOPICS.find((t: { key: string }) => t.key === topicKey);

if (!topic) {
  throw createError({
    statusCode: 404,
    message: 'Тема поддержки не найдена',
  });
}

// Цветовая схема
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

const bgColor = colorSchemes[topic.color];

// Store для подсчета общего количества уведомлений
const notificationsStore = useNotificationsStore();

// Локальные настройки (для therapy)
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
const timezone = ref('Europe/Moscow');
const activeDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6]); // Все дни по умолчанию
const timeRange = ref({ start: 540, end: 1350 }); // 09:00-22:30 по умолчанию
const customSlotTimes = ref<(number | null)[]>([]);
const loading = ref(false);

// Глобальные настройки (для превью)
const addressing = ref<Addressing>('informal');
const tone = ref<Tone>('neutral');

const {
  slots: slotControls,
  hasCustomTimes,
  setManualTime,
  resetAllSlotTimes,
} = useTimeSlotControls(timesPerDay, timeRange, customSlotTimes);

// Параметры для UI
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

// Авто-превью при изменении настроек
const previewKey = computed(
  () => `${addressing.value}-${tone.value}-${directness.value}-${topicKey}`
);

// Реактивное вычисление totalPerDay с учетом текущих изменений (до сохранения)
const currentTotalPerDay = computed(() => {
  // Фильтруем preferences: исключаем текущую тему и считаем остальные включенные
  const otherPreferences = notificationsStore.preferences.filter((p) => {
    // Пропускаем выключенные
    if (!p.enabled) return false;

    // Игнорируем legacy данные
    // Для therapy: должен быть topicKey
    if (p.kind === 'therapy' && !p.topicKey) return false;
    // Для habits: должен быть habitId
    if (p.kind === 'habits' && !p.habitId) return false;

    // Исключаем текущую тему (therapy с данным topicKey)
    if (p.kind === 'therapy' && p.topicKey === topicKey) return false;

    return true;
  });

  // Считаем сумму уведомлений от других тем/привычек
  let total = otherPreferences.reduce((sum, p) => sum + p.timesPerDay, 0);

  // Добавляем текущее значение слайдера ТОЛЬКО если уведомления включены
  if (enabled.value) {
    total += timesPerDay.value;
  }

  return total;
});

// Загрузка настроек
onMounted(async () => {
  try {
    const { $api } = useNuxtApp();

    // Загружаем все preferences для подсчета totalPerDay
    await notificationsStore.fetchAll();

    // Загружаем глобальные настройки
    const globalPrefs = await $api<UserPreferencesDto>(
      '/api/settings/preferences'
    );
    if (globalPrefs) {
      addressing.value = globalPrefs.addressing;
      tone.value = globalPrefs.tone;
    }

    // Загружаем локальные настройки для этой темы
    const pref = await $api<NotificationPreferencesDto | null>(
      `/api/notifications/prefs/therapy?topicKey=${topicKey}`
    );

    if (pref) {
      enabled.value = pref.enabled;
      timesPerDay.value = pref.timesPerDay;
      directness.value = pref.directness;
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
    const hasManualSlots = customSlotTimes.value.some(
      (value) => value !== null
    );

    const updateData: UpdateNotificationPreferencesDto = {
      topicKey,
      enabled: enabled.value,
      timesPerDay: timesPerDay.value,
      directness: directness.value,
      timezone: timezone.value,
      activeDays: activeDays.value,
      timeRangeStart: timeRange.value.start,
      timeRangeEnd: timeRange.value.end,
      customSlotTimes: hasManualSlots ? customSlotTimes.value : null,
    };

    const { $api } = useNuxtApp();
    const updated = await $api<NotificationPreferencesDto>(
      '/api/notifications/prefs/therapy',
      {
        method: 'PUT',
        body: updateData,
      }
    );

    // Обновляем store для моментального пересчета totalPerDay
    notificationsStore.updateLocal(updated);

    useToast('Настройки сохранены', 'success');
    // Остаёмся на текущей странице
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
      body: { kind: 'therapy' },
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
  navigateTo('/therapy');
}
</script>

<template>
  <div class="glass-deep px-2 space-y-6 h-full overflow-y-auto">
    <!-- Шапка с кнопкой назад -->
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
          :class="bgColor"
        >
          {{ topic.emoji }}
        </div>

        <div class="flex-1 min-w-0">
          <h1
            class="text-xl font-bold text-gray-900 dark:text-gray-100 truncate"
          >
            {{ topic.name }}
          </h1>
          <p class="text-xs text-gray-600 dark:text-gray-400">
            Настройка уведомлений
          </p>
        </div>
      </div>
    </div>

    <div class="px-2 space-y-6">
      <!-- Toggle уведомлений -->
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold">Уведомления: Поддержка</h3>
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
        {{ topic.description }}
      </p>

      <div class="space-y-4">
        <!-- Выбор дней недели -->
        <WeekdaySelector v-model="activeDays" />

        <!-- Выбор временного диапазона -->
        <TimeRangeSelector v-model="timeRange" />

        <!-- Частота -->
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
            <div class="flex justify-between gap-2">
              <template v-for="slot in slotControls" :key="slot.index">
                <div v-if="slot.isActive" class="w-[32px]">
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
                  class="flex w-[32px] flex-col items-center gap-1 text-[11px] font-medium text-gray-500 opacity-50"
                >
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-400 text-sm"
                  >
                    {{ slot.number }}
                  </span>
                  <span
                    class="min-w-[62px] text-center leading-tight whitespace-nowrap"
                  >
                    Пусто
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

        <!-- Баннер рекомендаций -->
        <OverloadBanner :total-per-day="currentTotalPerDay" />

        <!-- Стиль подачи (directness) -->
        <div class="space-y-2">
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
              <span class="text-xs text-gray-600 dark:text-gray-400">{{
                option.description
              }}</span>
            </button>
          </div>
        </div>

        <!-- Превью уведомления -->
        <div class="space-y-2">
          <NotificationPreview
            :key="previewKey"
            kind="therapy"
            :addressing="addressing"
            :tone="tone"
            :directness="directness"
            :topic-key="topicKey"
          />
        </div>
      </div>

      <!-- Кнопки действий -->
      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="rounded-xl bg-gradient-to-r px-4 py-3 text-sm font-semibold text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
          :class="bgColor"
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
