<template>
  <div
    class="glass-deep p-2 space-y-2"
    :style="{ borderRadius: `calc(var(--radius-sm))` }"
  >
    <div class="flex items-center justify-between">
      <div class="font-medium">{{ item.title }}</div>
    </div>
    <div class="space-y-2">
      <ExpandableText
        :text="item.content"
        class="text-sm text-gray-300"
        :max-lines="3"
      />
    </div>
    <Separator class="mt-2" />
    <div class="flex justify-end z-1" @click.stop>
      <Button
        v-tooltip="'Скопировать текст'"
        variant="ghost"
        size="sm"
        class="p-3 min-w-[44px] min-h-[44px]"
        @click="handleCopy"
      >
        <IconCopy class="w-4 h-4" />
      </Button>
      <div
        v-tooltip="isAdded ? 'Промпт уже добавлен' : 'Добавить в мои промпты'"
        class="inline-block"
      >
        <Button
          variant="ghost"
          size="sm"
          :disabled="isAdded"
          class="p-3 min-w-[44px] min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
          @click="handleAdd"
        >
          <IconPlus class="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CatalogItem } from '@/app/lib/promptsCatalog';
import { ExpandableText } from '@/app/components/ui/expandable-text';
import { Separator } from '@/app/components/ui/shadcn/separator';
import { Button } from '@/app/components/ui/shadcn/button';
import IconPlus from '~icons/lucide/circle-plus';
import IconCopy from '~icons/lucide/copy';
import { useToast } from '@/app/composables/useToast';

const props = defineProps<{
  item: CatalogItem;
  isAdded: boolean;
}>();

const emit = defineEmits<{
  (e: 'copy', text: string): void;
  (e: 'add', item: CatalogItem): void;
}>();

function handleCopy() {
  navigator.clipboard.writeText(props.item.content).then(() => {
    emit('copy', props.item.content);
    useToast('Скопировано', 'Текст промпта в буфере', 'success');
  });
}

function handleAdd() {
  emit('add', props.item);
}
</script>
