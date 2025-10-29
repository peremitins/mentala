<template>
  <div class="w-full max-w-xs space-y-2">
    <Label :for="id">Multiple combobox expandable</Label>

    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          :id="id"
          variant="outline"
          role="combobox"
          :aria-expanded="open"
          class="h-auto min-h-8 w-full justify-between hover:bg-transparent"
        >
          <div class="flex flex-wrap items-center gap-1 pr-2.5">
            <template v-if="selectedValues.length > 0">
              <template v-for="val in visibleItems" :key="val">
                <Badge variant="outline">
                  {{ findLabel(val) }}
                  <Button
                    variant="ghost"
                    size="icon"
                    class="size-4 ml-1"
                    @click.stop="removeSelection(val)"
                  >
                    <IconX class="size-3" />
                  </Button>
                </Badge>
              </template>

              <Badge
                v-if="hiddenCount > 0 || expanded"
                variant="outline"
                class="cursor-pointer select-none"
                @click.stop="expanded = !expanded"
              >
                {{ expanded ? 'Скрыть' : `+${hiddenCount} ещё` }}
              </Badge>
            </template>

            <span v-else class="text-muted-foreground">Выберите фреймворк</span>
          </div>

          <IconChevronsUpDown
            class="w-4 h-4 text-muted-foreground/80 shrink-0"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent class="w-[--radix-popper-anchor-width] p-0">
        <Command>
          <CommandInput placeholder="Поиск фреймворка..." />
          <CommandList>
            <CommandEmpty>Не найдено.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                v-for="framework in filteredFrameworks"
                :key="framework.value"
                :value="framework.label"
                @select="toggleSelection(framework.value)"
              >
                <span class="truncate">{{ framework.label }}</span>
                <IconCheck
                  v-if="selectedValues.includes(framework.value)"
                  class="ml-auto w-4 h-4 opacity-80"
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
import { useId } from 'radix-vue';

import IconCheck from '~icons/lucide/check';
import IconChevronsUpDown from '~icons/lucide/chevrons-up-down';
import IconX from '~icons/lucide/x';

interface Framework {
  value: string;
  label: string;
}

const props = defineProps<{
  modelValue: string[];
  options: Framework[];
}>();

const frameworks = computed(() => props.options);

const id = useId();
const open = ref(false);
const expanded = ref(false);
const search = ref('');
const selectedValues = ref<string[]>([]);

const maxShownItems = 2;
const visibleItems = computed(() =>
  expanded.value
    ? selectedValues.value
    : selectedValues.value.slice(0, maxShownItems)
);
const hiddenCount = computed(
  () => selectedValues.value.length - visibleItems.value.length
);

const filteredFrameworks = computed(() =>
  frameworks.value.filter((f) =>
    f.label.toLowerCase().includes(search.value.toLowerCase())
  )
);

function toggleSelection(value: string) {
  if (selectedValues.value.includes(value)) {
    selectedValues.value = selectedValues.value.filter((v) => v !== value);
  } else {
    selectedValues.value.push(value);
  }
}

function removeSelection(value: string) {
  selectedValues.value = selectedValues.value.filter((v) => v !== value);
}

function findLabel(value: string) {
  return frameworks.value.find((f) => f.value === value)?.label || value;
}
</script>
