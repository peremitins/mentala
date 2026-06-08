<template>
  <div class="space-y-4">
    <template v-if="isStepIntro">
      <article class="space-y-3">
        <div
          v-if="promptParagraphs.length"
          class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"
        >
          <p
            v-for="paragraph in promptParagraphs"
            :key="paragraph"
            class="text-sm leading-relaxed text-foreground/78"
          >
            {{ paragraph }}
          </p>
        </div>

        <section
          v-for="(step, index) in steps"
          :key="step.id"
          class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3"
        >
          <h3
            v-if="index === 0"
            class="mb-1 text-base font-semibold leading-tight text-foreground"
          >
            {{ step.title }}
          </h3>
          <p
            v-for="paragraph in splitParagraphs(step.text)"
            :key="paragraph"
            class="text-sm leading-relaxed text-foreground/72"
          >
            {{ paragraph }}
          </p>
        </section>
      </article>
    </template>

    <template v-else-if="isScriptBuilder">
      <ProgramFormattedPrompt
        v-if="action.prompt"
        :text="action.prompt"
        class="text-sm leading-relaxed text-foreground/80"
      />

      <div class="space-y-2">
        <button
          v-for="(step, index) in steps"
          :key="step.id"
          type="button"
          class="rounded-2xl border px-3 py-3 transition w-full"
          :class="
            isScriptChecklistCompleted(step.id)
              ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
              : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
          "
          @click="toggleStep(step.id)"
        >
          <span class="flex items-start gap-3 text-left">
            <span
              class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition"
              :class="
                isScriptChecklistCompleted(step.id)
                  ? 'border-emerald-200/45 bg-emerald-300/30 text-emerald-50'
                  : 'border-white/15 bg-white/6 text-foreground/55'
              "
            >
              <IconCheck
                v-if="isScriptChecklistCompleted(step.id)"
                class="h-4 w-4"
              />
              <span v-else>{{ index + 1 }}</span>
            </span>
            <span class="min-w-0 space-y-1">
              <span class="block text-sm font-semibold leading-snug">
                {{ step.title }}
              </span>
              <span
                v-if="step.text"
                class="block text-sm leading-relaxed text-foreground/70"
              >
                {{ step.text }}
              </span>
              <span
                v-if="step.helperText"
                class="block text-xs leading-relaxed text-foreground/52"
              >
                {{ step.helperText }}
              </span>
            </span>
          </span>
        </button>
      </div>

      <section
        class="space-y-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
      >
        <div class="space-y-1">
          <h3 class="text-sm font-semibold leading-snug text-foreground">
            Итоговая просьба
          </h3>
          <p class="text-xs leading-relaxed text-foreground/58">
            Собери одну фразу, которую можно отправить или произнести.
          </p>
        </div>

        <GratitudeDiaryEmbeddedComposer
          :model-value="scriptText"
          :prompt="null"
          placeholder="Например: «Мне сейчас тяжело. Можешь выслушать меня 10 минут? Когда тебе будет удобно?»"
          :max-length="SCRIPT_TEXT_MAX_LENGTH"
          @update:model-value="onScriptTextInput"
        />
      </section>
    </template>

    <template v-else>
      <!-- helpHint-подсказка «?» для guided_steps показывается у заголовка
           практики в родителе (steps/[step].vue), т.к. у этого типа нет
           prompt и места под иконку рядом с вопросом. Здесь рендерим только
           prompt, если он задан. -->
      <ProgramFormattedPrompt
        v-if="action.prompt"
        :text="action.prompt"
        class="text-sm leading-relaxed text-foreground/80"
      />

      <div class="space-y-2">
        <button
          v-for="(step, index) in steps"
          :key="step.id"
          type="button"
          class="flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.98]"
          :class="
            isCompleted(step.id)
              ? 'border-emerald-200/45 bg-emerald-300/18 text-foreground'
              : 'border-white/14 bg-white/6 text-foreground/78 hover:border-white/25'
          "
          @click="toggleStep(step.id)"
        >
          <span
            class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition"
            :class="
              isCompleted(step.id)
                ? 'border-emerald-200/45 bg-emerald-300/30 text-emerald-50'
                : 'border-white/15 bg-white/6 text-foreground/55'
            "
          >
            <IconCheck v-if="isCompleted(step.id)" class="h-4 w-4" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="min-w-0 space-y-1">
            <span class="block text-sm font-semibold leading-snug">
              {{ step.title }}
            </span>
            <span
              v-if="step.text"
              class="block text-sm leading-relaxed text-foreground/70"
            >
              {{ step.text }}
            </span>
            <span
              v-if="step.helperText"
              class="block text-xs leading-relaxed text-foreground/52"
            >
              {{ step.helperText }}
            </span>
          </span>
        </button>
      </div>

      <p
        v-if="steps.length === 0"
        class="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm leading-relaxed text-foreground/70"
      >
        Отметь действие как выполненное, когда попробуешь инструкцию.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IconCheck from '~icons/lucide/check';
import GratitudeDiaryEmbeddedComposer from '@/app/components/gratitude-diary/GratitudeDiaryEmbeddedComposer.vue';
import ProgramFormattedPrompt from '@/app/components/programs/ProgramFormattedPrompt.vue';
import { useHaptics } from '@/app/composables/useHaptics';
import type { ProgramStepActionStateDto } from '@/shared/dto/retention';

const props = defineProps<{
  modelValue: string[];
  action: ProgramStepActionStateDto;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

const SCRIPT_SEP = '::';
const SCRIPT_FINAL_TEXT_ID = '__support_request_script_text';
const SCRIPT_TEXT_MAX_LENGTH = 500;
const { triggerLight } = useHaptics();

const steps = computed(() => props.action.steps ?? []);
const isStepIntro = computed(() => props.action.formKind === 'step_intro');
const isScriptBuilder = computed(
  () => props.action.formKind === 'support_request_script'
);
const promptParagraphs = computed(() => splitParagraphs(props.action.prompt));
const scriptText = computed(() => getScriptText());

function splitParagraphs(value: string | null | undefined) {
  return (value ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

// --- script builder helpers ---

function getScriptText(): string {
  const entry = props.modelValue.find((value) =>
    value.startsWith(SCRIPT_FINAL_TEXT_ID + SCRIPT_SEP)
  );
  return entry
    ? entry.slice(SCRIPT_FINAL_TEXT_ID.length + SCRIPT_SEP.length)
    : '';
}

function onScriptTextInput(text: string) {
  const rest = props.modelValue.filter(
    (value) => !value.startsWith(SCRIPT_FINAL_TEXT_ID + SCRIPT_SEP)
  );
  const next = text.trim()
    ? [...rest, `${SCRIPT_FINAL_TEXT_ID}${SCRIPT_SEP}${text}`]
    : rest;
  emit('update:modelValue', next);
}

function isScriptChecklistCompleted(stepId: string) {
  return props.modelValue.some(
    (value) => value === stepId || value.startsWith(stepId + SCRIPT_SEP)
  );
}

// --- checkbox helpers ---

function isCompleted(stepId: string) {
  return props.modelValue.some(
    (v) => v === stepId || v.startsWith(stepId + SCRIPT_SEP)
  );
}

function toggleStep(stepId: string) {
  const selected = new Set(props.modelValue);
  if (selected.has(stepId)) {
    selected.delete(stepId);
  } else {
    selected.add(stepId);
  }
  void triggerLight();
  emit('update:modelValue', Array.from(selected));
}
</script>
