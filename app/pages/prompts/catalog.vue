<template>
  <div
    class="xs:space-y-3 space-y-1 h-full overflow-y-auto rounded-lg pb-[100px]"
  >
    <PageHeader
      title="Каталог промптов"
      :show-back-button="true"
      @go-back="handleGoBack"
    />
    <div class="">
      <CatalogPromptsList
        :categories="filteredCategories"
        :is-already-added="isAlreadyAdded"
        @copy="handleCopy"
        @add="handleAdd"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { promptsCatalog } from '@/app/lib/promptsCatalog';
import { usePromptsStore } from '@/app/stores/prompts';
import { useToast } from '@/app/composables/useToast';
import CatalogPromptsList from '@/app/components/prompts/CatalogPromptsList.vue';
import { useCopyToClipboard } from '@/app/composables/useCopyToClipboard';
import type { CatalogItem } from '@/app/lib/promptsCatalog';
import type { UserPrompt } from '@/app/types';

const prompts = usePromptsStore();
const route = useRoute();
const router = useRouter();

// Получаем тип из query параметра (habits | therapy)
const contextType = computed(() => {
  const type = route.query.type as string;
  return type === 'habits' || type === 'therapy' ? type : null;
});

// Обработчик кнопки "Назад"
function handleGoBack() {
  router.back();
}

// Фильтруем категории по типу контекста
const filteredCategories = computed(() => {
  if (!contextType.value) {
    // Если нет контекста, показываем все
    return promptsCatalog.categories;
  }

  return promptsCatalog.categories.filter(
    (cat) => cat.type === contextType.value
  );
});

onMounted(async () => {
  await prompts.fetch();
});

const isAlreadyAdded = (catalogItem: CatalogItem) => {
  if (!prompts.items) return false;

  return prompts.items.some((userPrompt: UserPrompt) => {
    return userPrompt.content.trim() === catalogItem.content.trim();
  });
};

const { copy } = useCopyToClipboard();

async function handleCopy(text: string) {
  await copy(text);
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

  useToast('Добавлено', 'Промпт добавлен в мои');
}
</script>
