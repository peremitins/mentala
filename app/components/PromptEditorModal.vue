<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="w-[640px] max-w-[95vw] bg-background border-border gray:bg-neutral-800 gray:border-neutral-700"
    >
      <DialogHeader>
        <DialogTitle class="text-base font-semibold">
          {{ isEdit ? 'Редактировать промпт' : 'Новый промпт' }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-2">
          <label class="text-xs opacity-80"
            >Название
            <input
              v-model="form.title"
              class="w-full mt-1 px-2 py-1 rounded-md bg-background border border-input gray:bg-neutral-700 gray:border-neutral-600"
            />
          </label>
          <div class="text-sm opacity-80">Тип</div>

          <Combobox
            v-model="form.type"
            :options="AI_WORK_MODE_OPTIONS"
            placeholder="Выберите режим"
          />
          <label class="flex items-center gap-2 text-xs opacity-80 mt-auto">
            <input type="checkbox" v-model="form.isActive" /> Сделать активным
          </label>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <div class="text-xs opacity-80">Текст промпта</div>
            <div class="text-[10px] opacity-60">Подсветка</div>
          </div>
          <textarea
            v-model="form.content"
            rows="10"
            class="w-full bg-background border border-input rounded-md p-2 text-sm whitespace-pre-wrap gray:bg-neutral-700 gray:border-neutral-600"
            @input="highlight"
            ref="textareaRef"
          />
        </div>

        <div class="flex items-center justify-between text-xs">
          <div class="opacity-70">{{ lengthInfo }}</div>
        </div>
      </div>

      <DialogFooter class="flex gap-2">
        <Button variant="outline" @click="onCancel"> Отмена </Button>
        <Button @click="onSave"> Сохранить </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Модалка подтверждения при закрытии с изменениями -->
  <AlertDialog :open="showConfirmDialog" @update:open="setShowConfirmDialog">
    <AlertDialogContent
      class="bg-background border-border gray:bg-neutral-800 gray:border-neutral-700"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>Есть несохраненные изменения</AlertDialogTitle>
        <AlertDialogDescription>
          Вы внесли изменения в промпт. Если вы закроете модалку сейчас, все
          изменения будут потеряны.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="discardChanges">
          Отменить
        </AlertDialogCancel>
        <AlertDialogAction @click="confirmClose">
          Закрыть без сохранения
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { usePromptsStore } from '@/app/stores/prompts';
import type { UserPrompt } from '@/app/types';
import { AI_WORK_MODE_OPTIONS } from '@/app/constants/select-options';
import { useToast } from '@/app/composables/useToast';
import Combobox from '@/app/components/Combobox.vue';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/app/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { Button } from '@/app/components/ui/button';

const chatSettings = useChatSettingsStore();
const props = defineProps<{
  open: boolean;
  initial?: Partial<UserPrompt> | null;
}>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', item: UserPrompt): void;
}>();

const prompts = usePromptsStore();
const isEdit = computed(() => Boolean(props.initial?.id));

// Состояние для отслеживания изменений
const showConfirmDialog = ref(false);
const pendingClose = ref(false);

// Исходные данные для сравнения
const originalData = ref<Partial<UserPrompt>>({});

const form = reactive({
  id: props.initial?.id as number | undefined,
  title: props.initial?.title || '',
  type: (props.initial?.type || 'therapy') as 'therapy' | 'habits',
  lang: (props.initial?.lang || 'ru') as 'ru' | 'en',
  content: props.initial?.content || '',
  isActive: Boolean(props.initial?.isActive),
});

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const highlighted = ref('');

const lengthInfo = computed(
  () => `${form.title.length}/120 • ${form.content.length}/8000`
);

// Проверка на наличие изменений
const hasChanges = computed(() => {
  if (!props.initial) {
    // Для нового промпта проверяем, что хотя бы одно поле заполнено
    return (
      form.title.trim() !== '' ||
      form.content.trim() !== '' ||
      form.isActive !== false
    );
  }

  return (
    form.title !== (originalData.value.title || '') ||
    form.content !== (originalData.value.content || '') ||
    form.type !== (originalData.value.type || 'therapy') ||
    form.lang !== (originalData.value.lang || 'ru') ||
    form.isActive !== Boolean(originalData.value.isActive)
  );
});

// Сохранение исходных данных при инициализации
function saveOriginalData() {
  originalData.value = {
    title: form.title,
    content: form.content,
    type: form.type,
    lang: form.lang,
    isActive: form.isActive,
  };
}

watch(
  () => props.initial,
  (v) => {
    Object.assign(form, {
      id: (v as any)?.id,
      title: v?.title || '',
      type: ((v?.type as any) || 'therapy') as any,
      lang: ((v?.lang as any) || 'ru') as any,
      content: v?.content || '',
      isActive: Boolean(v?.isActive),
    });
    saveOriginalData();
    highlight();
  },
  { immediate: true }
);

// Отслеживание изменений в форме
watch(
  () => [form.title, form.content, form.type, form.lang, form.isActive],
  () => {
    // Изменения отслеживаются через computed hasChanges
  },
  { deep: true }
);

function highlight() {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = esc(form.content).replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    '<span class="text-emerald-400">{{$1}}</span>'
  );
  highlighted.value = html;
}

function onOpenChange(open: boolean) {
  if (!open) {
    if (hasChanges.value) {
      showConfirmDialog.value = true;
      pendingClose.value = true;
    } else {
      emit('close');
    }
  }
}

function onCancel() {
  if (hasChanges.value) {
    showConfirmDialog.value = true;
    pendingClose.value = true;
  } else {
    emit('close');
  }
}

function setShowConfirmDialog(show: boolean) {
  showConfirmDialog.value = show;
  if (!show && pendingClose.value) {
    pendingClose.value = false;
  }
}

function discardChanges() {
  showConfirmDialog.value = false;
  pendingClose.value = false;
}

function confirmClose() {
  showConfirmDialog.value = false;
  pendingClose.value = false;
  emit('close');
}

async function onSave() {
  // Валидация и лимит 10
  if (form.title.trim().length < 1 || form.title.length > 120) {
    return useToast('Ошибка', 'Название 1..120 символов');
  }
  if (form.content.trim().length < 20 || form.content.length > 8000) {
    return useToast('Ошибка', 'Текст 20..8000 символов');
  }

  try {
    let saved: UserPrompt;
    if (isEdit.value && form.id) {
      saved = await prompts.update(form.id, {
        title: form.title,
        type: form.type,
        lang: form.lang,
        content: form.content,
        isActive: form.isActive,
      } as any);
    } else {
      saved = await prompts.create({
        title: form.title,
        type: form.type,
        lang: form.lang,
        content: form.content,
        isActive: form.isActive,
      });
    }

    // Эмитим событие с сохранённым промптом
    emit('saved', saved);
    emit('close');

    if (form.isActive) {
      useToast('Активный промпт обновлён', `Выбран тип: ${form.type}`);
    } else {
      useToast('Сохранено', 'Промпт сохранён');
    }
  } catch (e: any) {
    useToast('Ошибка', String(e?.message || 'Не удалось сохранить'));
  }
}
</script>
