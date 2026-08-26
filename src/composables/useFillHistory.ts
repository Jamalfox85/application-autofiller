import { ref } from 'vue'
import type { FillHistoryEntry } from '../types'

export function useFillHistory() {
  const fillHistory = ref<FillHistoryEntry[]>([])

  const loadFillHistory = async () => {
    const data = await chrome.storage.local.get('fillHistory')
    fillHistory.value = data.fillHistory || []
  }

  const clearFillHistory = async () => {
    await chrome.runtime.sendMessage({ action: 'clearFillHistory' })
    fillHistory.value = []
  }

  return {
    fillHistory,
    loadFillHistory,
    clearFillHistory,
  }
}
