<template>
  <div class="space-y-4">
    <ProgramFormattedPrompt
      v-if="action.prompt"
      :text="action.prompt"
      class="text-sm leading-relaxed text-foreground/80"
    />

    <section
      v-for="question in questions"
      :key="question.id"
      class="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-medium leading-relaxed text-foreground">
          {{ question.question }}
        </p>
        <span
          v-if="question.required !== false"
          class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-foreground/55"
        >
          Обязательно
        </span>
      </div>

      <!-- Индикатор лимита выбора: показываем только если у multiple-вопроса
           задан maxSelected. Подсвечивается при достижении лимита. -->
      <p
        v-if="isLimitedMulti(question)"
        class="text-[11px] font-medium transition-colors"
        :class="
          isAtSelectionLimit(question)
            ? 'text-emerald-300'
            : 'text-foreground/45'
        "
      >
        Можно выбрать до {{ question.maxSelected }} · выбрано
        {{ choiceValues(question.id).length }}
      </p>

      <ProgramRangeScale
        v-if="questionType(question) === 'rating_scale'"
        :model-value="ratingValue(question)"
        :min="questionMin(question)"
        :max="questionMax(question)"
        :aria-label="question.question"
        :min-label="question.minLabel || null"
        :max-label="question.maxLabel || null"
        @update:model-value="updateRating(question, $event)"
      />

      <div v-else-if="questionType(question) === 'text'" class="space-y-1">
        <textarea
          class="min-h-24 w-full resize-none rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-foreground/35 focus:border-emerald-200/45"
          :value="textValue(question.id)"
          :placeholder="question.placeholder || 'Можно коротко одной фразой'"
          maxlength="800"
          @input="updateText(question.id, $event)"
        />
      </div>

      <div v-else class="grid gap-2">
        <button
          v-for="option in question.options ?? []"
          :key="option.id"
          type="button"
          class="flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition active:scale-[0.98]"
          :class="
            isChoiceSelected(question.id, option.id)
              ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
              : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
          "
          @click="toggleChoice(question, option.id)"
        >
          <IconCheckCircle
            class="h-4 w-4 shrink-0"
            :class="
              isChoiceSelected(question.id, option.id)
                ? 'text-emerald-200'
                : 'text-white/30'
            "
            aria-hidden="true"
          />
          <span class="min-w-0">
            <span class="block font-medium">{{ option.label }}</span>
            <span
              v-if="option.helperText"
              class="mt-0.5 block text-xs leading-relaxed text-foreground/55"
            >
              {{ option.helperText }}
            </span>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconCheckCircle from '~icons/lucide/check-circle';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import ProgramRangeScale from '@/app/components/programs/ProgramRangeScale.vue';
import type {
  ProgramStepActionStateDto,
  ProgramWeeklyCheckQuestionDto,
} from '@/shared/dto/retention';

const props = defineProps<{
  modelValue: Record<string, unknown>;
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void;
}>();

const defaultQuestions: ProgramWeeklyCheckQuestionDto[] = [
  {
    id: 'anxiety_level_last_days',
    type: 'rating_scale',
    question: 'Насколько тревога мешала тебе в последние дни?',
    min: 0,
    max: 10,
    minLabel: 'Почти не мешала',
    maxLabel: 'Очень сильно мешала',
  },
  {
    id: 'main_change',
    type: 'choice',
    question: 'Что стало заметнее за это время? Можно выбрать несколько.',
    mode: 'multiple',
    minSelected: 1,
    exclusiveOptionIds: ['no_change_yet', 'worse'],
    options: [
      { id: 'less_body_tension', label: 'Меньше напряжения в теле' },
      { id: 'notice_thoughts', label: 'Лучше замечаю мысли' },
      { id: 'more_pause', label: 'Чаще получается делать паузу' },
      { id: 'less_avoidance', label: 'Меньше избегаю' },
      { id: 'no_change_yet', label: 'Пока без заметных изменений' },
      { id: 'worse', label: 'Стало тяжелее' },
    ],
  },
  {
    id: 'support_need',
    type: 'choice',
    question: 'Как идут дела на этой неделе?',
    mode: 'single',
    options: [
      { id: 'better', label: 'Лучше, чем раньше' },
      { id: 'usual', label: 'Похоже на обычное состояние' },
      { id: 'harder', label: 'Тяжелее, чем хотелось бы' },
    ],
  },
];

const questions = computed(() =>
  props.action.questions?.length ? props.action.questions : defaultQuestions
);

function questionType(question: ProgramWeeklyCheckQuestionDto) {
  return question.type ?? 'choice';
}

function questionMin(question: ProgramWeeklyCheckQuestionDto) {
  return question.min ?? 0;
}

function questionMax(question: ProgramWeeklyCheckQuestionDto) {
  return question.max ?? 10;
}

function emitAnswer(questionId: string, value: unknown) {
  emit('update:modelValue', {
    ...props.modelValue,
    [questionId]: value,
  });
}

function textValue(questionId: string) {
  const value = props.modelValue[questionId];
  return typeof value === 'string' ? value : '';
}

function updateText(questionId: string, event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  emitAnswer(questionId, target.value.slice(0, 800));
}

function ratingValue(question: ProgramWeeklyCheckQuestionDto) {
  const value = props.modelValue[question.id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function updateRating(question: ProgramWeeklyCheckQuestionDto, value: number) {
  emitAnswer(question.id, value);
}

function choiceValues(questionId: string) {
  const value = props.modelValue[questionId];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function isChoiceSelected(questionId: string, optionId: string) {
  return choiceValues(questionId).includes(optionId);
}

// Вопрос — multiple с заданным лимитом выбора.
function isLimitedMulti(question: ProgramWeeklyCheckQuestionDto) {
  return (
    (question.mode ?? 'single') === 'multiple' && question.maxSelected != null
  );
}

// Достигнут ли лимит выбора (для подсветки индикатора).
function isAtSelectionLimit(question: ProgramWeeklyCheckQuestionDto) {
  return (
    question.maxSelected != null &&
    choiceValues(question.id).length >= question.maxSelected
  );
}

function toggleChoice(
  question: ProgramWeeklyCheckQuestionDto,
  optionId: string
) {
  const mode = question.mode ?? 'single';
  const exclusive = new Set(question.exclusiveOptionIds ?? []);
  const current = new Set(choiceValues(question.id));

  if (mode === 'single') {
    emitAnswer(question.id, current.has(optionId) ? null : optionId);
    return;
  }

  if (current.has(optionId)) {
    current.delete(optionId);
  } else {
    if (exclusive.has(optionId)) {
      // Эксклюзивный вариант (например, «без изменений» или «стало тяжелее») —
      // обнуляет любые другие выбранные ответы.
      current.clear();
    } else {
      // Любая неэксклюзивная опция выключает эксклюзивные.
      for (const id of exclusive) current.delete(id);
      // Соблюдаем maxSelected: если лимит достигнут, не добавляем больше.
      const maxSelected = question.maxSelected ?? Infinity;
      if (current.size >= maxSelected) return;
    }
    current.add(optionId);
  }

  emitAnswer(question.id, Array.from(current));
}
</script>
