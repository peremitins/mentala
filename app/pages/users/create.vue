<template>
  <div class="glass-deep flex flex-1 relative overflow-hidden xs:p-5 p-4">
    <section class="w-full" :style="{ borderRadius: `calc(var(--radius-lg))` }">
      <h2 class="text-lg font-semibold mb-4">Добавить пользователя</h2>

      <form class="space-y-3" @submit.prevent="onSubmit">
        <Input
          v-model="email"
          type="email"
          placeholder="email@example.com"
          :show-clear-button="false"
        />
        <Input
          v-model="name"
          type="text"
          placeholder="Имя (опционально)"
          :show-clear-button="false"
        />
        <Select v-model="roleId">
          <SelectTrigger>
            <SelectValue placeholder="Выберите роль" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">Пользователь</SelectItem>
            <SelectItem value="admin">Администратор</SelectItem>
            <SelectItem value="moderator">Модератор</SelectItem>
            <SelectItem value="support">Поддержка</SelectItem>
          </SelectContent>
        </Select>
        <Input
          v-model="password"
          type="password"
          placeholder="Пароль (мин. 6)"
          :show-clear-button="false"
        />
        <Input
          v-model="confirm"
          type="password"
          placeholder="Подтверждение пароля"
          :show-clear-button="false"
        />
        <label
          class="flex items-center gap-3 rounded-xl border border-border px-3 py-3"
        >
          <Checkbox v-model:checked="emailVerified" />
          <div class="space-y-1">
            <p class="text-sm font-medium text-foreground">
              Сразу пометить email как подтвержденный
            </p>
            <p class="text-xs text-muted-foreground">
              Удобно для review- и support-аккаунтов без реального inbox.
            </p>
          </div>
        </label>
        <div class="flex items-center gap-2">
          <Button type="submit" variant="outline" :disabled="saving">
            Сохранить
          </Button>
          <Button as-child variant="outline">
            <NuxtLink to="/users">Отмена</NuxtLink>
          </Button>
        </div>
        <div v-if="error" class="text-destructive text-sm">
          {{ error }}
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
});
import { Input } from '@/app/components/ui/shadcn/input';
import { Button } from '@/app/components/ui/button';
import { Checkbox } from '@/app/components/ui/shadcn/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/shadcn/select';

const email = ref('');
const name = ref('');
const roleId = ref('user');
const password = ref('');
const confirm = ref('');
const emailVerified = ref(false);
const saving = ref(false);
const error = ref('');

async function onSubmit() {
  error.value = '';
  if (!email.value.trim()) {
    error.value = 'Email обязателен';
    return;
  }
  if (password.value && password.value.length < 6) {
    error.value = 'Пароль слишком короткий';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = 'Пароли не совпадают';
    return;
  }
  saving.value = true;
  try {
    await useAPI('/api/admin/users', {
      method: 'POST',
      body: {
        email: email.value.trim(),
        name: name.value.trim() || undefined,
        password: password.value,
        roleId: roleId.value,
        emailVerified: emailVerified.value,
      },
    });

    useToast('Готово', 'Пользователь добавлен');
    await navigateTo('/users');
  } catch (e: any) {
    error.value = e?.data?.message || e?.message || 'Ошибка сохранения';
  } finally {
    saving.value = false;
  }
}
</script>
