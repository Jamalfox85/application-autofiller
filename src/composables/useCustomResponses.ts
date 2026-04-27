import { ref } from 'vue'
import type { CustomResponse } from '../types'

export function useCustomResponses() {
  const customResponses = ref<CustomResponse[]>([])

  const loadCustomResponses = async () => {
    const data = await chrome.storage.local.get('customResponses')
    if (data.customResponses) {
      customResponses.value = data.customResponses
    }
  }

  const addCustomResponse = async (response: CustomResponse) => {
    customResponses.value.push(response)
    await chrome.storage.local.set({
      customResponses: JSON.parse(JSON.stringify(customResponses.value)),
    })
  }

  const deleteCustomResponse = async (responseId: number) => {
    customResponses.value = customResponses.value.filter((r: CustomResponse) => r.id !== responseId)
    await chrome.storage.local.set({
      customResponses: JSON.parse(JSON.stringify(customResponses.value)),
    })
  }

  const saveCustomResponse = async (updatedResponse: CustomResponse) => {
    const index = customResponses.value.findIndex(
      (r: CustomResponse) => r.id === updatedResponse.id,
    )
    if (index !== -1) {
      customResponses.value[index] = updatedResponse
      await chrome.storage.local.set({
        customResponses: JSON.parse(JSON.stringify(customResponses.value)),
      })
    }
  }

  return {
    customResponses,
    loadCustomResponses,
    addCustomResponse,
    deleteCustomResponse,
    saveCustomResponse,
  }
}
