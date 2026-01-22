<template>
  <div class="space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-foreground mb-1">
      {{ label }}
    </label>

    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <slot name="trigger" :formatted-time="formattedTime">
          <Button
            variant="outline"
            class="w-full justify-start text-left font-normal border-primary-ui rounded-lg bg-transparent"
          >
            <IconClock class="mr-2 h-4 w-4 opacity-50" />
            {{ formattedTime }}
          </Button>
        </slot>
      </PopoverTrigger>

      <PopoverContent
        class="p-0 glass-deep z-[70] w-[var(--reka-popper-anchor-width)] min-w-[var(--reka-popper-anchor-width)] max-w-[var(--reka-popper-anchor-width)]"
        align="start"
        :portal="portalProps"
        :style="{
          width: 'var(--reka-popper-anchor-width)',
          minWidth: 'var(--reka-popper-anchor-width)',
          maxWidth: 'var(--reka-popper-anchor-width)',
        }"
      >
        <div class="flex items-center">
          <!-- Часы -->
          <div
            v-if="isTimeMode"
            class="flex flex-col items-center border-r border-border"
          >
            <!-- Кнопка вверх для часов (уменьшаем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-muted transition-colors"
              @click="decrementHours"
            >
              <IconChevronUp class="h-4 w-4" />
            </button>

            <!-- Список часов с нативным скроллом -->
            <div ref="hoursContainer" class="h-40 w-16">
              <ScrollArea
                class="h-full [&>div>div]:overflow-y-auto [&_[data-radix-scroll-area-scrollbar]]:hidden"
              >
                <div class="flex flex-col">
                  <button
                    v-for="hour in hoursList"
                    :key="`hour-${hour}`"
                    :data-hour="hour"
                    type="button"
                    :class="[
                      'flex h-10 w-full items-center justify-center text-sm transition-colors',
                      hour === hours
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : 'hover:bg-muted',
                    ]"
                    @click="
                      updateTime(hour, minutes);
                      scrollToValue('hours', hour);
                    "
                  >
                    {{ hour.toString().padStart(2, '0') }}
                  </button>
                </div>
              </ScrollArea>
            </div>

            <!-- Кнопка вниз для часов (увеличиваем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-muted transition-colors"
              @click="incrementHours"
            >
              <IconChevronDown class="h-4 w-4" />
            </button>
          </div>

          <!-- Минуты -->
          <div
            :class="['flex flex-col items-center', isTimeMode ? '' : 'w-full']"
          >
            <!-- Кнопка вверх для минут (уменьшаем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-muted transition-colors"
              @click="decrementMinutes"
            >
              <IconChevronUp class="h-4 w-4" />
            </button>

            <!-- Список минут с нативным скроллом -->
            <div
              ref="minutesContainer"
              :class="isTimeMode ? 'h-40 w-16' : 'h-44 w-full'"
            >
              <ScrollArea
                class="h-full [&>div>div]:overflow-y-auto [&_[data-radix-scroll-area-scrollbar]]:hidden"
              >
                <div class="flex flex-col">
                  <button
                    v-for="minute in minutesList"
                    :key="`minute-${minute}`"
                    :data-minute="minute"
                    type="button"
                    :class="[
                      'flex h-10 w-full items-center justify-center text-sm transition-colors',
                      minute === minutes
                        ? 'bg-primary font-semibold text-primary-foreground'
                        : isTimeMode
                          ? 'hover:bg-muted'
                          : 'text-white/80 hover:bg-white/10',
                    ]"
                    @click="
                      updateTime(hours, minute);
                      scrollToValue('minutes', minute);
                    "
                  >
                    {{ minute.toString().padStart(2, '0') }}
                  </button>
                </div>
              </ScrollArea>
            </div>

            <!-- Кнопка вниз для минут (увеличиваем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-muted transition-colors"
              @click="incrementMinutes"
            >
              <IconChevronDown class="h-4 w-4" />
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/ui/shadcn/popover';
import { ScrollArea } from '@/app/components/ui/shadcn/scroll-area';
import { Button } from '@/app/components/ui/button';
import IconChevronUp from '~icons/lucide/chevron-up';
import IconChevronDown from '~icons/lucide/chevron-down';
import IconClock from '~icons/lucide/clock';

type TimePickerMode = 'time' | 'minutes';

interface Props {
  modelValue: number; // Время в минутах от начала дня (time) или минутная длительность (minutes)
  label?: string;
  mode?: TimePickerMode;
  minuteMin?: number;
  minuteMax?: number;
  minuteStep?: number;
  portalTo?: string;
  portalDisabled?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Время',
  mode: 'time',
  minuteMin: 0,
  minuteMax: 55,
  minuteStep: 5,
  portalDisabled: false,
});

const emit = defineEmits<Emits>();

const isOpen = ref(false);

// Режим определяет один столбец (минуты) или два (часы+минуты).
const isTimeMode = computed(() => props.mode === 'time');
const portalProps = computed(() => {
  if (props.portalDisabled) {
    return { disabled: true };
  }
  if (props.portalTo) {
    return { to: props.portalTo };
  }
  return undefined;
});
// В режиме минут учитываем минутный минимум, чтобы поддержать "0 минут".
const effectiveMinuteMin = computed(() => props.minuteMin);
const effectiveMinuteMax = computed(() =>
  isTimeMode.value ? props.minuteMax : 60
);
const effectiveMinuteStep = computed(() =>
  isTimeMode.value ? props.minuteStep : 1
);

// Разделяем время на часы и минуты
const hours = computed(() =>
  isTimeMode.value ? Math.floor(props.modelValue / 60) : 0
);
const minutes = computed(() => {
  if (isTimeMode.value) {
    return props.modelValue % 60;
  }
  return clampNumber(
    props.modelValue,
    effectiveMinuteMin.value,
    effectiveMinuteMax.value
  );
});

// Форматируем время для отображения
const formattedTime = computed(() => {
  if (!isTimeMode.value) {
    return `${minutes.value} мин`;
  }
  const h = hours.value.toString().padStart(2, '0');
  const m = minutes.value.toString().padStart(2, '0');
  return `${h}:${m}`;
});

// Списки для выбора
const hoursList = Array.from({ length: 24 }, (_, i) => i);
const minutesList = computed(() => {
  const min = effectiveMinuteMin.value;
  const max = effectiveMinuteMax.value;
  const step = Math.max(1, effectiveMinuteStep.value);
  const size = Math.floor((max - min) / step) + 1;
  return Array.from({ length: size }, (_, index) => min + index * step);
});

// Обновление времени
function updateTime(newHours: number, newMinutes: number) {
  if (!isTimeMode.value) {
    emit(
      'update:modelValue',
      clampNumber(
        newMinutes,
        effectiveMinuteMin.value,
        effectiveMinuteMax.value
      )
    );
    return;
  }
  const totalMinutes = newHours * 60 + newMinutes;
  emit('update:modelValue', totalMinutes);
}

// Refs для контейнеров ScrollArea
const hoursContainer = ref<HTMLElement | null>(null);
const minutesContainer = ref<HTMLElement | null>(null);
let hoursViewport: HTMLElement | null = null;
let minutesViewport: HTMLElement | null = null;

// Находим viewport элементы после монтирования
function setupViewports() {
  if (hoursViewport) {
    hoursViewport.removeEventListener('scroll', handleHoursScroll);
  }
  if (minutesViewport) {
    minutesViewport.removeEventListener('scroll', handleMinutesScroll);
  }

  if (isTimeMode.value && hoursContainer.value) {
    hoursViewport = hoursContainer.value.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement;
    if (hoursViewport) {
      hoursViewport.addEventListener('scroll', handleHoursScroll, {
        passive: true,
      });
    }
  }

  if (minutesContainer.value) {
    minutesViewport = minutesContainer.value.querySelector(
      '[data-radix-scroll-area-viewport]'
    ) as HTMLElement;
    if (minutesViewport) {
      minutesViewport.addEventListener('scroll', handleMinutesScroll, {
        passive: true,
      });
    }
  }
}

// Функция для поиска центрального элемента
function getCenterElement(
  viewport: HTMLElement,
  selector: string
): HTMLElement | null {
  const rect = viewport.getBoundingClientRect();
  const centerY = rect.top + rect.height / 2;

  const elements = Array.from(
    viewport.querySelectorAll(selector)
  ) as HTMLElement[];
  let closestElement: HTMLElement | null = null;
  let closestDistance = Infinity;

  for (const el of elements) {
    const elRect = el.getBoundingClientRect();
    const elCenterY = elRect.top + elRect.height / 2;
    const distance = Math.abs(elCenterY - centerY);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestElement = el;
    }
  }

  return closestElement;
}

// Обновление значения на основе центрального элемента
let hoursScrollTimeout: ReturnType<typeof setTimeout> | null = null;
let minutesScrollTimeout: ReturnType<typeof setTimeout> | null = null;

function handleHoursScroll() {
  if (!isTimeMode.value) return;
  if (hoursScrollTimeout) {
    clearTimeout(hoursScrollTimeout);
  }

  hoursScrollTimeout = setTimeout(() => {
    if (!hoursViewport) return;

    const centerEl = getCenterElement(hoursViewport, '[data-hour]');
    if (!centerEl) return;

    const hour = Number(centerEl.getAttribute('data-hour'));
    if (hour !== hours.value) {
      updateTime(hour, minutes.value);
    }
  }, 150);
}

function handleMinutesScroll() {
  if (minutesScrollTimeout) {
    clearTimeout(minutesScrollTimeout);
  }

  minutesScrollTimeout = setTimeout(() => {
    if (!minutesViewport) return;

    const centerEl = getCenterElement(minutesViewport, '[data-minute]');
    if (!centerEl) return;

    const minute = Number(centerEl.getAttribute('data-minute'));
    if (minute !== minutes.value) {
      updateTime(hours.value, minute);
    }
  }, 150);
}

// Стрелка вверх - уменьшаем (14 → 13 → 12...)
function decrementHours() {
  if (!isTimeMode.value) return;
  const newHours = (hours.value - 1 + 24) % 24;
  scrollToValue('hours', newHours);
}

// Стрелка вниз - увеличиваем (12 → 13 → 14...)
function incrementHours() {
  if (!isTimeMode.value) return;
  const newHours = (hours.value + 1) % 24;
  scrollToValue('hours', newHours);
}

// Стрелка вверх - уменьшаем
function decrementMinutes() {
  const step = Math.max(1, effectiveMinuteStep.value);
  let newMinutes = minutes.value - step;

  if (!isTimeMode.value) {
    const safe = Math.max(effectiveMinuteMin.value, newMinutes);
    updateTime(0, safe);
    scrollToValue('minutes', safe);
    return;
  }

  let newHours = hours.value;
  if (newMinutes < 0) {
    newMinutes += 60;
    newHours = (newHours - 1 + 24) % 24;
  }
  scrollToValue('minutes', newMinutes);
  // Обновляем часы если нужно
  if (newHours !== hours.value) {
    updateTime(newHours, newMinutes);
  }
}

// Стрелка вниз - увеличиваем
function incrementMinutes() {
  const step = Math.max(1, effectiveMinuteStep.value);
  let newMinutes = minutes.value + step;

  if (!isTimeMode.value) {
    const safe = Math.min(effectiveMinuteMax.value, newMinutes);
    updateTime(0, safe);
    scrollToValue('minutes', safe);
    return;
  }

  let newHours = hours.value;
  if (newMinutes >= 60) {
    newMinutes -= 60;
    newHours = (newHours + 1) % 24;
  }
  scrollToValue('minutes', newMinutes);
  // Обновляем часы если нужно
  if (newHours !== hours.value) {
    updateTime(newHours, newMinutes);
  }
}

// Функция для скролла к значению
async function scrollToValue(type: 'hours' | 'minutes', value: number) {
  await nextTick();
  if (!isTimeMode.value && type === 'hours') return;
  const selector =
    type === 'hours' ? `[data-hour="${value}"]` : `[data-minute="${value}"]`;
  const container =
    type === 'hours' ? hoursContainer.value : minutesContainer.value;
  const element = container?.querySelector(selector) as HTMLElement | null;
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// Скролл к выбранному значению при открытии
watch(isOpen, async (open) => {
  if (open) {
    await nextTick();
    setupViewports();
    setTimeout(() => {
      // Скроллим к выбранным значениям
      const hourElement = isTimeMode.value
        ? (hoursContainer.value?.querySelector(
            `[data-hour="${hours.value}"]`
          ) as HTMLElement | null)
        : null;
      const minuteElement = minutesContainer.value?.querySelector(
        `[data-minute="${minutes.value}"]`
      ) as HTMLElement | null;

      hourElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      minuteElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }
});

function clampNumber(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.floor(safe)));
}

onUnmounted(() => {
  if (hoursViewport) {
    hoursViewport.removeEventListener('scroll', handleHoursScroll);
  }
  if (minutesViewport) {
    minutesViewport.removeEventListener('scroll', handleMinutesScroll);
  }
  if (hoursScrollTimeout) {
    clearTimeout(hoursScrollTimeout);
  }
  if (minutesScrollTimeout) {
    clearTimeout(minutesScrollTimeout);
  }
});
</script>
