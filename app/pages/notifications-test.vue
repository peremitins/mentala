<template>
  <div class="glass-deep px-4 py-6 space-y-6 h-full overflow-y-auto">
    <PageHeader
      title="Тест уведомлений"
      :show-back-button="true"
      @go-back="goBack"
    />

    <div class="space-y-4">
      <!-- Статус -->
      <div class="p-4 bg-card rounded-lg">
        <h3 class="text-lg font-semibold mb-3">Статус</h3>
        <div class="space-y-2 text-sm">
          <div>
            Платформа: <span class="font-mono">{{ platform }}</span>
          </div>
          <div>
            Уведомления доступны:
            <span
              :class="
                notifications.isAvailable ? 'text-primary' : 'text-destructive'
              "
            >
              {{ notifications.isAvailable ? 'Да' : 'Нет' }}
            </span>
          </div>
          <div>
            Push разрешения:
            <span class="font-mono">{{ permissions.push }}</span>
          </div>
          <div>
            Локальные разрешения:
            <span class="font-mono">{{ permissions.local }}</span>
          </div>
          <div v-if="pushToken">
            Push токен: <span class="font-mono text-xs">{{ pushToken }}</span>
          </div>
        </div>
      </div>

      <!-- Тесты -->
      <div class="space-y-3">
        <h3 class="text-lg font-semibold">Тесты</h3>

        <Button
          class="w-full"
          @click="sendTestNotification"
          :disabled="!notifications.isAvailable"
        >
          Отправить тестовое уведомление
        </Button>

        <Button
          class="w-full"
          variant="outline"
          @click="sendScheduledNotification"
          :disabled="!notifications.isAvailable"
        >
          Отправить уведомление через 5 сек
        </Button>

        <Button
          class="w-full"
          variant="outline"
          @click="checkStatus"
          :disabled="!notifications.isAvailable"
        >
          Обновить статус разрешений
        </Button>

        <Button
          class="w-full"
          variant="outline"
          @click="getPushTokenTest"
          :disabled="!notifications.isAvailable"
        >
          Получить Push токен
        </Button>

        <Button
          class="w-full"
          variant="destructive"
          @click="cancelAll"
          :disabled="!notifications.isAvailable"
        >
          Отменить все уведомления
        </Button>
      </div>

      <!-- Логи -->
      <div class="p-4 bg-card rounded-lg">
        <h3 class="text-lg font-semibold mb-3">Логи</h3>
        <div class="space-y-1 text-xs font-mono max-h-40 overflow-y-auto">
          <div
            v-for="(log, index) in logs"
            :key="index"
            class="text-muted-foreground"
          >
            {{ log }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core';
import { useNotifications } from '@/app/composables/useNotifications';
import { useToast } from '@/app/composables/useToast';
import { Button } from '@/app/components/ui/shadcn/button';

const notifications = useNotifications();

const platform = ref(Capacitor.getPlatform());
const permissions = ref({ push: 'unknown', local: 'unknown' });
const pushToken = ref<string | null>(null);
const logs = ref<string[]>([]);

function addLog(message: string) {
  const timestamp = new Date().toLocaleTimeString();
  logs.value.unshift(`[${timestamp}] ${message}`);
  if (logs.value.length > 20) logs.value.pop();
}

async function checkStatus() {
  addLog('Проверка статуса разрешений...');
  const perms = await notifications.checkPermissions();
  permissions.value = perms;
  addLog(`Push: ${perms.push}, Local: ${perms.local}`);
  useToast('Статус обновлён', 'Разрешения проверены');
}

async function sendTestNotification() {
  addLog('Отправка тестового уведомления...');
  const success = await notifications.sendNotification(
    'Тестовое уведомление',
    'Это тестовое уведомление от MentAI!'
  );

  if (success) {
    addLog('Уведомление успешно отправлено');
    useToast('Успешно', 'Уведомление отправлено');
  } else {
    addLog('Ошибка отправки уведомления');
    useToast('Ошибка', 'Не удалось отправить уведомление');
  }
}

async function sendScheduledNotification() {
  const scheduleDate = new Date();
  scheduleDate.setSeconds(scheduleDate.getSeconds() + 5);

  addLog(`Планирование уведомления на ${scheduleDate.toLocaleTimeString()}...`);

  const success = await notifications.scheduleLocalNotification({
    title: 'Запланированное уведомление',
    body: 'Это уведомление было запланировано на 5 секунд вперед',
    schedule: { at: scheduleDate },
  });

  if (success) {
    addLog('Уведомление успешно запланировано');
    useToast('Запланировано', 'Уведомление придет через 5 секунд');
  } else {
    addLog('Ошибка планирования уведомления');
    useToast('Ошибка', 'Не удалось запланировать уведомление');
  }
}

async function getPushTokenTest() {
  addLog('Получение Push токена...');
  const token = await notifications.getPushToken();

  if (token) {
    pushToken.value = token;
    addLog(`Push токен получен: ${token.substring(0, 20)}...`);
    useToast('Токен получен', 'Push токен сохранён');
  } else {
    addLog('Токен еще не доступен. Проверьте логи для registration события.');
    useToast('Внимание', 'Токен будет доступен после регистрации');
  }
}

async function cancelAll() {
  addLog('Отмена всех уведомлений...');
  await notifications.cancelAll();
  addLog('Все уведомления отменены');
  useToast('Отменено', 'Все уведомления отменены');
}

function goBack() {
  navigateTo('/settings');
}

// Проверка статуса при загрузке
onMounted(async () => {
  addLog('Инициализация тестовой страницы...');
  await checkStatus();

  // Пытаемся получить сохраненный токен
  if (typeof window !== 'undefined') {
    const savedToken = window.localStorage.getItem('pushToken');
    if (savedToken) {
      pushToken.value = savedToken;
      addLog(`Найден сохраненный токен: ${savedToken.substring(0, 20)}...`);
    }
  }
});
</script>
