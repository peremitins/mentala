<template>
  <div class="space-y-2 h-full overflow-y-auto rounded-lg pb-[80px]">
    <PageHeader
      title="Тексты уведомлений"
      :show-back-button="true"
      @go-back="goBack"
    />

    <section class="flex-1 overflow-y-auto space-y-4 pb-[100px]">
      <!-- Заголовок с информацией -->
      <div>
        <h2 class="text-lg font-semibold text-foreground">
          {{ entityName }} — Тексты уведомлений
        </h2>
        <p class="text-sm text-foreground">
          {{ filteredTextsCount }} текстов • Источник: Шаблоны + ваши
        </p>
      </div>

      <!-- Фильтры -->
      <div class="space-y-3">
        <!-- Фокус уведомлений -->
        <div>
          <label class="text-sm font-medium text-foreground mb-2 block">
            Фокус уведомлений
          </label>
          <ToggleGroup
            :model-value="selectedSubtype || ''"
            type="single"
            class="inline-flex w-full gap-2 overflow-auto"
            @update:model-value="handleSubtypeChange"
          >
            <ToggleGroupItem
              v-for="option in subtypeOptions"
              :key="option.value"
              :value="option.value"
              class="flex-1 rounded-lg px-2 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
            >
              {{ option.icon }} {{ option.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <!-- Стиль уведомлений -->
        <div>
          <label class="text-sm font-medium text-foreground mb-2 block">
            Стиль уведомлений
          </label>
          <ToggleGroup
            :model-value="selectedDirectness"
            type="single"
            class="inline-flex w-full gap-2 overflow-auto"
            @update:model-value="handleDirectnessChange"
          >
            <ToggleGroupItem
              v-for="option in DIRECTNESS_OPTIONS"
              :key="option.value"
              :value="option.value"
              class="flex-1 rounded-lg px-2 py-2 text-xs xs:text-sm whitespace-nowrap font-medium transition-all"
            >
              {{ option.icon }} {{ option.label }}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <!-- Скелетон при загрузке -->
      <Skeleton v-if="loading" type="notification-text" :count="5" />

      <!-- Список текстов -->
      <TransitionGroup v-else name="list" tag="div" class="space-y-3">
        <div
          v-for="(text, index) in localTexts"
          :key="text.id || text.tempId"
          :data-text-id="text.id || text.tempId"
          class="rounded-lg border border-border bg-transparent p-3 transition-all shadow-sm relative overflow-hidden list-item hover:border-primary-ui"
          :class="{
            'border-primary-ui ring-2 ring-primary-ui/20':
              editingId === (text.id || text.tempId),
            'opacity-50': text.toDelete,
          }"
        >
          <!-- Цветная полоска слева -->
          <div
            v-if="text.source === 'user'"
            class="absolute left-0 top-0 bottom-0 w-1 bg-primary-ui"
          />

          <!-- Компактный режим -->
          <div
            v-if="editingId !== (text.id || text.tempId)"
            class="flex items-center gap-3"
            @click="startEdit(text)"
          >
            <div class="flex-1 truncate text-sm text-foreground cursor-pointer">
              {{ text.text }}
            </div>
            <div class="flex items-center gap-1">
              <button
                class="inline-flex items-center justify-center rounded-md p-1.5 text-foreground hover:text-primary-ui hover:bg-primary-ui/10 transition-colors"
                aria-label="Редактировать"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 013.536 3.536L6.5 20.5 3 21l.5-3.5L16.732 3.732z"
                  />
                </svg>
              </button>
              <button
                class="delete-button inline-flex items-center justify-center rounded-md p-1.5 transition-colors"
                :class="{
                  'text-destructive bg-destructive/10': text.toDelete,
                  'text-foreground': !text.toDelete,
                }"
                @click.stop="markForDelete(text)"
                aria-label="Удалить"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Режим редактирования -->
          <div
            v-else-if="editingId === (text.id || text.tempId)"
            :data-text-id="text.id || text.tempId"
            class="space-y-3"
          >
            <TextareaResize
              ref="textareaRef"
              v-model="editModel"
              class="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              :max-length="MAX_NOTIFICATION_TEXT_LENGTH"
            />
            <div class="flex items-center justify-between text-xs">
              <span class="text-foreground">
                Можно использовать {name} для подстановки имени
              </span>
              <span
                :class="{
                  'text-destructive':
                    editModel?.length > MAX_NOTIFICATION_TEXT_LENGTH,
                  'text-foreground':
                    editModel?.length <= MAX_NOTIFICATION_TEXT_LENGTH,
                }"
              >
                {{ editModel?.length }}/{{ MAX_NOTIFICATION_TEXT_LENGTH }}
              </span>
            </div>
          </div>
        </div>
      </TransitionGroup>

      <!-- Кнопка добавления -->
      <button
        class="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary-ui hover:text-primary-ui transition-colors w-full"
        @click="addNewText"
      >
        <svg
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        Добавить текст
      </button>

      <!-- Восстановление дефолтных -->
      <div class="rounded-lg border border-border bg-transparent p-4 space-y-3">
        <h3 class="text-sm font-semibold text-foreground">
          Восстановить стандартные шаблоны
        </h3>
        <div class="flex items-center gap-2">
          <Checkbox id="keepUserTexts" v-model:checked="keepUserTexts" />
          <label
            for="keepUserTexts"
            class="text-sm text-foreground cursor-pointer"
          >
            Сохранить мои тексты ({{ userTextsCount }})
          </label>
        </div>
        <p class="text-xs text-foreground">
          Ваши тексты останутся, дефолтные будут добавлены обратно
        </p>
        <button
          class="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-transparent px-4 py-2.5 text-sm font-medium text-foreground hover:border-primary-ui hover:text-primary-ui transition-colors w-full"
          @click="handleReset"
        >
          <svg
            class="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Восстановить дефолтные тексты
        </button>
      </div>
    </section>

    <!-- Фиксированная кнопка сохранения -->
    <div class="sticky bottom-[20px]">
      <button
        class="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors w-full disabled:opacity-70 disabled:cursor-not-allowed"
        :disabled="!hasChanges || saving"
        @click="handleSave"
      >
        <svg
          v-if="saving"
          class="h-4 w-4 animate-spin"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <svg
          v-else
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span v-if="saving">Сохранение...</span>
        <span v-else>Сохранить изменения ({{ changesCount }})</span>
      </button>
    </div>

    <!-- Модалка подтверждения сброса -->
    <ConfirmModal
      ref="resetModalRef"
      :title="`Сбросить тексты для ${entityName}?`"
      :subtitle="`Будут восстановлены стандартные тексты.\n⚠️ ВНИМАНИЕ: Все ваши изменения стандартных текстов будут потеряны.\n\nВаши ${userTextsCount} пользовательских текстов будут сохранены, если включена галочка.`"
      confirm-label="Сбросить"
      cancel-label="Отмена"
      @confirm="handleResetConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { nanoid } from 'nanoid';
import type {
  NotificationText,
  NotificationSubtype,
  Directness,
} from '@/shared/dto/notifications';
import { MAX_NOTIFICATION_TEXT_LENGTH } from '@/shared/dto/notifications';
import { useNotificationTexts } from '@/app/composables/useNotificationTexts';
import PageHeader from '@/app/components/PageHeader.vue';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import ConfirmModal from '@/app/components/ui/ConfirmModal.vue';
import Skeleton from '@/app/components/ui/Skeleton.vue';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';
import { useToast } from '@/app/composables/useToast';
import { findHabitByKey } from '@/app/lib/habitsCatalog';
import { THERAPY_TOPICS } from '@/app/lib/therapyCatalog';
import ToggleGroup from '@/app/components/ui/toggle-group/ToggleGroup.vue';
import ToggleGroupItem from '@/app/components/ui/toggle-group/ToggleGroupItem.vue';
import {
  SUBTYPE_OPTIONS,
  SUBTYPE_OPTIONS_BUILD_WITHOUT_MIXED,
  SUBTYPE_OPTIONS_QUIT_WITHOUT_MIXED,
  SUBTYPE_OPTIONS_WITHOUT_MIXED,
  DIRECTNESS_OPTIONS,
} from '@/app/constants/select-options';

const props = defineProps<{
  kind: 'habits' | 'therapy';
  entityKey: string;
}>();

const route = useRoute();
const router = useRouter();
const { texts, loading, saving, fetchTexts, saveChanges, resetDefaults } =
  useNotificationTexts(props.kind, props.entityKey);

// Фильтры из URL
const selectedSubtype = ref<NotificationSubtype | null>(
  (route.query.subtype as NotificationSubtype) || null
);
const selectedDirectness = ref<Directness>(
  (route.query.directness as Directness) || 'moderate'
);

// Определяем intent для фильтрации subtype опций
const entityIntent = computed<'build' | 'quit' | null>(() => {
  if (props.kind === 'habits') {
    const habit = findHabitByKey(props.entityKey);
    return habit?.intent || 'build';
  }
  return null;
});

// Опции для subtype в зависимости от типа сущности (без "Смешанные" для редактора)
const subtypeOptions = computed(() => {
  if (props.kind === 'therapy') {
    return SUBTYPE_OPTIONS_WITHOUT_MIXED;
  }
  // Для привычек фильтруем по intent
  const intent = entityIntent.value ?? 'build';
  return intent === 'quit'
    ? SUBTYPE_OPTIONS_QUIT_WITHOUT_MIXED
    : SUBTYPE_OPTIONS_BUILD_WITHOUT_MIXED;
});

// Количество отфильтрованных текстов
const filteredTextsCount = computed(() => {
  return localTexts.value.length;
});

// Локальная модель с флагами изменений
interface LocalText extends NotificationText {
  tempId?: string;
  isNew?: boolean;
  isDirty?: boolean;
  toDelete?: boolean;
}

const localTexts = ref<LocalText[]>([]);
const editingId = ref<string | null>(null);
const editModel = ref('');
const keepUserTexts = ref(true);
const resetModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const textareaRef = ref<InstanceType<typeof TextareaResize> | null>(null);
let clickOutsideStop: (() => void) | null = null;

// Получаем название сущности
const entityName = computed(() => {
  if (props.kind === 'habits') {
    const habit = findHabitByKey(props.entityKey);
    return habit?.name || props.entityKey;
  } else {
    const topic = THERAPY_TOPICS.find((t) => t.key === props.entityKey);
    return topic?.name || props.entityKey;
  }
});

// Подсчет изменений
const hasChanges = computed(() => {
  return localTexts.value.some((t) => t.isDirty || t.isNew || t.toDelete);
});

const changesCount = computed(() => {
  return localTexts.value.filter((t) => t.isDirty || t.isNew || t.toDelete)
    .length;
});

const userTextsCount = computed(() => {
  return localTexts.value.filter((t) => t.source === 'user' && !t.toDelete)
    .length;
});

// Функция сортировки: сначала default, потом custom, внутри каждой группы по дате создания
function sortTexts(textsArray: LocalText[]): LocalText[] {
  return [...textsArray].sort((a, b) => {
    // Сначала default (source === 'default' или userId === null)
    const aIsDefault = a.source === 'default' || a.userId === null;
    const bIsDefault = b.source === 'default' || b.userId === null;

    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;

    // Если оба одного типа, сортируем по дате создания (старые сначала)
    const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aDate - bDate;
  });
}

// Функция обновления URL с фильтрами
function updateURLFilters() {
  const query = { ...route.query };

  if (selectedSubtype.value) {
    query.subtype = selectedSubtype.value;
  } else {
    // Удаляем subtype из URL, если он сброшен
    delete query.subtype;
  }

  if (selectedDirectness.value && selectedDirectness.value !== 'moderate') {
    query.directness = selectedDirectness.value;
  } else {
    // Удаляем directness из URL, если он сброшен или равен дефолтному
    delete query.directness;
  }

  router.replace({ query });
}

// Обработчики изменения фильтров
async function handleSubtypeChange(value: string | string[] | null) {
  const subtypeValue = Array.isArray(value) ? value[0] : value;
  selectedSubtype.value = (subtypeValue as NotificationSubtype) || null;
  updateURLFilters();
  await loadTextsWithFilters();
}

async function handleDirectnessChange(value: string | string[] | null) {
  const directnessValue = Array.isArray(value) ? value[0] : value;
  if (!directnessValue) return;
  selectedDirectness.value = directnessValue as Directness;
  updateURLFilters();
  await loadTextsWithFilters();
}

// Загрузка текстов с фильтрами
async function loadTextsWithFilters() {
  // Сохраняем новые тексты перед загрузкой
  const newTexts = localTexts.value.filter((t) => t.isNew && !t.toDelete);

  await fetchTexts({
    subtype: selectedSubtype.value || undefined,
    directness: selectedDirectness.value || undefined,
  });

  // Объединяем загруженные тексты с новыми (если есть)
  const loadedTexts = texts.value.map((t) => ({ ...t }));

  if (newTexts.length > 0) {
    // Добавляем новые тексты к загруженным
    loadedTexts.push(...newTexts);
  }

  // Обновляем локальные тексты
  localTexts.value = sortTexts(loadedTexts);
}

// Загрузка текстов при монтировании
onMounted(async () => {
  // Проверяем, есть ли фильтры в URL при переходе со страницы настроек
  const querySubtype = route.query.subtype as NotificationSubtype | undefined;
  const queryDirectness = route.query.directness as Directness | undefined;

  // Если выбран "Смешанные" (mixed), которого нет на странице редактора,
  // выбираем первую доступную опцию
  if (querySubtype === 'mixed') {
    const firstOption = subtypeOptions.value[0];
    if (firstOption) {
      selectedSubtype.value = firstOption.value as NotificationSubtype;
    } else {
      selectedSubtype.value = null;
    }
  } else if (querySubtype) {
    selectedSubtype.value = querySubtype;
  }

  if (queryDirectness) {
    selectedDirectness.value = queryDirectness;
  }

  // Обновляем URL после установки всех значений (если subtype был 'mixed')
  if (querySubtype === 'mixed') {
    updateURLFilters();
  }

  await loadTextsWithFilters();
});

watch(texts, (newTexts) => {
  // Сохраняем новые тексты перед обновлением
  const newTextsToKeep = localTexts.value.filter((t) => t.isNew && !t.toDelete);

  const loadedTexts = newTexts.map((t) => ({ ...t }));

  if (newTextsToKeep.length > 0) {
    loadedTexts.push(...newTextsToKeep);
  }

  // Обновляем только если нет незавершенных изменений (кроме новых текстов)
  const hasOtherChanges = localTexts.value.some(
    (t) => (t.isDirty || t.toDelete) && !t.isNew
  );

  if (!hasOtherChanges) {
    localTexts.value = sortTexts(loadedTexts);
  }
});

// Следим за изменениями URL (например, при использовании кнопки "Назад")
watch(
  () => route.query,
  async (newQuery) => {
    const newSubtype = (newQuery.subtype as NotificationSubtype) || null;
    const newDirectness = (newQuery.directness as Directness) || 'moderate';

    let needsReload = false;

    if (newSubtype !== selectedSubtype.value) {
      selectedSubtype.value = newSubtype;
      needsReload = true;
    }
    if (newDirectness !== selectedDirectness.value) {
      selectedDirectness.value = newDirectness;
      needsReload = true;
    }

    // Перезагружаем тексты, если фильтры изменились
    if (needsReload) {
      await loadTextsWithFilters();
    }
  }
);

// Редактирование
function startEdit(text: LocalText) {
  editingId.value = text.id || text.tempId || null;
  editModel.value = text.text;

  // Устанавливаем фокус на textarea после обновления DOM
  const textId = text.id || text.tempId;
  if (!textId) return;

  // Используем комбинацию nextTick и setTimeout для гарантии, что DOM полностью обновлен
  nextTick(() => {
    // Ищем textarea внутри нужного элемента по data-text-id
    const cardElement = document.querySelector(
      `[data-text-id="${textId}"]`
    ) as HTMLElement | null;

    if (cardElement) {
      const textarea = cardElement.querySelector(
        'textarea'
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        // Используем setTimeout для гарантии, что элемент полностью отрендерен
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(0, 0);
        }, 10);
      }
    }
  });
}

function finishEdit() {
  if (!editingId.value) return;

  const text = localTexts.value.find(
    (t) => (t.id || t.tempId) === editingId.value
  );
  if (text && editModel.value !== text.text) {
    text.text = editModel.value;
    text.isDirty = true;
  }

  editingId.value = null;
  editModel.value = '';
}

// Click outside для закрытия редактирования
watch(editingId, (newId, oldId) => {
  // Останавливаем предыдущий обработчик
  if (clickOutsideStop) {
    clickOutsideStop();
    clickOutsideStop = null;
  }

  if (newId) {
    // Ждём, пока DOM обновится
    nextTick(() => {
      // Находим элемент по data-text-id
      const element = document.querySelector(
        `[data-text-id="${newId}"]`
      ) as HTMLElement | null;

      if (element) {
        const stop = onClickOutside(element, (event) => {
          // Игнорируем клики на элементы внутри карточки
          const target = event.target as HTMLElement;

          // Если клик был внутри самой карточки - игнорируем
          if (element.contains(target)) {
            return;
          }

          // Проверяем, что редактирование всё ещё активно
          if (editingId.value === newId) {
            finishEdit();
          }
        });
        clickOutsideStop = stop;
      }
    });
  } else {
    // Когда редактирование закрывается, сбрасываем ref textarea
    textareaRef.value = null;
  }
});

// Удаление
function markForDelete(text: LocalText) {
  if (text.isNew) {
    // Удаляем из списка, если это новый текст
    const index = localTexts.value.findIndex(
      (t) => (t.id || t.tempId) === (text.id || text.tempId)
    );
    if (index !== -1) {
      localTexts.value.splice(index, 1);
    }
  } else {
    text.toDelete = !text.toDelete;
  }
}

// Добавление нового текста
async function addNewText() {
  // Проверяем, есть ли уже пустой новый текст
  const existingEmptyText = localTexts.value.find(
    (t) => t.isNew && !t.toDelete && !t.text.trim()
  );

  if (existingEmptyText) {
    // Если есть пустой новый текст, показываем анимацию и устанавливаем фокус
    const emptyTextId = existingEmptyText.id || existingEmptyText.tempId;
    if (emptyTextId) {
      // Ждём обновления DOM
      await nextTick();
      await nextTick(); // Двойной nextTick для гарантии

      const element = document.querySelector(
        `[data-text-id="${emptyTextId}"]`
      ) as HTMLElement | null;

      if (element) {
        // Убираем класс, если он уже есть (для перезапуска анимации)
        element.classList.remove('animate-shake');

        // Принудительно перезапускаем анимацию через requestAnimationFrame
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.add('animate-shake');

            // Удаляем класс после завершения анимации
            setTimeout(() => {
              element.classList.remove('animate-shake');
            }, 500);
          });
        });
      }
    }

    // Устанавливаем фокус на пустой текст
    nextTick(() => {
      nextTick(() => {
        startEdit(existingEmptyText);
      });
    });
    return;
  }

  // Если есть открытое редактирование, сначала сохраняем его
  if (editingId.value) {
    finishEdit();
  }

  // Создаём новый текст с текущими значениями фильтров
  const newText: LocalText = {
    id: '',
    kind: props.kind,
    entityKey: props.entityKey,
    userId: null,
    source: 'user',
    intent: props.kind === 'habits' ? entityIntent.value : null,
    subtype: selectedSubtype.value,
    directness: selectedDirectness.value,
    addressing: 'universal', // Временное значение, на бэкенде будет заменено на значение из userPreferences
    locale: 'ru',
    text: '',
    sortOrder: 0,
    isDeleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tempId: nanoid(),
    isNew: true,
    isDirty: false,
    toDelete: false,
  };

  // Находим индекс последнего кастомного текста
  let lastCustomIndex = -1;
  for (let i = localTexts.value.length - 1; i >= 0; i--) {
    const t = localTexts.value[i];
    if (
      t &&
      (t.source === 'user' || (t.userId !== null && t.source !== 'default'))
    ) {
      lastCustomIndex = i;
      break;
    }
  }

  // Добавляем новый текст после последнего кастомного текста (или в конец, если кастомных нет)
  if (lastCustomIndex >= 0) {
    localTexts.value.splice(lastCustomIndex + 1, 0, newText);
  } else {
    // Если нет кастомных текстов, добавляем в конец
    localTexts.value.push(newText);
  }

  // Открываем редактирование после обновления DOM
  // Используем двойной nextTick для гарантии, что DOM полностью обновлен
  nextTick(() => {
    nextTick(() => {
      startEdit(newText);
    });
  });
}

// Сохранение
async function handleSave() {
  if (!hasChanges.value) return;

  // Сохраняем текущее редактирование перед отправкой
  if (editingId.value) {
    finishEdit();
  }

  // Валидация только длины текста (пустые тексты просто не отправляются)
  const errors: string[] = [];
  localTexts.value.forEach((text, index) => {
    if (text.toDelete) return;

    // Проверяем только длину текста (пустые тексты будут отфильтрованы при отправке)
    const textLength = text.text.trim().length;
    if (textLength > 0 && textLength > MAX_NOTIFICATION_TEXT_LENGTH) {
      const textType = text.isNew ? 'Новый текст' : 'Текст';
      errors.push(
        `${textType} #${index + 1} превышает ${MAX_NOTIFICATION_TEXT_LENGTH} символов`
      );
    }
  });

  if (errors.length > 0) {
    useToast('Ошибки валидации', errors.join(', '), 'error');
    return;
  }

  // Собираем изменения (фильтруем пустые тексты после trim)
  const changes = {
    updated: localTexts.value
      .filter(
        (t) =>
          t.isDirty &&
          !t.isNew &&
          !t.toDelete &&
          t.id &&
          t.text.trim().length > 0
      )
      .map((t) => ({
        id: t.id!,
        text: t.text.trim(), // Обрезаем пробелы
      })),
    created: localTexts.value
      .filter((t) => t.isNew && !t.toDelete && t.text.trim().length > 0)
      .map((t) => ({
        directness: t.directness,
        // addressing больше не передается, берется из userPreferences на бэкенде
        locale: t.locale,
        text: t.text.trim(), // Обрезаем пробелы
        intent: t.intent,
        subtype: t.subtype,
      })),
    deleted: localTexts.value
      .filter((t) => t.toDelete && !t.isNew && t.id)
      .map((t) => ({
        id: t.id!,
      })),
  };

  // Удаляем пустые новые тексты из локального списка перед отправкой
  localTexts.value = localTexts.value.filter(
    (t) => !(t.isNew && !t.text.trim())
  );

  const success = await saveChanges(changes);
  if (success) {
    // Перезагружаем тексты с текущими фильтрами после сохранения
    await loadTextsWithFilters();
    // Обновляем локальное состояние из обновлённых texts
    // (watch не сработает, если были локальные изменения)
    localTexts.value = sortTexts(texts.value.map((t) => ({ ...t })));

    // Сбрасываем флаги
    localTexts.value.forEach((t) => {
      t.isDirty = false;
      t.isNew = false;
      t.toDelete = false;
      delete t.tempId;
    });
    editingId.value = null;
    editModel.value = '';
  }
}

// Восстановление дефолтных
function handleReset() {
  resetModalRef.value?.open();
}

async function handleResetConfirm() {
  const success = await resetDefaults(keepUserTexts.value);
  if (success) {
    // Перезагружаем тексты с текущими фильтрами
    // loadTextsWithFilters() уже обновляет localTexts.value
    await loadTextsWithFilters();
    editingId.value = null;
    editModel.value = '';
  }
}

// Навигация
function goBack() {
  router.back();
}

// Горячие клавиши
onMounted(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (hasChanges.value) {
        handleSave();
      }
    }
    if (e.key === 'Escape' && editingId.value) {
      finishEdit();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
});
</script>

<style scoped>
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-4px);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(4px);
  }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}

/* Анимации для списка текстов */
.list-item {
  transition: all 0.3s ease;
}

.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.list-move {
  transition: transform 0.3s ease;
}

/* Ховер только для устройств с нормальной мышью */
@media (hover: hover) and (pointer: fine) {
  .delete-button:hover {
    color: hsl(var(--destructive));
    background-color: hsl(var(--destructive) / 0.1);
  }
}

/* Убираем активное состояние на мобильных устройствах */
@media (hover: none) and (pointer: coarse) {
  .delete-button:active {
    /* На мобильных при нажатии не меняем стили - используем только состояние toDelete */
    opacity: 0.8;
  }

  /* Если элемент НЕ помечен на удаление, при активном нажатии остаемся белым */
  .delete-button.text-foreground:active {
    color: hsl(var(--foreground)) !important;
    background-color: transparent !important;
  }

  /* Если элемент помечен на удаление, сохраняем красный цвет даже при активном состоянии */
  .delete-button.text-destructive:active {
    color: hsl(var(--destructive)) !important;
    background-color: hsl(var(--destructive) / 0.1) !important;
  }
}
</style>
