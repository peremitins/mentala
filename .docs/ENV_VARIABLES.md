# Переменные окружения

## Deep Links / App Links (mobile checkout return)
| Переменная | Описание | Дефолт |
|------------|----------|--------|
| `IOS_APP_LINK_TEAM_ID` | Apple Team ID для AASA | `8QMGJ847K5` |
| `IOS_APP_LINK_BUNDLE_IDS` | iOS bundle IDs (через запятую) | `com.mentala.app` |
| `ANDROID_APP_LINK_PACKAGE_NAME` | Android package name для assetlinks | `com.mentala.app` |
| `ANDROID_APP_LINK_SHA256_FINGERPRINTS` | SHA-256 fingerprints сертификатов (через запятую) | — |

## Production (обязательно)
| Переменная | Описание |
|------------|----------|
| `PUBLIC_APP_ORIGIN` | Основной домен (приоритет 1): `https://my.mentala.app` |
| `ALLOWED_ORIGINS` | Разрешённые origins через запятую (приоритет 2, если нет PUBLIC_APP_ORIGIN) |

Если ни `PUBLIC_APP_ORIGIN`, ни `ALLOWED_ORIGINS` не заданы → ошибка в production.

## Development
| Переменная | Описание | Дефолт |
|------------|----------|--------|
| `DEV_ALLOWED_ORIGINS` | Разрешённые origins для dev (через запятую) | `http://localhost:3000,http://127.0.0.1:3000` |
| `RATE_LIMIT_MAX` | Макс. запросов в окне rate-limit | `180` |
| `RATE_LIMIT_WINDOW_MS` | Окно rate-limit (мс) | `60000` |

## Примеры
```bash
# .env.development — с мобильными устройствами
DEV_ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.100:3000

# .env.production
PUBLIC_APP_ORIGIN=https://my.mentala.app
ALLOWED_ORIGINS=https://my.mentala.app,https://mentala.app
```
