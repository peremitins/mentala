#!/bin/bash
# =============================================================================
# setup-lan-dns.sh — Настройка локального DNS-сервера для разработки на LAN
#
# Проблема: телефон не знает что local.mentala.app → Mac (192.168.0.100)
# Решение: запустить dnsmasq на Mac как DNS-сервер, указать телефону его IP
#
# После запуска:
#   1. Запустите этот скрипт: bash scripts/setup-lan-dns.sh
#   2. На телефоне смените DNS на IP вашего Mac (см. инструкцию ниже)
#   3. Откройте https://local.mentala.app в браузере телефона
# =============================================================================

set -e

# Определяем LAN IP автоматически
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")
DOMAIN="local.mentala.app"

if [ -z "$LAN_IP" ]; then
  echo "❌ Не удалось определить LAN IP. Убедитесь что подключены к Wi-Fi."
  exit 1
fi

echo "🌐 LAN IP вашего Mac: $LAN_IP"
echo "📡 Настраиваем DNS: $DOMAIN → $LAN_IP"
echo ""

# 1. Устанавливаем dnsmasq если нет
if ! command -v dnsmasq &>/dev/null; then
  echo "📦 Устанавливаем dnsmasq..."
  brew install dnsmasq
else
  echo "✅ dnsmasq уже установлен ($(dnsmasq --version 2>&1 | head -1))"
fi

# 2. Настраиваем dnsmasq
DNSMASQ_CONF=$(brew --prefix)/etc/dnsmasq.conf
DNSMASQ_CONF_DIR=$(brew --prefix)/etc/dnsmasq.d
mkdir -p "$DNSMASQ_CONF_DIR"

# Включаем conf-dir в основном конфиге
if ! grep -q "^conf-dir" "$DNSMASQ_CONF" 2>/dev/null; then
  echo "conf-dir=$(brew --prefix)/etc/dnsmasq.d/,*.conf" >> "$DNSMASQ_CONF"
fi

# Создаём конфиг для нашего домена
cat > "$DNSMASQ_CONF_DIR/mentala-local.conf" <<EOF
# Резолвинг local.mentala.app → LAN IP Mac для разработки
address=/$DOMAIN/$LAN_IP
# Слушаем на всех интерфейсах для доступа с телефона
interface=en0
interface=en1
listen-address=127.0.0.1,$LAN_IP
EOF

echo "✅ Конфиг dnsmasq создан: $DNSMASQ_CONF_DIR/mentala-local.conf"

# 3. Запускаем/перезапускаем dnsmasq
echo "🚀 Запускаем dnsmasq..."
if sudo brew services restart dnsmasq 2>/dev/null; then
  echo "✅ dnsmasq запущен"
else
  echo "⚠️  Попробуйте: sudo brew services start dnsmasq"
fi

# 4. Проверяем что DNS работает локально
sleep 1
if dig @127.0.0.1 "$DOMAIN" +short 2>/dev/null | grep -q "$LAN_IP"; then
  echo "✅ DNS работает: $DOMAIN → $LAN_IP"
else
  echo "⚠️  Проверьте вручную: dig @127.0.0.1 $DOMAIN"
fi

echo ""
echo "=================================================================="
echo "📱 НАСТРОЙКА ТЕЛЕФОНА"
echo "=================================================================="
echo ""
echo "🤖 Android:"
echo "  1. Настройки → Wi-Fi → [ваша сеть] → карандаш/детали"
echo "  2. IP-настройки → Статический"
echo "  3. DNS 1: $LAN_IP"
echo "  4. Сохранить → переподключиться к Wi-Fi"
echo ""
echo "🍎 iOS:"
echo "  1. Настройки → Wi-Fi → [ваша сеть] → (i)"
echo "  2. Настроить DNS → Вручную"
echo "  3. Добавить сервер: $LAN_IP"
echo "  4. Сохранить"
echo ""
echo "После настройки DNS на телефоне:"
echo "  📲 Откройте https://local.mentala.app"
echo ""
echo "🔒 Если браузер предупреждает о сертификате — установите mkcert CA:"
echo "  Файл: $(mkcert -CAROOT)/rootCA.pem"
echo "  Отправьте на телефон через AirDrop / Telegram / email"
echo ""
echo "=================================================================="
echo "🔄 Для обновления IP (при смене сети):"
echo "  bash scripts/setup-lan-dns.sh"
echo "=================================================================="
