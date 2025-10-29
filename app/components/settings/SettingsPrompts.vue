<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between w-full gap-2">
      <Combobox
        class="!max-w-[200px] w-full"
        :model-value="chatSettings.mode"
        :options="AI_WORK_MODE_OPTIONS"
        @update:model-value="handleModeChange"
      />
      <NuxtLink
        class="underline text-xs opacity-80 whitespace-nowrap"
        to="/prompts/catalog"
      >
        Каталог
      </NuxtLink>
    </div>

    <div v-if="prompts.length === 0" class="text-sm opacity-70">
      Промптов пока нет.
      <button
        @click="handleAdd"
        class="text-primary cursor-pointer hover:text-primary/80 transition-colors underline"
      >
        Добавьте свой
      </button>
      или возьмите из каталога.
    </div>

    <RadioGroup :model-value="activeId" class="w-full gap-3">
      <div
        v-for="prompt in prompts"
        :key="prompt.id"
        class="border-input [:has([data-state=checked])]:border-primary/50 relative flex items-center justify-between gap-2 rounded-md border p-2 shadow-xs outline-none bg-white/5"
      >
        <div class="flex gap-2 w-full">
          <div class="flex items-start">
            <RadioGroupItem
              :value="String(prompt.id)"
              :id="`${uid}-${prompt.id}`"
              @click="handleActivate(prompt.id)"
              :aria-describedby="`${uid}-${prompt.id}-desc`"
              class="size-5 after:absolute after:inset-0 [&_svg]:size-3 cursor-pointer"
            />
          </div>
          <div class="grid grow gap-1 z-1">
            <Label
              :for="`${uid}-${prompt.id}`"
              class="leading-[20px] justify-between cursor-pointer"
            >
              <span class="font-medium">{{ prompt.title }}</span>
            </Label>
            <ExpandableText
              :text="prompt.content"
              :id="`${uid}-${prompt.id}-desc`"
              class="text-muted-foreground"
            />
            <Separator class="mt-2" />
            <div class="flex justify-end z-1" @click.stop>
              <Button
                variant="ghost"
                size="sm"
                @click="handleEdit(prompt)"
                title="Редактировать"
                class="p-3 min-w-[44px] min-h-[44px]"
              >
                <IconEdit class="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="handleRemove(prompt.id)"
                title="Удалить"
                class="p-3 min-w-[44px] min-h-[44px] text-red-300 hover:text-red-200"
              >
                <IconTrash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </RadioGroup>

    <button
      v-tooltip.bottom="'Добавить промпт'"
      class="fixed right-3 bottom-3 grid place-items-center z-10"
      :style="{ borderRadius: 'var(--radius-icon)' }"
      @click="handleAdd"
      aria-label="Добавить пользователя"
    >
      <IconCirclePlus class="w-5 h-5" />
    </button>

    <!-- Модальное окно редактора -->
    <PromptEditorModal
      :open="editorOpen"
      :initial="editorItem"
      @close="editorOpen = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { usePromptsStore } from '@/app/stores/prompts';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { useToast } from '@/app/composables/useToast';
import { AI_WORK_MODE_OPTIONS } from '@/app/constants/select-options';
import { ExpandableText } from '@/app/components/ui/expandable-text';
import { Label } from 'radix-vue';
import Combobox from '@/app/components/Combobox.vue';
import type { UserPrompt } from '@/app/types';
import IconEdit from '~icons/lucide/edit';
import IconCopy from '~icons/lucide/copy';
import IconTrash2 from '~icons/lucide/trash-2';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/app/components/ui/shadcn/radio-group';
import { Separator } from '@/app/components/ui/shadcn/separator';
import { Button } from '@/app/components/ui/shadcn/button';
import PromptEditorModal from '@/app/components/PromptEditorModal.vue';
import IconCirclePlus from '~icons/lucide/circle-plus';

const promptsStore = usePromptsStore();
const chatSettings = useChatSettingsStore();
const uid = useId();

// Внутреннее состояние для модального окна
const editorOpen = ref(false);
const editorItem = ref<Partial<UserPrompt> | null>(null);

// Вычисляемые свойства
const prompts = computed(() =>
  promptsStore.items.filter((x) => x.type === chatSettings.mode)
);

const activeId = computed(() => {
  const active = prompts.value.find((p: any) => p.isActive);
  return active
    ? String(active.id)
    : prompts.value[0]
      ? String(prompts.value[0].id)
      : '';
});

// Загружаем промпты при монтировании компонента
onMounted(async () => {
  await promptsStore.fetch();
});

// Методы
async function handleActivate(id: number) {
  const p = promptsStore.items.find((x) => x.id === id);
  if (!p || id === Number(activeId.value)) return;
  await promptsStore.activate(id);
  if (p) useToast('Активный промпт обновлён', `Тип: ${p.type}`, 'success');
}

function handleEdit(prompt: UserPrompt) {
  editorItem.value = prompt;
  editorOpen.value = true;
}

async function handleRemove(id: number) {
  const res = await promptsStore.remove(id);
  if (res) {
    useToast('Готово', 'Промпт удалён', 'success');
  }
}

function handleDuplicate(prompt: UserPrompt) {
  editorItem.value = {
    ...prompt,
    id: undefined,
    title: `${prompt.title} (копия)`,
    isActive: false,
  };
  editorOpen.value = true;
}

function handleAdd() {
  editorItem.value = { type: chatSettings.mode, lang: 'ru' } as any;
  editorOpen.value = true;
}

async function handleModeChange(newMode: string) {
  await chatSettings.updateChatSettings({ mode: newMode });
}

function onSaved(item: UserPrompt) {
  if (item.type !== chatSettings.mode) chatSettings.mode = item.type;
}
</script>
