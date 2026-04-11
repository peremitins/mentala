# Mentala — Frontend ТЗ

## Стек

Nuxt 4, TypeScript, Pinia, Tailwind CSS, Radix Vue / shadcn-vue, unplugin-icons (Lucide), vue-i18n, ofetch, @vueuse/core, Capacitor, Vitest, Sentry

## Структура (Nuxt 4)

```
app/
├─ components/     # shadcn + кастомные
├─ composables/    # use* (запросы, helpers)
├─ layouts/        # default, blank, auth
├─ middleware/     # auth, i18n-redirect
├─ pages/          # маршруты
├─ plugins/        # i18n, sentry, api
├─ stores/         # Pinia
└─ utils/
shared/dto/        # Zod-схемы (общие с бэком)
```

## UI правила

- Glassmorphism: backdrop-blur, bg-white/10, мягкие тени, радиусы 16-24px
- Цвета — только CSS-переменные из tailwind.css, `dark:` классы запрещены
- Компоненты: shadcn-vue как база
- Иконки: Lucide (основные), Tabler/Phosphor через Iconify

## Данные и запросы

- HTTP только через `useAPI()` composable или `nuxtApp.$api` напрямую
- Состояние: Pinia для глобального, composables для локального
- DTO (Zod): `shared/dto/*`, ответ парсится через Zod
- Для billing UI `subscription` store может получать optional promo/referral блоки без поломки старых клиентов

## Billing UI

- `/subscription` — единая точка для тарифов, промокодов, referral-кода и активных бонусов
- На `/subscription` блоки промокода и активных бонусов должны идти перед карточками тарифов, но после блоков текущего billing-состояния, запланированного/проблемного списания и способа оплаты
- `/settings` — компактный пользовательский блок `Пригласи друга` с личным кодом, copy/share и переходом на `/settings/referral`
- `/settings/referral` — детальный экран referral со счётчиками, pending rewards, бонусным счётом и пояснением механики
- `/admin/promo-codes` — два tab'а: `Промокоды` и `Referral`
- `FeaturePaywallModal` не содержит полноценный billing-flow, только CTA на `/subscription`, включая `Есть промокод?`
- Для `apple_iap` пользователь не должен видеть internal promo/referral controls
- `/auth/login` и `/auth/register` должны поддерживать optional input для promo/referral code как дополнительную точку входа
- pre-auth ввод кода не должен делать финальный redeem: код только сохраняется как pending и после авторизации обрабатывается тем же backend-flow, что и на `/subscription`
- UX на auth/register должен объяснять тот же самый смысл reward, что и на `/subscription`, без отдельной логики “специального auth-кода”
- Пользовательский referral UI должен уметь показывать:
  - доступный `billingCredit`
  - pending referral credits
  - дату/правило подтверждения reward после первой оплаты приглашённого
- Admin UI во вкладке `Referral` должен использовать только актуальные настройки consumer-модели:
  - `inviteePercent`
  - `referrerPercent`
  - `inviteeRewardValidityDays`
  - `creditHoldDays`
- Для `creditHoldDays` нужен env-aware дефолт:
  - development / QA: `1`
  - production: `14`
- Admin UI для промокодов должен уметь и генерировать код автоматически, и принимать ручной код от администратора с live-проверкой уникальности
- Отдельный блогерский / affiliate UI в эту итерацию не входит

## Кроссплатформенность

- Web: Chrome, Firefox, Safari, Edge (последние версии)
- iOS 15+, Android 8+
- Проверка API через `typeof` или `isDocumentAvailable()`
- Capacitor plugins для нативных функций, VueUse для кросс-браузерных
- Async/await везде, не .then()/.catch()
- Для safe area и системных баров нельзя полагаться на фиксированные отступы или только на `StatusBar.overlaysWebView=false`: при target SDK Android 35+ / 36 edge-to-edge может быть принудительным
- На iOS можно опираться на `env(safe-area-inset-*)`, но на Android, особенно на планшетах и некоторых WebView, нужен fallback через native `WindowInsets` bridge с прокидкой значений в CSS-переменные

## Mobile build notes

- `@capgo/capacitor-social-login` для текущего стека должен оставаться на ветке `7.x`, потому что `8.x` требует `@capacitor/core >= 8`
- Для Android используется локальный pnpm patch `patches/@capgo__capacitor-social-login@7.20.0.patch`, который устраняет конфликт `androidx.browser` vs `androidbrowserhelper`
- Для iOS тот же social-login дополнительно санитизируется локальным скриптом `scripts/strip-ios-social-login-ads-sdk.js`: Mentala использует только Google Sign-In, поэтому перед `cap update` из podspec принудительно вырезаются `FBSDKCoreKit` / `FBSDKLoginKit`, чтобы Facebook SDK и `FBAEMKit` не попадали в release-бинарь и не триггерили App Store Review как advertising SDK
- Release-сборка Android включает `ndk.debugSymbolLevel = 'SYMBOL_TABLE'`, чтобы Google Play Console получал native symbols для читаемых native crash/ANR без включения R8/ProGuard
- Для финального production AAB R8 и `shrinkResources` включаются только явным флагом `MENTALA_ANDROID_ENABLE_MINIFY=true` или командами `pnpm android:bundle:release:optimized` / `pnpm build:mobile:android:prod`; по умолчанию `release` остаётся без minify, потому что Play track сам по себе не меняет Gradle build type
- `pnpm build:mobile:android:prod` должен завершаться только после подготовки полного набора артефактов для Play Console в `android/app/build/outputs/play-console/release`: `app-release.aab`, `mapping.txt`, `native-debug-symbols.zip`
- Если AGP не формирует `native-debug-symbols.zip` автоматически, build создаёт fallback-архив из merged release `.so`, чтобы артефакт не терялся между сборкой и загрузкой в Play Console
- В `android/app/proguard-rules.pro` зафиксированы `-dontwarn com.facebook.**` для optional Facebook-классов из `@capgo/capacitor-social-login`; без этого R8 роняет optimized release даже если в приложении используется только Google login
- `scripts/verify-capacitor-config.js` в release-режиме проверяет не только runtime config, но и отсутствие `FBSDKCoreKit`, `FBSDKLoginKit`, `FBAEMKit` в `ios/App/Podfile.lock`
- Перед обновлением social-login до `8.x` сначала нужно мигрировать весь Capacitor-стек проекта на `8.x`, иначе Android build снова сломается на разрешении зависимостей

## Качество

- LCP < 2.5s, TTI < 3s
- ESLint + Prettier, Husky + lint-staged
- Vitest для критичных путей
- TS no-any, Zod-валидация форм (vee-validate)
