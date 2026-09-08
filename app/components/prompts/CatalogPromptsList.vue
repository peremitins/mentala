<template>
  <div class="space-y-2">
    <template v-for="cat in categories" :key="cat.id">
      <div class="space-y-3 mb-6">
        <CatalogPromptCard
          v-for="(item, index) in cat.items"
          :key="item.id"
          :item="item"
          :is-added="isAlreadyAdded(item)"
          :index="index"
          @copy="handleCopy"
          @add="handleAdd"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CatalogCategory, CatalogItem } from '@/app/lib/promptsCatalog';
import CatalogPromptCard from './CatalogPromptCard.vue';

defineProps<{
  categories: CatalogCategory[];
  isAlreadyAdded: (item: CatalogItem) => boolean;
}>();

const emit = defineEmits<{
  (e: 'copy', text: string): void;
  (e: 'add', item: CatalogItem): void;
}>();

function handleCopy(text: string) {
  emit('copy', text);
}

function handleAdd(item: CatalogItem) {
  emit('add', item);
}
</script>
