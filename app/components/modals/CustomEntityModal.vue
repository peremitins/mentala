<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="glass-deep border border-border bg-card backdrop-blur-xl shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95"
    >
      <DialogHeader>
        <DialogTitle
          class="text-lg sm:text-xl font-semibold text-card-foreground"
        >
          {{ headerTitle }}
        </DialogTitle>
        <DialogDescription class="text-xs sm:text-sm text-muted-foreground">
          {{ headerSubtitle }}
        </DialogDescription>
      </DialogHeader>

      <form
        class="space-y-4 sm:space-y-5 overflow-auto"
        @submit.prevent="handleSubmit"
      >
        <div v-if="showIntentSelector" class="flex flex-col gap-2">
          <label class="text-xs sm:text-sm font-medium text-foreground">
            Тип привычки
          </label>
          <ToggleGroup
            :model-value="intent || ''"
            type="single"
            class="inline-flex w-full gap-2 overflow-auto"
            @update:model-value="
              (value) => {
                if (value && typeof value === 'string')
                  intent = value as HabitIntent;
              }
            "
          >
            <ToggleGroupItem
              v-for="option in intentOptions"
              :key="option.value"
              :value="option.value"
              class="flex-1 rounded-lg px-2 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
            >
              {{ option.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div
          v-if="showHero && heroTitle"
          class="flex items-start gap-2 sm:gap-4 p-2.5 sm:p-3 rounded-xl sm:rounded-lg border border-primary bg-transparent transition-all duration-300"
        >
          <div
            class="flex items-start rounded-2xl text-2xl transition-transform duration-300"
          >
            {{ emoji?.trim() || defaultEmojiValue }}
          </div>
          <div class="space-y-1">
            <p class="text-base font-semibold text-foreground">
              {{ heroTitle }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ heroSubtitle }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div
            class="flex items-end gap-2 sm:gap-3"
            :class="showIntentSelector ? '' : 'pt-1'"
          >
            <div class="flex flex-col gap-1 w-[50px] sm:w-[60px] shrink-0">
              <label class="text-xs sm:text-sm font-medium text-foreground">
                Эмодзи
              </label>
              <Input
                v-model="emoji"
                type="text"
                :maxlength="4"
                :placeholder="emojiPlaceholder"
                class="text-sm sm:text-base text-center h-9 sm:h-10"
                :show-clear-button="false"
              />
            </div>
            <div class="flex-1 flex flex-col gap-1 min-w-0">
              <label class="text-xs sm:text-sm font-medium text-foreground">
                Название
              </label>
              <Input
                ref="nameInputRef"
                :model-value="String(name ?? '')"
                @update:model-value="
                  (v) => {
                    name = v as string;
                    setNameTouched(true);
                  }
                "
                type="text"
                :class="[
                  nameMeta.touched && nameError
                    ? 'border-destructive focus:border-destructive'
                    : '',
                ]"
                @blur="handleNameBlur"
                :maxlength="props.mentaiMode === 'habits' ? 60 : 80"
                :placeholder="namePlaceholder"
              />
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-xs sm:text-sm font-medium text-foreground">
            Описание
          </label>
          <TextareaResize
            v-model="description"
            variant="form"
            :min-height="'80px'"
            :max-height="'200px'"
            :placeholder="descriptionPlaceholder"
          />
        </div>

        <div class="flex flex-col gap-3 pt-2">
          <Button
            type="submit"
            variant="default"
            :disabled="isSubmitDisabled"
            class="w-full"
          >
            {{ loading ? 'Создаём...' : submitLabel }}
          </Button>
          <Button
            type="button"
            variant="ghost"
            class="w-full text-sm"
            @click="close"
          >
            Отменить
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { Input } from '@/app/components/ui/shadcn/input';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { Button } from '@/app/components/ui/button';
import ToggleGroup from '@/app/components/ui/toggle-group/ToggleGroup.vue';
import ToggleGroupItem from '@/app/components/ui/toggle-group/ToggleGroupItem.vue';
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
const nameInputRef = ref<InstanceType<typeof Input> | null>(null);

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
    } else {
      // Фокусируемся на поле ввода имени при открытии модалки
      nextTick(() => {
        nameInputRef.value?.focus();
      });
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
