import { ref } from 'vue'
import type { CustomResponse } from '../types'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import {
  fetchCustomResponsesFromDb,
  saveCustomResponsesToDb,
} from '../lib/sync/customResponses'

const MIRROR_KEY = 'customResponses'

export function useCustomResponses() {
  const customResponses = ref<CustomResponse[]>([])

  const persist = async () => {
    const snapshot = JSON.parse(JSON.stringify(customResponses.value)) as CustomResponse[]
    await writeMirror(MIRROR_KEY, snapshot)
    const userId = await getUserIdOrNull()
    if (!userId) return
    await saveCustomResponsesToDb(userId, snapshot)
  }

  const loadCustomResponses = async () => {
    const userId = await getUserIdOrNull()
    if (userId) {
      try {
        const remote = await fetchCustomResponsesFromDb(userId)
        customResponses.value = remote
        await writeMirror(MIRROR_KEY, remote)
        return
      } catch (error) {
        console.error('Failed to load custom responses from Supabase — using local cache', error)
      }
    }
    customResponses.value = (await readMirror<CustomResponse[]>(MIRROR_KEY)) ?? []
  }

  const addCustomResponse = async (response: CustomResponse) => {
    customResponses.value.push(response)
    await persist()
  }

  const deleteCustomResponse = async (responseId: number) => {
    customResponses.value = customResponses.value.filter((r) => r.id !== responseId)
    await persist()
  }

  const saveCustomResponse = async (updatedResponse: CustomResponse) => {
    const index = customResponses.value.findIndex((r) => r.id === updatedResponse.id)
    if (index !== -1) {
      customResponses.value[index] = updatedResponse
      await persist()
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
