<template>
  <div
    class="flex flex-col xs:space-y-3 space-y-1 h-dvh overflow-y-auto pb-[100px] rounded-lg"
  >
    <PageHeader
      title="Мой набор"
      :show-back-button="true"
      @go-back="router.back()"
    />

    <!-- Пустое состояние -->
    <div
      v-if="store.hasFetched && store.isEmpty"
      class="glass-deep p-6 mx-1 flex flex-col items-center text-center gap-4 animate-slide-up"
    >
      <div
        class="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/40 bg-white/55"
      >
        <img :src="toolkitImg" alt="Мой набор" class="h-7 w-7 object-contain" />
      </div>
      <p class="text-sm text-foreground/80 max-w-xs">
        Здесь появятся практики, фразы и действия, которые ты выберешь для себя
        в программах.
      </p>
      <NuxtLink
        to="/programs"
        class="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-90"
      >
        Перейти к программам
      </NuxtLink>
    </div>

    <template v-else>
      <!-- Практики -->
      <section v-if="store.practices.length" class="glass-deep p-4 space-y-3">
        <h2 class="text-sm font-semibold text-foreground/70 px-1">Практики</h2>
        <button
          v-for="item in store.practices"
          :key="item.id"
          type="button"
          class="rounded-2xl border border-white/10 bg-white/5 p-3 w-full flex items-center gap-3 text-left transition hover:-translate-y-0.5 animate-slide-up"
          @click="openItem(item)"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/40 bg-white/55"
          >
            <img
              :src="imageFor(item)"
              :alt="item.title"
              class="h-10 w-10 object-contain"
            />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium text-foreground truncate">
              {{ item.title }}
            </span>
            <span
              v-if="sourceLabel(item)"
              class="block text-xs text-foreground/55 truncate"
            >
              {{ sourceLabel(item) }}
            </span>
          </span>
          <button
            type="button"
            class="shrink-0 rounded-lg p-1.5 text-foreground/40 transition hover:text-foreground/70"
            aria-label="Убрать из набора"
            @click.stop="removeItem(item)"
          >
            <IconX class="h-4 w-4" />
          </button>
        </button>
      </section>

      <!-- ИИ-ассистент -->
      <section v-if="store.chats.length" class="glass-deep p-4 space-y-3">
        <h2 class="text-sm font-semibold text-foreground/70 px-1">
          ИИ-ассистент
        </h2>
        <button
          v-for="item in store.chats"
          :key="item.id"
          type="button"
          class="rounded-2xl border border-white/10 bg-white/5 p-3 w-full flex items-center gap-3 text-left transition hover:-translate-y-0.5 animate-slide-up"
          @click="openItem(item)"
        >
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/40 bg-white/55"
          >
            <img
              :src="aiImg"
              :alt="item.title"
              class="h-10 w-10 object-contain"
            />
          </span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium text-foreground truncate">
              {{ item.title }}
            </span>
          </span>
          <button
            type="button"
            class="shrink-0 rounded-lg p-1.5 text-foreground/40 transition hover:text-foreground/70"
            aria-label="Убрать из набора"
            @click.stop="removeItem(item)"
          >
            <IconX class="h-4 w-4" />
          </button>
        </button>
      </section>

      <!-- Мои фразы -->
      <section class="glass-deep p-4 space-y-3">
        <div class="flex items-center justify-between px-1">
          <h2 class="text-sm font-semibold text-foreground/70">Мои фразы</h2>
          <button
            type="button"
            class="flex items-center gap-1 text-xs font-medium text-foreground/70 transition hover:text-foreground"
            @click="openCreate"
          >
            <IconPlus class="h-4 w-4" /> Добавить
          </button>
        </div>

        <p
          v-if="!store.phrases.length"
          class="text-xs text-foreground/50 px-2 py-1"
        >
          Пока нет сохранённых фраз. Добавь свою или собери их в программах.
        </p>

        <div
          v-for="item in store.phrases"
          :key="item.id"
          class="rounded-2xl border border-white/10 bg-white/5 p-3 w-full flex flex-col gap-2 animate-slide-up"
        >
          <span v-if="sourceLabel(item)" class="text-xs text-foreground/50">
            {{ sourceLabel(item) }}
          </span>
          <p class="text-sm text-foreground whitespace-pre-wrap break-words">
            {{ item.content }}
          </p>
          <div class="border-t border-white/10 pt-1 flex justify-end gap-1">
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/50 transition hover:text-foreground"
              aria-label="Изменить фразу"
              @click="openEdit(item)"
            >
              <IconPencil class="h-4 w-4" />
            </button>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-lg text-foreground/50 transition hover:text-destructive"
              aria-label="Удалить фразу"
              @click="removeItem(item)"
            >
              <IconTrash2 class="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- Редактирование / добавление фразы -->
    <BottomSheet v-model:open="sheetOpen">
      <div class="px-5 py-4 space-y-4">
        <DialogTitle class="text-base font-semibold text-foreground">
          {{ editingId ? 'Изменить фразу' : 'Добавить фразу' }}
        </DialogTitle>
        <TextareaResize
          v-model="draft"
          :maxlength="300"
          placeholder="Напиши фразу, к которой захочешь вернуться…"
          class="glass-deep px-3 py-2"
        />
        <div class="flex items-center justify-between">
          <span class="text-xs text-foreground/45">{{ draftLength }}/300</span>
          <button
            type="button"
            class="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition disabled:opacity-40"
            :disabled="!canSave || saving"
            @click="savePhrase"
          >
            Сохранить
          </button>
        </div>
      </div>
    </BottomSheet>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { DialogTitle } from 'radix-vue';
import { toast } from 'vue-sonner';
import IconX from '~icons/lucide/x';
import IconPlus from '~icons/lucide/plus';
import IconPencil from '~icons/lucide/pencil';
import IconTrash2 from '~icons/lucide/trash-2';
import toolkitImg from '@/app/assets/images/toolkit.webp';
import panicImg from '@/app/assets/images/panic.webp';
import tensionImg from '@/app/assets/images/tension.webp';
import thoughtDumpImg from '@/app/assets/images/thought-dump.webp';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — кириллическая «с» в имени файла (оригинальный asset)
import breathImg from '@/app/assets/images/breath_practiсes.webp';
import aiImg from '@/app/assets/images/ai_terapist.webp';
import PageHeader from '@/app/components/PageHeader.vue';
import BottomSheet from '@/app/components/ui/BottomSheet.vue';
import TextareaResize from '@/app/components/ui/TextareaResize.vue';
import { useToolkitStore } from '@/app/stores/toolkit';
import { resolveToolkitRoute } from '@/shared/toolkit/registry';
import type { UserToolkitItem } from '@/shared/dto/toolkit';

const router = useRouter();
const store = useToolkitStore();

onMounted(() => {
  // Принудительно перечитываем: набор пополняется после прохождения шагов roadmap,
  // поэтому кэш hasFetched тут не нужен — всегда показываем свежие данные.
  void store.load(true);
});

function imageFor(item: UserToolkitItem): string {
  const kind = item.toolRef?.kind;
  if (kind === 'breath') return breathImg;
  if (kind === 'thought_dump') return thoughtDumpImg;
  if (kind === 'chat') return aiImg;
  if (kind === 'sos') {
    return item.toolRef &&
      item.toolRef.kind === 'sos' &&
      item.toolRef.entry === 'tension'
      ? tensionImg
      : panicImg;
  }
  return toolkitImg;
}

// Источник: «Из сада «…»». Если источников несколько — показываем первый + счётчик.
function sourceLabel(item: UserToolkitItem): string | null {
  const named = item.sources.filter((s) => s.gardenTitle);
  if (!named.length) return null;
  const first = named[0]!.gardenTitle as string;
  if (named.length > 1) {
    return `Из сада «${first}» и ещё ${named.length - 1}`;
  }
  return `Из сада «${first}»`;
}

async function openItem(item: UserToolkitItem) {
  if (!item.toolRef) return;
  await router.push(resolveToolkitRoute(item.toolRef));
}

async function removeItem(item: UserToolkitItem) {
  const isPhrase = item.type === 'phrase';
  const content = item.content;
  try {
    await store.remove(item.id);
  } catch {
    return;
  }
  // Undo доступен только для личных фраз — их можно пересоздать через POST.
  if (isPhrase && content) {
    toast.info('Убрано из набора', {
      action: {
        label: 'Вернуть',
        onClick: () => {
          void store.addPhrase(content);
        },
      },
      duration: 7000,
    });
  } else {
    toast.info('Убрано из набора', { duration: 4000 });
  }
}

// --- Добавление / редактирование фразы ---
const sheetOpen = ref(false);
const editingId = ref<number | null>(null);
const draft = ref('');
const saving = ref(false);

const draftLength = computed(() => (draft.value || '').length);
const canSave = computed(() => (draft.value || '').trim().length > 0);

function openCreate() {
  editingId.value = null;
  draft.value = '';
  sheetOpen.value = true;
}

function openEdit(item: UserToolkitItem) {
  editingId.value = item.id;
  draft.value = item.content || '';
  sheetOpen.value = true;
}

async function savePhrase() {
  const content = (draft.value || '').trim();
  if (!content) return;
  saving.value = true;
  try {
    if (editingId.value) {
      await store.updatePhrase(editingId.value, content);
    } else {
      await store.addPhrase(content);
    }
    sheetOpen.value = false;
  } catch {
    // тост уже показан в сторе
  } finally {
    saving.value = false;
  }
}
</script>
