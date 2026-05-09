import { toast } from 'vue-sonner';

type AppToastType = 'success' | 'error' | 'info' | 'warning';

export function useToast(
  text: string,
  description?: string,
  // Нейтральный дефолт — синий info-тост; зелёный success указываем только явно.
  type: AppToastType = 'info',
  duration: number = 7000
) {
  toast[type](text, {
    description,
    duration,
  });
}
