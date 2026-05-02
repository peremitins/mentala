<template>
  <Dialog v-model:open="modalOpen" @update:open="handleOpenChange">
    <DialogContent
      class="glass-deep w-[calc(100%-2rem)] max-w-[560px] overflow-hidden rounded-2xl border border-white/15 p-0 text-white shadow-[0_28px_80px_rgba(4,10,24,0.45)] backdrop-blur-2xl sm:w-full"
    >
      <div class="relative">
        <div class="pointer-events-none absolute inset-0 opacity-80">
          <div
            class="absolute -left-20 top-0 h-48 w-48 rounded-full bg-cyan-400/18 blur-3xl"
          />
          <div
            class="absolute right-0 top-12 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
          />
        </div>

        <div class="relative space-y-5 p-6 sm:p-7">
          <DialogHeader class="space-y-3 text-left">
            <DialogTitle class="text-2xl font-semibold text-white">
              {{ t('AI_CHAT_CONSENT.TITLE') }}
            </DialogTitle>
            <DialogDescription class="text-sm leading-6 text-slate-200/86">
              {{ t('AI_CHAT_CONSENT.DESCRIPTION', { provider: providerName }) }}
            </DialogDescription>
          </DialogHeader>

          <button
            type="button"
            class="inline-flex touch-manipulation select-none text-sm font-medium text-cyan-200 underline transition hover:text-cyan-100"
            @click.stop.prevent="openPrivacyPolicy"
            @pointerdown.stop
          >
            {{ t('AI_CHAT_CONSENT.PRIVACY_LINK') }}
          </button>

          <DialogFooter
            class="flex-col-reverse gap-3 sm:flex-row sm:justify-end"
          >
            <Button
              variant="ghost"
              class="w-full border border-white/12 bg-white/6 text-white hover:bg-white/12 sm:w-auto"
              :disabled="isSubmitting"
              @click="cancelAiConsentRequest"
            >
              {{ t('AI_CHAT_CONSENT.CANCEL') }}
            </Button>
            <Button
              class="relative w-full sm:w-auto"
              :disabled="isSubmitting"
              @click="handleAcceptClick"
            >
              <ButtonLoader v-if="isSubmitting" />
              <span :class="isSubmitting ? 'invisible' : ''">
                {{ t('AI_CHAT_CONSENT.ACCEPT') }}
              </span>
            </Button>
          </DialogFooter>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/app/components/ui/button';
import ButtonLoader from '@/app/components/ui/ButtonLoader.vue';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/shadcn/dialog';
import { useAiChatConsentGate } from '@/app/composables/useAiChatConsentGate';
import { openExternalBrowser } from '@/app/utils/openExternalBrowser';

const { t } = useI18n();
const {
  acceptAiConsent,
  cancelAiConsentRequest,
  isSubmitting,
  modalOpen,
  privacyPolicyUrl,
  providerName,
} = useAiChatConsentGate();

const closingByAccept = ref(false);

function handleOpenChange(nextOpen: boolean) {
  if (nextOpen) {
    return;
  }

  // Если закрываемся после успешного принятия — не трактуем это как "отмена".
  if (closingByAccept.value) {
    closingByAccept.value = false;
    return;
  }

  // Пользователь закрыл модалку вручную (оверлей/esc/крестик) — считаем это отказом.
  if (!isSubmitting.value) {
    cancelAiConsentRequest();
  }
}

async function handleAcceptClick() {
  if (isSubmitting.value) return;
  closingByAccept.value = true;
  await acceptAiConsent();
}

async function openPrivacyPolicy() {
  await openExternalBrowser(privacyPolicyUrl.value);
}
</script>
