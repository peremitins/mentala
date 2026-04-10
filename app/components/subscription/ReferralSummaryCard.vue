<template>
  <div
    class="group glass-deep rounded-xl border border-border/70 p-4 transition-all duration-200"
    :class="
      interactive
        ? 'cursor-pointer hover:border-white/15 hover:bg-white/[0.06] active:scale-[0.995]'
        : ''
    "
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    @click="handleOpen"
    @keydown.enter.prevent="handleOpen"
    @keydown.space.prevent="handleOpen"
  >
    <div class="space-y-4">
      <div class="space-y-2">
        <div class="flex items-start justify-between gap-3">
          <h3 class="min-w-0 text-sm font-semibold text-foreground">
            Пригласи друга
          </h3>

          <span
            class="shrink-0 rounded-full border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-foreground/70"
          >
            Ваш личный код
          </span>
        </div>

        <div class="flex items-center justify-between gap-3">
          <p class="min-w-0 text-xs leading-relaxed text-foreground/70">
            Поделитесь кодом. Друг получит скидку на следующий платёж, а вам
            пополнится бонусный счёт после его первой успешной оплаты.
          </p>
          <IconChevronRight
            v-if="showChevron"
            class="h-4 w-4 shrink-0 text-foreground/45 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </div>
      </div>

      <div
        v-if="loading"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-4"
      >
        <p class="text-xs text-foreground/60">Загружаем…</p>
      </div>

      <div
        v-else-if="summary"
        class="rounded-xl border border-white/10 bg-white/[0.04] p-4"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-xs text-foreground/60">Код</p>
            <p
              class="break-all text-lg font-semibold tracking-[0.12em] text-foreground sm:break-normal sm:tracking-[0.16em]"
            >
              {{ summary.myCode }}
            </p>
          </div>

          <div class="flex items-center justify-end gap-2 sm:justify-start">
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 shrink-0"
              aria-label="Копировать код"
              title="Копировать код"
              @click.stop="emit('copy')"
            >
              <IconCopy class="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              class="h-9 w-9 shrink-0"
              aria-label="Поделиться кодом"
              title="Поделиться кодом"
              @click.stop="emit('share')"
            >
              <IconShare2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/app/components/ui/button';
import type { ReferralMeResponse } from '@/shared/dto/referral';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconCopy from '~icons/lucide/copy';
import IconShare2 from '~icons/lucide/share-2';

const props = withDefaults(
  defineProps<{
    loading?: boolean;
    summary?: ReferralMeResponse | null;
    interactive?: boolean;
    showChevron?: boolean;
  }>(),
  {
    loading: false,
    summary: null,
    interactive: false,
    showChevron: false,
  }
);

const emit = defineEmits<{
  open: [];
  copy: [];
  share: [];
}>();

function handleOpen() {
  if (!props.interactive) return;
  emit('open');
}
</script>
