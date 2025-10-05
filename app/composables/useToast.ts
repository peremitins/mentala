import { toast } from 'vue-sonner'

export function useToast(
  text: string,
  description: string,
  type: 'success' | 'error' | 'info' | 'warning' = 'success',
  duration: number = 7000
) {
  toast[type](text, {
    description,
    duration,
  })
}
