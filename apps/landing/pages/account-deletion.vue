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
            />
          </a>

          <div class="flex items-center gap-2">
            <a :href="supportUrlWithLocale" class="home-link-btn">
              {{ t('ACCOUNT_DELETION.SUPPORT_LINK') }}
            </a>
            <a :href="homeUrlWithLocale" class="home-link-btn">
              {{ t('ACCOUNT_DELETION.HOME_LINK') }}
            </a>
          </div>
        </div>
      </div>
    </header>

    <main class="pt-28 sm:pt-32">
      <section class="landing-container">
        <div class="w-full space-y-5">
          <div class="deletion-intro text-center">
            <p class="deletion-badge">{{ t('ACCOUNT_DELETION.BADGE') }}</p>
            <h1
              class="font-display text-3xl sm:text-4xl font-bold tracking-tight"
            >
              {{ t('ACCOUNT_DELETION.TITLE') }}
            </h1>
            <p
              class="text-white/80 text-base sm:text-lg mt-3 max-w-3xl mx-auto"
            >
              {{ t('ACCOUNT_DELETION.SUBTITLE') }}
            </p>
          </div>

          <div class="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
            <article class="deletion-card space-y-5">
              <div class="space-y-2">
                <p class="deletion-kicker">
                  {{ t('ACCOUNT_DELETION.REQUEST.KICKER') }}
                </p>
                <h2 class="deletion-title">
                  {{ t('ACCOUNT_DELETION.REQUEST.TITLE') }}
                </h2>
              </div>

              <ol class="space-y-4">
                <li class="deletion-step">
                  <div class="deletion-step-index">1</div>
                  <div class="space-y-1">
                    <h3 class="deletion-step-title">
                      {{ t('ACCOUNT_DELETION.REQUEST.IN_APP.TITLE') }}
                    </h3>
                    <p class="deletion-step-text">
                      {{ t('ACCOUNT_DELETION.REQUEST.IN_APP.TEXT') }}
                    </p>
                  </div>
                </li>

                <li class="deletion-step">
                  <div class="deletion-step-index">2</div>
                  <div class="space-y-1">
                    <h3 class="deletion-step-title">
                      {{ t('ACCOUNT_DELETION.REQUEST.EMAIL.TITLE') }}
                    </h3>
                    <p class="deletion-step-text">
                      {{
                        t('ACCOUNT_DELETION.REQUEST.EMAIL.TEXT', {
                          email: supportEmail,
                        })
                      }}
                    </p>
                  </div>
                </li>
              </ol>

              <div
                class="rounded-2xl border border-white/12 bg-white/4 p-4 sm:p-5"
              >
                <p class="text-sm text-white/78 leading-relaxed">
                  {{ t('ACCOUNT_DELETION.REQUEST.CONFIRMATION') }}
                </p>
              </div>
            </article>

            <article class="deletion-card space-y-5">
              <div class="space-y-2">
                <p class="deletion-kicker">
                  {{ t('ACCOUNT_DELETION.DELETE.KICKER') }}
                </p>
                <h2 class="deletion-title">
                  {{ t('ACCOUNT_DELETION.DELETE.TITLE') }}
                </h2>
              </div>

              <ul class="deletion-bullets">
                <li
                  v-for="item in deletedDataItems"
                  :key="item"
                  class="deletion-bullet"
                >
                  <span class="deletion-bullet-dot" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </article>
          </div>

          <div
            class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start"
          >
            <article class="deletion-card space-y-5">
              <div class="space-y-2">
                <p class="deletion-kicker">
                  {{ t('ACCOUNT_DELETION.RETAINED.KICKER') }}
                </p>
                <h2 class="deletion-title">
                  {{ t('ACCOUNT_DELETION.RETAINED.TITLE') }}
                </h2>
              </div>

              <ul class="deletion-bullets">
                <li
                  v-for="item in retainedDataItems"
                  :key="item"
                  class="deletion-bullet"
                >
                  <span class="deletion-bullet-dot" />
                  <span>{{ item }}</span>
                </li>
              </ul>
            </article>

            <article class="deletion-card space-y-4 contact-card">
              <p class="deletion-kicker">
                {{ t('ACCOUNT_DELETION.CONTACT.KICKER') }}
              </p>
              <h2 class="deletion-title">
                {{ t('ACCOUNT_DELETION.CONTACT.TITLE') }}
              </h2>
              <p class="text-sm sm:text-[15px] text-white/75 leading-relaxed">
                {{ t('ACCOUNT_DELETION.CONTACT.TEXT') }}
              </p>
              <a :href="supportMailto" class="support-email-btn">
                {{ t('ACCOUNT_DELETION.CONTACT.CTA') }}
              </a>
            </article>
          </div>
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
import { useLandingSiteUrl } from '../composables/useLandingSiteUrl';
import { useLandingLocale } from '../composables/useLandingLocale';
import type { SupportedLocale } from '../composables/useLandingLocale';
import LanguageSelect from '../components/ui/LanguageSelect.vue';

const { t } = useI18n();
const { locale, selectedLocale, switchLocale, brandLogoSrc, brandLogoAlt } =
  useLandingLocale();

const supportEmail = 'support@mentala.app';
const supportMailto = `mailto:${supportEmail}`;
const siteUrl = useLandingSiteUrl();
const accountDeletionBaseUrl = computed(
  () => `${siteUrl.value}/account-deletion`
);
const homeUrl = computed(() => `/?lang=${selectedLocale.value}`);
const homeUrlWithLocale = computed(() => homeUrl.value);
const supportUrlWithLocale = computed(
  () => `/support?lang=${selectedLocale.value}`
);

const deletedDataItems = computed(() => [
  String(t('ACCOUNT_DELETION.DELETE.ITEMS.ITEM_1')),
  String(t('ACCOUNT_DELETION.DELETE.ITEMS.ITEM_2')),
  String(t('ACCOUNT_DELETION.DELETE.ITEMS.ITEM_3')),
  String(t('ACCOUNT_DELETION.DELETE.ITEMS.ITEM_4')),
]);

const retainedDataItems = computed(() => [
  String(t('ACCOUNT_DELETION.RETAINED.ITEMS.ITEM_1')),
]);

async function onLocaleChange(nextLocale: SupportedLocale) {
  await switchLocale(nextLocale);
}

useSeoMeta({
  title: () => String(t('ACCOUNT_DELETION.META.TITLE')),
  description: () => String(t('ACCOUNT_DELETION.META.DESCRIPTION')),
  ogTitle: () => String(t('ACCOUNT_DELETION.META.TITLE')),
  ogDescription: () => String(t('ACCOUNT_DELETION.META.DESCRIPTION')),
  ogType: 'website',
  ogUrl: () => `${accountDeletionBaseUrl.value}?lang=${locale.value}`,
});

useHead(() => ({
  htmlAttrs: {
    lang: locale.value,
  },
  link: [
    {
      rel: 'canonical',
      href: accountDeletionBaseUrl.value,
    },
    {
      rel: 'alternate',
      hreflang: 'ru',
      href: `${accountDeletionBaseUrl.value}?lang=ru`,
    },
    {
      rel: 'alternate',
      hreflang: 'en',
      href: `${accountDeletionBaseUrl.value}?lang=en`,
    },
    {
      rel: 'alternate',
      hreflang: 'x-default',
      href: accountDeletionBaseUrl.value,
    },
  ],
}));
</script>

<style scoped>
.deletion-intro {
  border: 1px solid rgba(214, 228, 255, 0.18);
  border-radius: 1.5rem;
  padding: 1.5rem 1.25rem;
  background: linear-gradient(
    140deg,
    rgba(8, 17, 37, 0.92),
    rgba(14, 24, 48, 0.78)
  );
  box-shadow: 0 28px 70px rgba(3, 9, 24, 0.34);
}

.deletion-card {
  border: 1px solid rgba(214, 228, 255, 0.16);
  border-radius: 1.5rem;
  padding: 1.25rem;
  background: linear-gradient(
    150deg,
    rgba(10, 18, 38, 0.9),
    rgba(9, 16, 33, 0.76)
  );
  box-shadow: 0 24px 60px rgba(3, 9, 24, 0.26);
}

.deletion-badge {
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

.deletion-kicker {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(147, 197, 253, 0.78);
}

.deletion-title {
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 1.2rem + 0.7vw, 1.85rem);
  line-height: 1.1;
  font-weight: 800;
  color: rgba(248, 250, 252, 0.98);
}

.deletion-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.9rem;
  align-items: start;
}

.deletion-step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  border: 1px solid rgba(103, 232, 249, 0.35);
  background: rgba(103, 232, 249, 0.12);
  color: rgba(226, 232, 240, 0.96);
  font-size: 0.9rem;
  font-weight: 700;
}

.deletion-step-title {
  font-size: 1rem;
  font-weight: 700;
  color: rgba(248, 250, 252, 0.96);
}

.deletion-step-text {
  font-size: 0.95rem;
  line-height: 1.65;
  color: rgba(226, 232, 240, 0.75);
}

.deletion-bullets {
  display: grid;
  gap: 0.85rem;
}

.deletion-bullet {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.8rem;
  align-items: start;
  font-size: 0.95rem;
  line-height: 1.65;
  color: rgba(226, 232, 240, 0.76);
}

.deletion-bullet-dot {
  width: 0.6rem;
  height: 0.6rem;
  margin-top: 0.45rem;
  border-radius: 9999px;
  background: linear-gradient(135deg, #67e8f9, #34d399);
  box-shadow: 0 0 0 4px rgba(52, 211, 153, 0.08);
}

.contact-card {
  min-width: min(100%, 22rem);
}

.support-email-btn {
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
  padding: 0.72rem 1rem;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.support-email-btn:hover {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.home-link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.85rem;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease;
}

.home-link-btn:hover {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
}

@media (min-width: 640px) {
  .deletion-card {
    padding: 1.5rem;
  }

  .deletion-intro {
    padding: 2rem;
  }
}
</style>
