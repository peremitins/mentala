<template>
  <div class="glass-deep h-full overflow-y-auto">
    <PageHeader title="Каталог промптов" :show-back-button="true" />
    <div class="space-y-4 px-4">
      <Tabs
        :model-value="flt"
        @update:model-value="(v) => (flt = v as any)"
        class="w-full"
      >
        <div
          class="sticky top-[49px] z-50 py-[10px] bg-background/95 backdrop-blur-md"
        >
          <TabsList class="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="therapy">Психотерапия</TabsTrigger>
            <TabsTrigger value="habits">Привычки</TabsTrigger>
            <TabsTrigger value="growth">Личный рост</TabsTrigger>
          </TabsList>
        </div>

        <template v-for="cat in promptsCatalog.categories" :key="cat.id">
          <TabsContent :value="cat.type" class="mt-0">
            <CatalogPromptCard
              v-for="item in cat.items"
              :key="item.id"
              :item="item"
              :is-added="isAlreadyAdded(item)"
              @copy="handleCopy"
              @add="handleAdd"
            />
          </TabsContent>
        </template>

        <TabsContent value="all" class="mt-0">
          <CatalogPromptsList
            :categories="promptsCatalog.categories"
            :is-already-added="isAlreadyAdded"
            @copy="handleCopy"
            @add="handleAdd"
          />
        </TabsContent>
      </Tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { promptsCatalog } from '@/app/lib/promptsCatalog';
import { usePromptsStore } from '@/app/stores/prompts';
import { useToast } from '@/app/composables/useToast';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/ui/shadcn/tabs';
import CatalogPromptCard from '@/app/components/prompts/CatalogPromptCard.vue';
import CatalogPromptsList from '@/app/components/prompts/CatalogPromptsList.vue';
import type { CatalogItem } from '@/app/lib/promptsCatalog';
import type { UserPrompt } from '@/app/types';

const prompts = usePromptsStore();
const flt = ref<'all' | 'habits' | 'therapy' | 'growth'>('all');

onMounted(async () => {
  await prompts.fetch();
});

const isAlreadyAdded = (catalogItem: CatalogItem) => {
  if (!prompts.items) return false;

  return prompts.items.some((userPrompt: UserPrompt) => {
    return userPrompt.content.trim() === catalogItem.content.trim();
  });
};

function handleCopy(text: string) {
  navigator.clipboard.writeText(text);
}

function handleAdd(item: CatalogItem) {
  if (isAlreadyAdded(item)) {
    useToast('Уже добавлен', 'Этот промпт уже есть в вашем списке', 'warning');
    return;
  }

  const cat = promptsCatalog.categories.find((c) =>
    c.items.some((x) => x.id === item.id)
  );
  const type = cat?.type || 'therapy';

  prompts.create({
    title: item.title,
    content: item.content,
    type,
    isActive: false,
  });

  useToast('Добавлено', 'Промпт добавлен в мои', 'success');
}
</script>
