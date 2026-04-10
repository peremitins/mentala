# Гайд по релизам Mentala

Пошаговая инструкция для сборки и публикации релизов. Для деталей стратегии — см. `release-strategy-and-compatibility.md`.

---

## Быстрая шпаргалка

| Платформа | Что деплоится | Как |
|-----------|--------------|-----|
| **Web** | Автоматически при пуше в `main` | GitHub Actions → Docker → prod сервер |
| **Android** | Ручная сборка + Google Play Console | `pnpm build:mobile:android:prod` → Upload AAB |
| **iOS** | Ручная сборка + Xcode → App Store Connect | `pnpm cap:sync:prod` → Xcode Archive → TestFlight |

---

## 1. Web-деплой

Автоматический. Пуш в `main` запускает GitHub Actions:

```
main push → Docker build → миграции БД → docker compose up
```

Никаких ручных действий не требуется.

---

## 2. Android-релиз

### 2.1. Поднять versionCode и versionName

Файл: `android/app/build.gradle`

```groovy
defaultConfig {
    versionCode 2        // ← увеличить (монотонно растущий integer)
    versionName "1.1.0"  // ← маркетинговая версия
}
```

> versionCode — это `X-App-Build`, по которому сервер проверяет минимальную версию. Он должен **только расти**.

### 2.2. Собрать production bundle

```bash
pnpm build:mobile:android:prod
```

Эта команда:
1. Собирает Nuxt production bundle (`.output/public`)
2. Синхронизирует с Capacitor (`cap sync`)
3. Проверяет prod-safe конфиг (нет dev URL, правильные API endpoints)
4. Собирает оптимизированный Android App Bundle (`.aab`) с включённым R8
5. Проверяет, что `mapping.txt` встроен внутрь `aab`
6. Готовит `native-debug-symbols.zip` для Google Play Console
7. Складывает полный набор release-артефактов в отдельный каталог

Результат: `android/app/build/outputs/bundle/release/app-release.aab`

Дополнительные артефакты для Play Console:

- `android/app/build/outputs/play-console/release/app-release.aab`
- `android/app/build/outputs/play-console/release/mapping.txt`
- `android/app/build/outputs/play-console/release/native-debug-symbols.zip`
- `android/app/build/outputs/play-console/release/artifacts-info.txt`

### 2.3. Подписать и загрузить

```bash
# Если signing настроен в build.gradle — AAB уже подписан
# Загрузить в Google Play Console:
# Google Play Console → Production → Create new release → Upload AAB
```

### 2.4. Тестирование перед публикацией

1. Загрузить AAB в **Internal Testing** или **Closed Testing** трек
2. Установить на устройство через Google Play
3. Проверить: приложение запускается, API работает, платежи проходят

### 2.5. Опубликовать

Google Play Console → Production → Submit for review

---

## 3. iOS-релиз

### 3.1. Поднять build number и version

Файл: `ios/App/App.xcodeproj/project.pbxproj` (или через Xcode)

**Через Xcode:**
1. Открыть `ios/App/App.xcodeproj`
2. Target → General → Version: `1.1.0` (маркетинговая)
3. Target → General → Build: `16` (увеличить, монотонно растущий integer)

> Build number — это `X-App-Build`. Он должен **только расти**.

### 3.2. Синхронизировать web bundle

```bash
pnpm cap:sync:prod
```

Эта команда:
1. Собирает Nuxt production bundle
2. Синхронизирует с iOS проектом
3. Синхронизирует Google OAuth конфиг в Info.plist
4. Проверяет prod-safe конфиг

### 3.3. Собрать и загрузить через Xcode

1. Открыть `ios/App/App.xcodeproj` в Xcode
2. Выбрать **Any iOS Device (arm64)** как target
3. **Product → Archive**
4. После архивации: **Distribute App → App Store Connect**
5. Дождаться обработки в App Store Connect (~15 мин)

### 3.4. Тестирование через TestFlight

1. App Store Connect → TestFlight → выбрать build
2. Добавить тестировщиков или использовать Internal Testing
3. Установить через TestFlight, проверить работу

### 3.5. Опубликовать

App Store Connect → App Store → Submit for Review

---

## 4. Управление минимальной версией (force update)

### Как работает

Сервер хранит `minimumSupportedBuild` для iOS и Android отдельно. Если build пользователя ниже — приложение показывает blocker с кнопкой "Обновить".

### Когда поднимать

- **НЕ на каждый релиз**. Только когда старые build реально нужно заблокировать:
  - Breaking API change, несовместимый со старыми клиентами
  - Критический баг безопасности в старом build
  - Серьёзный баг, который невозможно исправить server-side

### Как поднять

**Вариант 1: Admin API** (рекомендуемый)

```bash
# Посмотреть текущие значения
curl -H "Cookie: ..." https://my.mentala.app/api/admin/app-version-policy

# Поднять для Android
curl -X PATCH https://my.mentala.app/api/admin/app-version-policy \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"platform": "android", "minimumSupportedBuild": 2}'

# Поднять для iOS
curl -X PATCH https://my.mentala.app/api/admin/app-version-policy \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{"platform": "ios", "minimumSupportedBuild": 16}'
```

**Вариант 2: Прямой SQL** (аварийный)

```sql
UPDATE app_version_policy SET minimum_supported_build = 2 WHERE platform = 'android';
UPDATE app_version_policy SET minimum_supported_build = 16 WHERE platform = 'ios';
```

### Откат при ошибке

Если заблокировали пользователей по ошибке — понизить значение тем же способом. Кэш сервера обновится в течение 60 секунд. Клиенты получат `ok` при следующем foreground resume.

---

## 5. Порядок выката (чеклист)

```
□ 1. Сервер: запушить изменения в main (web деплоится автоматически)
□ 2. Проверить: web работает, API не сломан для текущих mobile build
□ 3. Mobile: поднять versionCode / build number
□ 4. Android: pnpm build:mobile:android:prod → загрузить AAB в Play Console
□ 5. iOS: pnpm cap:sync:prod → Xcode Archive → App Store Connect
□ 6. Тест: Internal Testing (Android) + TestFlight (iOS)
□ 7. Публикация в сторы
□ 8. (Опционально) Поднять minimumSupportedBuild после подтверждения доступности
```

> Сервер деплоится **первым**. Mobile — **после**. Так обеспечивается обратная совместимость.

---

## 6. Версионные заголовки

Каждый запрос клиента автоматически содержит:

| Заголовок | Пример | Откуда берётся |
|-----------|--------|---------------|
| `X-Platform` | `ios`, `android`, `web` | `Capacitor.getPlatform()` |
| `X-App-Version` | `1.1.0` | `App.getInfo().version` (mobile) или `''` (web) |
| `X-App-Build` | `16` | `App.getInfo().build` (mobile) или `0` (web) |

Эти заголовки добавляются автоматически в `app/plugins/api.ts`. Никаких ручных действий не требуется.

---

## 7. Миграции БД при breaking changes

Если меняется API-контракт или схема БД — строго по порядку:

```
1. expand      — добавить новое поле/таблицу (старый код продолжает работать)
2. dual support — сервер поддерживает оба формата
3. mobile rollout — выпустить mobile build с новой логикой
4. cleanup     — удалить старое только после блокировки старых build
```

> Нельзя удалять поля из API или менять типы данных, пока старые build ещё в поддержке.

---

## Troubleshooting

### Android: AAB не собирается

```bash
cd android && ./gradlew clean    # очистить кэш
pnpm build:mobile:android:prod   # пересобрать
```

### iOS: Archive fails

```bash
pnpm cap:sync:prod               # пересинхронизировать
# Xcode → Product → Clean Build Folder (Cmd+Shift+K)
# Xcode → Product → Archive
```

### Capacitor: dev URL в production сборке

```bash
node scripts/verify-capacitor-config.js   # проверить prod-safe
```

Если ошибка — `server.url` не удалён. Выполнить `pnpm cap:sync:prod` заново.

### Force update blocker показывается всем

Ошибочное повышение `minimumSupportedBuild`. Понизить через admin API или SQL (см. раздел 4).
