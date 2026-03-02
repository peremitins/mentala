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
              src="/logo.svg"
              loading="lazy"
              alt="Mentai"
              class="w-[130px] h-10"
            />
          </button>

          <nav class="hidden lg:flex items-center gap-2 text-sm text-white/80">
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('features')"
            >
              Возможности
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('scenarios')"
            >
              Сценарии
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('how-it-works')"
            >
              Как работает
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('landing-pricing')"
            >
              Тарифы
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('privacy')"
            >
              Приватность
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white transition"
              @click="scrollToSection('faq')"
            >
              Вопросы
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
            Получить доступ
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
            <Badge variant="accent" class="reveal-item"
              >Спокойствие и ясность в кармане</Badge
            >

            <h1
              class="reveal-item font-display text-2xl lg:text-4xl leading-[1.06] font-extrabold tracking-tight"
            >
              ИИ-помощник для поддержки, практик и привычек.<br />В любое время.
            </h1>

            <p class="reveal-item text-base sm:text-lg text-white/80 max-w-2xl">
              Помогает выговориться, выдохнуть и настроить здоровый ритм жизни.
              Без осуждения и записи на прием.
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
                Посмотреть возможности
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
                alt="Пользователи Mentala в повседневных сценариях"
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
              Возможности Mentala
            </h2>
            <p class="text-white/75 reveal-item">
              От быстрой помощи при тревоге до устойчивых изменений в привычках.
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
              Mentala создана для психологической поддержки и самопомощи. Это не
              медицинская услуга и не замена врачу или психотерапевту. Если вы
              чувствуете, что вам нужна профессиональная помощь, пожалуйста, не
              откладывайте визит к квалифицированному специалисту.
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
              Сценарии
            </h2>
            <p class="text-white/75 reveal-item">
              Как Mentala помогает в повседневной жизни.
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
              :key="item.title"
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
              Как это работает
            </h2>
            <p class="text-white/75 reveal-item">
              Три шага, чтобы превратить короткую поддержку в устойчивый ритм.
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
              Дополняет, не заменяет
            </Badge>
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              Чем Mentala удобна в реальной жизни
            </h2>
            <p class="text-white/75 reveal-item">
              Mentala не заменяет специалиста. Она делает поддержку доступной в
              моменты, когда она нужна.
            </p>
          </div>

          <div
            class="grid w-full min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-2 lg:gap-6"
          >
            <article
              class="reveal-item glass-panel min-w-0 rounded-2xl p-5 sm:p-6 flex flex-col"
            >
              <h3 class="font-display text-xl sm:text-2xl font-bold mb-4">
                Mentala
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
                      :aria-label="`Подробнее: ${point.text}`"
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
                Консультация со специалистом
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
            При тяжёлом состоянии и рисках для здоровья обращайтесь к врачу или
            психотерапевту.
          </p>
        </div>
      </section>

      <section id="landing-pricing" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="mb-5 space-y-3">
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              Тарифы
            </h2>
            <p class="text-white/75 reveal-item">
              Выберите формат подписки: месяц или год. При оплате за год скидка
              20%.
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
              Месяц
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
              Год (-20%)
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
                        ? plan.monthlyPrice.toLocaleString('ru-RU')
                        : plan.yearlyPrice.toLocaleString('ru-RU')
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
                    Экономия:
                    {{ getYearlySavings(plan).toLocaleString('ru-RU') }} ₽
                  </Badge>
                </div>

                <p class="text-sm text-white/70">
                  {{
                    billingPeriod === 'year' && plan.monthlyPrice > 0
                      ? 'в год'
                      : 'в месяц'
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
                {{ isReleased ? 'Выбрать и начать' : 'Получить ранний доступ' }}
              </Button>
            </article>
          </div>
        </div>
      </section>

      <section
        class="reveal-item glass-panel rounded-xl px-5 py-4 text-xs sm:text-sm text-white/80 border-white/25 max-w-3xl mx-auto mt-20 sm:mt-28 text-center"
      >
        Mentala создана для психологической поддержки и самопомощи. Это не
        медицинская услуга и не замена врачу или психотерапевту. Если вы
        чувствуете, что вам нужна профессиональная помощь, пожалуйста, не
        откладывайте визит к квалифицированному специалисту.
      </section>

      <section id="privacy" class="scroll-mt-header mt-20 lg:mt-28">
        <div class="landing-container">
          <div class="max-w-2xl space-y-3 sm:space-y-4">
            <Badge variant="accent" class="reveal-item"
              >Гарантия приватности</Badge
            >
            <h2 class="font-display text-3xl sm:text-4xl font-bold reveal-item">
              Приватность и безопасность
            </h2>
          </div>

          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <article
              v-for="item in privacyCards"
              :key="item.id"
              class="reveal-item glass-panel rounded-2xl p-5 sm:p-6"
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
            Часто задаваемые вопросы
          </h2>

          <div class="space-y-3">
            <article
              v-for="(item, index) in faq"
              :key="item.question"
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
                © {{ new Date().getFullYear() }} Mentala
              </p>
              <a
                href="mailto:hello@mentala.app"
                class="hover:text-white/95 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent rounded"
                aria-label="Написать на hello@mentala.app"
              >
                hello@mentala.app
              </a>
            </div>

            <div
              class="flex flex-wrap items-center justify-center gap-1 lg:gap-3 text-sm"
            >
              <a
                class="rounded-lg px-3 py-2 hover:bg-white/10"
                href="https://my.mentala.app/legal/privacy-policy.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                Политика конфиденциальности
              </a>
              <a
                class="rounded-lg px-3 py-2 hover:bg-white/10"
                href="https://my.mentala.app/legal/terms-of-service.html"
                target="_blank"
                rel="noopener noreferrer"
              >
                Условия использования
              </a>
            </div>
          </div>
        </div>
      </footer>
    </main>

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
          aria-label="Закрыть"
          @click="closeWaitlist"
        />

        <section
          class="relative w-full max-w-xl glass-panel rounded-3xl p-6 sm:p-7 border-white/30"
        >
          <button
            class="absolute right-4 top-4 rounded-lg px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white"
            type="button"
            aria-label="Закрыть"
            @click="closeWaitlist"
          >
            ✕
          </button>

          <h3 class="font-display text-2xl font-bold mb-2">
            Ранний доступ к Mentala
          </h3>
          <p class="text-sm text-white/72 mb-6">
            Оставьте контакт — сообщим о запуске и пришлём доступ.
          </p>

          <form class="space-y-4" @submit.prevent="submitLead">
            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-name">Имя</label>
              <Input
                id="lead-name"
                v-model="leadForm.name"
                placeholder="Ваше имя"
                autocomplete="name"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-email"
                >Email</label
              >
              <Input
                id="lead-email"
                v-model="leadForm.email"
                type="email"
                placeholder="example@mail.ru"
                autocomplete="email"
                required
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs text-white/70" for="lead-goal">
                Цели (можно несколько)
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
                  aria-label="Выбор целей"
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

            <Button type="submit" class="w-full" :disabled="submittingLead">
              {{ submittingLead ? 'Отправляем...' : 'Получить ранний доступ' }}
            </Button>

            <p
              v-if="submitStatus === 'duplicate'"
              class="text-sm text-white/75"
            >
              Этот email уже в списке. Мы напишем при запуске.
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
          aria-label="Закрыть"
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
            Спасибо, вы в списке раннего доступа.
          </p>
          <Button class="w-full" @click="successModalOpen = false">
            Отлично
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
import { Badge } from '../components/ui/shadcn/badge';
import { Button } from '../components/ui/shadcn/button';
import { Input } from '../components/ui/shadcn/input';
import { useLandingConfig } from '../composables/useLandingConfig';
import { useLandingAnalytics } from '../composables/useLandingAnalytics';

type FeatureStep = {
  key: string;
  title: string;
  description: string;
  chips: string[];
  image: string;
};

type ScenarioCard = {
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
  question: string;
  answer: string;
};

type PrivacyCard = {
  id: string;
  icon: string;
  title: string;
  text: string;
};

const runtimeConfig = useRuntimeConfig();
const route = useRoute();
const reducedMotion = usePreferredReducedMotion();

const { data: landingConfig } = await useLandingConfig();
const { reachGoal, trackScrollDepth } = useLandingAnalytics();

const billingPeriod = ref<'month' | 'year'>('month');
const waitlistOpen = ref(false);
/** Маленькая модалка «Успех» после отправки лида */
const successModalOpen = ref(false);
const submittingLead = ref(false);
const submitStatus = ref<'idle' | 'created' | 'duplicate' | 'error'>('idle');
const submitErrorText = ref('');
const activeFeatureIndex = ref(0);
const faqOpenIndex = ref<number | null>(0);

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

const selectedGoalsText = computed(() => {
  if (!leadForm.goalKeys.length) {
    return 'Выберите цели (необязательно)';
  }

  const selected = goalOptions
    .filter((option) => leadForm.goalKeys.includes(option.value))
    .map((option) => option.label);

  return selected.length
    ? selected.join(', ')
    : 'Выберите цели (необязательно)';
});

onClickOutside(goalDropdownRef, () => {
  goalDropdownOpen.value = false;
});

const featureSteps: FeatureStep[] = [
  {
    key: 'chat',
    title: 'ИИ-ассистент',
    description:
      'Разбирает состояние в диалоге и предлагает короткие практики, которые можно сделать сразу.',
    chips: ['Диалог', 'Разбор мыслей', 'Всегда рядом'],
    image: '/landing/features/chat.webp',
  },
  {
    key: 'therapy',
    title: 'Темы терапии',
    description:
      'Тревога, стресс, отношения, самооценка и другие темы, выбираете то, что актуально, и начинаете разговор без лишних шагов.',
    chips: ['Тревога', 'Стресс', 'Отношения', 'и другие'],
    image: '/landing/features/therapy.webp',
  },
  {
    key: 'habits',
    title: 'Привычки',
    description:
      'Выбирайте готовые привычки или создавайте свои. Настраивайте напоминания под себя и закрепляйте полезные действия шаг за шагом.',
    chips: ['Напоминания', 'Свой ритм', 'Любые привычки'],
    image: '/landing/features/habits.webp',
  },
  {
    key: 'meditations',
    title: 'Медитации',
    description:
      'Подборки медитаций и звуков для сна, восстановления и концентрации в течение дня.',
    chips: ['Сон', 'Фокус', 'Восстановление'],
    image: '/landing/features/meditations.webp',
  },
  {
    key: 'breathing',
    title: 'Дыхательные практики',
    description:
      'Короткие дыхательные протоколы с понятным ритмом помогают быстро снизить напряжение и вернуть устойчивость.',
    chips: ['4-4-4-4', '4-7-8', '4-6', 'и другие'],
    image: '/landing/features/breathing.webp',
  },
];

const scenarios: ScenarioCard[] = [
  {
    title: 'Мне тревожно прямо сейчас',
    text: 'Открываете чат или SOS-практику, чтобы быстро вернуть ощущение контроля и выдохнуть.',
    emoji: '😮‍💨',
  },
  {
    title: 'Хочу быстрее уснуть',
    text: 'Включаете медитации и дыхательные техники, чтобы расслабиться и уснуть быстрее.',
    emoji: '🌙',
  },
  {
    title: 'Хочу пить больше воды',
    text: 'Выбирайте готовую тему, настраивайте напоминания и двигайтесь к цели в своём темпе.',
    emoji: '💧',
  },
  {
    title: 'Чувствую выгорание',
    text: 'Получайте ежедневную поддержку и восстанавливающие практики.',
    emoji: '🔥',
  },
  {
    title: 'Нужна дыхательная пауза',
    text: 'Запускайте дыхательный протокол на 1–3 минуты, чтобы сбросить напряжение и перезагрузиться.',
    emoji: '🫁',
  },
];

const howItWorks = [
  {
    step: '01',
    title: 'Выбираете тему или привычку',
    text: 'Начинаете с того, что актуально прямо сейчас: тревога, сон, привычка, стресс.',
  },
  {
    step: '02',
    title: 'Получаете поддержку и практику',
    text: 'ИИ-чат, практики, медитации и дыхание работают вместе, чтобы быстро вернуть Вам равновесие.',
  },
  {
    step: '03',
    title: 'Делаете это привычкой',
    text: 'Повторяете практики и настраиваете напоминания для поддержки в течение всего дня.',
  },
];

// Сравнение «по-другому»: Mentala и очная консультация (без противопоставления «лучше/хуже»).
// tooltip опционален: иконка «?» и v-tooltip (floating-vue) только у пунктов с tooltip.
type ComparisonPoint = { text: string; tooltip?: string };

const comparisonMentalaPoints: ComparisonPoint[] = [
  {
    text: 'Доступность в моменте',
    tooltip:
      'В отличие от сессий с психологом, к которым нужно готовиться и записываться заранее, ассистент всегда в вашем кармане. Помощь приходит именно тогда, когда она вам нужна: ночью, в дороге или перед важной встречей.',
  },
  {
    text: 'Экономия времени и ресурсов',
    tooltip:
      'Курс годовой поддержки в Mentala стоит дешевле, чем одна консультация у квалифицированного специалиста. Вы получаете ежедневную опору без необходимости тратить время на дорогу и поиск «своего» терапевта.',
  },
  {
    text: 'Анонимность и отсутствие суждений',
    tooltip:
      'Многим сложно начать терапию из-за страха осуждения или неловкости. В Mentala вы можете быть максимально честны: ИИ не оценивает, не критикует и гарантирует конфиденциальность ваших мыслей.',
  },
  {
    text: 'Комплексный подход в одном месте',
    tooltip:
      'Вам не нужно искать разные приложения для ИИ-чата, медитаций, дыхательных практик, привычек. Всё собрано в единую систему, которая адаптируется под ваши потребности.',
  },
];

// Без тултипов — иконка «?» не показывается.
const comparisonConsultationPoints: ComparisonPoint[] = [
  { text: 'Глубокая работа с причинами и динамикой.' },
  { text: 'Диагностика и лечение в медицинских случаях.' },
  { text: 'Подходит при тяжёлых состояниях и кризисах.' },
  { text: 'Индивидуальный план от специалиста.' },
];

// Контент секции приватности в коротком формате, чтобы блок оставался ёмким и читаемым.
const privacyCards: PrivacyCard[] = [
  {
    id: 'private-dialogs',
    icon: '🔐',
    title: 'Личное остаётся личным',
    text: 'Ваш диалог с ИИ-ассистентом конфиденциален: данные не привязываются к публичному профилю и не используются для рекламы.',
  },
  {
    id: 'data-protection',
    icon: '🛡️',
    title: 'Данные под защитой',
    text: 'Передаем данные по защищенному соединению. Доступ к информации строго ограничен.',
  },
];

const pricingPlans: PricingPlan[] = [
  {
    id: 'basic',
    title: 'Basic',
    subtitle: 'Старт без оплаты',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      'SOS-техники для быстрой стабилизации',
      'Базовые дыхательные практики',
      'Стандартные напоминания',
      'Пробный период: 7 дней Premium для новых пользователей',
    ],
  },
  {
    id: 'pro',
    title: 'PRO',
    subtitle: 'Для регулярной поддержки',
    monthlyPrice: 349,
    yearlyPrice: Math.round(349 * 12 * 0.8),
    features: [
      'Все из Basic',
      'ИИ-сессии для регулярной поддержки',
      'До 100 минут ИИ-сессий в неделю',
      'Полная библиотека медитаций',
      'Доступ ко всем дыхательным практикам',
      'ИИ-напоминания с изображениями',
    ],
  },
  {
    id: 'premium',
    title: 'Premium',
    subtitle: 'Максимальная персонализация',
    monthlyPrice: 649,
    yearlyPrice: Math.round(649 * 12 * 0.8),
    features: [
      'Все из PRO',
      'Безлимитные ИИ-сессии',
      'Персональный стиль ИИ-напоминаний',
      'Создание и управление своими практиками',
      'Создание своих привычек и личной терапии',
      'Приоритетная поддержка',
    ],
  },
];

const faq: FaqItem[] = [
  {
    question: 'Может ли Mentala заменить психолога или психотерапевта?',
    answer:
      'Нет. Mentala, это приложение для самопомощи и психологической поддержки, но оно не заменяет врача или психотерапевта. Mentala не ставит диагнозы и не назначает лечение. Если состояние ухудшается или нужна помощь специалиста, обратитесь к квалифицированному врачу или психотерапевту.',
  },
  {
    question: 'Как работает приватность?',
    answer:
      'Ваша безопасность для нас в приоритете. Все данные анонимны и передаются по защищенным каналам. Мы не привязываем историю общения с ИИ к Вашей личности и не передаем ее третьим лицам.',
  },
  {
    question: 'Нужна ли подписка сразу?',
    answer:
      'Нет, Вы можете начать с бесплатного тарифа Basic. Для новых пользователей мы также предоставляем 7 дней пробного периода Premium-доступа, чтобы Вы могли оценить все возможности приложения перед принятием решения',
  },
  {
    question: 'Как ИИ-ассистент подбирает ответы и практики?',
    answer:
      'Ассистент опирается на Ваш запрос и контекст диалога. Он предлагает практики, которые можно выполнить сразу: дыхательные техники, медитации или шаги по привычкам. Вы сами выбираете, что Вам подходит, и всегда можете уточнить запрос, если нужна другая форма поддержки',
  },
];

const goalOptions = [
  { value: 'reduce_anxiety', label: 'Снизить тревожность' },
  { value: 'sleep_better', label: 'Улучшить сон' },
  { value: 'reduce_stress', label: 'Снизить стресс и выгорание' },
  { value: 'quit_smoking', label: 'Бросить курить' },
  { value: 'reduce_alcohol', label: 'Сократить алкоголь' },
  { value: 'reduce_caffeine', label: 'Сократить кофеин' },
  { value: 'build_habits', label: 'Развить полезные привычки' },
  { value: 'try_ai_support', label: 'Попробовать ИИ-поддержку' },
  { value: 'other', label: 'Другое' },
];

const swiperModules = [Autoplay, Pagination, A11y];

const isReleased = computed(() => landingConfig.value?.isReleased ?? false);
const ctaUrl = computed(
  () => landingConfig.value?.ctaUrl || runtimeConfig.public.appAuthUrl
);
const isReducedMotion = computed(() => reducedMotion.value === 'reduce');

const primaryCtaText = computed(() =>
  isReleased.value ? 'Войти и начать' : 'Получить ранний доступ'
);

const activeFeature = computed<FeatureStep>(
  () => featureSteps[activeFeatureIndex.value] ?? featureSteps[0]!
);

function getYearlySavings(plan: PricingPlan): number {
  // Экономия считается как разница между оплатой 12 месяцев и ценой за год.
  // Возвращаем 0, если экономии нет (например, бесплатный тариф).
  const savings = plan.monthlyPrice * 12 - plan.yearlyPrice;
  return savings > 0 ? savings : 0;
}

const siteUrl = computed(() =>
  String(runtimeConfig.public.landingSiteUrl || 'https://mentala.app').replace(
    /\/$/,
    ''
  )
);

const canonicalUrl = computed(() => `${siteUrl.value}/`);
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
  const normalizedIndex = Math.max(0, Math.min(featureSteps.length - 1, index));
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
      error?.data?.message || error?.message || 'Не удалось отправить форму.';
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
  title: 'Mentala — психологическая поддержка 24/7',
  description:
    'ИИ‑чат поддержки, дыхательные практики, медитации и привычки — в одном приложении. Начните бесплатно (Basic) или попробуйте Premium на 7 дней.',
  robots:
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogTitle: 'Mentala — психологическая поддержка 24/7',
  ogDescription:
    'ИИ‑чат, медитации, дыхание, SOS‑практики и персональные напоминания. Начните бесплатно или попробуйте Premium на 7 дней.',
  ogType: 'website',
  ogUrl: canonicalUrl.value,
  ogSiteName: 'Mentala',
  ogLocale: 'ru_RU',
  ogImage: ogImageUrl.value,
  ogImageAlt: 'Mentala — психологическая поддержка 24/7',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Mentala — психологическая поддержка 24/7',
  twitterDescription:
    'ИИ‑чат, медитации, дыхательные практики и привычки. Начните бесплатно или попробуйте Premium на 7 дней.',
  twitterImage: ogImageUrl.value,
});

useHead({
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
  script: [
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Mentala',
        url: canonicalUrl.value,
        logo: new URL('/logo.svg', canonicalUrl.value).href,
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: 'hello@mentala.app',
            availableLanguage: ['ru'],
          },
        ],
      }),
    },
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Mentala',
        url: canonicalUrl.value,
        inLanguage: 'ru',
      }),
    },
    {
      type: 'application/ld+json',
      textContent: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Mentala — психологическая поддержка 24/7',
        url: canonicalUrl.value,
        inLanguage: 'ru',
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
        inLanguage: 'ru',
        mainEntity: faq.map((item) => ({
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
});
</script>
