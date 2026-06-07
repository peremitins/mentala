<template>
  <div class="relative min-h-screen overflow-x-clip pb-4">
    <div class="landing-grid-glow" />
    <div class="noise-overlay" />

    <header class="fixed inset-x-0 top-3 z-50 px-0">
      <div class="landing-container">
        <div
          class="glass-panel rounded-2xl px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3"
        >
          <a
            href="#hero"
            class="font-display text-[15px] sm:text-lg font-bold tracking-tight text-white"
            @click.prevent="scrollToSection('hero')"
          >
            <img
              :src="brandLogoSrc"
              loading="lazy"
              :alt="brandLogoAlt"
              class="w-[130px] h-10"
            />
          </a>

          <nav class="hidden lg:flex items-center gap-1 text-sm text-white/80">
            <a
              v-for="link in navLinks"
              :key="link.section"
              :href="`#${link.section}`"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click.prevent="scrollToSection(link.section)"
            >
              {{ link.label }}
            </a>
          </nav>

          <Button
            class="hidden sm:inline-flex"
            size="sm"
            @click="openPrimaryCTA('header_desktop')"
          >
            {{ primaryCtaText }}
          </Button>

          <Button
            class="sm:hidden"
            size="sm"
            @click="openPrimaryCTA('header_mobile')"
          >
            {{ primaryCtaText }}
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
              <Button size="lg" @click="openPrimaryCTA('hero_primary')">{{
                primaryCtaText
              }}</Button>
              <button
                type="button"
                class="h-11 px-2 text-sm font-semibold text-white/80 underline-offset-4 transition hover:text-white hover:underline"
                @click="openAssessmentCTA('hero_secondary')"
              >
                {{ t('LANDING.HERO.SECONDARY_CTA') }}
              </button>
            </div>

            <div
              class="android-promo-surface reveal-item flex flex-col w-max gap-3 items-center rounded-lg"
            >
              <!-- На телефонах QR не показываем: там он избыточен, нужен только CTA. -->
              <a
                :href="androidInstallHref"
                target="_blank"
                class="hidden lg:flex items-center justify-center transition hover:border-white/20 hover:bg-white/[0.07]"
                :aria-label="t('LANDING.ANDROID_PROMO.QR_LINK_ARIA')"
                @click="trackAndroidPromoClick('hero_qr')"
              >
                <div
                  class="overflow-hidden rounded-lg bg-white p-4 shadow-[0_20px_44px_rgba(0,0,0,0.24)]"
                >
                  <img
                    src="/qr-codes/android.svg"
                    :alt="t('LANDING.ANDROID_PROMO.QR_ALT')"
                    class="h-[130px] w-[130px] rounded-[16px]"
                    loading="lazy"
                    decoding="async"
                    width="130"
                    height="130"
                  />
                </div>
              </a>

              <div class="flex min-w-0">
                <!-- Ведём на стабильный first-party путь, чтобы потом не перевыпускать QR. -->
                <a
                  :href="androidInstallHref"
                  target="_blank"
                  class="inline-flex transition hover:border-white/20 hover:bg-white/[0.06]"
                  :aria-label="t('LANDING.ANDROID_PROMO.BADGE_LINK_ARIA')"
                  @click="trackAndroidPromoClick('hero_primary')"
                >
                  <img
                    src="/store-badges/google-play-badge.svg"
                    :alt="t('LANDING.ANDROID_PROMO.GOOGLE_PLAY_BADGE_ALT')"
                    class="h-auto w-full max-w-[160px]"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </div>
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
                src="/landing/features/hero_bg.webp"
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

      <!-- Направления (сады): 9 тем продукта. Показываем все, чтобы каждый нашёл «своё». -->
      <section id="topics" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 max-w-2xl space-y-3">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              {{ t('LANDING.TOPICS.TITLE') }}
            </h2>
            <p class="text-white/75 reveal-item">
              {{ t('LANDING.TOPICS.DESCRIPTION') }}
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <article
              v-for="card in topicCards"
              :key="card.id"
              class="reveal-item glass-panel rounded-2xl p-4 sm:p-5 h-full"
            >
              <div class="flex items-start gap-3">
                <span
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5 text-[#A8FF35]"
                  aria-hidden="true"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M7 20h10" />
                    <path d="M10 20c5.5-2.5.8-6.4 3-10" />
                    <path
                      d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"
                    />
                    <path
                      d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"
                    />
                  </svg>
                </span>
                <div class="min-w-0">
                  <h3 class="font-display text-base sm:text-lg font-bold mb-1">
                    {{ card.title }}
                  </h3>
                  <p class="text-sm text-white/72 leading-relaxed">
                    {{ card.text }}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- Дифференциатор: чем Ментала больше, чем просто чат. Только наши плюсы, без конкурентов. -->
      <section id="differentiator" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div
            class="reveal-item glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 lg:p-10"
          >
            <div
              class="pointer-events-none absolute -right-16 -top-12 h-48 w-48 rounded-full bg-emerald-300/12 blur-3xl"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-sky-300/10 blur-3xl"
              aria-hidden="true"
            />

            <div class="relative">
              <div class="max-w-2xl space-y-4">
                <Badge variant="accent">
                  {{ t('LANDING.DIFFERENTIATOR.BADGE') }}
                </Badge>
                <h2 class="font-display text-3xl sm:text-4xl font-bold">
                  {{ t('LANDING.DIFFERENTIATOR.TITLE') }}
                </h2>
                <p class="text-white/78 leading-relaxed">
                  {{ t('LANDING.DIFFERENTIATOR.DESCRIPTION') }}
                </p>
              </div>

              <div class="mt-7 grid gap-4 sm:grid-cols-3">
                <article
                  v-for="pillar in differentiatorPillars"
                  :key="pillar.id"
                  class="rounded-2xl border border-white/12 bg-white/[0.04] p-5 h-full"
                >
                  <span
                    class="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/5 text-[#A8FF35]"
                    aria-hidden="true"
                  >
                    <svg
                      v-if="pillar.id === 'guides'"
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <circle cx="6" cy="19" r="3" />
                      <path
                        d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"
                      />
                      <circle cx="18" cy="5" r="3" />
                    </svg>
                    <svg
                      v-else-if="pillar.id === 'remembers'"
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path
                        d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                      />
                      <path d="M3 3v5h5" />
                      <path d="M12 7v5l4 2" />
                    </svg>
                    <svg
                      v-else
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <rect width="7" height="7" x="3" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="3" rx="1" />
                      <rect width="7" height="7" x="14" y="14" rx="1" />
                      <rect width="7" height="7" x="3" y="14" rx="1" />
                    </svg>
                  </span>
                  <h3 class="font-display text-lg font-bold mb-2">
                    {{ pillar.title }}
                  </h3>
                  <p class="text-sm text-white/72 leading-relaxed">
                    {{ pillar.text }}
                  </p>
                </article>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Оценка состояния: основной вход в продукт (GAD-7). CTA ведёт на авторизацию с next. -->
      <section id="assessment" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div
            class="reveal-item glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 lg:p-10"
          >
            <div
              class="pointer-events-none absolute -right-16 -top-10 h-48 w-48 rounded-full bg-emerald-300/12 blur-3xl"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-sky-300/10 blur-3xl"
              aria-hidden="true"
            />

            <div
              class="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center"
            >
              <div class="space-y-5">
                <Badge variant="accent">
                  {{ t('LANDING.ASSESSMENT.BADGE') }}
                </Badge>
                <h2 class="font-display text-2xl sm:text-3xl font-bold">
                  {{ t('LANDING.ASSESSMENT.TITLE') }}
                </h2>
                <p class="text-white/78 leading-relaxed max-w-xl">
                  {{ t('LANDING.ASSESSMENT.TEXT') }}
                </p>
                <div class="flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    @click="openAssessmentCTA('assessment_block')"
                  >
                    {{ t('LANDING.ASSESSMENT.CTA') }}
                  </Button>
                </div>
              </div>

              <div class="mx-auto w-full max-w-[260px]">
                <div
                  class="mx-auto overflow-hidden"
                  style="aspect-ratio: 390 / 844"
                >
                  <img
                    src="/landing/features/assessment.webp"
                    :alt="t('LANDING.ASSESSMENT.IMAGE_ALT')"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          </div>
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

            <p
              class="reveal-item text-sm text-white/65 leading-relaxed glass-panel rounded-xl px-5 py-4 border-white/15"
            >
              {{ t('LANDING.FEATURES.ALSO_AVAILABLE') }}
            </p>

            <div
              class="reveal-item relative max-w-3xl mx-auto w-full my-[40px]"
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
              <!-- На мобильных даем пользователю ручной свайп по всем экранам. -->
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

          <div class="grid lg:grid-cols-2 gap-4">
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
                @click="openPrimaryCTA(`pricing_${plan.id}`)"
              >
                {{ pricingCtaText }}
              </Button>
            </article>
          </div>

          <p
            class="reveal-item mt-5 text-center text-sm text-white/70 max-w-2xl mx-auto"
          >
            {{ t('LANDING.PRICING.TRIAL_NOTE') }}
          </p>
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

          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <article
              v-for="item in privacyCards"
              :key="item.id"
              class="reveal-item glass-panel rounded-2xl p-5 sm:p-6 h-full"
            >
              <div class="flex items-start gap-3.5">
                <div
                  class="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/5 text-white/85"
                  aria-hidden="true"
                >
                  <svg
                    v-if="item.id === 'private-dialogs'"
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <svg
                    v-else
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path
                      d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
                    />
                  </svg>
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

      <section
        id="android-download"
        class="android-promo-surface reveal-item scroll-mt-header mt-20 lg:mt-28"
      >
        <div class="landing-container">
          <div
            class="reveal-item glass-panel relative overflow-hidden rounded-2xl border-white/20 p-6 sm:p-8 lg:p-10"
          >
            <div
              class="pointer-events-none absolute -right-20 top-0 h-48 w-48 rounded-full bg-emerald-300/12 blur-3xl"
              aria-hidden="true"
            />
            <div
              class="pointer-events-none absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-sky-300/10 blur-3xl"
              aria-hidden="true"
            />

            <div
              class="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"
            >
              <div class="space-y-2 max-w-md">
                <h2 class="font-display text-2xl sm:text-3xl font-bold">
                  {{ t('LANDING.ANDROID_PROMO.DOWNLOAD_TITLE') }}
                </h2>
                <p class="text-white/75">
                  {{ t('LANDING.ANDROID_PROMO.DOWNLOAD_SUBTITLE') }}
                </p>
              </div>

              <div class="flex flex-col items-center gap-5 w-max">
                <a
                  :href="androidInstallHref"
                  target="_blank"
                  class="hidden lg:flex items-center justify-center transition hover:border-white/20 hover:bg-white/[0.07]"
                  :aria-label="t('LANDING.ANDROID_PROMO.QR_LINK_ARIA')"
                  @click="trackAndroidPromoClick('bottom_qr')"
                >
                  <div
                    class="mx-auto overflow-hidden rounded-lg bg-white shadow-[0_20px_44px_rgba(0,0,0,0.24)]"
                  >
                    <img
                      src="/qr-codes/android.svg"
                      :alt="t('LANDING.ANDROID_PROMO.QR_ALT')"
                      class="h-[200px] w-[200px] rounded-[16px]"
                      loading="lazy"
                      decoding="async"
                      width="200"
                      height="200"
                    />
                  </div>
                </a>

                <a
                  :href="androidInstallHref"
                  target="_blank"
                  class="w-full inline-flex justify-center transition hover:border-white/20 hover:bg-white/[0.06]"
                  :aria-label="t('LANDING.ANDROID_PROMO.BADGE_LINK_ARIA')"
                  @click="trackAndroidPromoClick('bottom_primary')"
                >
                  <img
                    src="/store-badges/google-play-badge.svg"
                    :alt="t('LANDING.ANDROID_PROMO.GOOGLE_PLAY_BADGE_ALT')"
                    class="h-auto w-[200px]"
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              </div>
            </div>
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
  </div>
</template>

<script setup lang="ts">
import { Autoplay, Pagination, A11y } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/vue';
import { usePreferredReducedMotion } from '@vueuse/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { onPrehydrate } from 'nuxt/app';
import { nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge } from '../components/ui/shadcn/badge';
import { Button } from '../components/ui/shadcn/button';
import LanguageSelect from '../components/ui/LanguageSelect.vue';
import { useLandingAnalytics } from '../composables/useLandingAnalytics';
import { useLandingAppAuthUrl } from '../composables/useLandingAppAuthUrl';
import { useLandingLocale } from '../composables/useLandingLocale';
import { useLandingSiteUrl } from '../composables/useLandingSiteUrl';
import type { SupportedLocale } from '../composables/useLandingLocale';
import {
  GOOGLE_PLAY_WEB_URL,
  LANDING_ANDROID_QR_PATH,
  buildLandingAndroidQrUrl,
} from '../../../shared/utils/mobileAppLinks';
import type { MarketingAttributionDto } from '../../../shared/dto/marketing-attribution';
import {
  MARKETING_ATTRIBUTION_STORAGE_KEY,
  MARKETING_ATTRIBUTION_TTL_MS,
  appendMarketingAttributionToUrl,
  extractMarketingAttributionFromQuery,
  normalizeMarketingAttribution,
} from '../../../shared/utils/marketingAttribution';
import { calculateSubscriptionPrice } from '../../../shared/utils/subscriptionPricing';

// Глубинная ссылка на тест тревожности в приложении. После авторизации
// /auth?next=... доводит нового пользователя прямо до прохождения теста (воронка B).
const ASSESSMENT_DEEP_LINK_PATH = '/practices/assessments/anxiety_check_v1';

type FeatureStep = {
  key: string;
  title: string;
  description: string;
  chips: string[];
  image: string;
};

type TopicCard = {
  id: string;
  title: string;
  text: string;
};

type DifferentiatorPillar = {
  id: string;
  title: string;
  text: string;
};

type PricingPlan = {
  id: 'pro' | 'premium';
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
  title: string;
  text: string;
};
type ComparisonPoint = {
  text: string;
  tooltip?: string;
};
type PrimaryCtaSource =
  | 'header_desktop'
  | 'header_mobile'
  | 'hero_primary'
  | `pricing_${PricingPlan['id']}`;
type AssessmentCtaSource = 'hero_secondary' | 'assessment_block';
type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

const { t } = useI18n();
const route = useRoute();
const {
  locale,
  selectedLocale,
  switchLocale,
  getLocalizedPath,
  brandLogoSrc,
  brandLogoAlt,
} = useLandingLocale();
const siteUrl = useLandingSiteUrl();
const appAuthUrl = useLandingAppAuthUrl();
const reducedMotion = usePreferredReducedMotion();

const { reachGoal, trackScrollDepth } = useLandingAnalytics();

const supportEmail = 'support@mentala.app';
const webAppUrl = computed(() =>
  String(appAuthUrl.value)
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
const accountDeletionUrl = computed(() =>
  getLocalizedPath('/account-deletion', selectedLocale.value)
);
const billingPeriod = ref<'month' | 'year'>('month');
const activeFeatureIndex = ref(0);
const faqOpenIndex = ref<number | null>(null);
const landingMarketingAttribution = ref<MarketingAttributionDto | undefined>();

const featureRefs = ref<Array<HTMLElement | null>>([]);
const featurePhoneRef = ref<HTMLElement | null>(null);
let gsapContext: gsap.Context | null = null;
let gsapMedia: gsap.MatchMedia | null = null;
let hashScrollFrameIds: number[] = [];
let hashScrollTimeoutIds: number[] = [];

const currentYear = new Date().getFullYear();
const numberFormatLocale = computed(() =>
  locale.value === 'ru' ? 'ru-RU' : 'en-US'
);

// Навигация в шапке: пункты ведут на соответствующие секции по якорю.
const navLinks = computed(() => [
  { section: 'topics', label: String(t('LANDING.HEADER.NAV.TOPICS')) },
  { section: 'assessment', label: String(t('LANDING.HEADER.NAV.ASSESSMENT')) },
  { section: 'features', label: String(t('LANDING.HEADER.NAV.FEATURES')) },
  {
    section: 'landing-pricing',
    label: String(t('LANDING.HEADER.NAV.PRICING')),
  },
  { section: 'privacy', label: String(t('LANDING.HEADER.NAV.SECURITY')) },
  { section: 'faq', label: String(t('LANDING.HEADER.NAV.FAQ')) },
]);

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
    key: 'roadmap',
    title: String(t('LANDING.FEATURES.STEPS.ROADMAP.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.ROADMAP.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.ROADMAP.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.ROADMAP.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.ROADMAP.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/roadmap.webp',
  },
  {
    key: 'practices',
    title: String(t('LANDING.FEATURES.STEPS.PRACTICES.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.PRACTICES.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.PRACTICES.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.PRACTICES.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.PRACTICES.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/breathing.webp',
  },
  {
    key: 'assessment',
    title: String(t('LANDING.FEATURES.STEPS.ASSESSMENT.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.ASSESSMENT.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.ASSESSMENT.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.ASSESSMENT.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.ASSESSMENT.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/assessment.webp',
  },
  {
    key: 'garden',
    title: String(t('LANDING.FEATURES.STEPS.GARDEN.TITLE')),
    description: String(t('LANDING.FEATURES.STEPS.GARDEN.DESCRIPTION')),
    chips: [
      String(t('LANDING.FEATURES.STEPS.GARDEN.CHIPS.CHIP_1')),
      String(t('LANDING.FEATURES.STEPS.GARDEN.CHIPS.CHIP_2')),
      String(t('LANDING.FEATURES.STEPS.GARDEN.CHIPS.CHIP_3')),
    ],
    image: '/landing/features/plant.webp',
  },
]);

// Направления (сады): каждая тема ведёт пользователя к «своей» программе.
const topicCards = computed<TopicCard[]>(() => [
  {
    id: 'anxiety',
    title: String(t('LANDING.TOPICS.ITEMS.ANXIETY.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.ANXIETY.TEXT')),
  },
  {
    id: 'self-kindness',
    title: String(t('LANDING.TOPICS.ITEMS.SELF_KINDNESS.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.SELF_KINDNESS.TEXT')),
  },
  {
    id: 'relationships',
    title: String(t('LANDING.TOPICS.ITEMS.RELATIONSHIPS.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.RELATIONSHIPS.TEXT')),
  },
  {
    id: 'burnout',
    title: String(t('LANDING.TOPICS.ITEMS.BURNOUT.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.BURNOUT.TEXT')),
  },
  {
    id: 'sleep',
    title: String(t('LANDING.TOPICS.ITEMS.SLEEP.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.SLEEP.TEXT')),
  },
  {
    id: 'emotions',
    title: String(t('LANDING.TOPICS.ITEMS.EMOTIONS.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.EMOTIONS.TEXT')),
  },
  {
    id: 'habits',
    title: String(t('LANDING.TOPICS.ITEMS.HABITS.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.HABITS.TEXT')),
  },
  {
    id: 'joy',
    title: String(t('LANDING.TOPICS.ITEMS.JOY.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.JOY.TEXT')),
  },
  {
    id: 'purpose',
    title: String(t('LANDING.TOPICS.ITEMS.PURPOSE.TITLE')),
    text: String(t('LANDING.TOPICS.ITEMS.PURPOSE.TEXT')),
  },
]);

// Дифференциатор «не просто чат»: три преимущества Ментала (без сравнения с конкурентами).
const differentiatorPillars = computed<DifferentiatorPillar[]>(() => [
  {
    id: 'guides',
    title: String(t('LANDING.DIFFERENTIATOR.PILLARS.GUIDES.TITLE')),
    text: String(t('LANDING.DIFFERENTIATOR.PILLARS.GUIDES.TEXT')),
  },
  {
    id: 'remembers',
    title: String(t('LANDING.DIFFERENTIATOR.PILLARS.REMEMBERS.TITLE')),
    text: String(t('LANDING.DIFFERENTIATOR.PILLARS.REMEMBERS.TEXT')),
  },
  {
    id: 'all-in-one',
    title: String(t('LANDING.DIFFERENTIATOR.PILLARS.ALL_IN_ONE.TITLE')),
    text: String(t('LANDING.DIFFERENTIATOR.PILLARS.ALL_IN_ONE.TEXT')),
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

// Сравнение «по-другому»: Mentala и приём у специалиста (без противопоставления «лучше/хуже»).
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
    title: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.TITLE')),
    text: String(t('LANDING.PRIVACY.CARDS.PRIVATE_DIALOGS.TEXT')),
  },
  {
    id: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.ID')),
    title: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.TITLE')),
    text: String(t('LANDING.PRIVACY.CARDS.DATA_PROTECTION.TEXT')),
  },
]);

const pricingPlans = computed<PricingPlan[]>(() => [
  {
    id: 'pro',
    title: String(t('LANDING.PRICING.PLANS.PRO.TITLE')),
    subtitle: String(t('LANDING.PRICING.PLANS.PRO.SUBTITLE')),
    monthlyPrice: 399,
    yearlyPrice: calculateSubscriptionPrice(399, 'year'),
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
    yearlyPrice: calculateSubscriptionPrice(899, 'year'),
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

const swiperModules = [Autoplay, Pagination, A11y];

// С лендинга всегда ведём на вкладку регистрации (`?mode=signup`): по умолчанию
// на странице авторизации активен вход, а новым посетителям удобнее сразу
// попасть на регистрацию. Параметр наследуют все CTA, построенные поверх ctaUrl.
const ctaUrl = computed(() => {
  try {
    const url = new URL(String(appAuthUrl.value));
    url.searchParams.set('mode', 'signup');
    return url.toString();
  } catch {
    return String(appAuthUrl.value);
  }
});
const ctaUrlWithAttribution = computed(() =>
  appendMarketingAttributionToUrl(
    String(ctaUrl.value),
    landingMarketingAttribution.value
  )
);

// Воронка теста: тот же auth-URL + ?next=, чтобы после входа сразу открыть тест в приложении.
const assessmentCtaUrl = computed(() => {
  try {
    const url = new URL(String(ctaUrlWithAttribution.value));
    url.searchParams.set('next', ASSESSMENT_DEEP_LINK_PATH);
    return url.toString();
  } catch {
    return String(ctaUrlWithAttribution.value);
  }
});

const isReducedMotion = computed(() => reducedMotion.value === 'reduce');
const androidInstallHref = LANDING_ANDROID_QR_PATH;
const androidQrUrl = computed(() => buildLandingAndroidQrUrl(siteUrl.value));

// CTA-тексты жёстко зафиксированы в released-режиме: приложение опубликовано,
// форма waitlist выпилена, дополнительной ветки EARLY_ACCESS больше нет.
const primaryCtaText = computed(() =>
  String(t('LANDING.HERO.PRIMARY_CTA_RELEASED'))
);

const pricingCtaText = computed(() =>
  String(t('LANDING.PRICING.CTA_RELEASED'))
);

const activeFeature = computed<FeatureStep>(
  () => featureSteps.value[activeFeatureIndex.value] ?? featureSteps.value[0]!
);

function isAppleClientPlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const clientNavigator = navigator as NavigatorWithUserAgentData;
  const userAgent = clientNavigator.userAgent || '';
  const platform = clientNavigator.platform || '';
  const userAgentDataPlatform =
    'userAgentData' in clientNavigator
      ? String(clientNavigator.userAgentData?.platform || '')
      : '';

  // iPadOS может маскироваться под macOS в Safari desktop mode.
  const isIpadDesktopMode =
    platform === 'MacIntel' &&
    'maxTouchPoints' in clientNavigator &&
    clientNavigator.maxTouchPoints > 1;

  return (
    /iPad|iPhone|iPod|Macintosh|Mac OS X/i.test(userAgent) ||
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /macOS|iOS|iPadOS/i.test(userAgentDataPlatform) ||
    isIpadDesktopMode
  );
}

onPrehydrate(() => {
  const clientNavigator = navigator as NavigatorWithUserAgentData;
  const userAgent = clientNavigator.userAgent || '';
  const platform = clientNavigator.platform || '';
  const userAgentDataPlatform =
    'userAgentData' in clientNavigator
      ? String(clientNavigator.userAgentData?.platform || '')
      : '';
  const isIpadDesktopMode =
    platform === 'MacIntel' &&
    'maxTouchPoints' in clientNavigator &&
    clientNavigator.maxTouchPoints > 1;
  const isApplePlatform =
    /iPad|iPhone|iPod|Macintosh|Mac OS X/i.test(userAgent) ||
    /Mac|iPhone|iPad|iPod/i.test(platform) ||
    /macOS|iOS|iPadOS/i.test(userAgentDataPlatform) ||
    isIpadDesktopMode;

  document.documentElement.classList.toggle(
    'is-apple-client-platform',
    isApplePlatform
  );
});

onMounted(() => {
  document.documentElement.classList.toggle(
    'is-apple-client-platform',
    isAppleClientPlatform()
  );
});

function getYearlySavings(plan: PricingPlan): number {
  // Экономия считается как разница между оплатой 12 месяцев и ценой за год.
  // Возвращаем 0, если экономии нет (например, бесплатный тариф).
  const savings = plan.monthlyPrice * 12 - plan.yearlyPrice;
  return savings > 0 ? savings : 0;
}

const ruHomeUrl = computed(() => `${siteUrl.value}/`);
const enHomeUrl = computed(() => `${ruHomeUrl.value}?lang=en`);
const canonicalUrl = computed(() =>
  locale.value === 'en' ? enHomeUrl.value : ruHomeUrl.value
);
const ogImageUrl = computed(
  () => new URL('/landing/features/hero_bg.webp', ruHomeUrl.value).href
);

function readStoredMarketingAttribution(): MarketingAttributionDto | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    const storage = window.localStorage;
    const raw = storage.getItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return undefined;

    const parsed = JSON.parse(raw) as {
      value?: MarketingAttributionDto;
      expiresAt?: number;
    };
    if (!parsed.value || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      storage.removeItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
      return undefined;
    }

    return normalizeMarketingAttribution(parsed.value);
  } catch {
    try {
      window.localStorage.removeItem(MARKETING_ATTRIBUTION_STORAGE_KEY);
    } catch {
      // localStorage может быть недоступен в приватном режиме или WebView.
    }
    return undefined;
  }
}

function captureLandingMarketingAttribution(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const captured = extractMarketingAttributionFromQuery(route.query, {
    landingUrl: window.location.href,
    referrer:
      typeof document !== 'undefined' && document.referrer
        ? document.referrer
        : undefined,
    capturedAt: new Date().toISOString(),
  });

  const attribution = captured ?? readStoredMarketingAttribution();
  landingMarketingAttribution.value = attribution;

  if (!captured) {
    return;
  }

  try {
    window.localStorage.setItem(
      MARKETING_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({
        value: captured,
        expiresAt: Date.now() + MARKETING_ATTRIBUTION_TTL_MS,
      })
    );
  } catch {
    // Attribution всё равно останется в памяти страницы и попадёт в текущий CTA/lead.
  }
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

function scrollToSection(
  sectionId: string,
  options?: { behavior?: ScrollBehavior; updateHash?: boolean }
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const section = document.getElementById(sectionId);
  if (!section) {
    return;
  }

  if (options?.updateHash !== false) {
    const nextHash = `#${sectionId}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, '', nextHash);
    }
  }

  const scrollMarginTop = Number.parseFloat(
    window.getComputedStyle(section).scrollMarginTop || '0'
  );
  const top =
    window.scrollY +
    section.getBoundingClientRect().top -
    (Number.isFinite(scrollMarginTop) ? scrollMarginTop : 0);

  window.scrollTo({
    top: Math.max(0, top),
    behavior: options?.behavior ?? (isReducedMotion.value ? 'auto' : 'smooth'),
  });
}

function clearScheduledHashScroll() {
  if (typeof window === 'undefined') {
    return;
  }

  hashScrollFrameIds.forEach((frameId) => {
    window.cancelAnimationFrame(frameId);
  });
  hashScrollFrameIds = [];

  hashScrollTimeoutIds.forEach((timeoutId) => {
    window.clearTimeout(timeoutId);
  });
  hashScrollTimeoutIds = [];
}

function runAfterFrame(callback: () => void) {
  if (
    typeof window === 'undefined' ||
    typeof window.requestAnimationFrame !== 'function'
  ) {
    callback();
    return;
  }

  const frameId = window.requestAnimationFrame(() => {
    hashScrollFrameIds = hashScrollFrameIds.filter((id) => id !== frameId);
    callback();
  });
  hashScrollFrameIds.push(frameId);
}

function runAfterDelay(callback: () => void, delayMs: number) {
  if (typeof window === 'undefined') {
    return;
  }

  const timeoutId = window.setTimeout(() => {
    hashScrollTimeoutIds = hashScrollTimeoutIds.filter(
      (id) => id !== timeoutId
    );
    callback();
  }, delayMs);
  hashScrollTimeoutIds.push(timeoutId);
}

async function scrollToCurrentHash(options?: { behavior?: ScrollBehavior }) {
  if (typeof window === 'undefined') {
    return;
  }

  const sectionId = window.location.hash.replace(/^#/, '');
  if (!sectionId) {
    return;
  }

  const scroll = () => {
    scrollToSection(sectionId, {
      behavior: options?.behavior ?? 'auto',
      updateHash: false,
    });
  };

  clearScheduledHashScroll();
  await nextTick();

  // Рекламный URL с hash приходит до hydration и до ScrollTrigger refresh.
  // Повторяем коротко после стабилизации layout, чтобы не застревать наверху.
  runAfterFrame(() => {
    ScrollTrigger.refresh();
    scroll();
    runAfterFrame(scroll);
  });
  runAfterDelay(scroll, 250);
  runAfterDelay(scroll, 650);
}

function handleHashChange() {
  void scrollToCurrentHash();
}

function trackCtaGoal(goalName: string, source: string) {
  // Оставляем старую общую цель и добавляем детальную цель по месту клика.
  reachGoal(goalName, { source });
  reachGoal(`${goalName}_${source}`, { source });
}

function openPrimaryCTA(source: PrimaryCtaSource) {
  trackCtaGoal('landing_auth_redirect_click', source);
  if (typeof window !== 'undefined') {
    window.open(ctaUrlWithAttribution.value, '_blank', 'noopener,noreferrer');
  }
}

function openAssessmentCTA(source: AssessmentCtaSource) {
  // Отдельная цель: видно, сколько людей зашло именно через тест.
  trackCtaGoal('landing_assessment_cta_click', source);
  if (typeof window !== 'undefined') {
    window.open(assessmentCtaUrl.value, '_blank', 'noopener,noreferrer');
  }
}

function trackAndroidPromoClick(location: string) {
  // Отдельно помечаем install CTA, чтобы видеть разницу между hero и нижним блоком.
  trackCtaGoal('landing_android_store_click', location);
}

async function onLocaleChange(nextLocale: SupportedLocale) {
  await switchLocale(nextLocale);
}

function toggleFaq(index: number) {
  faqOpenIndex.value = faqOpenIndex.value === index ? null : index;
}

onMounted(() => {
  captureLandingMarketingAttribution();

  // Аналитика v1: просмотр лендинга и глубина скролла
  reachGoal('landing_view');
  trackScrollDepth();

  // Guard на браузерные API для кросс-платформенности.
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  window.addEventListener('hashchange', handleHashChange, { passive: true });

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

  void scrollToCurrentHash({ behavior: 'auto' });
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('hashchange', handleHashChange);
  }

  clearScheduledHashScroll();
  gsapMedia?.revert();
  gsapContext?.revert();
});

useSeoMeta({
  title: () => String(t('LANDING.SEO.HOME.TITLE')),
  description: () => String(t('LANDING.SEO.HOME.DESCRIPTION')),
  robots: () =>
    locale.value === 'ru'
      ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      : 'noindex, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogTitle: () => String(t('LANDING.SEO.HOME.OG_TITLE')),
  ogDescription: () => String(t('LANDING.SEO.HOME.OG_DESCRIPTION')),
  ogType: 'website',
  ogUrl: () => canonicalUrl.value,
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
    { rel: 'alternate', hreflang: 'ru', href: ruHomeUrl.value },
    { rel: 'alternate', hreflang: 'x-default', href: ruHomeUrl.value },
  ],
  script: [
    {
      key: 'ld-organization',
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: String(t('LANDING.STRUCTURED_DATA.ORGANIZATION_NAME')),
        url: ruHomeUrl.value,
        logo: new URL(brandLogoSrc.value, ruHomeUrl.value).href,
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
      key: 'ld-website',
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: String(t('LANDING.STRUCTURED_DATA.WEBSITE_NAME')),
        url: ruHomeUrl.value,
        inLanguage: 'ru',
      }),
    },
    {
      key: 'ld-webpage',
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: String(t('LANDING.STRUCTURED_DATA.WEBPAGE_NAME')),
        url: canonicalUrl.value,
        inLanguage: locale.value,
        primaryImageOfPage: ogImageUrl.value,
        isPartOf: {
          '@type': 'WebSite',
          url: ruHomeUrl.value,
        },
      }),
    },
    {
      key: 'ld-faq',
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
    {
      key: 'ld-software-application',
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: String(t('LANDING.STRUCTURED_DATA.SOFTWARE_APPLICATION_NAME')),
        operatingSystem: 'Android',
        applicationCategory: 'HealthApplication',
        url: androidQrUrl.value,
        installUrl: androidQrUrl.value,
        downloadUrl: GOOGLE_PLAY_WEB_URL,
        description: String(t('LANDING.ANDROID_PROMO.STRUCTURED_DESCRIPTION')),
      }),
    },
  ],
}));
</script>
