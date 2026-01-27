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
      <h3 class="text-lg font-semibold">{{ getPlanName() }}</h3>
      <div class="flex items-center gap-2">
        <span
          v-if="plan.name === 'basic' && props.trialActive"
          class="text-xs bg-primary-ui/10 text-primary-ui px-2 py-1 rounded font-medium text-end"
        >
          Бесплатный пробный период
        </span>
        <span v-if="plan.name === 'premium'" class="text-xl">👑</span>
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
        :key="feature"
        class="flex items-start gap-2"
      >
        <span class="text-primary-ui mt-0.5">✓</span>
        <span>{{ feature }}</span>
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
      {{ isCurrent ? 'Активный' : 'Выбрать' }}
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
  }

  return features;
}
</script>
