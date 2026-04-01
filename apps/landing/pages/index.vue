<template>
  <div class="relative min-h-screen overflow-x-clip pb-4">
    <div class="landing-grid-glow" />
    <div class="noise-overlay" />

    <header class="fixed inset-x-0 top-3 z-50 px-0">
      <div class="landing-container">
        <div
          class="glass-panel rounded-2xl px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3"
        >
          <button
            class="font-display text-[15px] sm:text-lg font-bold tracking-tight text-white"
            type="button"
            @click="scrollToSection('hero')"
          >
            <img
              :src="brandLogoSrc"
              loading="lazy"
              :alt="brandLogoAlt"
              class="w-[130px] h-10"
            />
          </button>

          <nav class="hidden lg:flex items-center gap-2 text-sm text-white/80">
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('features')"
            >
              {{ t('LANDING.HEADER.NAV.FEATURES') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('scenarios')"
            >
              {{ t('LANDING.HEADER.NAV.SCENARIOS') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('how-it-works')"
            >
              {{ t('LANDING.HEADER.NAV.HOW_IT_WORKS') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('landing-pricing')"
            >
              {{ t('LANDING.HEADER.NAV.PRICING') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('privacy')"
            >
              {{ t('LANDING.HEADER.NAV.PRIVACY') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('faq')"
            >
              {{ t('LANDING.HEADER.NAV.FAQ') }}
            </button>
          </nav>

          <Button
            class="hidden sm:inline-flex"
            size="sm"
            @click="openPrimaryCTA"
          >
            {{ primaryCtaText }}
          </Button>

          <Button class="sm:hidden" size="sm" @click="openPrimaryCTA">
            {{ primaryCtaTextMobile }}
          </Button>
        </div>
      </div>
    </header>

    <main class="pt-28 lg:pt-42">
      <section id="hero" class="scroll-mt-header">
        <div
          class="landing-container grid lg:grid-cols-2 gap-6 sm:gap-8 items-center"
        >
          <div class="space-y-6 order-2 lg:order-1">
            <Badge variant="accent" class="reveal-item">
              {{ t('LANDING.HERO.BADGE') }}
            </Badge>

            <h1
              class="reveal-item font-display text-2xl lg:text-4xl leading-[1.06] font-extrabold tracking-tight"
            >
              {{ t('LANDING.HERO.TITLE_LINE_1') }}<br />{{
                t('LANDING.HERO.TITLE_LINE_2')
              }}
            </h1>

            <p class="reveal-item text-base sm:text-lg text-white/80 max-w-2xl">
              {{ t('LANDING.HERO.DESCRIPTION') }}
            </p>

            <div class="reveal-item flex flex-wrap items-center gap-3">
              <Button size="lg" @click="openPrimaryCTA">{{
                primaryCtaText
              }}</Button>
              <button
                type="button"
                class="h-11 px-2 text-sm font-semibold text-white/80 underline-offset-4 transition hover:text-white hover:underline"
                @click="scrollToSection('features')"
              >
                {{ t('LANDING.HERO.SECONDARY_CTA') }}
              </button>
            </div>
          </div>

          <div class="relative reveal-item order-1 lg:order-2">
            <!--
              Inline-стили здесь — намеренно: это critical layout для первого экрана.
              На некоторых устройствах при обновлении страницы картинка может успеть отрисоваться до загрузки CSS
              и «выпрыгнуть» на весь экран из-за своих огромных intrinsic размеров (4000×3200).
              Инлайн фиксирует размеры/обрезку до прихода landing.css.
            -->
            <figure
              class="hero-media"
              style="
                position: relative;
                width: 100%;
                aspect-ratio: 5/4;
                overflow: hidden;
                border-radius: 1.75rem;
                background: #111a2f;
              "
            >
              <img
                src="/landing/features/hero_bg.jpg"
                :alt="t('LANDING.HERO.IMAGE_ALT')"
                class="hero-media-image"
                loading="lazy"
                fetchpriority="high"
                decoding="async"
                width="4000"
                height="3200"
                style="
                  display: block;
                  width: 100%;
                  height: 100%;
                  object-fit: cover;
                  object-position: center;
                "
              />
            </figure>
          </div>
        </div>
      </section>

      <section id="features" class="scroll-mt-header mt-20 lg:mt-42">
        <div class="landing-container">
          <div class="max-w-2xl space-y-4 mb-5">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.FEATURES.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.FEATURES.DESCRIPTION') }}
            </p>
          </div>
        </div>
        <div
          class="landing-container grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-10 items-start mt-8"
        >
          <div class="space-y-5 lg:space-y-7 order-1">
            <article
              v-for="(step, index) in featureSteps"
              :key="step.key"
              :ref="(el) => setFeatureRef(index, el as Element | null)"
              class="reveal-item feature-story-step glass-panel rounded-2xl p-5 sm:p-6 transition-all duration-300"
              :class="[
                index === activeFeatureIndex
                  ? 'feature-story-step-active border-[color:rgba(52,211,153,0.52)] bg-[linear-gradient(150deg,rgba(103,232,249,0.14),rgba(52,211,153,0.12))]'
                  : 'feature-story-step-inactive border-white/15',
              ]"
            >
              <h3 class="font-display text-xl sm:text-2xl font-bold mb-2">
                {{ step.title }}
              </h3>
              <p class="text-white/75 mb-4">{{ step.description }}</p>
              <div class="flex flex-wrap gap-2">
                <Badge v-for="chip in step.chips" :key="chip">{{ chip }}</Badge>
              </div>
            </article>

            <div
              class="reveal-item relative max-w-3xl mx-auto w-full my-[50px]"
              aria-hidden="true"
            >
              <div
                class="pointer-events-none absolute inset-x-0 -top-3 h-10 blur-2xl opacity-70 bg-[radial-gradient(circle,rgba(168,255,53,0.18),transparent_62%)]"
              />
              <div
                class="relative h-px w-full bg-gradient-to-r from-transparent via-white/25 to-transparent"
              />
            </div>

            <div
              class="reveal-item glass-panel rounded-xl px-5 py-4 text-xs sm:text-sm text-white/80 border-white/25 max-w-3xl mx-auto !mt-[10px] text-center"
            >
              {{ t('LANDING.DISCLAIMER') }}
            </div>
          </div>

          <div class="order-2 lg:self-start">
            <div
              id="feature-phone"
              ref="featurePhoneRef"
              class="feature-phone hidden lg:block mx-auto"
            >
              <Transition name="crossfade" mode="out-in">
                <img
                  :key="activeFeature.key"
                  :src="activeFeature.image"
                  :alt="activeFeature.title"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              </Transition>
            </div>

            <div class="feature-phone lg:hidden mx-auto">
              <!-- На мобильных даем пользователю ручной свайп по всем 5 экранам. -->
              <Swiper
                class="feature-phone-swiper h-full w-full"
                :modules="swiperModules"
                :slides-per-view="1"
                :space-between="0"
                :pagination="{ clickable: true }"
                :autoplay="
                  isReducedMotion
                    ? false
                    : {
                        delay: 3800,
                        disableOnInteraction: false,
                        pauseOnMouseEnter: true,
                      }
                "
                :a11y="{ enabled: true }"
              >
                <SwiperSlide
                  v-for="step in featureSteps"
                  :key="`feature-mobile-${step.key}`"
                  class="h-full"
                >
                  <img
                    :src="step.image"
                    :alt="step.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                </SwiperSlide>
              </Swiper>
            </div>
          </div>
        </div>
      </section>

      <section id="scenarios" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 space-y-3">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.SCENARIOS.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.SCENARIOS.DESCRIPTION') }}
            </p>
          </div>

          <Swiper
            class="reveal-item scenario-swiper"
            :modules="swiperModules"
            :slides-per-view="1.05"
            :space-between="14"
            :breakpoints="{
              640: { slidesPerView: 1.5, spaceBetween: 16 },
              1024: { slidesPerView: 2.3, spaceBetween: 20 },
              1280: { slidesPerView: 3, spaceBetween: 22 },
            }"
            :autoplay="
              isReducedMotion
                ? false
                : {
                    delay: 3800,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                  }
            "
            :pagination="{ clickable: true }"
            :a11y="{ enabled: true }"
          >
            <SwiperSlide
              v-for="item in scenarios"
              :key="item.id"
              class="h-auto"
            >
              <article
                class="glass-panel rounded-2xl p-5 h-full min-h-[150px] flex flex-col"
              >
                <span class="text-2xl mb-3">{{ item.emoji }}</span>
                <h3 class="font-semibold text-lg mb-2">{{ item.title }}</h3>
                <p class="text-white/75 text-sm mt-auto">{{ item.text }}</p>
              </article>
            </SwiperSlide>
          </Swiper>
        </div>
      </section>

      <section id="how-it-works" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 space-y-3">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.HOW_IT_WORKS.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.HOW_IT_WORKS.DESCRIPTION') }}
            </p>
          </div>

          <div class="grid lg:grid-cols-3 gap-4">
            <article
              v-for="item in howItWorks"
              :key="item.step"
              class="reveal-item glass-panel rounded-2xl p-5"
            >
              <div
                class="text-xs font-bold tracking-[0.18em] text-white/50 mb-3"
              >
                {{ item.step }}
              </div>
              <h3 class="font-semibold text-xl mb-2">{{ item.title }}</h3>
              <p class="text-sm text-white/70">{{ item.text }}</p>
            </article>
          </div>
        </div>
      </section>

      <section id="why-mentala" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 space-y-3">
            <Badge variant="accent" class="reveal-item">
              {{ t('LANDING.WHY.BADGE') }}
            </Badge>
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.WHY.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.WHY.DESCRIPTION') }}
            </p>
          </div>

          <div
            class="grid w-full min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-6"
          >
            <article
              class="reveal-item glass-panel min-w-0 rounded-2xl p-5 sm:p-6 flex flex-col"
            >
              <h3 class="font-display text-xl sm:text-2xl font-bold mb-4">
                {{ t('LANDING.WHY.MENTALA_TITLE') }}
              </h3>
              <ul
                class="space-y-3 text-sm text-white/80 leading-relaxed flex-1"
              >
                <li
                  v-for="(point, index) in comparisonMentalaPoints"
                  :key="index"
                  class="flex gap-2 items-center"
                >
                  <span class="text-[#A8FF35] shrink-0">✓</span>
                  <span class="inline-flex items-center gap-1 min-w-0 flex-1">
                    {{ point.text }}
                    <button
                      v-if="point.tooltip"
                      type="button"
                      v-tooltip="{
                        content: point.tooltip,
                        triggers: ['hover', 'focus', 'click'],
                        placement: 'top',
                      }"
                      class="ml-1 inline-flex h-4 w-4 shrink-0 align-middle items-center justify-center rounded-full border border-white/25 bg-white/5 text-[10px] font-semibold text-white/70 hover:bg-white/10 hover:text-white !cursor-default"
                      :aria-label="
                        t('LANDING.WHY.TOOLTIP_ARIA', { point: point.text })
                      "
                    >
                      ?
                    </button>
                  </span>
                </li>
              </ul>
            </article>

            <article
              class="reveal-item glass-panel min-w-0 rounded-2xl p-5 sm:p-6 flex flex-col border-white/15"
            >
              <h3 class="font-display text-xl sm:text-2xl font-bold mb-4">
                {{ t('LANDING.WHY.CONSULTATION_TITLE') }}
              </h3>
              <ul
                class="space-y-3 text-sm text-white/80 leading-relaxed flex-1"
              >
                <li
                  v-for="(point, index) in comparisonConsultationPoints"
                  :key="index"
                  class="flex gap-2 items-center"
                >
                  <span class="text-white/50 shrink-0">•</span>
                  <span class="min-w-0 flex-1">{{ point.text }}</span>
                </li>
              </ul>
            </article>
          </div>

          <p
            class="reveal-item mt-5 text-center text-xs sm:text-sm text-white/65 leading-relaxed max-w-2xl mx-auto"
          >
            {{ t('LANDING.WHY.DISCLAIMER') }}
          </p>
        </div>
      </section>

      <section id="landing-pricing" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 space-y-3">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.PRICING.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.PRICING.DESCRIPTION') }}
            </p>
          </div>

          <div
            class="reveal-item inline-flex rounded-xl border border-white/20 bg-white/5 p-1 mb-6"
          >
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm transition"
              :class="
                billingPeriod === 'month'
                  ? 'bg-white text-black'
                  : 'text-white/75 hover:text-white'
              "
              @click="billingPeriod = 'month'"
            >
              {{ t('LANDING.PRICING.TAB_MONTH') }}
            </button>
            <button
              type="button"
              class="rounded-lg px-4 py-2 text-sm transition"
              :class="
                billingPeriod === 'year'
                  ? 'bg-white text-black'
                  : 'text-white/75 hover:text-white'
              "
              @click="billingPeriod = 'year'"
            >
              {{ t('LANDING.PRICING.TAB_YEAR') }}
            </button>
          </div>

          <div class="grid lg:grid-cols-3 gap-4">
            <article
              v-for="plan in pricingPlans"
              :key="plan.id"
              class="glass-panel rounded-3xl p-6 flex flex-col"
              :class="'border-white/15'"
            >
              <div class="flex items-center justify-between gap-3">
                <h3 class="font-display text-2xl font-bold">
                  {{ plan.title }}
                </h3>
              </div>

              <p class="text-sm text-white/70 mt-1 mb-5">{{ plan.subtitle }}</p>

              <div class="mb-5 space-y-1">
                <div class="flex items-end gap-2 flex-wrap">
                  <p class="font-display text-4xl font-extrabold">
                    {{
                      billingPeriod === 'month'
                        ? plan.monthlyPrice.toLocaleString(numberFormatLocale)
                        : plan.yearlyPrice.toLocaleString(numberFormatLocale)
                    }}
                    ₽
                  </p>

                  <Badge
                    v-if="
                      billingPeriod === 'year' &&
                      plan.monthlyPrice > 0 &&
                      getYearlySavings(plan) > 0
                    "
                    variant="accent"
                    class="translate-y-[-3px]"
                  >
                    {{ t('LANDING.PRICING.SAVINGS_LABEL') }}
                    {{
                      getYearlySavings(plan).toLocaleString(numberFormatLocale)
                    }}
                    ₽
                  </Badge>
                </div>

                <p class="text-sm text-white/70">
                  {{
                    billingPeriod === 'year' && plan.monthlyPrice > 0
                      ? t('LANDING.PRICING.PERIOD_YEAR')
                      : t('LANDING.PRICING.PERIOD_MONTH')
                  }}
                </p>
              </div>

              <ul class="space-y-2.5 text-sm text-white/85 mb-6">
                <li
                  v-for="feature in plan.features"
                  :key="feature"
                  class="flex gap-2"
                >
                  <span class="text-[#A8FF35]">✓</span>
                  <span>{{ feature }}</span>
                </li>
              </ul>

              <Button
                class="mt-auto"
                variant="secondary"
                @click="openPrimaryCTA"
              >
                {{ pricingCtaText }}
              </Button>
            </article>
          </div>
        </div>
      </section>

      <section
        class="landing-container reveal-item glass-panel rounded-xl px-5 py-4 text-xs sm:text-sm text-white/80 border-white/25 max-w-3xl mx-auto !mt-20 sm:mt-28 text-center"
      >
        {{ t('LANDING.DISCLAIMER') }}
      </section>

      <section id="privacy" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="max-w-2xl space-y-3 sm:space-y-4">
            <Badge variant="accent" class="reveal-item">
              {{ t('LANDING.PRIVACY.BADGE') }}
            </Badge>
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.PRIVACY.TITLE') }}
            </h2>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="item in privacyCards"
              :key="item.id"
              class="reveal-item glass-panel rounded-2xl p-5 sm:p-6 h-full"
            >
              <div class="flex items-start gap-3.5">
                <div
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/5"
                  aria-hidden="true"
                >
                  {{ item.icon }}
                </div>

                <div class="min-w-0">
                  <h3 class="font-display text-lg sm:text-xl font-bold mb-2">
                    {{ item.title }}
                  </h3>
                  <p class="text-sm text-white/76 leading-relaxed">
                    {{ item.text }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="faq" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <h2
            class="font-display text-3xl sm:text-4xl font-bold mb-7 reveal-item"
          >
            {{ t('LANDING.FAQ.TITLE') }}
          </h2>

          <div class="space-y-3">
            <article
              v-for="(item, index) in faq"
              :key="item.id"
              class="reveal-item glass-panel rounded-2xl p-5"
            >
              <button
                type="button"
                class="w-full cursor-pointer flex items-center justify-between gap-4 text-left"
                :aria-expanded="faqOpenIndex === index"
                @click="toggleFaq(index)"
              >
                <span class="font-semibold">{{ item.question }}</span>
                <span
                  class="text-white/70 transition"
                  :class="faqOpenIndex === index ? 'rotate-45' : ''"
                >
                  +
                </span>
              </button>
              <div
                class="faq-panel"
                :class="{ 'faq-panel-open': faqOpenIndex === index }"
              >
                <div class="faq-panel-inner">
                  <p class="text-sm text-white/72 leading-relaxed faq-answer">
                    {{ item.answer }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <footer class="mt-20 sm:mt-28">
        <div class="landing-container">
          <div
            class="glass-panel rounded-2xl p-6 sm:p-7 flex flex-col md:flex-row gap-1 lg:gap-5 md:items-center md:justify-between"
          >
            <div
              class="flex px-3 py-2 gap-3 items-center justify-center text-sm text-white/75"
            >
              <p class="flex text-xs text-white/55 leading-0">
                © {{ t('LANDING.FOOTER.COPYRIGHT', { year: currentYear }) }}
              </p>
              <a
                href="mailto:support@mentala.app"
                class="hover:text-white/95 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
                :aria-label="
                  t('LANDING.FOOTER.SUPPORT_ARIA', { email: supportEmail })
                "
              >
                support@mentala.app
              </a>
            </div>

            <div
              class="flex flex-wrap items-center justify-center gap-1 lg:gap-3 text-sm"
            >
              <a class="rounded-lg px-3 py-2 hover:bg-white/10" href="/support">
                {{ t('LANDING.FOOTER.SUPPORT_LINK') }}
              </a>
              <a
                class="rounded-lg px-3 py-2 hover:bg-white/10"
                :href="accountDeletionUrl"
              >
                {{ t('LANDING.FOOTER.DELETE_ACCOUNT_LINK') }}
              </a>
              <a
                class="rounded-lg px-3 py-2 hover:bg-white/10"
                :href="privacyPolicyUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('LANDING.FOOTER.PRIVACY_LINK') }}
              </a>
              <a
                class="rounded-lg px-3 py-2 hover:bg-white/10"
                :href="termsOfServiceUrl"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('LANDING.FOOTER.TERMS_LINK') }}
              </a>
            </div>
          </div>
        </div>
      </footer>
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

    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="waitlistOpen"
        class="fixed inset-0 z-[90] p-3 sm:p-6 grid place-items-center"
      >
        <button
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          type="button"
          :aria-label="t('LANDING.WAITLIST.CLOSE_ARIA')"
          @click="closeWaitlist"
        />

        <section
          class="relative w-full max-w-xl glass-panel rounded-3xl p-6 sm:p-7 border-white/30"
        >
          <button
            class="absolute right-4 top-4 rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white"
            type="button"
            :aria-label="t('LANDING.WAITLIST.CLOSE_ARIA')"
            @click="closeWaitlist"
          >
            ✕
          </button>

          <h3 class="font-display text-2xl font-bold mb-2">
            {{ t('LANDING.WAITLIST.TITLE') }}
          </h3>
          <p class="text-sm text-white/72 mb-6">
            {{ t('LANDING.WAITLIST.SUBTITLE') }}
          </p>

          <form class="space-y-4" @submit.prevent="submitLead">
            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-name">
                {{ t('LANDING.WAITLIST.NAME_LABEL') }}
              </label>
              <Input
                id="lead-name"
                v-model="leadForm.name"
                :placeholder="t('LANDING.WAITLIST.NAME_PLACEHOLDER')"
                autocomplete="name"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-email">
                {{ t('LANDING.WAITLIST.EMAIL_LABEL') }}
              </label>
              <Input
                id="lead-email"
                v-model="leadForm.email"
                type="email"
                :placeholder="t('LANDING.WAITLIST.EMAIL_PLACEHOLDER')"
                autocomplete="email"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-goal">
                {{ t('LANDING.WAITLIST.GOALS_LABEL') }}
              </label>

              <div ref="goalDropdownRef" class="relative">
                <button
                  id="lead-goal"
                  type="button"
                  class="h-11 w-full rounded-xl border border-white/20 bg-white/5 px-4 text-left text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  :aria-expanded="goalDropdownOpen"
                  aria-haspopup="listbox"
                  @click="goalDropdownOpen = !goalDropdownOpen"
                  @keydown.esc.stop.prevent="goalDropdownOpen = false"
                >
                  <span class="block truncate pr-7">{{
                    selectedGoalsText
                  }}</span>
                  <span
                    class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
                    aria-hidden="true"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                <div
                  v-if="goalDropdownOpen"
                  class="absolute z-50 mt-2 w-full rounded-xl border border-white/15 bg-[#0b1222] p-2 shadow-[0_18px_60px_rgba(0,0,0,0.55)]"
                  role="listbox"
                  :aria-label="t('LANDING.WAITLIST.GOALS_LIST_ARIA')"
                  @keydown.esc.stop.prevent="goalDropdownOpen = false"
                >
                  <div class="max-h-56 overflow-auto">
                    <label
                      v-for="option in goalOptions"
                      :key="option.value"
                      class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-white transition hover:bg-white/5"
                    >
                      <input
                        v-model="leadForm.goalKeys"
                        type="checkbox"
                        :value="option.value"
                        class="h-4 w-4 rounded border-white/30 bg-white/5 text-primary focus-visible:ring-2 focus-visible:ring-white/70"
                      />
                      <span>{{ option.label }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <input
              v-model="leadForm.website"
              class="hidden"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
            />

            <Button
              type="submit"
              class="relative w-full"
              :disabled="submittingLead"
            >
              <ButtonLoader v-if="submittingLead" />
              <span :class="submittingLead ? 'invisible' : ''">
                {{ t('LANDING.WAITLIST.SUBMIT') }}
              </span>
            </Button>

            <p
              v-if="submitStatus === 'duplicate'"
              class="text-sm text-white/75"
            >
              {{ t('LANDING.WAITLIST.DUPLICATE') }}
            </p>
            <p
              v-else-if="submitStatus === 'error'"
              class="text-sm text-[#ffd6d6]"
            >
              {{ submitErrorText }}
            </p>
          </form>
        </section>
      </div>
    </Transition>

    <!-- Маленькая модалка об успехе после отправки лида -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="successModalOpen"
        class="fixed inset-0 z-[91] p-4 grid place-items-center"
      >
        <button
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          type="button"
          :aria-label="t('LANDING.SUCCESS_MODAL.CLOSE_ARIA')"
          @click="successModalOpen = false"
        />
        <div
          class="relative w-full max-w-sm rounded-2xl border border-white/20 bg-[#0b1222]/95 backdrop-blur p-6 shadow-xl"
          role="dialog"
          aria-labelledby="success-modal-title"
          aria-modal="true"
        >
          <p
            id="success-modal-title"
            class="text-center text-base text-white mb-5"
          >
            {{ t('LANDING.SUCCESS_MODAL.TITLE') }}
          </p>
          <Button class="w-full" @click="successModalOpen = false">
            {{ t('LANDING.SUCCESS_MODAL.ACTION') }}
          </Button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { Autoplay, Pagination, A11y } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { onClickOutside, usePreferredReducedMotion } from '@vueuse/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRuntimeConfig } from 'nuxt/app';
import { useI18n } from 'vue-i18n';
import { Badge } from '../components/ui/shadcn/badge';
import { Button } from '../components/ui/shadcn/button';
import ButtonLoader from '../components/ui/ButtonLoader.vue';
import LanguageSelect from '../components/ui/LanguageSelect.vue';
import { Input } from '../components/ui/shadcn/input';
import { useLandingConfig } from '../composables/useLandingConfig';
import { useLandingAnalytics } from '../composables/useLandingAnalytics';
import { useLandingLocale } from '../composables/useLandingLocale';
import { useLandingSiteUrl } from '../composables/useLandingSiteUrl';
import type { SupportedLocale } from '../composables/useLandingLocale';

type FeatureStep = {
  key: string;
  title: string;
  description: string;
  chips: string[];
  image: string;
};

type ScenarioCard = {
  id: string;
  title: string;
  text: string;
  emoji: string;
};

type PricingPlan = {
  id: 'basic' | 'pro' | 'premium';
  title: string;
  subtitle: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
};

type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

type PrivacyCard = {
  id: string;
  icon: string;
  title: string;
  text: string;
};
type ComparisonPoint = {
  text: string;
  tooltip?: string;
};

const { t } = useI18n();
const runtimeConfig = useRuntimeConfig();
const route = useRoute();
const { locale, selectedLocale, switchLocale, brandLogoSrc, brandLogoAlt } =
  useLandingLocale();
const siteUrl = useLandingSiteUrl();
const reducedMotion = usePreferredReducedMotion();

const { data: landingConfig } = await useLandingConfig();
const { reachGoal, trackScrollDepth } = useLandingAnalytics();

const supportEmail = 'support@mentala.app';
const webAppUrl = computed(() =>
  String(runtimeConfig.public.appAuthUrl || 'https://my.mentala.app/auth')
    .replace(/\/auth\/?$/, '')
    .replace(/\/$/, '')
);
const legalLocale = computed(() =>
  String(locale.value).toLowerCase().startsWith('en') ? 'en' : 'ru'
);
const privacyPolicyUrl = computed(
  () => `${webAppUrl.value}/legal/privacy-policy-${legalLocale.value}.html`
);
const termsOfServiceUrl = computed(
  () => `${webAppUrl.value}/legal/terms-of-service-${legalLocale.value}.html`
);
const accountDeletionUrl = computed(
  () => `/account-deletion?lang=${selectedLocale.value}`
);
const billingPeriod = ref<'month' | 'year'>('month');
const waitlistOpen = ref(false);
/** Маленькая модалка «Успех» после отправки лида */
const successModalOpen = ref(false);
const submittingLead = ref(false);
const submitStatus = ref<'idle' | 'created' | 'duplicate' | 'error'>('idle');
const submitErrorText = ref('');
const activeFeatureIndex = ref(0);
const faqOpenIndex = ref<number | null>(null);

const featureRefs = ref<Array<HTMLElement | null>>([]);
const featurePhoneRef = ref<HTMLElement | null>(null);
let gsapContext: gsap.Context | null = null;
let gsapMedia: gsap.MatchMedia | null = null;

const leadForm = reactive<{
  name: string;
  email: string;
  goalKeys: string[];
  website: string;
}>({
  name: '',
  email: '',
  goalKeys: [],
  website: '', // honeypot
});

const goalDropdownOpen = ref(false);
const goalDropdownRef = ref<HTMLElement | null>(null);
const currentYear = new Date().getFullYear();
const numberFormatLocale = computed(() =>
  locale.value === 'ru' ? 'ru-RU' : 'en-US'
);

const selectedGoalsText = computed(() => {
  if (!leadForm.goalKeys.length) {
    return String(t('LANDING.WAITLIST.GOALS_PLACEHOLDER'));
  }

  const selected = goalOptions.value
    .filter((option) => leadForm.goalKeys.includes(option.value))
    .map((option) => option.label);

  return selected.length
    ? selected.join(', ')
    : String(t('LANDING.WAITLIST.GOALS_PLACEHOLDER'));
});

onClickOutside(goalDropdownRef, () => {
  goalDropdownOpen.value = false;
});

const featureSteps = computed<FeatureStep[]>(() => [
  {
    key: 'chat',
    title: String(t('LANDING.FEATURES.STEPS.CHAT.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.CHAT.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.CHAT.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.CHAT.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.CHAT.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/chat.webp',
  },
  {
    key: 'therapy',
    title: String(t('LANDING.FEATURES.STEPS.THERAPY.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.THERAPY.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.THERAPY.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.THERAPY.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.THERAPY.CHIPS.CHIP_3')),
      String(t('LANDING.FEATURES.STEPS.THERAPY.CHIPS.CHIP_4')),
    ],
    image: '/landing/features/therapy.webp',
  },
  {
    key: 'habits',
    title: String(t('LANDING.FEATURES.STEPS.HABITS.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.HABITS.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.HABITS.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.HABITS.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.HABITS.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/habits.webp',
  },
  {
    key: 'meditations',
    title: String(t('LANDING.FEATURES.STEPS.MEDITATIONS.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.MEDITATIONS.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.MEDITATIONS.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.MEDITATIONS.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.MEDITATIONS.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/meditations.webp',
  },
  {
    key: 'breathing',
    title: String(t('LANDING.FEATURES.STEPS.BREATHING.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.BREATHING.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.BREATHING.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.BREATHING.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.BREATHING.CHIPS.CHIP_3')),
      String(t('LANDING.FEATURES.STEPS.BREATHING.CHIPS.CHIP_4')),
    ],
    image: '/landing/features/breathing.webp',
  },
]);

const scenarios = computed<ScenarioCard[]>(() => [
  {
    id: 'anxiety-now',
    title: String(t('LANDING.SCENARIOS.ITEMS.ANXIETY_NOW.TITLE')),
    text: String(t('LANDING.SCENARIOS.ITEMS.ANXIETY_NOW.TEXT')),
    emoji: String(t('LANDING.SCENARIOS.ITEMS.ANXIETY_NOW.EMOJI')),
  },
  {
    id: 'sleep-faster',
    title: String(t('LANDING.SCENARIOS.ITEMS.SLEEP_FASTER.TITLE')),
    text: String(t('LANDING.SCENARIOS.ITEMS.SLEEP_FASTER.TEXT')),
    emoji: String(t('LANDING.SCENARIOS.ITEMS.SLEEP_FASTER.EMOJI')),
  },
  {
    id: 'drink-more-water',
    title: String(t('LANDING.SCENARIOS.ITEMS.DRINK_MORE_WATER.TITLE')),
    text: String(t('LANDING.SCENARIOS.ITEMS.DRINK_MORE_WATER.TEXT')),
    emoji: String(t('LANDING.SCENARIOS.ITEMS.DRINK_MORE_WATER.EMOJI')),
  },
  {
    id: 'burnout',
    title: String(t('LANDING.SCENARIOS.ITEMS.BURNOUT.TITLE')),
    text: String(t('LANDING.SCENARIOS.ITEMS.BURNOUT.TEXT')),
    emoji: String(t('LANDING.SCENARIOS.ITEMS.BURNOUT.EMOJI')),
  },
  {
    id: 'breathing-pause',
    title: String(t('LANDING.SCENARIOS.ITEMS.BREATHING_PAUSE.TITLE')),
    text: String(t('LANDING.SCENARIOS.ITEMS.BREATHING_PAUSE.TEXT')),
    emoji: String(t('LANDING.SCENARIOS.ITEMS.BREATHING_PAUSE.EMOJI')),
  },
]);

const howItWorks = computed(() => [
  {
    step: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_1.NUMBER')),
    title: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_1.TITLE')),
    text: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_1.TEXT')),
  },
  {
    step: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_2.NUMBER')),
    title: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_2.TITLE')),
    text: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_2.TEXT')),
  },
  {
    step: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_3.NUMBER')),
    title: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_3.TITLE')),
    text: String(t('LANDING.HOW_IT_WORKS.STEPS.STEP_3.TEXT')),
  },
]);

// Сравнение «по-другому»: Mentala и очная консультация (без противопоставления «лучше/хуже»).
// tooltip опционален: иконка «?» и v-tooltip (floating-vue) только у пунктов с tooltip.
const comparisonMentalaPoints = computed<ComparisonPoint[]>(() => [
  {
    text: String(t('LANDING.WHY.MENTALA_POINTS.POINT_1.TEXT')),
    tooltip: String(t('LANDING.WHY.MENTALA_POINTS.POINT_1.TOOLTIP')),
  },
  {
    text: String(t('LANDING.WHY.MENTALA_POINTS.POINT_2.TEXT')),
    tooltip: String(t('LANDING.WHY.MENTALA_POINTS.POINT_2.TOOLTIP')),
  },
  {
    text: String(t('LANDING.WHY.MENTALA_POINTS.POINT_3.TEXT')),
    tooltip: String(t('LANDING.WHY.MENTALA_POINTS.POINT_3.TOOLTIP')),
  },
  {
    text: String(t('LANDING.WHY.MENTALA_POINTS.POINT_4.TEXT')),
    tooltip: String(t('LANDING.WHY.MENTALA_POINTS.POINT_4.TOOLTIP')),
  },
]);

// Без тултипов — иконка «?» не показывается.
const comparisonConsultationPoints = computed<ComparisonPoint[]>(() => [
  { text: String(t('LANDING.WHY.CONSULTATION_POINTS.POINT_1')) },
  { text: String(t('LANDING.WHY.CONSULTATION_POINTS.POINT_2')) },
  { text: String(t('LANDING.WHY.CONSULTATION_POINTS.POINT_3')) },
  { text: String(t('LANDING.WHY.CONSULTATION_POINTS.POINT_4')) },
]);

// Контент секции приватности в коротком формате, чтобы блок оставался ёмким и читаемым.
const privacyCards = computed<PrivacyCard[]>(() => [
  {
    id: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.ID')),
    icon: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.ICON')),
    title: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.TITLE')),
    text: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.TEXT')),
  },
  {
    id: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.ID')),
    icon: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.ICON')),
    title: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.TITLE')),
    text: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.TEXT')),
  },
  {
    id: String(t('LANDING.PRIVACY.CARDS.GOOGLE_SIGN_IN.ID')),
    icon: String(t('LANDING.PRIVACY.CARDS.GOOGLE_SIGN_IN.ICON')),
    title: String(t('LANDING.PRIVACY.CARDS.GOOGLE_SIGN_IN.TITLE')),
    text: String(t('LANDING.PRIVACY.CARDS.GOOGLE_SIGN_IN.TEXT')),
  },
]);

const pricingPlans = computed<PricingPlan[]>(() => [
  {
    id: 'basic',
    title: String(t('LANDING.PRICING.PLANS.BASIC.TITLE')),
    subtitle: String(t('LANDING.PRICING.PLANS.BASIC.SUBTITLE')),
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      String(t('LANDING.PRICING.PLANS.BASIC.FEATURES.FEATURE_1')),
      String(t('LANDING.PRICING.PLANS.BASIC.FEATURES.FEATURE_2')),
      String(t('LANDING.PRICING.PLANS.BASIC.FEATURES.FEATURE_3')),
      String(t('LANDING.PRICING.PLANS.BASIC.FEATURES.FEATURE_4')),
    ],
  },
  {
    id: 'pro',
    title: String(t('LANDING.PRICING.PLANS.PRO.TITLE')),
    subtitle: String(t('LANDING.PRICING.PLANS.PRO.SUBTITLE')),
    monthlyPrice: 399,
    yearlyPrice: Math.round(399 * 12 * 0.8),
    features: [
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_1')),
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_2')),
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_3')),
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_4')),
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_5')),
      String(t('LANDING.PRICING.PLANS.PRO.FEATURES.FEATURE_6')),
    ],
  },
  {
    id: 'premium',
    title: String(t('LANDING.PRICING.PLANS.PREMIUM.TITLE')),
    subtitle: String(t('LANDING.PRICING.PLANS.PREMIUM.SUBTITLE')),
    monthlyPrice: 899,
    yearlyPrice: Math.round(899 * 12 * 0.8),
    features: [
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_1')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_2')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_3')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_4')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_5')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_6')),
      String(t('LANDING.PRICING.PLANS.PREMIUM.FEATURES.FEATURE_7')),
    ],
  },
]);

const faq = computed<FaqItem[]>(() => [
  {
    id: 'faq-1',
    question: String(t('LANDING.FAQ.ITEMS.ITEM_1.QUESTION')),
    answer: String(t('LANDING.FAQ.ITEMS.ITEM_1.ANSWER')),
  },
  {
    id: 'faq-2',
    question: String(t('LANDING.FAQ.ITEMS.ITEM_2.QUESTION')),
    answer: String(t('LANDING.FAQ.ITEMS.ITEM_2.ANSWER')),
  },
  {
    id: 'faq-3',
    question: String(t('LANDING.FAQ.ITEMS.ITEM_3.QUESTION')),
    answer: String(t('LANDING.FAQ.ITEMS.ITEM_3.ANSWER')),
  },
  {
    id: 'faq-4',
    question: String(t('LANDING.FAQ.ITEMS.ITEM_4.QUESTION')),
    answer: String(t('LANDING.FAQ.ITEMS.ITEM_4.ANSWER')),
  },
]);

const goalOptions = computed(() => [
  {
    value: 'reduce_anxiety',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.REDUCE_ANXIETY')),
  },
  {
    value: 'sleep_better',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.SLEEP_BETTER')),
  },
  {
    value: 'reduce_stress',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.REDUCE_STRESS')),
  },
  {
    value: 'quit_smoking',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.QUIT_SMOKING')),
  },
  {
    value: 'reduce_alcohol',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.REDUCE_ALCOHOL')),
  },
  {
    value: 'reduce_caffeine',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.REDUCE_CAFFEINE')),
  },
  {
    value: 'build_habits',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.BUILD_HABITS')),
  },
  {
    value: 'try_ai_support',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.TRY_AI_SUPPORT')),
  },
  {
    value: 'other',
    label: String(t('LANDING.WAITLIST.GOAL_OPTIONS.OTHER')),
  },
]);

const swiperModules = [Autoplay, Pagination, A11y];

const isReleased = computed(() => landingConfig.value?.isReleased ?? false);
const ctaUrl = computed(
  () => landingConfig.value?.ctaUrl || runtimeConfig.public.appAuthUrl
);
const isReducedMotion = computed(() => reducedMotion.value === 'reduce');

const primaryCtaText = computed(() =>
  isReleased.value
    ? String(t('LANDING.HERO.PRIMARY_CTA_RELEASED'))
    : String(t('LANDING.HERO.PRIMARY_CTA_EARLY_ACCESS'))
);

const primaryCtaTextMobile = computed(() =>
  isReleased.value
    ? String(t('LANDING.HERO.PRIMARY_CTA_RELEASED'))
    : String(t('LANDING.HEADER.CTA_MOBILE'))
);

const pricingCtaText = computed(() =>
  isReleased.value
    ? String(t('LANDING.PRICING.CTA_RELEASED'))
    : String(t('LANDING.PRICING.CTA_EARLY_ACCESS'))
);

const activeFeature = computed<FeatureStep>(
  () => featureSteps.value[activeFeatureIndex.value] ?? featureSteps.value[0]!
);

function getYearlySavings(plan: PricingPlan): number {
  // Экономия считается как разница между оплатой 12 месяцев и ценой за год.
  // Возвращаем 0, если экономии нет (например, бесплатный тариф).
  const savings = plan.monthlyPrice * 12 - plan.yearlyPrice;
  return savings > 0 ? savings : 0;
}

const canonicalUrl = computed(() => `${siteUrl.value}/`);
const localizedHomeUrl = computed(
  () => `${canonicalUrl.value}?lang=${locale.value}`
);
const ogImageUrl = computed(
  () => new URL('/landing/features/hero_bg.jpg', canonicalUrl.value).href
);

function toSingleQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function setFeatureRef(index: number, element: Element | null) {
  featureRefs.value[index] = element instanceof HTMLElement ? element : null;
}

function setActiveFeature(index: number) {
  // Единая точка смены шага: текстовая карточка и скрин телефона всегда синхронны.
  const normalizedIndex = Math.max(
    0,
    Math.min(featureSteps.value.length - 1, index)
  );
  if (activeFeatureIndex.value !== normalizedIndex) {
    activeFeatureIndex.value = normalizedIndex;
  }
}

function scrollToSection(sectionId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }

  section.scrollIntoView({
    behavior: isReducedMotion.value ? 'auto' : 'smooth',
    block: 'start',
  });
}

function openPrimaryCTA() {
  if (isReleased.value) {
    reachGoal('landing_auth_redirect_click');
    if (typeof window !== 'undefined') {
      window.location.href = ctaUrl.value;
    }
    return;
  }
  reachGoal('landing_cta_click');
  waitlistOpen.value = true;
}

async function onLocaleChange(nextLocale: SupportedLocale) {
  await switchLocale(nextLocale);
}

function closeWaitlist() {
  waitlistOpen.value = false;
}

function toggleFaq(index: number) {
  faqOpenIndex.value = faqOpenIndex.value === index ? null : index;
}

async function submitLead() {
  if (submittingLead.value) {
    return;
  }

  submitStatus.value = 'idle';
  submitErrorText.value = '';
  submittingLead.value = true;

  try {
    const response = await $fetch<{
      ok: boolean;
      status: 'created' | 'duplicate';
    }>('/api/landing/lead', {
      baseURL: runtimeConfig.public.landingApiBase,
      method: 'POST',
      body: {
        name: leadForm.name,
        email: leadForm.email,
        goalKeys: leadForm.goalKeys.length > 0 ? leadForm.goalKeys : undefined,
        utmSource: toSingleQueryValue(route.query.utm_source),
        utmMedium: toSingleQueryValue(route.query.utm_medium),
        utmCampaign: toSingleQueryValue(route.query.utm_campaign),
        honeypot: leadForm.website,
      },
    });

    submitStatus.value = response.status;

    if (response.status === 'created') {
      reachGoal('landing_lead_submit_success');
      leadForm.name = '';
      leadForm.email = '';
      leadForm.goalKeys = [];
      leadForm.website = '';
      waitlistOpen.value = false;
      await nextTick();
      successModalOpen.value = true;
    } else {
      reachGoal('landing_lead_submit_duplicate');
    }
  } catch (error: any) {
    submitStatus.value = 'error';
    reachGoal('landing_lead_submit_error', {
      message: error?.data?.message || error?.message || 'unknown',
    });
    submitErrorText.value =
      error?.data?.message ||
      error?.message ||
      String(t('LANDING.WAITLIST.ERROR_DEFAULT'));
  } finally {
    submittingLead.value = false;
  }
}

// Аналитика: открытие модалки waitlist
watch(waitlistOpen, (open) => {
  if (open) reachGoal('landing_modal_open');
});

onMounted(() => {
  // Аналитика v1: просмотр лендинга и глубина скролла
  reachGoal('landing_view');
  trackScrollDepth();

  // Guard на браузерные API для кросс-платформенности.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  if (!isReducedMotion.value) {
    gsap.registerPlugin(ScrollTrigger);

    gsapContext = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.reveal-item').forEach((element) => {
        gsap.fromTo(
          element,
          { opacity: 0, y: 24 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: element,
              start: 'top 82%',
              once: true,
            },
          }
        );
      });
    });

    gsapMedia = gsap.matchMedia();
    gsapMedia.add('(min-width: 1024px)', () => {
      // Смещение фиксированной точки под высоту шапки.
      const pinOffset = 100;
      // Точка переключения: когда карточка начинает уходить под хедер.
      const switchOffset = 104;
      const phone = featurePhoneRef.value;
      const steps = featureRefs.value.filter(
        (element): element is HTMLElement => Boolean(element)
      );

      if (!phone || steps.length === 0) {
        return;
      }

      setActiveFeature(0);

      const pinTrigger = ScrollTrigger.create({
        trigger: phone,
        start: `top top+=${pinOffset}`,
        endTrigger: steps[steps.length - 1],
        end: `top top+=${switchOffset}`,
        pin: true,
        // Важно для расчета высоты секции: добавляем pin-spacing в поток документа.
        pinSpacing: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
      });

      const stepTriggers = steps.slice(0, -1).map((step, index) =>
        ScrollTrigger.create({
          trigger: step,
          start: `top top+=${switchOffset}`,
          end: `bottom top+=${switchOffset}`,
          onEnter: () => {
            setActiveFeature(index + 1);
          },
          onLeaveBack: () => {
            setActiveFeature(index);
          },
        })
      );

      const resetTrigger = ScrollTrigger.create({
        trigger: steps[0],
        start: `top top+=${switchOffset}`,
        onLeaveBack: () => {
          setActiveFeature(0);
        },
      });

      return () => {
        pinTrigger.kill();
        resetTrigger.kill();
        stepTriggers.forEach((trigger) => trigger.kill());
      };
    });
  }
});

onBeforeUnmount(() => {
  gsapMedia?.revert();
  gsapContext?.revert();
});

useSeoMeta({
  title: () => String(t('LANDING.SEO.HOME.TITLE')),
  description: () => String(t('LANDING.SEO.HOME.DESCRIPTION')),
  robots:
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogTitle: () => String(t('LANDING.SEO.HOME.OG_TITLE')),
  ogDescription: () => String(t('LANDING.SEO.HOME.OG_DESCRIPTION')),
  ogType: 'website',
  ogUrl: () => localizedHomeUrl.value,
  ogSiteName: () => String(t('LANDING.SEO.HOME.SITE_NAME')),
  ogLocale: () => (locale.value === 'ru' ? 'ru_RU' : 'en_US'),
  ogImage: () => ogImageUrl.value,
  ogImageAlt: () => String(t('LANDING.SEO.HOME.OG_IMAGE_ALT')),
  twitterCard: 'summary_large_image',
  twitterTitle: () => String(t('LANDING.SEO.HOME.TWITTER_TITLE')),
  twitterDescription: () => String(t('LANDING.SEO.HOME.TWITTER_DESCRIPTION')),
  twitterImage: () => ogImageUrl.value,
});

useHead(() => ({
  htmlAttrs: {
    lang: locale.value,
  },
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
    { rel: 'alternate', hreflang: 'ru', href: `${canonicalUrl.value}?lang=ru` },
    { rel: 'alternate', hreflang: 'en', href: `${canonicalUrl.value}?lang=en` },
    { rel: 'alternate', hreflang: 'x-default', href: canonicalUrl.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: String(t('LANDING.STRUCTURED_DATA.ORGANIZATION_NAME')),
        url: canonicalUrl.value,
        logo: new URL(brandLogoSrc.value, canonicalUrl.value).href,
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: supportEmail,
            availableLanguage: ['ru', 'en'],
          },
        ],
      }),
    },
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: String(t('LANDING.STRUCTURED_DATA.WEBSITE_NAME')),
        url: canonicalUrl.value,
        inLanguage: locale.value,
      }),
    },
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: String(t('LANDING.STRUCTURED_DATA.WEBPAGE_NAME')),
        url: localizedHomeUrl.value,
        inLanguage: locale.value,
        primaryImageOfPage: ogImageUrl.value,
        isPartOf: {
          '@type': 'WebSite',
          url: canonicalUrl.value,
        },
      }),
    },
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        inLanguage: locale.value,
        mainEntity: faq.value.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      }),
    },
  ],
}));
</script>
