<template>
  <div class="h-dvh overflow-y-auto pb-[100px] space-y-2 rounded-lg">
    <PageHeader
      :title="t('SUPPORT.BADGE')"
      :show-back-button="true"
      @go-back="goBack"
    />

    <section class="space-y-2">
      <article class="glass-deep rounded-lg p-4 space-y-2">
        <h1 class="text-xl font-semibold text-foreground">
          {{ t('SUPPORT.TITLE') }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ supportSubtitle }}
        </p>
      </article>

      <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <article class="glass-deep rounded-lg p-4 space-y-3">
          <h2 class="text-base font-semibold text-foreground">
            {{ t('SUPPORT.CONTACT.TITLE') }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ t('SUPPORT.CONTACT.DESCRIPTION') }}
          </p>
          <a :href="supportMailto" class="support-action-link">
            {{ t('SUPPORT.CONTACT.CTA') }}
          </a>
        </article>

        <article class="glass-deep rounded-lg p-4 space-y-3">
          <h2 class="text-base font-semibold text-foreground">
            {{ t('SUPPORT.SLA.TITLE') }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ t('SUPPORT.SLA.VALUE') }}
          </p>
        </article>

        <article
          v-if="!shouldHideIosReviewBillingUi"
          class="glass-deep rounded-lg p-4 space-y-3"
        >
          <h2 class="text-base font-semibold text-foreground">
            {{ t('SUPPORT.CANCEL.TITLE') }}
          </h2>
          <ul class="list-disc space-y-3 pl-4 text-sm text-muted-foreground">
            <li>
              <p>{{ t('SUPPORT.CANCEL.APPLE') }}</p>
              <a
                :href="appleCancelHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="support-text-link"
              >
                {{ t('SUPPORT.CANCEL.APPLE_LINK') }}
              </a>
            </li>
            <li>
              <p>{{ t('SUPPORT.CANCEL.GOOGLE') }}</p>
              <a
                :href="googleCancelHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="support-text-link"
              >
                {{ t('SUPPORT.CANCEL.GOOGLE_LINK') }}
              </a>
            </li>
            <li>
              <p>{{ t('SUPPORT.CANCEL.WEB', { webUrl: webAppUrl }) }}</p>
              <a
                :href="webAppUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="support-text-link"
              >
                {{ t('SUPPORT.CANCEL.WEB_LINK') }}
              </a>
            </li>
          </ul>
        </article>

        <article
          v-if="!shouldHideIosReviewBillingUi"
          class="glass-deep rounded-lg p-4 space-y-3"
        >
          <h2 class="text-base font-semibold text-foreground">
            {{ t('SUPPORT.REFUND.TITLE') }}
          </h2>
          <p class="text-sm text-muted-foreground">
            {{ t('SUPPORT.REFUND.PLATFORM') }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ t('SUPPORT.REFUND.WEB_PREFIX') }}
            <a :href="supportMailto" class="support-text-link">
              {{ supportEmail }}
            </a>
            {{
              t('SUPPORT.REFUND.WEB_SUFFIX', {
                reviewDays: refundReviewDays,
              })
            }}
          </p>
        </article>
      </div>

      <article class="glass-deep rounded-lg p-4 space-y-3">
        <h2 class="text-base font-semibold text-foreground">
          {{ t('SUPPORT.LEGAL.TITLE') }}
        </h2>
        <div class="flex flex-wrap gap-2">
          <a
            :href="privacyPolicyUrl"
            class="support-secondary-link"
            @click.prevent="openLegalDocument(privacyPolicyUrl)"
          >
            {{ t('SUPPORT.LEGAL.PRIVACY') }}
          </a>
          <a
            :href="termsOfServiceUrl"
            class="support-secondary-link"
            @click.prevent="openLegalDocument(termsOfServiceUrl)"
          >
            {{ t('SUPPORT.LEGAL.TERMS') }}
          </a>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRuntimeConfig } from '#imports';
import { useI18n } from 'vue-i18n';
import { useIosReviewBillingUi } from '@/app/composables/useIosReviewBillingUi';
import { openExternalBrowser } from '@/app/utils/openExternalBrowser';

const { t, locale } = useI18n();
const { shouldHideIosReviewBillingUi } = useIosReviewBillingUi();
const runtimeConfig = useRuntimeConfig();

const supportEmail = 'support@mentala.app';
const supportMailto = `mailto:${supportEmail}`;
const webAppUrl = 'https://my.mentala.app';
const refundReviewDays = '5';

const supportLocale = computed(() => {
  const normalizedLocale = String(locale.value || 'ru').toLowerCase();
  return normalizedLocale.startsWith('en') ? 'en' : 'ru';
});
const publicAppUrl = computed(() =>
  String(runtimeConfig.public.appUrl || webAppUrl).replace(/\/$/, '')
);
const supportSubtitle = computed(() => {
  if (shouldHideIosReviewBillingUi.value) {
    return 'Здесь вы можете быстро связаться с нами и получить помощь по приложению.';
  }

  return t('SUPPORT.SUBTITLE');
});

const privacyPolicyUrl = computed(
  () => `${publicAppUrl.value}/legal/privacy-policy-${supportLocale.value}.html`
);
const termsOfServiceUrl = computed(
  () =>
    `${publicAppUrl.value}/legal/terms-of-service-${supportLocale.value}.html`
);

const appleCancelHelpUrl = computed(() =>
  supportLocale.value === 'en'
    ? 'https://support.apple.com/en-us/118428'
    : 'https://support.apple.com/ru-ru/118428'
);

const googleCancelHelpUrl = computed(
  () =>
    `https://support.google.com/googleplay/answer/7018481?hl=${supportLocale.value}`
);

function goBack() {
  navigateTo('/settings');
}

async function openLegalDocument(url: string) {
  await openExternalBrowser(url);
}
</script>

<style scoped>
.support-action-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(248, 250, 252, 0.96);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.5rem 0.85rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.support-action-link:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.support-text-link {
  color: rgba(226, 232, 240, 0.94);
  text-decoration: underline;
  text-decoration-color: rgba(226, 232, 240, 0.52);
  text-underline-offset: 2px;
  transition:
    color 160ms ease,
    text-decoration-color 160ms ease;
}

.support-text-link:hover {
  color: #ffffff;
  text-decoration-color: rgba(255, 255, 255, 0.86);
}

.support-secondary-link {
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.06);
  padding: 0.45rem 0.7rem;
  color: rgba(248, 250, 252, 0.96);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.support-secondary-link:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}
</style>
