<template>
  <div
    :class="[
      'rounded-lg glass-deep p-4 space-y-4 transition-all',
      isSelected
        ? '!border-primary !bg-primary/5'
        : 'border-border bg-transparent hover:border-primary-ui/50',
    ]"
  >
    <div class="flex items-start justify-between gap-2">
      <h3 class="text-lg font-semibold">
        {{ getPlanName() }}
        {{ plan.name === 'premium' ? '💎' : plan.name === 'pro' ? '⭐' : '' }}
      </h3>
      <div class="flex items-center gap-2">
        <span
          v-if="plan.name === 'basic' && props.trialActive"
          class="text-xs bg-primary-ui/10 text-primary-ui px-2 py-1 rounded font-medium text-end"
        >
          Бесплатный пробный период
        </span>
        <span
          v-if="plan.name === 'premium'"
          class="text-xs bg-primary-ui/10 text-primary-ui px-2 py-1 rounded"
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
            : 'bg-transparent text-foreground hover:bg-primary/10 border border-border',
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
            : 'bg-transparent text-foreground hover:bg-primary/10 border border-border',
        ]"
        @click.stop="handlePeriodChange('year')"
      >
        Год
        <span class="text-green-400 ml-0.5">(-20%)</span>
      </button>
    </div>

    <div class="space-y-1">
      <p class="text-3xl font-bold">{{ getPrice() }} ₽</p>
      <p v-if="plan.name !== 'basic'" class="text-sm text-foreground">
        {{ billingPeriod === 'year' ? 'в год' : 'в месяц' }}
      </p>
      <p v-else class="text-sm text-foreground">бесплатно</p>
    </div>

    <ul class="space-y-2 text-sm">
      <li
        v-for="feature in getFeatures()"
        :key="feature.label"
        class="flex items-start gap-2"
      >
        <span class="text-primary-ui mt-0.5">✓</span>
        <span class="inline-flex items-start gap-1.5">
          <span>{{ feature.label }}</span>
          <span
            v-if="feature.tooltip"
            v-tooltip="feature.tooltip"
            class="mt-[1px] inline-flex h-4 w-4 flex-shrink-0 cursor-help select-none items-center justify-center rounded-full border border-white/25 bg-black/30 text-[10px] font-semibold leading-none text-foreground/90"
            aria-label="Подробнее о пользе изображений"
            role="button"
            tabindex="0"
          >
            ?
          </span>
        </span>
      </li>
    </ul>

    <button
      :class="[
        'w-full rounded-md px-4 py-2 text-sm font-medium transition-colors',
        isCurrent
          ? 'bg-primary text-primary-foreground cursor-not-allowed opacity-75'
          : isSelected
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'bg-primary-ui/10 text-primary-ui hover:bg-primary-ui/20',
      ]"
      :disabled="isCurrent"
      @click.stop="handleButtonClick"
    >
      {{ getButtonLabel() }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface Plan {
  id: string;
  name: string;
  basePrice: number;
  weeklyMinutesLimit: number;
}

type PlanFeature = {
  label: string;
  tooltip?: PlanTooltip;
};

type PlanTooltip = {
  content: string;
  html?: boolean;
  popperClass?: string;
  placement?: string;
  distance?: number;
  overflowPadding?: number;
  triggers: string[];
};

const props = defineProps<{
  plan: Plan;
  billingPeriod: 'month' | 'year';
  isSelected: boolean;
  isCurrent: boolean;
  trialActive?: boolean;
}>();

const emit = defineEmits<{
  select: [plan: Plan];
  'update:billingPeriod': [value: 'month' | 'year'];
  'confirm-change': [plan: Plan];
}>();

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
  return props.plan.name;
}

function getPrice() {
  // Рассчитываем цену с учетом периода
  const price =
    props.billingPeriod === 'year'
      ? Math.round(props.plan.basePrice * 12 * 0.8) // Годовая цена со скидкой 20%
      : props.plan.basePrice; // Месячная цена
  return price.toLocaleString('ru-RU');
}

function getFeatures() {
  const features: PlanFeature[] = [];

  // Единый пресет tooltip для карточек тарифа:
  // hover/focus для desktop и click для мобильных устройств.
  const createPlanTooltip = (content: string): PlanTooltip => ({
    content,
    triggers: ['hover', 'focus', 'click'],
    popperClass: 'plan-feature-tooltip',
    placement: 'top',
    distance: 10,
    overflowPadding: 16,
  });

  // Подсказка объясняет эффект "картинка + текст": визуальные стимулы
  // улучшают запоминание и повышают вероятность целевого действия.
  const imageReminderTooltip = createPlanTooltip(
    'Сочетание текста и изображения помогает лучше запоминать и быстрее воспринимать информацию. Этот эффект подтверждён исследованиями когнитивной психологии'
  );
  const sosTooltip = createPlanTooltip(
    'Быстрые упражнения для снижения тревоги и стабилизации состояния'
  );
  const standardRemindersTooltip: PlanTooltip = {
    ...createPlanTooltip(
      'Сила регулярности.<br>Без триггера намерение часто остаётся намерением. Напоминание превращает его в действие'
    ),
    // Разрешаем HTML только для контролируемой статической строки.
    html: true,
  };
  const personalAiStyleTooltip = createPlanTooltip(
    'Вы управляете тем, как звучат напоминания. Добавьте свои правила и примеры, и ИИ будет подстраивать тексты под ваш стиль и цели'
  );

  if (props.plan.name === 'basic') {
    if (props.trialActive) {
      // Trial-период на базе Basic.
      features.push({ label: 'Пробный период 7 дней' });
      features.push({ label: 'Полный доступ к функциям Premium' });
      features.push({ label: 'Безлимитные ИИ-сессии' });
    } else {
      features.push({
        label: 'SOS-техники для быстрой стабилизации',
        tooltip: sosTooltip,
      });
      features.push({ label: 'Базовые дыхательные практики' });
      features.push({
        label: 'Стандартные напоминания',
        tooltip: standardRemindersTooltip,
      });
    }
  } else if (props.plan.name === 'pro') {
    features.push({ label: 'Всё из Basic' });
    features.push({ label: 'ИИ-сессии для регулярной поддержки' });
    features.push({ label: 'До 100 минут в неделю' });
    features.push({ label: 'Полная библиотека медитаций' });
    features.push({ label: 'Доступ ко всем дыхательным практикам' });
    features.push({
      label: 'ИИ-напоминания с изображениями для усиления эффекта',
      tooltip: imageReminderTooltip,
    });
  } else if (props.plan.name === 'premium') {
    features.push({ label: 'Всё из PRO' });
    features.push({ label: 'Безлимитные ИИ-сессии' });
    features.push({
      label: 'Персональный стиль ИИ-напоминаний',
      tooltip: personalAiStyleTooltip,
    });
    features.push({ label: 'Создание и управление своими практиками' });
    features.push({ label: 'Создание своих привычек' });
    features.push({ label: 'Создание личной терапии' });
    features.push({ label: 'Приоритетная поддержка' });
  }

  return features;
}

function getButtonLabel() {
  if (!props.isCurrent) {
    return 'Выбрать';
  }

  return props.plan.name === 'basic' ? 'Активный' : 'Текущий план';
}
</script>
