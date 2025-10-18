<template>
  <SelectRoot
    v-if="!multiple"
    :model-value="String(internalValue)"
    @update:model-value="(v: string) => updateSingle(v)"
    :disabled="disabled"
  >
    <SelectTrigger
      class="inline-flex min-w-[160px] items-center justify-between rounded-full h-10 px-4 text-sm bg-white/10 border border-white/15 backdrop-blur shadow-[var(--shadow-sm)]"
    >
      <SelectValue :placeholder="placeholder" />
      <IconChevronDown class="h-4 w-4" />
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        :side-offset="8"
        :collision-padding="12"
        class="z-50 min-w-[200px] max-h-64 overflow-auto rounded-2xl border border-white/15 bg-white/10 border border-white/15 backdrop-blur shadow-[var(--shadow-sm)] p-1"
      >
        <SelectViewport class="p-1">
          <template v-for="(group, gi) in normalizedOptions" :key="gi">
            <SelectLabel
              v-if="group.label"
              class="px-3 py-1 text-xs opacity-70"
              >{{ group.label }}</SelectLabel
            >
            <SelectGroup>
              <SelectItem
                v-for="opt in group.items"
                :key="String(opt.value)"
                :value="String(opt.value)"
                class="text-sm leading-none rounded-[10px] flex items-center h-8 pr-8 pl-4 select-none gap-2 data-[disabled]:opacity-50 data-[disabled]:pointer-events-none data-[highlighted]:outline-none data-[highlighted]:bg-white/10"
                :disabled="opt.disabled"
              >
                <SelectItemIndicator
                  class="absolute left-0 w-[25px] inline-flex items-center justify-center"
                >
                  <IconCheck />
                </SelectItemIndicator>
                <IconCheck
                  v-if="showItemIcons && modelValue === opt.value"
                  class="w-4 h-4 opacity-80"
                />
                <SelectItemText class="truncate pl-2">{{
                  opt.label
                }}</SelectItemText>
              </SelectItem>
            </SelectGroup>
          </template>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>

  <template v-else>
    <div class="inline-block">
      <PopoverRoot v-model:open="open">
        <PopoverTrigger as-child>
          <button
            type="button"
            class="inline-flex min-w-[200px] items-center justify-between rounded-full h-10 px-4 text-sm bg-white/10 border border-white/15 backdrop-blur shadow-[var(--shadow-sm)]"
          >
            <span class="truncate text-left">{{
              selectedLabels.join(', ') || placeholder
            }}</span>
            <IconChevronDown class="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverPortal>
          <PopoverContent
            :side-offset="8"
            class="z-50 min-w-[240px] max-h-72 overflow-auto rounded-2xl border border-white/15 bg-black/80 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,.45)] p-2"
          >
            <ul class="space-y-1">
              <li v-for="opt in flatOptions" :key="String(opt.value)">
                <label
                  class="flex items-center gap-2 px-2 py-2 rounded-[10px] hover:bg-white/10 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    class="sr-only"
                    :checked="isChecked(opt.value)"
                    @change="toggleValue(opt.value)"
                  />
                  <span
                    class="w-4 h-4 grid place-items-center rounded border border-white/20"
                    :class="{ 'bg-white text-black': isChecked(opt.value) }"
                  >
                    <IconCheck v-if="isChecked(opt.value)" class="w-3 h-3" />
                  </span>
                  <span class="truncate">{{ opt.label }}</span>
                </label>
              </li>
            </ul>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
  </template>
</template>

<script setup lang="ts">
import IconChevronDown from '~icons/lucide/chevron-down';
import IconCheck from '~icons/lucide/check';
import { computed, ref } from 'vue';
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectViewport,
  SelectPortal,
} from 'radix-vue';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
} from 'radix-vue';

type Option = { label: string; value: string | number; disabled?: boolean };
type OptionGroup = { label?: string; items: Option[] };

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | Array<string | number>;
    options: Array<Option | OptionGroup>;
    placeholder?: string;
    disabled?: boolean;
    multiple?: boolean;
    showItemIcons?: boolean;
  }>(),
  {
    placeholder: 'Select...',
    disabled: false,
    multiple: false,
    showItemIcons: false,
  }
);
const emit = defineEmits<{ (e: 'update:modelValue', v: any): void }>();

const multiple = computed(() => props.multiple);
const disabled = computed(() => props.disabled);
const internalValue = computed(() =>
  Array.isArray(props.modelValue) ? '' : (props.modelValue ?? '')
);

const normalizedOptions = computed<OptionGroup[]>(() => {
  if (!props.options?.length) return [];
  const first = props.options[0] as any;
  if ('items' in first || first.items) return props.options as OptionGroup[];
  return [{ items: props.options as Option[] }];
});

const flatOptions = computed<Option[]>(() =>
  normalizedOptions.value.flatMap((g) => g.items)
);
const open = ref(false);

function updateSingle(v: string) {
  const num = Number(v);
  emit('update:modelValue', Number.isNaN(num) ? v : num);
}

function isChecked(v: string | number) {
  return Array.isArray(props.modelValue) && props.modelValue.includes(v);
}
function toggleValue(v: string | number) {
  const arr = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
  const idx = arr.findIndex((x) => x === v);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(v);
  emit('update:modelValue', arr);
}

const selectedLabels = computed(() => {
  if (!Array.isArray(props.modelValue)) return [];
  const map = new Map(flatOptions.value.map((o) => [o.value, o.label]));
  return props.modelValue.map((v) => map.get(v) || String(v));
});
</script>
