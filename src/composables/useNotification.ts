import { ref } from 'vue'
import type { NotificationType } from '../types'

export function useNotification() {
  //   const notification = ref<Notification | null>(null)
  const notification = ref({
    show: false,
    message: '',
    type: 'success' as 'success' | 'error',
  })

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    notification.value = { show: true, message, type }
    setTimeout(() => {
      notification.value.show = false
    }, 10000)
  }

  return {
    notification,
    showNotification,
  }
}
