<template>
  <div class="space-y-6">
    <section class="space-y-4">
      <div v-if="loading" class="text-sm text-muted-foreground">
        Загрузка...
      </div>

      <div v-else-if="user" class="space-y-4">
        <!-- ID -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> ID </label>
          <Input
            :model-value="String(user.id)"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Email -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Email </label>
          <Input
            :model-value="user.email || 'Не указан'"
            type="email"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Name -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Имя </label>
          <Input
            :model-value="user.name || 'Не указано'"
            type="text"
            disabled
            :show-clear-button="false"
          />
        </div>

        <!-- Locale -->
        <div class="space-y-2">
          <label class="text-sm font-medium text-foreground"> Локаль </label>
          <Input
            :model-value="user.locale || 'Не указана'"
            type="text"
            disabled
            :show-clear-button="false"
          />
        </div>
      </div>

      <div v-else class="text-sm text-destructive">
        Не удалось загрузить информацию о пользователе
      </div>
    </section>

    <!-- Удаление аккаунта -->
    <section class="space-y-4 border-t border-border pt-6">
      <div class="space-y-2">
        <h3 class="text-sm font-semibold text-foreground">Удаление аккаунта</h3>
        <p class="text-sm text-muted-foreground">
          Удаление аккаунта необратимо. Все ваши данные будут удалены через 7 дней.
          В течение этого периода вы можете восстановить аккаунт.
        </p>
      </div>

      <AlertDialog :open="showDeleteDialog" @update:open="showDeleteDialog = $event">
        <AlertDialogTrigger as-child>
          <Button
            variant="destructive"
            :disabled="isDeleting"
          >
            Удалить аккаунт
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent class="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить аккаунт?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить свой аккаунт? Это действие нельзя отменить.
              Все ваши данные будут удалены через 7 дней. В течение этого периода вы
              можете восстановить аккаунт.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel :disabled="isDeleting">Отмена</AlertDialogCancel>
            <AlertDialogAction
              :class="buttonVariants({ variant: 'destructive' })"
              @click="handleDeleteAccount"
              :disabled="isDeleting"
            >
              {{ isDeleting ? 'Удаление...' : 'Да, удалить аккаунт' }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from '@/app/stores/auth';
import { Input } from '@/app/components/ui/shadcn/input';
import { Button } from '@/app/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/app/components/ui/alert-dialog';
import { useToast } from '@/app/composables/useToast';
import { useRouter } from 'vue-router';
import { buttonVariants } from '@/app/components/ui/button';

const auth = useAuthStore();
const router = useRouter();
const user = ref<any>(null);
const loading = ref(true);
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

onMounted(async () => {
  try {
    // Загружаем данные пользователя, если их нет в store
    if (!auth.user) {
      await auth.me();
    }
    user.value = auth.user;
  } catch (error) {
    console.error('Failed to load user data:', error);
  } finally {
    loading.value = false;
  }
});

async function handleDeleteAccount() {
  if (isDeleting.value) return;

  isDeleting.value = true;

  try {
    const response = await $fetch<{
      ok?: boolean;
      error?: boolean;
      message?: string;
      jobId?: string;
      loggedOut?: boolean;
      canRestore?: boolean;
    }>('/api/user/delete', {
      method: 'POST',
    });

    if (response.error) {
      useToast('Ошибка', response.message || 'Не удалось удалить аккаунт');
      showDeleteDialog.value = false;
      return;
    }

    if (response.ok && response.loggedOut) {
      // Закрываем модалку
      showDeleteDialog.value = false;

      useToast(
        'Аккаунт удалён',
        'Ваш аккаунт будет полностью удалён через 7 дней. Вы можете восстановить его в течение этого периода.'
      );

      // Разлогиниваем пользователя
      await auth.logout();

      // Перенаправляем на главную страницу
      await router.push('/');
    }
  } catch (error: any) {
    console.error('Failed to delete account:', error);
    const errorMessage =
      error?.response?.data?.message ||
      error?.message ||
      'Не удалось удалить аккаунт';
    useToast('Ошибка', errorMessage);
    showDeleteDialog.value = false;
  } finally {
    isDeleting.value = false;
  }
}
</script>
