import { ref } from 'vue'
import type { SavedResponse } from '../types'

export function useSavedResponses() {
  const savedResponses = ref<SavedResponse[]>([])

  const loadSavedResponses = async () => {
    const data = await chrome.storage.local.get('savedResponses')
    if (data.savedResponses) {
      savedResponses.value = data.savedResponses
    }
  }

  const addSavedResponse = async (response: SavedResponse) => {
    savedResponses.value.push(response)
    await chrome.storage.local.set({
      savedResponses: JSON.parse(JSON.stringify(savedResponses.value)),
    })
  }

  const deleteSavedResponse = async (responseId: number) => {
    savedResponses.value = savedResponses.value.filter((r) => r.id !== responseId)
    await chrome.storage.local.set({
      savedResponses: JSON.parse(JSON.stringify(savedResponses.value)),
    })
  }

  return {
    savedResponses,
    loadSavedResponses,
    addSavedResponse,
    deleteSavedResponse,
  }
}
