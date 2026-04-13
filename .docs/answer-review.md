Уважаемая команда App Review,

Я изучил замечания и внес необходимые изменения в приложение и документацию.

Guideline 4.8 - Design - Login Services
Мы добавили Sign in with Apple на экран входа.

Guidelines 5.1.1(i) и 5.1.2(i) - Legal - Privacy
Я обновил политику конфиденциальности и экран согласия перед первым использованием ИИ-чата.

В политике конфиденциальности теперь прямо указано:

- какие данные передаются
- кому они передаются
- для какой цели они используются

Перед первым использованием цифрового ассистента показывается обязательное модальное окно согласия. Если пользователь не подтверждает согласие, функция чата остается недоступной.

Guideline 2.5.4 - Performance - Software Requirements (Background Audio)
Фоновое воспроизведение используется только для медитаций, чтобы практика не прерывалась при блокировке экрана.

Как протестировать:

- откройте вкладку «Практики»
- запустите любую медитацию
- установите таймер на любое значение больше 0 минут
- заблокируйте экран

В этом случае аудио продолжит воспроизведение в фоне до окончания таймера.
Если таймер установлен на 0 минут, воспроизведение прекращается сразу после ухода приложения в фон.

Guideline 2.1(b) - Information Needed

1. Кто использует платные функции?
   Платные функции предназначены для обычных пользователей приложения Mentala. Это индивидуальные пользователи, а не компании или корпоративные клиенты.

2. Где можно оформить подписку?
   Сейчас подписку можно оформить только через веб-версию сервиса.

   В текущей iOS-версии не показываются тарифы, цены, экран оплаты или ссылки на оплату. В приложении пользователь видит только информацию о текущем плане в настройках и текст о том, что изменить или оформить подписку можно на официальном сайте.

   Для российского рынка я планирую использовать Apple-approved StoreKit External Purchase Link, как только Apple позволит использовать его для моего приложения. Я пытаюсь получить и настроить этот entitlement с 3 марта, но сейчас заблокирован технической проблемой на стороне Apple. Страница запроса entitlement для России возвращает HTTP 500. По этому вопросу у меня уже открыт кейс в поддержке Apple #102835130992.

3. Какие функции доступны по подписке?
   Активная подписка открывает премиальные цифровые функции приложения, включая:

   - расширенный ИИ-чат
   - дополнительные медитации и аудиопрактики
   - ИИ-напоминания
   - премиальные инструменты самопомощи и функции, связанные с привычками
   - в более дорогих планах - дополнительные премиальные возможности, включая расширенную персонализацию и голосовые ИИ-функции

4. Какой платный контент доступен в приложении без In-App Purchase?
   В текущей iOS-версии внутри приложения нет встроенного платежного сценария, экрана оплаты или внешней ссылки на оплату.

   При этом пользователь, который уже оформил подписку в веб-версии, может войти в iOS-приложение под тем же аккаунтом и получить доступ к премиальным функциям своей подписки.

5. Требуется ли оплата для создания аккаунта?
   Нет. Аккаунт можно создать бесплатно. Оплата требуется только в случае, если пользователь позже решит оформить платную подписку в веб-версии сервиса.

Hello,

I reviewed the feedback and made the necessary changes to the app and documentation.

Guideline 4.8 - Design - Login Services
I added Sign in with Apple to the sign-in screen.

Guidelines 5.1.1(i) and 5.1.2(i) - Legal - Privacy
I updated the privacy policy and the consent screen shown before the first use of the AI chat.

The privacy policy now clearly states:

- what data is transferred
- to whom it is transferred
- for what purpose it is used

Before the first use of the digital assistant, the user is shown a mandatory consent modal. If the user does not confirm consent, the chat feature remains unavailable.

Guideline 2.5.4 - Performance - Software Requirements (Background Audio)
Background audio playback is used only for meditations, so the session is not interrupted when the screen is locked.

How to test:

- open the “Practices” tab
- start any meditation
- set the timer to any value greater than 0 minutes
- lock the screen

In this case, the audio will continue playing in the background until the timer ends.
If the timer is set to 0 minutes, playback stops immediately after the app goes into the background.

Guideline 2.1(b) - Information Needed

1. Who are the users that will use the paid features and services in the app?
   The paid features are intended for regular users of the Mentala app. These are individual consumers, not companies or enterprise customers.

2. Where can users purchase the features and services that can be accessed in the app?
   At the moment, subscriptions can only be purchased through the web version of the service.

   In the current iOS version, the app does not display subscription plans, pricing, a payment screen, or payment links. In the app, the user can only see information about the current plan in Settings and a text notice explaining that a subscription can be changed or purchased on the official website.

   For the Russian market, I plan to use the Apple-approved StoreKit External Purchase Link as soon as Apple enables it for my app. As soon as this is approved and becomes available, I will immediately implement the proper Apple-compliant flow in the app. At the moment, this does not depend on me, because I have been trying to obtain and configure this entitlement since March 3, 2026, but I am still blocked by a technical issue on Apple’s side. The entitlement request page for Russia returns HTTP 500. I already have an open Apple Support case about this issue, case #102835130992.

3. What specific types of previously purchased features and services can a user access in the app?
   The app currently includes two paid subscription tiers: Pro and Premium.

   Pro includes:

   - extended AI chat
   - additional meditations and audio practices
   - AI reminders

   Premium includes everything in Pro, plus additional premium capabilities such as:

   - expanded personalization
   - voice conversations with AI

4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?
   In the current iOS version, there is no built-in payment flow, payment screen, or external payment link inside the app.

   However, a user who has already purchased a subscription through the web version can sign in to the iOS app with the same account and access the premium features included in that subscription.

5. How do users obtain an account? Do users have to pay a fee to create an account?
   No. An account can be created for free. Payment is required only if the user later chooses to purchase a paid subscription through the web version of the service.
