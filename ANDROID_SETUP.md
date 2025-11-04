# 🚀 Настройка Android для MentAI

## 📋 Установка Android Studio

### Шаг 1: Скачивание и установка

1. Скачайте Android Studio с официального сайта:

   - https://developer.android.com/studio

2. Установите Android Studio:

   - **macOS**: Откройте `.dmg` файл и перетащите Android Studio в папку Applications
   - **Windows**: Запустите `.exe` установщик и следуйте инструкциям
   - **Linux**: Распакуйте архив и запустите `bin/studio.sh`

3. При первом запуске:
   - Выберите "Standard" установку
   - Дождитесь загрузки Android SDK
   - Примите лицензионные соглашения

### Шаг 2: Установка Android SDK

1. Откройте Android Studio
2. Перейдите в **Settings/Preferences** → **Appearance & Behavior** → **System Settings** → **Android SDK**
3. Убедитесь, что установлены:

   - Android SDK Platform-Tools
   - Android SDK Build-Tools 34.0.0 или выше
   - Android SDK Command-line Tools
   - Android 14.0 (API level 34) или выше

4. Нажмите **Apply** и дождитесь установки

### Шаг 3: Настройка переменных окружения (опционально)

> ⚠️ **Это не обязательно**, если ты работаешь только через Android Studio!

#### Когда это нужно:

- Если используешь команды `adb` из терминала (`adb devices`, `adb logcat`)
- Если запускаешь эмулятор через командную строку
- Если используешь Gradle напрямую из терминала

#### Когда НЕ нужно:

- Если работаешь только через Android Studio (она уже знает, где SDK)
- Если запускаешь приложение через кнопку **Run** в Android Studio
- Если используешь Capacitor команды (`pnpm run cap:open:android`)

#### macOS / Linux:

Если нужно, добавьте в `~/.zshrc` или `~/.bashrc`:

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

Затем выполните:

```bash
source ~/.zshrc  # или source ~/.bashrc
```

#### Windows:

1. Откройте **System Properties** → **Environment Variables**
2. Создайте переменную `ANDROID_HOME` со значением:
   ```
   C:\Users\YourUsername\AppData\Local\Android\Sdk
   ```
3. Добавьте в `Path`:
   - `%ANDROID_HOME%\platform-tools`
   - `%ANDROID_HOME%\tools`
   - `%ANDROID_HOME%\tools\bin`

### Шаг 4: Проверка установки

Выполните в терминале:

```bash
adb version
```

Если команда работает — установка прошла успешно! ✅

---

## 📱 Инициализация Android проекта для MentAI

### Шаг 1: Сборка проекта

```bash
# Соберите Nuxt приложение
pnpm run generate

# Или для разработки (с hot reload)
pnpm run build
```

### Шаг 2: Добавление Android платформы

```bash
# Добавляем Android проект
pnpm run cap:add:android
```

Эта команда создаст папку `android/` с нативным Android проектом.

### Шаг 3: Синхронизация

```bash
# Синхронизируем веб-код с нативным проектом
pnpm run cap:sync
```

### Шаг 4: Открытие в Android Studio

```bash
# Открывает проект в Android Studio
pnpm run cap:open:android
```

Или вручную:

1. Откройте Android Studio
2. Выберите **File** → **Open**
3. Выберите папку `/Users/peremitin/Desktop/dev/mentai/frontend/android`

---

## 🧪 Тестирование на эмуляторе

### Создание эмулятора

1. В Android Studio: **Tools** → **Device Manager**
2. Нажмите **Create Device**
3. Выберите устройство (например, Pixel 5)
4. Выберите системный образ (рекомендуется API 34 или выше)
5. Нажмите **Finish**

### Запуск приложения

1. Запустите эмулятор из Device Manager
2. В Android Studio нажмите зеленую кнопку **Run** или `Shift + F10`
3. Или из терминала:
   ```bash
   cd android
   ./gradlew installDebug
   ```

## 🔧 Тестирование на реальном устройстве

### Вариант 1: Беспроводная отладка через QR-код (рекомендуется)

#### Активация режима разработчика

1. Откройте **Настройки** → **О телефоне**
2. Найдите **Номер сборки** (Build number)
3. Нажмите на **Номер сборки 7 раз подряд**
4. Появится сообщение "Вы стали разработчиком!" или "You are now a developer!"

#### Включение беспроводной отладки

1. Откройте **Настройки** → **Для разработчиков** (Developer options)
2. Найдите раздел **Беспроводная отладка** (Wireless debugging)
3. Включите переключатель **Беспроводная отладка**
4. Нажмите на пункт **Беспроводная отладка** для входа в меню
5. Выберите **Сопряжение по QR‑коду** (Pair device with pairing code) или **Pair using QR code**

#### Сопряжение устройства

1. На телефоне откроется QR-код
2. В Android Studio (или через ADB):
   - **Вариант А**: Используйте встроенный сканер QR-кода в Android Studio
   - **Вариант Б**: Используйте команду `adb pair` с IP и портом из QR-кода
3. После успешного сопряжения устройство появится в списке доступных для отладки

#### Подключение к устройству

После сопряжения выполните:

```bash
# Узнайте IP адрес и порт из настроек беспроводной отладки
# Затем подключитесь:
adb connect IP_АДРЕС:ПОРТ

# Например:
# adb connect 192.168.1.100:12345

# Проверьте подключение:
adb devices
```

> ⚠️ **Важно**: Этот метод (через "Wireless debugging") использует **шифрование** и безопасен. Если вы используете старый метод `adb tcpip`, появится предупреждение о незашифрованном канале — для локальной разработки на доверенной сети это обычно безопасно, но рекомендуется использовать новый метод через QR-код.

### Вариант 2: Подключение через USB

1. Включите на телефоне:

   - **Настройки** → **Для разработчиков** → **Отладка по USB**
   - Если режим разработчика не включен: **Настройки** → **О телефоне** → нажмите 7 раз на "Номер сборки"

2. Подключите телефон через USB

3. Проверьте подключение:
   ```bash
   adb devices
   ```
   Должно показать ваше устройство

### Разрешение на установку

На телефоне разрешите установку из неизвестных источников, если потребуется.

### Установка приложения

```bash
cd android
./gradlew installDebug
```

Или через Android Studio: нажмите **Run** и выберите ваше устройство.

---

## 📝 Полезные команды

```bash
# Сборка и синхронизация
pnpm run build:mobile

# Только синхронизация
pnpm run cap:sync

# Открыть Android Studio
pnpm run cap:open:android

# Просмотр логов устройства
adb logcat

# Перезапуск приложения
adb shell am force-stop com.mentai.app
adb shell am start -n com.mentai.app/.MainActivity

# Установка APK на устройство
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## ⚠️ Возможные проблемы

### Проблема: "Command not found: adb"

**Решение**: Проверьте переменные окружения и перезапустите терминал.

### Проблема: Gradle не собирается

**Решение**:

1. Убедитесь, что установлен Android SDK
2. Проверьте интернет-соединение (Gradle загружает зависимости)
3. Попробуйте: `cd android && ./gradlew clean`

### Проблема: Появилось предупреждение о безопасности при mirroring

**Решение**:

Это предупреждение появляется при использовании старого метода беспроводной отладки через `adb tcpip`.

- **Для локальной разработки**: Это предупреждение можно проигнорировать (нажмите "Acknowledge"), если вы на доверенной Wi‑Fi сети
- **Для безопасности**: Используйте новый метод через "Wireless debugging" с QR-кодом (Android 11+), который использует шифрование
- **Альтернатива**: Используйте USB‑кабель для полной безопасности

### Проблема: Уведомления не работают

**Решение**:

1. Убедитесь, что разрешения выданы (проверьте в настройках телефона)
2. Проверьте логи: `adb logcat | grep -i notification`
3. На эмуляторе некоторые уведомления могут работать по-другому

### Проблема: Приложение не открывается

**Решение**:

1. **Проверьте логи в Android Studio**:

   - В нижней панели откройте вкладку **Logcat**
   - Отфильтруйте по `com.mentai.app`
   - Ищите ошибки с красным цветом

2. **Убедитесь, что проект собран**:

   ```bash
   pnpm run build:mobile
   ```

3. **Сделайте Clean Rebuild**:

   - В Android Studio: **Build** → **Clean Project**
   - Затем: **Build** → **Rebuild Project**
   - Или через терминал: `cd android && ./gradlew clean && ./gradlew build`

4. **Проверьте подключение устройства**:

   - Убедитесь, что телефон виден в списке устройств (верхняя панель Android Studio)
   - Если нет — проверьте USB отладку или беспроводную отладку

5. **Проверьте установку**:
   - Попробуйте установить APK вручную: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
   - Затем установите APK через `adb install`

### Проблема: Предупреждение "Using flatDir should be avoided"

**Решение**:

Это предупреждение появлялось из-за использования устаревшего `flatDir` в `build.gradle`. Оно уже исправлено — `flatDir` удален, используется стандартные репозитории Maven. Если предупреждение все еще появляется:

1. Синхронизируйте проект: **File** → **Sync Project with Gradle Files**
2. Очистите кеш: **File** → **Invalidate Caches...** → **Invalidate and Restart**

### Проблема: "Default FirebaseApp is not initialized"

**Решение**:

Эта ошибка возникает, если плагин push-notifications пытается использовать Firebase без инициализации.

**Исправлено в коде**: Firebase теперь инициализируется в `MainActivity`, даже если `google-services.json` отсутствует.

Если ошибка все еще возникает:

1. **Проверьте наличие `google-services.json`**:

   - Если нужно использовать push-уведомления — создайте Firebase проект и добавьте `google-services.json` в `android/app/`
   - Если push-уведомления не нужны — приложение должно работать, просто push не будет работать

2. **Для работы push-уведомлений**:

   - Создайте проект в [Firebase Console](https://console.firebase.google.com/)
   - Добавьте Android приложение с package name `com.mentai.app`
   - Скачайте `google-services.json` и положите в `android/app/`
   - Пересоберите проект: `pnpm run build:mobile`

3. **Если приложение все еще падает**:
   - Убедитесь, что синхронизировали проект с Gradle в Android Studio
   - Проверьте логи в **Logcat** с фильтром `com.mentai.app`

---

## 📚 Дополнительные ресурсы

- [Capacitor Android документация](https://capacitorjs.com/docs/android)
- [Android Developer Guide](https://developer.android.com/)
- [Capacitor уведомления](https://capacitorjs.com/docs/apis/push-notifications)
