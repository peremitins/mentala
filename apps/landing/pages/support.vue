<template>
  <div class="relative min-h-screen overflow-x-clip pb-10">
    <div class="landing-grid-glow" />
    <div class="noise-overlay" />

    <header class="fixed inset-x-0 top-3 z-50 px-0">
      <div class="landing-container">
        <div
          class="glass-panel rounded-2xl px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3"
        >
          <a
            :href="homeUrl"
            class="font-display text-[15px] sm:text-lg font-bold tracking-tight text-white flex items-center"
          >
            <img
              :src="brandLogoSrc"
              :alt="brandLogoAlt"
              class="w-[130px] h-10"
              loading="lazy"
            />
          </a>

          <div class="flex items-center gap-2">
            <a :href="homeUrl" class="home-link-btn">
              {{ t('SUPPORT.HOME_LINK') }}
            </a>
          </div>
        </div>
      </div>
    </header>

    <main class="pt-28 sm:pt-32">
      <section class="landing-container">
        <div class="w-full space-y-5">
          <div class="support-intro text-center">
            <p class="support-badge">{{ t('SUPPORT.BADGE') }}</p>
            <h1
              class="font-display text-3xl sm:text-4xl font-bold tracking-tight"
            >
              {{ t('SUPPORT.TITLE') }}
            </h1>
            <p class="text-white/80 text-base sm:text-lg mt-3">
              {{ t('SUPPORT.SUBTITLE') }}
            </p>
          </div>

          <div class="support-grid">
            <article class="support-card">
              <h2 class="support-card-title">
                {{ t('SUPPORT.CONTACT.TITLE') }}
              </h2>
              <p class="support-card-text">
                {{ t('SUPPORT.CONTACT.DESCRIPTION') }}
              </p>
              <a :href="supportMailto" class="support-email-btn">
                {{ t('SUPPORT.CONTACT.CTA') }}
              </a>
            </article>

            <article class="support-card">
              <h2 class="support-card-title">{{ t('SUPPORT.SLA.TITLE') }}</h2>
              <p class="support-card-text">
                {{ t('SUPPORT.SLA.VALUE') }}
              </p>
            </article>

            <article class="support-card">
              <h2 class="support-card-title">
                {{ t('SUPPORT.CANCEL.TITLE') }}
              </h2>
              <ul class="support-list">
                <li>
                  <p>{{ t('SUPPORT.CANCEL.APPLE') }}</p>
                  <a
                    :href="appleCancelHelpUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="support-list-link"
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
                    class="support-list-link"
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
                    class="support-list-link"
                  >
                    {{ t('SUPPORT.CANCEL.WEB_LINK') }}
                  </a>
                </li>
              </ul>
            </article>

            <article class="support-card">
              <h2 class="support-card-title">
                {{ t('SUPPORT.REFUND.TITLE') }}
              </h2>
              <p class="support-card-text">
                {{ t('SUPPORT.REFUND.PLATFORM') }}
              </p>
              <p class="support-card-text mt-3">
                {{ t('SUPPORT.REFUND.WEB_PREFIX') }}
                <a :href="supportMailto" class="support-list-link">
                  {{ supportEmail }}
                </a>
                {{
                  t('SUPPORT.REFUND.WEB_SUFFIX', {
                    reviewDays: refundReviewDays,
                  })
                }}
              </p>
            </article>

            <article class="support-card">
              <h2 class="support-card-title">
                {{ t('SUPPORT.ACCOUNT_DELETION.TITLE') }}
              </h2>
              <p class="support-card-text">
                {{ t('SUPPORT.ACCOUNT_DELETION.DESCRIPTION') }}
              </p>
              <a :href="accountDeletionUrl" class="support-email-btn">
                {{ t('SUPPORT.ACCOUNT_DELETION.CTA') }}
              </a>
            </article>
          </div>

          <article class="support-card">
            <h2 class="support-card-title">{{ t('SUPPORT.LEGAL.TITLE') }}</h2>
            <div class="support-links">
              <a :href="accountDeletionUrl">
                {{ t('SUPPORT.LEGAL.DELETE_ACCOUNT') }}
              </a>
              <a
                :href="privacyPolicyUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('SUPPORT.LEGAL.PRIVACY') }}
              </a>
              <a
                :href="termsOfServiceUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('SUPPORT.LEGAL.TERMS') }}
              </a>
            </div>
          </article>

          <p class="text-xs sm:text-sm text-white/62 text-center">
            {{ t('SUPPORT.DISCLAIMER') }}
          </p>
        </div>
      </section>
    </main>

    <div
      class="fixed right-3 z-[85] w-[74px] sm:right-4"
      style="bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <LanguageSelect
        :label="t('SUPPORT.LANGUAGE.LABEL')"
        :ru-label="t('SUPPORT.LANGUAGE.RU')"
        :en-label="t('SUPPORT.LANGUAGE.EN')"
        :model-value="selectedLocale"
        @update:model-value="onLocaleChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRuntimeConfig } from 'nuxt/app';
import { useLandingSiteUrl } from '../composables/useLandingSiteUrl';
import { useLandingLocale } from '../composables/useLandingLocale';
import type { SupportedLocale } from '../composables/useLandingLocale';
import LanguageSelect from '../components/ui/LanguageSelect.vue';

const runtimeConfig = useRuntimeConfig();
const { t } = useI18n();
const {
  locale,
  selectedLocale,
  switchLocale,
  getLocalizedPath,
  brandLogoSrc,
  brandLogoAlt,
} = useLandingLocale();

const supportEmail = 'support@mentala.app';
const supportMailto = `mailto:${supportEmail}`;
const webAppUrl = computed(() =>
  String(runtimeConfig.public.appAuthUrl || 'https://my.mentala.app/auth')
    .replace(/\/auth\/?$/, '')
    .replace(/\/$/, '')
);
const appleCancelHelpUrl = 'https://support.apple.com/en-us/118428';
const googleCancelHelpUrl =
  'https://support.google.com/googleplay/answer/7018481?hl=en';
const refundReviewDays = '5';

const legalLocale = computed(() =>
  String(locale.value).toLowerCase().startsWith('en') ? 'en' : 'ru'
);
const privacyPolicyUrl = computed(
  () => `${webAppUrl.value}/legal/privacy-policy-${legalLocale.value}.html`
);
const termsOfServiceUrl = computed(
  () => `${webAppUrl.value}/legal/terms-of-service-${legalLocale.value}.html`
);
const siteUrl = useLandingSiteUrl();
const accountDeletionUrl = computed(() =>
  getLocalizedPath('/account-deletion', selectedLocale.value)
);
const homeUrl = computed(() => getLocalizedPath('/', selectedLocale.value));
const ruSupportUrl = computed(() => `${siteUrl.value}/support`);
const enSupportUrl = computed(() => `${ruSupportUrl.value}?lang=en`);

async function onLocaleChange(nextLocale: SupportedLocale) {
  await switchLocale(nextLocale);
}
const supportUrl = computed(() =>
  locale.value === 'en' ? enSupportUrl.value : ruSupportUrl.value
);

useSeoMeta({
  title: () => String(t('SUPPORT.META.TITLE')),
  description: () => String(t('SUPPORT.META.DESCRIPTION')),
  robots: () =>
    locale.value === 'ru'
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogTitle: () => String(t('SUPPORT.META.TITLE')),
  ogDescription: () => String(t('SUPPORT.META.DESCRIPTION')),
  ogType: 'website',
  ogUrl: () => supportUrl.value,
});

useHead(() => ({
  htmlAttrs: {
    lang: locale.value,
  },
  link: [
    {
      rel: 'canonical',
      href: supportUrl.value,
    },
    {
      rel: 'alternate',
      hreflang: 'ru',
      href: ruSupportUrl.value,
    },
    {
      rel: 'alternate',
      hreflang: 'x-default',
      href: ruSupportUrl.value,
    },
  ],
}));
</script>

<style scoped>
.support-intro {
  border: 1px solid rgba(214, 228, 255, 0.18);
  border-radius: 1.5rem;
  padding: 1.5rem 1.25rem;
  background: linear-gradient(
    145deg,
    rgba(19, 35, 63, 0.7),
    rgba(17, 29, 56, 0.58) 60%,
    rgba(39, 65, 108, 0.48)
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 26px 60px -44px rgba(8, 17, 38, 0.78);
}

.support-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #d4fefe;
  border-radius: 9999px;
  border: 1px solid rgba(103, 232, 249, 0.56);
  background: linear-gradient(
    120deg,
    rgba(103, 232, 249, 0.25),
    rgba(52, 211, 153, 0.18)
  );
  padding: 0.3rem 0.7rem;
  margin-bottom: 1rem;
}

.support-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (min-width: 900px) {
  .support-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.support-card {
  border: 1px solid rgba(214, 228, 255, 0.16);
  border-radius: 1.1rem;
  padding: 1rem;
  background: rgba(16, 27, 51, 0.64);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 24px 48px -40px rgba(8, 17, 38, 0.75);
}

.support-card-title {
  font-family: 'Sora', 'Manrope', sans-serif;
  font-weight: 700;
  font-size: 1.06rem;
  color: #f3f8ff;
  margin: 0 0 0.5rem;
}

.support-card-text {
  margin: 0;
  color: rgba(233, 240, 255, 0.82);
  line-height: 1.55;
  font-size: 0.95rem;
}

.support-email-btn {
  margin-top: 0.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.72rem;
  border: 1px solid rgba(103, 232, 249, 0.5);
  background: linear-gradient(
    120deg,
    rgba(103, 232, 249, 0.22),
    rgba(52, 211, 153, 0.2)
  );
  color: #f8ffff;
  text-decoration: none;
  font-weight: 700;
  padding: 0.58rem 0.84rem;
  font-size: 0.9rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.support-email-btn:hover {
  border-color: rgba(103, 232, 249, 0.75);
  background: linear-gradient(
    120deg,
    rgba(103, 232, 249, 0.3),
    rgba(52, 211, 153, 0.26)
  );
}

.support-list {
  margin: 0;
  color: rgba(233, 240, 255, 0.84);
  display: grid;
  gap: 0.75rem;
}

.support-list p {
  margin: 0;
  line-height: 1.45;
}

.support-list-link {
  color: #67e8f9;
  font-size: 0.87rem;
  text-decoration: none;
}

.support-list-link:hover {
  text-decoration: underline;
}

.support-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.support-links a {
  border: 1px solid rgba(214, 228, 255, 0.22);
  border-radius: 0.7rem;
  padding: 0.45rem 0.7rem;
  color: rgba(233, 240, 255, 0.9);
  text-decoration: none;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}

.support-links a:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(103, 232, 249, 0.5);
  color: #ffffff;
}

.home-link-btn {
  display: inline-flex;
  align-items: center;
  height: 2rem;
  border-radius: 0.6rem;
  border: 1px solid rgba(214, 228, 255, 0.2);
  padding: 0 0.72rem;
  color: rgba(233, 240, 255, 0.86);
  text-decoration: none;
  font-size: 0.83rem;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.home-link-btn:hover {
  border-color: rgba(103, 232, 249, 0.54);
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}
</style>
