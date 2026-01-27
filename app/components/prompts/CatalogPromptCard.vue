<template>
  <div
    class="group relative overflow-hidden rounded-xl border-2 border-border bg-card p-4 space-y-2 transition-all duration-200 hover:border-primary-ui/50 hover:-translate-y-0.5 hover:shadow-lg animate-slide-up"
    :style="`animation-delay: ${(index ?? 0) * 0.05}s; animation-fill-mode: both`"
  >
    <div class="flex items-center justify-between">
      <div class="font-semibold text-card-foreground">{{ item.title }}</div>
    </div>
    <div class="space-y-2">
      <ExpandableText
        :text="item.content"
        class="text-sm text-foreground"
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
import { Button } from '@/app/components/ui/button';
import IconPlus from '~icons/lucide/circle-plus';
import IconCopy from '~icons/lucide/copy';

const props = withDefaults(
  defineProps<{
    item: CatalogItem;
    isAdded: boolean;
    index?: number;
  }>(),
  {
    index: 0,
  }
);

const emit = defineEmits<{
  (e: 'copy', text: string): void;
  (e: 'add', item: CatalogItem): void;
}>();

async function handleCopy() {
  emit('copy', props.item.content);
}

function handleAdd() {
  emit('add', props.item);
}
</script>
