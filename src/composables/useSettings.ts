import { ref, computed } from 'vue'
import type { Settings } from '../types'

export function useSettings() {
  const settings = ref<Settings>({
    autofillEnabled: true,
  })

  const loadSettings = async () => {
    const data = await chrome.storage.local.get('settings')
    if (data.settings) {
      settings.value = {
        ...settings.value,
        ...data.settings,
      }
    }
    return settings.value
  }

  const saveSettings = async (updatedSettings?: Settings) => {
    if (updatedSettings) {
      settings.value = {
        ...settings.value,
        ...updatedSettings,
      }
    }

    await chrome.storage.local.set({
      personalInfo: JSON.parse(JSON.stringify(personalInfo.value)),
    })
  }

  return {
    loadSettings,
    saveSettings,
  }
}
