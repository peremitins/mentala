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

interface Props {
  modelValue: number; // Время в минутах от начала дня (0-1439)
  label?: string;
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Время',
});

const emit = defineEmits<Emits>();

const isOpen = ref(false);

// Разделяем время на часы и минуты
const hours = computed(() => Math.floor(props.modelValue / 60));
const minutes = computed(() => props.modelValue % 60);

// Форматируем время для отображения
const formattedTime = computed(() => {
  const h = hours.value.toString().padStart(2, '0');
  const m = minutes.value.toString().padStart(2, '0');
  return `${h}:${m}`;
});

// Списки для выбора
const hoursList = Array.from({ length: 24 }, (_, i) => i);
const minutesList = Array.from({ length: 12 }, (_, i) => i * 5); // Шаг 5 минут

// Обновление времени
function updateTime(newHours: number, newMinutes: number) {
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

  if (hoursContainer.value) {
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
  const newHours = (hours.value - 1 + 24) % 24;
  scrollToValue('hours', newHours);
}

// Стрелка вниз - увеличиваем (12 → 13 → 14...)
function incrementHours() {
  const newHours = (hours.value + 1) % 24;
  scrollToValue('hours', newHours);
}

// Стрелка вверх - уменьшаем
function decrementMinutes() {
  let newMinutes = minutes.value - 5;
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
  let newMinutes = minutes.value + 5;
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
      const hourElement = hoursContainer.value?.querySelector(
        `[data-hour="${hours.value}"]`
      ) as HTMLElement | null;
      const minuteElement = minutesContainer.value?.querySelector(
        `[data-minute="${minutes.value}"]`
      ) as HTMLElement | null;

      hourElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      minuteElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);
  }
});

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

<template>
  <div class="space-y-1.5">
    <label
      v-if="label"
      class="text-sm font-medium text-gray-900 dark:text-gray-100"
    >
      {{ label }}
    </label>

    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <slot name="trigger" :formatted-time="formattedTime">
          <Button
            variant="outline"
            class="w-full justify-start text-left font-normal"
          >
            <IconClock class="mr-2 h-4 w-4 opacity-50" />
            {{ formattedTime }}
          </Button>
        </slot>
      </PopoverTrigger>

      <PopoverContent class="w-auto p-0" align="start">
        <div class="flex items-center">
          <!-- Часы -->
          <div
            class="flex flex-col items-center border-r border-gray-200 dark:border-gray-700"
          >
            <!-- Кнопка вверх для часов (уменьшаем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800"
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
                        ? 'bg-blue-500 font-semibold text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800',
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
              class="flex h-10 w-16 items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800"
              @click="incrementHours"
            >
              <IconChevronDown class="h-4 w-4" />
            </button>
          </div>

          <!-- Минуты -->
          <div class="flex flex-col items-center">
            <!-- Кнопка вверх для минут (уменьшаем) -->
            <button
              type="button"
              class="flex h-10 w-16 items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800"
              @click="decrementMinutes"
            >
              <IconChevronUp class="h-4 w-4" />
            </button>

            <!-- Список минут с нативным скроллом -->
            <div ref="minutesContainer" class="h-40 w-16">
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
                        ? 'bg-blue-500 font-semibold text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800',
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
              class="flex h-10 w-16 items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800"
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
