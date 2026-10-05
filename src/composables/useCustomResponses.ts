import { ref } from 'vue'
import type { CustomResponse } from '../types'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import {
  fetchCustomResponsesFromDb,
  saveCustomResponsesToDb,
} from '../lib/sync/customResponses'
import { CUSTOM_RESPONSES_KEY, readActiveProfileId } from '../lib/sync/activeProfile'

// Custom responses belong to the active profile. The id is captured at load so a save made
// after a swap elsewhere can't write this list into another profile.
export function useCustomResponses() {
  const customResponses = ref<CustomResponse[]>([])
  let profileId: string | null = null

  const persist = async () => {
    const snapshot = JSON.parse(JSON.stringify(customResponses.value)) as CustomResponse[]
    const target = profileId ?? (await readActiveProfileId(chrome.storage.local))
    const mirrored = await readActiveProfileId(chrome.storage.local)
    if (!mirrored || mirrored === target) await writeMirror(CUSTOM_RESPONSES_KEY, snapshot)
    const userId = await getUserIdOrNull()
    if (!userId || !target) return
    await saveCustomResponsesToDb(target, snapshot)
  }

  const loadCustomResponses = async () => {
    profileId = await readActiveProfileId(chrome.storage.local)
    const userId = await getUserIdOrNull()
    if (userId && profileId) {
      try {
        const remote = await fetchCustomResponsesFromDb(profileId)
        customResponses.value = remote
        await writeMirror(CUSTOM_RESPONSES_KEY, remote)
        return
      } catch (error) {
        console.error('Failed to load custom responses from Supabase — using local cache', error)
      }
    }
    customResponses.value = (await readMirror<CustomResponse[]>(CUSTOM_RESPONSES_KEY)) ?? []
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
