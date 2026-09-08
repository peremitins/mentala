<template>
  <div v-bind="$attrs" class="w-full space-y-2">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          variant="outline"
          role="combobox"
          :aria-expanded="open"
          class="w-full justify-between"
        >
          <span v-if="selectedOption?.label" class="flex gap-2 truncate">
            <span class="font-medium truncate" v-html="selectedOption.label" />
          </span>
          <span v-else class="text-foreground">{{
            placeholder || 'Выберите опцию'
          }}</span>

          <IconChevronsUpDown
            class="size-4 shrink-0 text-foreground"
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        :side-offset="8"
        :collision-padding="12"
        class="glass-deep p-0 min-w-[260px] w-[var(--radix-popper-anchor-width)] will-change-[transform,opacity] data-[state=open]:animate-dropdown-in data-[state=closed]:animate-dropdown-out"
      >
        <Command>
          <CommandInput v-if="props.search" placeholder="Поиск..." />
          <CommandList>
            <CommandEmpty>Ничего не найдено.</CommandEmpty>

            <CommandGroup>
              <CommandItem
                v-for="option in filtered"
                :key="option.value"
                :value="option.label"
                @select="() => onSelect(option)"
              >
                <span class="truncate" v-html="option.label" />

                <IconCheck
                  v-if="modelValue === option.value"
                  class="ml-auto size-4"
                />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import IconChevronsUpDown from '~icons/lucide/chevrons-up-down';
import IconCheck from '~icons/lucide/check';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/app/components/ui/shadcn/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/app/components/ui/shadcn/command';
import { Button } from '@/app/components/ui/button';

const id = `combobox-option-${Math.random().toString(36).slice(2, 9)}`;

type Option = {
  label: string;
  value: string;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options?: Option[];
    label?: string;
    search?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    allowDeselect?: boolean; // Разрешить сброс значения при повторном клике
  }>(),
  {
    modelValue: '',
    search: false,
    placeholder: 'Выберите тип',
    searchPlaceholder: 'Поиск...',
    options: () => [],
    allowDeselect: false, // По умолчанию не разрешаем сброс
  }
);

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const open = ref(false);
const searchQuery = ref('');

const normalized = computed<Option[]>(() => props.options ?? []);

const filtered = computed<Option[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return normalized.value;
  return normalized.value.filter((o) => o.label.toLowerCase().includes(q));
});

const selectedOption = computed<Option | undefined>(() => {
  if (!props.modelValue) return undefined;
  return normalized.value.find((o) => o.value === props.modelValue);
});

function onSelect(o: Option) {
  // Если кликнули на уже выбранную опцию
  if (props.modelValue === o.value) {
    // Разрешаем сброс только если allowDeselect = true
    if (props.allowDeselect) {
      emit('update:modelValue', '');
    }
    // В любом случае закрываем меню
    open.value = false;
    return;
  }

  // Выбираем новую опцию
  emit('update:modelValue', o.value);
  open.value = false;
}
</script>
