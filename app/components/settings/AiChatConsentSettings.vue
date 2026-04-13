<template>
  <section class="space-y-4 rounded-lg glass-deep p-4">
    <div class="space-y-2">
      <h3 class="text-base font-semibold text-foreground">
        {{ t('AI_CHAT_CONSENT.SETTINGS_TITLE') }}
      </h3>
      <p class="text-sm leading-6 text-foreground/78">
        {{
          hasCurrentConsent
            ? t('AI_CHAT_CONSENT.SETTINGS_ENABLED')
            : t('AI_CHAT_CONSENT.SETTINGS_DISABLED')
        }}
      </p>
    </div>

    <div class="grid gap-2 text-sm text-foreground/78 sm:grid-cols-2">
      <div class="rounded-2xl bg-black/10 px-3 py-2">
        <div class="text-xs uppercase tracking-[0.18em] text-foreground/45">
          {{ t('AI_CHAT_CONSENT.SETTINGS_VERSION_LABEL') }}
        </div>
        <div class="mt-1 font-medium text-foreground">
          {{ consentSnapshot.version || consentVersion }}
        </div>
      </div>
      <div class="rounded-2xl bg-black/10 px-3 py-2">
        <div class="text-xs uppercase tracking-[0.18em] text-foreground/45">
          {{ t('AI_CHAT_CONSENT.SETTINGS_DATE_LABEL') }}
        </div>
        <div class="mt-1 font-medium text-foreground">
          {{ acceptedAtLabel }}
        </div>
      </div>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Button
        v-if="hasCurrentConsent"
        variant="outline"
        :disabled="isSubmitting"
        @click="revokeDialogOpen = true"
      >
        {{ t('AI_CHAT_CONSENT.REVOKE') }}
      </Button>
      <Button
        v-else
        :disabled="isSubmitting"
        :loading="isSubmitting"
        @click="handleOpenConsent"
      >
        {{ t('AI_CHAT_CONSENT.OPEN_MODAL') }}
      </Button>
      <NuxtLink
        :to="privacyPolicyUrl"
        class="text-sm font-medium text-primary-ui underline-offset-4 hover:underline"
      >
        {{ t('AI_CHAT_CONSENT.PRIVACY_LINK') }}
      </NuxtLink>
    </div>

    <AlertDialog :open="revokeDialogOpen" @update:open="revokeDialogOpen = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t('AI_CHAT_CONSENT.REVOKE_TITLE') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('AI_CHAT_CONSENT.REVOKE_DESCRIPTION') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {{ t('AI_CHAT_CONSENT.CANCEL') }}
          </AlertDialogCancel>
          <AlertDialogAction :disabled="isSubmitting" @click="handleRevokeConsent">
            {{ t('AI_CHAT_CONSENT.REVOKE_CONFIRM') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/app/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/shadcn/alert-dialog';
import { useAiChatConsentGate } from '@/app/composables/useAiChatConsentGate';
import { isAiChatConsentCurrent } from '@/shared/utils/ai-consent';

const { t, locale } = useI18n();
const revokeDialogOpen = ref(false);
const {
  consentSnapshot,
  consentVersion,
  isSubmitting,
  privacyPolicyUrl,
  requestAiConsent,
  revokeAiConsent,
} = useAiChatConsentGate();

const hasCurrentConsent = computed(() =>
  isAiChatConsentCurrent(consentSnapshot.value)
);

const acceptedAtLabel = computed(() => {
  if (!consentSnapshot.value.acceptedAt) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(consentSnapshot.value.acceptedAt));
  } catch {
    return consentSnapshot.value.acceptedAt;
  }
});

async function handleOpenConsent() {
  await requestAiConsent();
}

async function handleRevokeConsent() {
  const revoked = await revokeAiConsent();
  if (revoked) {
    revokeDialogOpen.value = false;
  }
}
</script>
