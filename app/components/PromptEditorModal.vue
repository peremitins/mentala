<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="w-[640px] max-w-[95vw] bg-background border-border rounded-lg"
    >
      <DialogHeader>
        <DialogTitle class="text-base font-semibold">
          {{ isEdit ? 'Редактировать промпт' : 'Новый промпт' }}
        </DialogTitle>
      </DialogHeader>

      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs text-foreground opacity-90">Название</label>
              <span class="text-[10px] text-muted-foreground opacity-70">
                {{ form.title.length }}/120
              </span>
            </div>
            <Input
              v-model="form.title"
              :maxlength="120"
              :show-clear-button="true"
            />
          </div>
          <label
            class="flex items-center gap-2 text-xs text-foreground opacity-90 pt-6 cursor-pointer"
          >
            <Checkbox v-model:checked="form.isActive" id="isActive" />
            Сделать активным
          </label>
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-between">
            <div class="text-xs text-foreground opacity-90">Текст промпта</div>
            <span class="text-[10px] text-muted-foreground opacity-70">
              {{ (form.content || '').length }}/8000
            </span>
          </div>
          <TextareaResize
            v-model="form.content"
            variant="form"
            :max-height="'300px'"
            :min-height="'120px'"
            ref="textareaRef"
          />
        </div>
      </div>

      <DialogFooter class="flex gap-2">
        <Button variant="outline" @click="onCancel"> Отмена </Button>
        <Button type="button" @click="onSave"> Сохранить </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Модалка подтверждения при закрытии с изменениями -->
  <AlertDialog :open="showConfirmDialog" @update:open="setShowConfirmDialog">
    <AlertDialogContent class="bg-background border-border">
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
import { useToast } from '@/app/composables/useToast';
import { useChatSettingsStore } from '@/app/stores/chatSettings';
import { Input } from '@/app/components/ui/shadcn/input';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';
import { nextTick } from 'vue';
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

// Определяем тип автоматически из роутера или из initial
const route = useRoute();
const promptType = computed(() => {
  // Если тип есть в initial, используем его
  if (props.initial?.type) {
    return props.initial.type as 'therapy' | 'habits';
  }
  // Иначе определяем из роутера
  if (route.path.includes('/therapy')) {
    return 'therapy';
  }
  if (route.path.includes('/habits')) {
    return 'habits';
  }
  // По умолчанию therapy
  return 'therapy';
});

const form = reactive({
  id: props.initial?.id as number | undefined,
  title: props.initial?.title || '',
  type: (props.initial?.type || promptType.value) as 'therapy' | 'habits',
  lang: (props.initial?.lang || 'ru') as 'ru' | 'en',
  content: props.initial?.content || ('' as string),
  isActive: Boolean(props.initial?.isActive),
});

// Убеждаемся, что тип установлен при инициализации
// Используем nextTick, чтобы убедиться, что promptType вычислен
nextTick(() => {
  if (!props.initial?.type && !form.type) {
    form.type = promptType.value;
  }
});

const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);

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
    form.type !== (originalData.value.type || promptType.value) ||
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
    const initialType = (v?.type || promptType.value) as 'therapy' | 'habits';
    Object.assign(form, {
      id: (v as any)?.id,
      title: v?.title || '',
      type: initialType,
      lang: ((v?.lang as any) || 'ru') as any,
      content: v?.content || ('' as string),
      isActive: Boolean(v?.isActive),
    });
    // Убеждаемся, что тип установлен для нового промпта
    if (!v?.id) {
      form.type = initialType;
    }
    saveOriginalData();
  },
  { immediate: true }
);

// Обновляем тип при изменении роутера
watch(
  () => promptType.value,
  (newType) => {
    if (!props.initial?.id && !form.id) {
      // Только для новых промптов
      form.type = newType;
    }
  }
);

// Отслеживание изменений в форме
watch(
  () => [form.title, form.content, form.type, form.lang, form.isActive],
  () => {
    // Изменения отслеживаются через computed hasChanges
  },
  { deep: true }
);

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
  // Валидация
  const titleTrimmed = (form.title || '').trim();
  const contentTrimmed = (form.content || '').trim();

  if (titleTrimmed.length < 1 || titleTrimmed.length > 120) {
    return useToast('Ошибка', 'Название 1..120 символов');
  }
  if (contentTrimmed.length === 0) {
    return useToast('Ошибка', 'Текст промпта обязателен');
  }
  if (contentTrimmed.length > 8000) {
    return useToast('Ошибка', 'Текст не должен превышать 8000 символов');
  }

  // Убеждаемся, что тип установлен
  const promptTypeValue = form.type || promptType.value;

  // Проверяем, что тип валидный
  if (promptTypeValue !== 'therapy' && promptTypeValue !== 'habits') {
    return useToast('Ошибка', 'Неверный тип промпта');
  }

  try {
    let saved: UserPrompt;
    if (isEdit.value && form.id) {
      saved = await prompts.update(form.id, {
        title: titleTrimmed,
        type: promptTypeValue,
        lang: form.lang,
        content: contentTrimmed,
        isActive: form.isActive,
      } as any);
    } else {
      saved = await prompts.create({
        title: titleTrimmed,
        type: promptTypeValue,
        lang: form.lang || 'ru',
        content: contentTrimmed,
        isActive: form.isActive || false,
      } as any);
    }

    // Эмитим событие с сохранённым промптом
    emit('saved', saved);
    emit('close');

    if (form.isActive) {
      useToast('Активный промпт обновлён', 'Промпт успешно обновлён');
    } else {
      useToast('Сохранено', 'Промпт сохранён');
    }
  } catch (e: any) {
    const errorMessage =
      e?.message || e?.response?.data?.message || 'Не удалось сохранить';
    useToast('Ошибка', errorMessage);
  }
}
</script>
