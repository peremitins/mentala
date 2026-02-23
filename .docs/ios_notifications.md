**ТЗ: отображение изображений в push-уведомлениях на iPhone (iOS Rich Notifications)**

1. Цель  
   Сделать стабильное отображение изображений в push-уведомлениях на iOS (iPhone/iPad) без регрессий Android и текущей навигации по пушам.

2. Область работ  
   Бэкенд отправки push (FCM), iOS-проект (Capacitor/Xcode target), проверка медиа-URL, логирование и тестовый сценарий QA.

3. Функциональные требования (обязательные)
4. iOS: уведомления с валидным `imageUrl` показывают изображение в расширенном виде уведомления (expanded view). В баннере изображение может не отображаться, это нормальное поведение iOS.
5. iOS: при невалидном или недоступном изображении уведомление приходит как текстовое, без падений приложения и без падений Notification Service Extension.
6. Android: поведение не меняется, изображение продолжает отображаться как сейчас.
7. Навигация по нажатию на уведомление остается рабочей (deepLink).
8. Логи: в консоли iOS (Xcode) и в серверных логах есть понятная причина, почему изображение не прикрепилось (таймаут, 404, неверный `Content-Type`, редирект, запрет HTTPS, неподдерживаемый формат).

9. Технические требования (обязательные)
10. iOS: добавить в iOS проект `Notification Service Extension` target (например, `MentalaNotificationService`).
11. iOS: extension должен обрабатывать rich push до показа уведомления и прикреплять изображение как `UNNotificationAttachment`.
12. iOS: для rich push обязательно передавать флаг `mutable-content = 1` в `aps`.
13. iOS: для FCM обязательно передавать URL изображения в iOS-специфичное поле `apns.fcm_options.image` (FCM HTTP v1) / `apns.fcmOptions.imageUrl` (Firebase Admin SDK).
14. Сохранить дублирование URL в `data.imageUrl` как fallback-канал (для диагностики и ручного скачивания в extension).
15. iOS: добавить логирование результата обработки изображения на стороне extension (успех, таймаут, ошибка скачивания, неподдерживаемый тип, неверный `Content-Type`).
16. Backend: добавить серверный лог отправки: `platform`, `slotId`, `imageUrl`, `hasMutableContent`, `hasApnsImageField`, `firebaseProjectId`.
17. Backend: если `imageUrl` отсутствует или не прошел валидацию, отправлять обычное текстовое уведомление (без rich-полей).
18. Backend (антиконфликтное правило): если размер изображения `>1MB`, отправлять только текстовый push без rich-полей и без `data.imageUrl`, чтобы extension не прикрепил тяжелую картинку через fallback.
19. QA: тестировать на реальном iPhone (не только симулятор). Убедиться, что изображение видно при long-press / pull-down на уведомлении.

20. Контракт payload (норматив)
21. Общие требования:

    - URL изображения должен быть абсолютным `https://...`.
    - URL должен быть публичным (без авторизации, без куки, без закрытых CDN-подписей, которые истекают раньше доставки).
    - Для iOS rich image требуется `mutable-content` и Notification Service Extension.

22. Firebase Admin SDK (Node) - нормативный пример (минимум полей для изображения):

    - `notification.imageUrl = <https-url>`
    - `android.notification.imageUrl = <https-url>`
    - `apns.payload.aps.mutableContent = true`
    - `apns.fcmOptions.imageUrl = <https-url>`
    - `data.imageUrl = <https-url>` (fallback)

23. FCM HTTP v1 - эквивалентные поля:

    - `notification.image = <https-url>` (кроссплатформенно, если используете)
    - `android.notification.image = <https-url>`
    - `apns.payload.aps["mutable-content"] = 1`
    - `apns.fcm_options.image = <https-url>`
    - `data.imageUrl = <https-url>` (fallback)

24. Примечание по совместимости:

    - На Android изображение часто отображается и без extension.
    - На iOS изображение не будет отображаться без extension даже при наличии `imageUrl`, поэтому extension обязателен.

25. Требования к медиа (обязательные)
26. Только публичный HTTPS URL без авторизации/куки.
27. Ответ сервера: `200 OK`, корректный `Content-Type` (`image/jpeg` или `image/png`).
28. Без редиректа на HTML-страницы.
29. Жесткий лимит веса файла: <= 1MB (ограничение FCM для notification image). Рекомендуемо 100-300KB для стабильности.
30. Рекомендуемый формат: JPEG/PNG; расширение в URL желательно (`.jpg`, `.png`).
31. Рекомендуемое разрешение: от 600px по короткой стороне; избегать экстремально больших изображений.

32. Реализация iOS Notification Service Extension (обязательный план)
33. Шаги в Xcode:

    1. Открыть iOS проект в Xcode через workspace (если используются CocoaPods).

       - Предпочтительно: открыть файл `*.xcworkspace` в папке `ios/`.
       - Если workspace не найден, значит Pods еще не установлены. Тогда:
         a) открыть `ios/App/App.xcodeproj`,
         b) в папке `ios/App` выполнить `pod install`,
         c) закрыть Xcode и открыть созданный `App.xcworkspace`.
       - Признак, что открыт workspace: слева в Project Navigator виден раздел `Pods`.

    2. File -> New -> Target -> Notification Service Extension.
    3. Название: `MentalaNotificationService`.
    4. После создания проверить:
       - В Project -> Targets появился новый target extension.
       - В Signing & Capabilities у extension выбран тот же Team, что и у основного приложения.
       - Сборка проходит без ошибок (Product -> Build).

34. Настройка зависимостей (если используется Firebase Messaging helper):

    - В `ios/App/Podfile` добавить FirebaseMessaging для extension target.
    - Выполнить `pod install`.

35. Логика обработки:
    Вариант A (предпочтительный): использовать `FirebaseMessaging` helper внутри extension (`Messaging.serviceExtension()`), так как он нативно обрабатывает FCM iOS-поля, включая `apns.fcm_options.image`.
    Вариант B (fallback): если helper не прикрепил изображение, скачать по `data.imageUrl` вручную, создать `UNNotificationAttachment`, прикрепить.

36. Таймауты:

    - В `serviceExtensionTimeWillExpire()` всегда возвращать `bestAttemptContent`, чтобы пуш не терялся.
    - Скачивание делать через `URLSession` и завершать быстро. Если не успели, вернуть текст.

37. Логирование extension:

    - Логировать: найден ли URL, источник (обработан Firebase Messaging helper или fallback data.imageUrl), размер файла (если доступно), итог (успех/ошибка/таймаут).
    - Для продакшена оставить логи на уровне `info/warn`, без персональных данных.

38. Нефункциональные требования
39. Поддержка iOS 13+.
40. Время обработки в extension не должно приводить к пропуску уведомления.
41. Ошибки rich media не должны ломать доставку текстового уведомления.
42. Без хранения секретов в extension.

43. Критерии приемки
44. На iOS при валидном `https`-изображении уведомление приходит с картинкой в expanded view.
45. При битом URL уведомление приходит без картинки, без crash.
46. При `Content-Type: text/html` уведомление приходит без картинки, без crash.
47. На Android изображение продолжает отображаться.
48. В логах есть причина, почему attachment не применился (если не применился).
49. Проверка на реальном iPhone (не только симулятор), минимум iOS 16/17.

50. План тестирования
51. Тест 1: JPEG ~100KB, прямой URL, ожидается успех.
52. Тест 2: PNG >1MB (например ~2MB), ожидается текстовый push без rich-полей и без `data.imageUrl`; картинка не отображается, без crash.
53. Тест 3: URL с 404, ожидается текст без картинки.
54. Тест 4: URL на HTML, ожидается текст без картинки.
55. Тест 5: проверка отображения в баннере и в expanded режиме.

56. Риски и меры
57. Риск: большие PNG дают таймаут.  
    Мера: сжать тяжелые ассеты, ввести лимит по весу в контент-пайплайне.
58. Риск: CDN/сервер отдает неверный `Content-Type`.  
    Мера: проверка заголовков на этапе QA и мониторинг 4xx/5xx по media URL.
59. Риск: extension не включен в сборку/подпись.  
    Мера: отдельный checklist по target membership, signing, provisioning.

60. Что можно не делать в MVP
61. Не делать сложную аналитику по CTR именно для rich image.
62. Не делать динамическую ресайз-обработку изображений на лету.
63. Не добавлять отдельный image CDN proxy, если текущий `media.mentala.app` стабилен.

64. Пошаговая инструкция, что нужно сделать в Mentala (чеклист)
65. Firebase Console (dev и prod отдельно):

    1. Project settings -> Cloud Messaging -> Apple app configuration.
    2. Для каждого iOS приложения (bundle id) загрузить APNs Authentication Key (`.p8`) минимум в нужный слот (Development для debug, Production для release). Для проектов с debug+release рекомендовано заполнить оба.
    3. Убедиться, что Key ID и Team ID совпадают с Apple Developer.

66. Apple Developer:

    1. Certificates, Identifiers & Profiles -> Keys.
    2. Должен существовать APNs key с включенной опцией Apple Push Notification service (APNs).
    3. Key ID и Team ID сохранить в секретном месте (в репозиторий не коммитить).

67. iOS (Xcode):

    1. В основном target включить Capabilities: Push Notifications; Background Modes -> Remote notifications.
    2. Добавить Notification Service Extension target `MentalaNotificationService`.
    3. Подписать extension тем же Team.
    4. (Если используете Firebase helper) Подключить FirebaseMessaging в Podfile для extension.

68. Backend (FCM):

    1. При наличии изображения всегда выставлять `aps.mutableContent = true (для Firebase Admin SDK) или "mutable-content": 1 (для raw HTTP v1 JSON)` и iOS поле `apns.fcmOptions.imageUrl` (Admin SDK) / `apns.fcm_options.image` (HTTP v1).
    2. Дублировать URL в `data.imageUrl` только если файл прошел валидацию и размер `<= 1MB`.
    3. Если файл `>1MB`, отправлять текстовый push без rich-полей и без `data.imageUrl`, чтобы исключить ручной fallback с большой картинкой.
    4. Логировать `hasMutableContent` и `hasApnsImageField`.

69. QA проверка:
    1. Отправить тестовое уведомление с маленьким JPEG (100-300KB) по прямому HTTPS URL.
    2. На iPhone открыть expanded view (long-press или pull-down) и убедиться, что картинка отображается.
    3. Прогнать негативные тесты (404, HTML, большой PNG) - уведомление должно приходить без падений.
