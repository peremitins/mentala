<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import SelectField from '@/app/components/ui/SelectField.vue';
import type {
  HabitDto,
  HabitIntent,
  TherapyTopicDto,
} from '@/shared/dto/notifications';
import { useUserHabitsStore } from '@/app/stores/userHabits';
import { useTherapyTopicsStore } from '@/app/stores/therapyTopics';
import { useForm, useField } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';

const props = withDefaults(
  defineProps<{
    open: boolean;
    mentaiMode: 'habits' | 'therapy';
    defaultIntent?: HabitIntent;
    headerTitle?: string;
    headerSubtitle?: string;
    heroTitle?: string;
    heroSubtitle?: string;
    showHero?: boolean;
    submitLabel?: string;
    namePlaceholder?: string;
    descriptionPlaceholder?: string;
    emojiPlaceholder?: string;
    defaultEmoji?: string;
  }>(),
  {
    defaultIntent: 'build',
    showHero: true,
  }
);

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'created', payload: HabitDto | TherapyTopicDto): void;
}>();

const userHabitsStore = useUserHabitsStore();
const therapyTopicsStore = useTherapyTopicsStore();

const formSchema = computed(() =>
  toTypedSchema(
    z.object({
      name: z
        .string()
        .trim()
        .min(1, 'Название обязательно')
        .max(
          props.mentaiMode === 'habits' ? 60 : 80,
          'Слишком длинное название'
        ),
      emoji: z.string().max(4).optional(),
      description: z.string().max(400).optional(),
    })
  )
);

const defaultEmojiValue = computed(() => props.defaultEmoji ?? '✨');

const defaultIntentValue = computed<HabitIntent>(
  () => props.defaultIntent ?? 'build'
);

const intent = ref<HabitIntent>(defaultIntentValue.value);
const loading = ref(false);

const { handleSubmit: handleFormSubmit, resetForm: resetVeeForm } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: '',
    emoji: defaultEmojiValue.value,
    description: '',
  },
});

const {
  value: name,
  errorMessage: nameError,
  meta: nameMeta,
  handleBlur: handleNameBlur,
  setTouched: setNameTouched,
} = useField('name', undefined, { validateOnValueUpdate: true });
const { value: emoji } = useField<string | undefined>('emoji');
const { value: description } = useField<string | undefined>('description');

const showIntentSelector = computed(() => props.mentaiMode === 'habits');

const headerTitle = computed(
  () =>
    props.headerTitle ??
    (props.mentaiMode === 'habits' ? 'Новая привычка' : 'Новая тема терапии')
);
const headerSubtitle = computed(
  () =>
    props.headerSubtitle ??
    (props.mentaiMode === 'habits'
      ? 'Настройте свою привычку: выберите цель, добавьте описание и сохраните'
      : 'Создайте тему под свои запросы: название, описание и эмодзи')
);

const heroTitle = computed(
  () =>
    props.heroTitle ??
    (props.mentaiMode === 'habits' ? 'Персонализируйте тему' : '')
);
const heroSubtitle = computed(
  () =>
    props.heroSubtitle ??
    (props.mentaiMode === 'habits'
      ? 'Эмодзи поможет быстрее находить её в списке'
      : '')
);

const submitLabel = computed(
  () =>
    props.submitLabel ??
    (props.mentaiMode === 'habits' ? 'Создать и настроить' : 'Создать тему')
);

const namePlaceholder = computed(
  () =>
    props.namePlaceholder ??
    (props.mentaiMode === 'habits'
      ? 'Например, «Осознанное утро»'
      : 'Например, «Поддержка перед выступлением»')
);

const descriptionPlaceholder = computed(
  () =>
    props.descriptionPlaceholder ??
    'Опишите чуть подробнее. Так ИИ сможет создавать более точные и полезные уведомления.'
);

const emojiPlaceholder = computed(
  () => props.emojiPlaceholder ?? defaultEmojiValue.value
);

const intentOptions = [
  { label: 'Привить привычку', value: 'build' },
  { label: 'Отказаться от привычки', value: 'quit' },
];

const isSubmitDisabled = computed(
  () => loading.value || !nameMeta.valid || !nameMeta.touched
);

function close() {
  emit('update:open', false);
}

function resetForm() {
  resetVeeForm({
    values: {
      name: '',
      emoji: defaultEmojiValue.value,
      description: '',
    },
  });
  intent.value = defaultIntentValue.value;
  loading.value = false;
}

watch(
  () => props.defaultIntent,
  (value) => {
    if (!props.open && value) {
      intent.value = value;
    }
  }
);

watch(
  () => props.open,
  (value) => {
    if (!value) {
      resetForm();
    }
  }
);

const createEntity = async (values: {
  name: string;
  emoji?: string;
  description?: string;
}) => {
  if (props.mentaiMode === 'habits') {
    const habit = await userHabitsStore.create({
      name: values.name.trim(),
      intent: intent.value,
      emoji: values.emoji?.trim() || undefined,
      description: values.description?.trim() || undefined,
    });
    emit('created', habit);
    return;
  }
  const topic = await therapyTopicsStore.create({
    name: values.name.trim(),
    description: values.description?.trim() || undefined,
    emoji: values.emoji?.trim() || undefined,
  });
  emit('created', topic);
};

const handleSubmit = handleFormSubmit(async (values) => {
  loading.value = true;
  try {
    await createEntity(values);
    close();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="sm:max-w-lg border-none bg-white/85 dark:bg-gray-900/85 backdrop-blur-xl shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
    >
      <DialogHeader>
        <DialogTitle class="text-xl font-semibold">
          {{ headerTitle }}
        </DialogTitle>
        <DialogDescription class="text-sm text-gray-500 dark:text-gray-400">
          {{ headerSubtitle }}
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-5" @submit.prevent="handleSubmit">
        <div v-if="showIntentSelector" class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Тип привычки
          </label>
          <SelectField
            v-model="intent"
            :options="intentOptions"
            placeholder="Выберите тип"
            class="w-full"
          />
        </div>

        <div
          v-if="showHero && heroTitle"
          class="flex items-center gap-4 p-3 rounded-2xl bg-gradient-to-r from-purple-100/80 to-blue-100/80 dark:from-purple-900/30 dark:to-blue-900/30 transition-all duration-300"
        >
          <div
            class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 dark:bg-white/10 text-2xl shadow-md transition-transform duration-300"
          >
            {{ emoji?.trim() || defaultEmojiValue }}
          </div>
          <div class="space-y-1">
            <p class="text-base font-semibold text-gray-900 dark:text-gray-100">
              {{ heroTitle }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ heroSubtitle }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div
            class="flex items-end gap-3"
            :class="showIntentSelector ? '' : 'pt-1'"
          >
            <div class="flex flex-col gap-1 w-[60px]">
              <label
                class="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Эмодзи
              </label>
              <input
                v-model="emoji"
                type="text"
                maxlength="4"
                class="rounded-xl border border-gray-200 bg-white/90 px-2 py-2 text-base text-center focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all dark:border-gray-700 dark:bg-gray-800/60 dark:text-white"
                :placeholder="emojiPlaceholder"
              />
            </div>
            <div class="flex-1 flex flex-col gap-1">
              <label
                class="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Название
              </label>
              <input
                v-focus
                v-model="name"
                type="text"
                :class="[
                  'w-full rounded-xl border bg-white/90 px-4 py-2.5 text-sm transition-all focus:ring-2 dark:bg-gray-800/60 dark:text-white',
                  nameMeta.touched && nameError
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-300 dark:border-red-500'
                    : 'border-gray-200 focus:border-purple-500 focus:ring-purple-200 dark:border-gray-700',
                ]"
                @input="setNameTouched(true)"
                @blur="handleNameBlur"
                :maxlength="props.mentaiMode === 'habits' ? 60 : 80"
                :placeholder="namePlaceholder"
              />
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Описание
          </label>
          <textarea
            v-model="description"
            rows="3"
            class="w-full rounded-xl border border-gray-200 bg-white/90 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all dark:border-gray-700 dark:bg-gray-800/60 dark:text-white"
            :placeholder="descriptionPlaceholder"
          />
        </div>

        <div class="flex flex-col gap-3 pt-2">
          <button
            type="submit"
            class="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-50 disabled:translate-y-0"
            :disabled="isSubmitDisabled"
          >
            {{ loading ? 'Создаём...' : submitLabel }}
          </button>
          <button
            type="button"
            class="text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            @click="close"
          >
            Отменить
          </button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>
