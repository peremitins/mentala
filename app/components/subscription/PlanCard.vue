<template>
  <div
    :class="[
      'rounded-lg border p-6 space-y-4 transition-all',
      isSelected
        ? 'border-primary bg-primary/5'
        : 'border-border bg-transparent hover:border-primary/50',
    ]"
  >
    <div class="flex items-start justify-between gap-2">
      <h3 class="text-lg font-semibold">{{ getPlanName() }}</h3>
      <div class="flex items-center gap-2">
        <span
          v-if="plan.name === 'basic' && props.trialActive"
          class="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-medium text-end"
        >
          Бесплатный пробный период
        </span>
        <span v-if="plan.name === 'premium'" class="text-xl">👑</span>
        <span
          v-if="plan.name === 'premium'"
          class="text-xs bg-primary/10 text-primary px-2 py-1 rounded"
        >
          Рекомендуем
        </span>
      </div>
    </div>

    <!-- Компактный переключатель месяц/год (только для платных тарифов) -->
    <div v-if="plan.name !== 'basic'" class="flex items-center gap-1.5">
      <button
        :class="[
          'px-2.5 py-1 text-xs rounded-md transition-colors border ',
          billingPeriod === 'month'
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent text-muted-foreground hover:bg-primary/10 border border-border',
        ]"
        @click.stop="handlePeriodChange('month')"
      >
        Месяц
      </button>
      <button
        :class="[
          'px-2.5 py-1 text-xs rounded-md transition-colors border ',
          billingPeriod === 'year'
            ? 'bg-primary text-primary-foreground'
            : 'bg-transparent text-muted-foreground hover:bg-primary/10 border border-border',
        ]"
        @click.stop="handlePeriodChange('year')"
      >
        Год
        <span class="text-green-400 ml-0.5">(-20%)</span>
      </button>
    </div>

    <div class="space-y-1">
      <p class="text-3xl font-bold">{{ getPrice() }} ₽</p>
      <p v-if="plan.name !== 'basic'" class="text-sm text-muted-foreground">
        {{ billingPeriod === 'year' ? 'в год' : 'в месяц' }}
      </p>
      <p v-else class="text-sm text-muted-foreground">бесплатно</p>
    </div>

    <ul class="space-y-2 text-sm">
      <li
        v-for="feature in getFeatures()"
        :key="feature"
        class="flex items-start gap-2"
      >
        <span class="text-primary mt-0.5">✓</span>
        <span>{{ feature }}</span>
      </li>
    </ul>

    <!-- Настройки Custom тарифа (внутри карточки) -->
    <div
      v-if="plan.isCustomConfigurable"
      class="space-y-4 pt-4 border-t border-border"
      @click.stop
    >
      <div>
        <label class="text-sm font-medium mb-2 block">
          Сколько минут в неделю?
        </label>
        <SliderRoot
          v-model="weeklyMinutesSlider"
          :min="10"
          :max="200"
          :step="10"
          class="relative flex w-full touch-none select-none items-center py-3"
          aria-label="Минут в неделю"
        >
          <SliderTrack
            class="relative h-2 w-full grow rounded-full bg-primary/20"
          >
            <SliderRange
              class="absolute h-full rounded-full bg-gradient-to-r from-primary to-primary"
            />
          </SliderTrack>
          <SliderThumb
            class="block h-5 w-5 rounded-full border-2 border-background/50 bg-primary shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </SliderRoot>
        <div class="flex justify-between text-xs text-muted-foreground mt-1">
          <span>10</span>
          <span class="font-medium"
            >{{ currentCustomConfig.weeklyMinutes }} минут</span
          >
          <span>200</span>
        </div>
      </div>

      <div
        v-if="customPrice"
        class="rounded-md bg-transparent p-3 text-center border border-border"
      >
        <p class="text-sm text-muted-foreground">Итоговая стоимость</p>
        <p class="text-2xl font-bold">
          {{ customPrice }} ₽ / {{ billingPeriod === 'year' ? 'год' : 'месяц' }}
        </p>
      </div>
    </div>

    <button
      :class="[
        'w-full rounded-md px-4 py-2 text-sm font-medium transition-colors',
        isCurrent
          ? 'bg-primary text-primary-foreground cursor-not-allowed opacity-75'
          : isSelected
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'bg-primary/10 text-primary hover:bg-primary/20',
      ]"
      :disabled="isCurrent"
      @click.stop="handleButtonClick"
    >
      {{ isCurrent ? 'Активный' : 'Выбрать' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from 'radix-vue';
import Checkbox from '@/app/components/ui/shadcn/checkbox/Checkbox.vue';

interface Plan {
  id: string;
  name: string;
  basePrice: number;
  weeklyMinutesLimit: number;
  isCustomConfigurable: boolean;
}

const props = defineProps<{
  plan: Plan;
  billingPeriod: 'month' | 'year';
  isSelected: boolean;
  isCurrent: boolean;
  trialActive?: boolean;
  weeklyMinutes?: number; // Для отображения в Custom настройках
  customPrice?: number | null; // Итоговая цена Custom тарифа
  customConfig?: {
    weeklyMinutes: number;
  }; // Конфигурация Custom тарифа
}>();

const emit = defineEmits<{
  select: [plan: Plan];
  'update:billingPeriod': [value: 'month' | 'year'];
  'confirm-change': [plan: Plan];
  'update:customConfig': [value: { weeklyMinutes: number }];
}>();

// Локальное состояние для Custom конфигурации, если не передано извне
const localCustomConfig = ref({
  weeklyMinutes: props.customConfig?.weeklyMinutes ?? 100,
});

// Используем переданный customConfig или локальное состояние
// Важно: используем computed для реактивности
const currentCustomConfig = computed(() => {
  if (props.customConfig) {
    return props.customConfig;
  }
  return localCustomConfig.value;
});

// Синхронизируем локальное состояние при изменении props
watch(
  () => props.customConfig,
  (newConfig) => {
    if (newConfig) {
      localCustomConfig.value = { ...newConfig };
    }
  },
  { immediate: true }
);

function handlePeriodChange(period: 'month' | 'year') {
  emit('update:billingPeriod', period);
}

function handleButtonClick() {
  if (!props.isCurrent) {
    emit('confirm-change', props.plan);
  }
}

function getPlanName() {
  if (props.plan.name === 'basic') return 'Basic';
  if (props.plan.name === 'pro') return 'PRO';
  if (props.plan.name === 'premium') return 'Premium';
  if (props.plan.name === 'custom') return 'Custom';
  return props.plan.name;
}

function getPrice() {
  if (props.plan.isCustomConfigurable) {
    // Для Custom показываем рассчитанную цену или "от 375"
    if (props.customPrice) {
      return props.customPrice.toLocaleString('ru-RU');
    }
    return 'от 375';
  }
  // Рассчитываем цену с учетом периода
  const price =
    props.billingPeriod === 'year'
      ? Math.round(props.plan.basePrice * 12 * 0.8) // Годовая цена со скидкой 20%
      : props.plan.basePrice; // Месячная цена
  return price.toLocaleString('ru-RU');
}

function getFeatures() {
  const features: string[] = [];

  if (props.plan.name === 'basic') {
    if (props.trialActive) {
      // Basic с Trial = Premium функционал
      // Используем формулировки как в известных приложениях (Spotify, Netflix)
      features.push('7 дней бесплатно');
      features.push('Полный доступ к Premium функционалу');
      features.push('AI-чат с искусственным интеллектом');
      features.push('100 минут в неделю');
    } else {
      // Basic без Trial
      features.push('Уведомления с шаблонами');
      features.push('Трекер привычек (базовый)');
    }
  } else if (props.plan.name === 'pro') {
    features.push('Неограниченный чат с ИИ');
    features.push('Напоминания и трекер привычек');
    features.push('Базовые отчёты и статистика');
    features.push('100 минут в неделю');
  } else if (props.plan.name === 'premium') {
    features.push('Всё из PRO');
    features.push('Расширенные рекомендации и аналитика');
    features.push('Приоритетная поддержка');
    features.push('100 минут в неделю');
  } else if (props.plan.name === 'custom') {
    features.push('Выберите количество минут в неделю (10–200)');
    features.push('Платите только за то, чем реально пользуетесь');
  }

  return features;
}

// Computed для SliderRoot (ожидает массив)
const weeklyMinutesSlider = computed({
  get: () => {
    return [currentCustomConfig.value.weeklyMinutes];
  },
  set: (value: number[]) => {
    if (value && value.length > 0 && value[0] !== undefined) {
      const newConfig = {
        weeklyMinutes: value[0],
      };

      // Всегда обновляем локальное состояние
      localCustomConfig.value = newConfig;
      // Всегда эмитим событие для синхронизации с родителем
      emit('update:customConfig', newConfig);
    }
  },
});
</script>
