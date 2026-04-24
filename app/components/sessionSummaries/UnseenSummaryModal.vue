<template>
  <Dialog :open="isOpen" @update:open="handleOpenChange">
    <DialogContent
      class="glass-deep border border-border bg-card backdrop-blur-xl text-card-foreground"
    >
      <DialogHeader>
        <DialogTitle class="text-lg font-semibold">
          Готов итог прошлой сессии
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground">
          Мы подготовили короткую сводку по твоему последнему разговору с
          ассистентом.
        </DialogDescription>
      </DialogHeader>

      <div v-if="summary" class="space-y-3">
        <p class="text-sm text-foreground/90 leading-relaxed">
          {{ summary.summary.shortSummary }}
        </p>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          @click="dismiss"
          :disabled="isBusy"
        >
          Позже
        </Button>
        <Button type="button" @click="openSummary" :disabled="isBusy">
          Посмотреть итог
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { useUnseenSessionSummary } from '@/app/composables/useUnseenSessionSummary';

const router = useRouter();
const { unseenSummary, loadUnseenSummary, markUnseenSummaryViewed } =
  useUnseenSessionSummary();

const isOpen = ref(false);
const isBusy = ref(false);
const summary = computed(() => unseenSummary.value);

// Флаг показа в сессии приложения: не показываем повторно после закрытия,
// даже если пользователь снова зашёл на главную (только до перезапуска приложения).
const SHOWN_FLAG_KEY = 'mentala.unseenSummaryShown';

function alreadyShownThisAppSession(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.sessionStorage.getItem(SHOWN_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function markShownThisAppSession() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SHOWN_FLAG_KEY, '1');
  } catch {
    // ignore
  }
}

async function loadUnseen() {
  if (alreadyShownThisAppSession()) return;

  try {
    const item = await loadUnseenSummary(true);
    if (item) {
      isOpen.value = true;
      markShownThisAppSession();
    }
  } catch {
    // не критично, просто не показываем модалку
  }
}

async function markViewed() {
  if (!summary.value) return;
  await markUnseenSummaryViewed(summary.value.id);
}

function handleOpenChange(open: boolean) {
  if (!open) dismiss();
}

async function dismiss() {
  if (isBusy.value) return;
  isBusy.value = true;
  await markViewed();
  isOpen.value = false;
  isBusy.value = false;
}

async function openSummary() {
  if (!summary.value || isBusy.value) return;
  isBusy.value = true;
  const id = summary.value.id;
  await markViewed();
  isOpen.value = false;
  isBusy.value = false;
  await router.push(`/session-summaries-user/${id}`);
}

onMounted(() => {
  void loadUnseen();
});
</script>
