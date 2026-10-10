import { ref } from 'vue'
import type { CustomResponse } from '../types'
import { getUserIdOrNull, readMirror, writeMirror } from '../lib/sync/shared'
import {
  fetchCustomResponsesFromDb,
  saveCustomResponsesToDb,
} from '../lib/sync/customResponses'
import { CUSTOM_RESPONSES_KEY, readActiveProfileId } from '../lib/sync/activeProfile'
import { mirrorEpoch, onMirrorReset } from '../lib/sync/mirrorEpoch'

// Custom responses belong to the active profile. The id is captured at load so a save made
// after a swap elsewhere can't write this list into another profile.
// Module-level so sign-out can drop the list the open dialog is holding.
const customResponses = ref<CustomResponse[]>([])
let profileId: string | null = null
let memoryValid = true
let memoryGeneration = 0

function invalidateCustomResponses() {
  memoryGeneration += 1
  memoryValid = false
  customResponses.value = []
  profileId = null
}

onMirrorReset(invalidateCustomResponses)

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, CUSTOM_RESPONSES_KEY)) return
    if (changes[CUSTOM_RESPONSES_KEY].newValue == null) invalidateCustomResponses()
  })
}

export function useCustomResponses() {
  const persist = async () => {
    if (!memoryValid) return
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    const snapshot = JSON.parse(JSON.stringify(customResponses.value)) as CustomResponse[]
    const target = profileId ?? (await readActiveProfileId(chrome.storage.local))
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    const mirrored = await readActiveProfileId(chrome.storage.local)
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch()) return
    if (!mirrored || mirrored === target) await writeMirror(CUSTOM_RESPONSES_KEY, snapshot)
    const userId = await getUserIdOrNull()
    if (!memoryValid || generation !== memoryGeneration || epoch !== mirrorEpoch() || !userId || !target) return
    await saveCustomResponsesToDb(target, snapshot)
  }

  const loadCustomResponses = async () => {
    const epoch = mirrorEpoch()
    const generation = memoryGeneration
    const stillCurrent = () => epoch === mirrorEpoch() && generation === memoryGeneration
    profileId = await readActiveProfileId(chrome.storage.local)
    if (!stillCurrent()) return
    const userId = await getUserIdOrNull()
    if (userId && profileId) {
      try {
        const remote = await fetchCustomResponsesFromDb(profileId)
        if (!stillCurrent()) return
        customResponses.value = remote
        memoryValid = true
        if (!stillCurrent()) {
          invalidateCustomResponses()
          return
        }
        await writeMirror(CUSTOM_RESPONSES_KEY, remote)
        if (!stillCurrent()) invalidateCustomResponses()
        return
      } catch (error) {
        console.error('Failed to load custom responses from Supabase — using local cache', error)
      }
    }
    if (!stillCurrent()) return
    const local = await readMirror<CustomResponse[]>(CUSTOM_RESPONSES_KEY)
    if (!stillCurrent()) return
    customResponses.value = local ?? []
    memoryValid = true
  }

  const addCustomResponse = async (response: CustomResponse) => {
    if (!memoryValid) return
    customResponses.value.push(response)
    await persist()
  }

  const deleteCustomResponse = async (responseId: number) => {
    if (!memoryValid) return
    customResponses.value = customResponses.value.filter((r) => r.id !== responseId)
    await persist()
  }

  const saveCustomResponse = async (updatedResponse: CustomResponse) => {
    if (!memoryValid) return
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
