# Быстрый старт: Android

## Запуск

```bash
# 1. Dev-сервер (в отдельном терминале, единственный экземпляр на порту 3000)
pnpm dev

# 2. Синхронизация Capacitor
pnpm run cap:sync:emulator   # для эмулятора
pnpm run cap:sync:device     # для реального устройства (использует adb reverse)

# 3. Открыть в Android Studio
pnpm run cap:open:android

# 4. Собрать и установить
cd android && ./gradlew clean installDebug
```

## Как работает cap:sync:device

- Проверяет, что dev-сервер отвечает на `127.0.0.1:3000`
- Для Android всегда прописывает `http://localhost:3000` через `adb reverse` (нужно для secure-context микрофона)
- Пересобирает и переустанавливает debug APK автоматически

## Полезные команды

```bash
pnpm run build:mobile              # Production-сборка мобилки
pnpm run cap:sync                  # Синхронизация после изменений
adb logcat                         # Логи
adb shell am force-stop com.mentai.app   # Перезапуск приложения
adb shell am start -n com.mentai.app/.MainActivity
```

## Troubleshooting

### "This app requires a WebView to work" / Черный экран

Dev-сервер не запущен или Capacitor не подключается к нему.

```bash
curl http://localhost:3000          # проверить доступность
pnpm run cap:sync:emulator         # или cap:sync:device
cd android && ./gradlew clean installDebug
```

### Запросы не проходят / Failed to fetch / Mixed Content

- Для dev: используй `cap:sync:emulator` / `cap:sync:device` — они настраивают URL автоматически
- Для production: `pnpm generate && pnpm cap:sync`

### Микрофон на эмуляторе

Эмулятор часто не поддерживает запись звука корректно. Проверь:
- AVD Manager → Edit → Advanced Settings → Microphone: Enabled
- macOS: Системные настройки → Конфиденциальность → Микрофон → разрешить Android Studio
- В эмуляторе: Настройки → Приложения → Mentala → Разрешения → Микрофон

Для надежного тестирования голоса используй **реальное устройство**.

### Прочее

- SDK не найден: проверь `ANDROID_HOME`
- Эмулятор не стартует: нужен HAXM
- Не собирается: `cd android && ./gradlew clean`
