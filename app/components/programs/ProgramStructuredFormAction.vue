<template>
  <div class="space-y-4">
    <div v-if="action.helpHint" class="flex items-start gap-2">
      <ProgramFormattedPrompt
        v-if="action.prompt"
        :text="action.prompt"
        class="flex-1 text-sm leading-relaxed text-foreground/80"
      />
      <p v-else class="flex-1 text-sm leading-relaxed text-foreground/70">
        Заполни поля ниже. Если что-то непонятно - открой подсказку.
      </p>
      <ProgramHelpHint
        :title="action.helpHint.title || null"
        :description="action.helpHint.description || null"
        :examples="action.helpHint.examples || null"
        aria-label="Подсказка к заданию"
      />
    </div>
    <ProgramFormattedPrompt
      v-else-if="action.prompt"
      :text="action.prompt"
      class="text-sm leading-relaxed text-foreground/80"
    />

    <div class="space-y-3">
      <section
        v-for="field in visibleFields"
        :key="field.id"
        class="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
      >
        <div class="space-y-1">
          <div class="flex items-start justify-between gap-2">
            <label
              :for="fieldInputId(field.id)"
              class="text-sm font-medium leading-snug text-foreground"
            >
              {{ field.label }}
            </label>
            <span
              v-if="field.required !== false"
              class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-medium text-foreground/55"
            >
              Обязательно
            </span>
          </div>
          <p
            v-if="field.helperText"
            class="text-xs leading-relaxed text-foreground/55"
          >
            {{ field.helperText }}
          </p>
          <!-- Индикатор лимита выбора: показываем только если у multiple-поля
               задан maxSelected. Подсвечивается, когда лимит достигнут, -
               сигнал «больше выбрать нельзя» без тоста. -->
          <p
            v-if="isLimitedMulti(field)"
            class="text-[11px] font-medium transition-colors"
            :class="
              isAtSelectionLimit(field)
                ? 'text-emerald-300'
                : 'text-foreground/45'
            "
          >
            Можно выбрать до {{ field.maxSelected }} · выбрано
            {{ choiceValues(field.id).length }}
          </p>
        </div>

        <div
          v-if="
            fieldType(field) === 'choice' ||
            fieldType(field) === 'experiment_status'
          "
          class="grid gap-2"
        >
          <button
            v-for="option in fieldOptions(field)"
            :key="option.id"
            type="button"
            class="flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-2 text-left text-sm transition active:scale-[0.98]"
            :class="
              isChoiceSelected(field.id, option.id)
                ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
                : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
            "
            @click="toggleChoice(field, option.id)"
          >
            <IconCheckCircle
              class="h-4 w-4 shrink-0"
              :class="
                isChoiceSelected(field.id, option.id)
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

        <ProgramRangeScale
          v-else-if="fieldType(field) === 'rating_scale'"
          :input-id="fieldInputId(field.id)"
          :model-value="ratingValue(field)"
          :min="fieldMin(field)"
          :max="fieldMax(field)"
          :aria-label="field.label"
          :min-label="field.minLabel || null"
          :max-label="field.maxLabel || null"
          @update:model-value="updateRating(field, $event)"
        />

        <input
          v-else-if="fieldType(field) === 'text'"
          :id="fieldInputId(field.id)"
          class="min-h-11 w-full rounded-2xl border border-white/12 bg-white/6 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-foreground/35 focus:border-emerald-200/45"
          :value="textValue(field.id)"
          :placeholder="field.placeholder"
          :maxlength="field.maxLength ?? 400"
          @input="updateTextFromEvent(field, $event)"
        />

        <!-- Многострочное поле - используем стандартный composer из дневника:
             встроенный счётчик слева внизу и кнопка голосового ввода справа.
             Это убирает дублирующий «кастомный» счётчик и даёт единый UX
             для текстового и голосового ввода по всему приложению. -->
        <GratitudeDiaryEmbeddedComposer
          v-else
          :model-value="textValue(field.id)"
          :prompt="null"
          :placeholder="field.placeholder || 'Напиши здесь...'"
          :max-length="field.maxLength ?? 800"
          @update:model-value="updateTextValue(field, $event)"
        />
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconCheckCircle from '~icons/lucide/check-circle';
import GratitudeDiaryEmbeddedComposer from '@/app/components/gratitude-diary/GratitudeDiaryEmbeddedComposer.vue';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import ProgramHelpHint from '@/app/components/programs/ProgramHelpHint.vue';
import ProgramRangeScale from '@/app/components/programs/ProgramRangeScale.vue';
import type {
  ProgramStepActionStateDto,
  ProgramStructuredFormFieldDto,
} from '@/shared/dto/retention';
import { useAuthStore } from '@/app/stores/auth';
import { applyGender } from '@/app/utils/genderedText';

const authStore = useAuthStore();

const props = defineProps<{
  modelValue: Record<string, unknown>;
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void;
}>();

const fields = computed(() => props.action.fields ?? []);

function isFieldVisible(field: ProgramStructuredFormFieldDto): boolean {
  if (!field.visibleWhen) return true;
  const { fieldId, valueIn } = field.visibleWhen;
  const current = props.modelValue[fieldId];
  if (Array.isArray(current)) return current.some((v) => valueIn.includes(v));
  return typeof current === 'string' && valueIn.includes(current);
}

const visibleFields = computed(() => fields.value.filter(isFieldVisible));

function fieldInputId(fieldId: string) {
  return `${props.action.id}-${fieldId}`;
}

function fieldType(field: ProgramStructuredFormFieldDto) {
  return field.type ?? 'textarea';
}

function fieldMin(field: ProgramStructuredFormFieldDto) {
  return field.min ?? 0;
}

function fieldMax(field: ProgramStructuredFormFieldDto) {
  return field.max ?? 10;
}

function fieldOptions(field: ProgramStructuredFormFieldDto) {
  if (field.options?.length) return field.options;
  if (field.type !== 'experiment_status') return [];
  const gender = authStore.user?.gender;
  return [
    { id: 'done', label: applyGender('Да, {сделал|сделала}', gender) },
    { id: 'partly', label: applyGender('{Сделал|Сделала} частично', gender) },
    {
      id: 'planned_later',
      label: applyGender('{Запланировал|Запланировала} на позже', gender),
    },
    { id: 'need_smaller', label: 'Нужно сделать меньше' },
    { id: 'not_yet', label: 'Пока нет' },
  ];
}

function emitFieldValue(fieldId: string, value: unknown) {
  emit('update:modelValue', {
    ...props.modelValue,
    [fieldId]: value,
  });
}

function textValue(fieldId: string) {
  const value = props.modelValue[fieldId];
  return typeof value === 'string' ? value : '';
}

function updateTextFromEvent(
  field: ProgramStructuredFormFieldDto,
  event: Event
) {
  const target = event.target;
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLTextAreaElement)
  ) {
    return;
  }
  const maxLength = field.maxLength ?? 800;
  emitFieldValue(field.id, target.value.slice(0, maxLength));
}

function updateTextValue(field: ProgramStructuredFormFieldDto, value: string) {
  // Композер уже сам обрезает по maxLength, но дублируем для устойчивости -
  // если в будущем maxLength придёт меньшим из props, тут поймаем срезание.
  const maxLength = field.maxLength ?? 800;
  emitFieldValue(field.id, value.slice(0, maxLength));
}

function ratingValue(field: ProgramStructuredFormFieldDto) {
  const value = props.modelValue[field.id];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function updateRating(field: ProgramStructuredFormFieldDto, value: number) {
  emitFieldValue(field.id, value);
}

function choiceValues(fieldId: string) {
  const value = props.modelValue[fieldId];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  return typeof value === 'string' ? [value] : [];
}

function isChoiceSelected(fieldId: string, optionId: string) {
  return choiceValues(fieldId).includes(optionId);
}

// Поле - multiple с заданным лимитом выбора.
function isLimitedMulti(field: ProgramStructuredFormFieldDto) {
  return (field.mode ?? 'single') === 'multiple' && field.maxSelected != null;
}

// Достигнут ли лимит выбора (для подсветки индикатора).
function isAtSelectionLimit(field: ProgramStructuredFormFieldDto) {
  return (
    field.maxSelected != null &&
    choiceValues(field.id).length >= field.maxSelected
  );
}

function toggleChoice(field: ProgramStructuredFormFieldDto, optionId: string) {
  const mode = field.mode ?? 'single';
  const exclusive = new Set(field.exclusiveOptionIds ?? []);
  const current = new Set(choiceValues(field.id));

  if (mode === 'single') {
    emitFieldValue(field.id, current.has(optionId) ? null : optionId);
    return;
  }

  if (current.has(optionId)) {
    current.delete(optionId);
  } else {
    if (exclusive.has(optionId)) {
      current.clear();
    } else {
      // Любая неэксклюзивная опция выключает эксклюзивные.
      for (const id of exclusive) current.delete(id);
      // Соблюдаем maxSelected: при достигнутом лимите новый выбор игнорируем.
      const maxSelected = field.maxSelected ?? Infinity;
      if (current.size >= maxSelected) return;
    }
    current.add(optionId);
  }

  emitFieldValue(field.id, Array.from(current));
}
</script>
