import { ref } from 'vue'

export function useNotification() {
  const notification = ref({
    show: false,
    message: '',
    type: 'success' as 'success' | 'error' | 'info',
  })

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    notification.value = { show: true, message, type }
    setTimeout(() => {
      notification.value.show = false
    }, 4000)
  }

  return {
    notification,
    showNotification,
  }
}
