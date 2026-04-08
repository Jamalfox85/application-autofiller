import { ref, computed } from 'vue'
import type { PersonalInfo } from '../types'

export function usePersonalInfo() {
  const personalInfo = ref<PersonalInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    linkedin: '',
    website: '',
    github: '',
    resumeFile: '',
    education: [],
    experience: [],
    skills: [],
    gender: '',
    raceEthnicity: '',
    disabilityStatus: '',
    veteranStatus: '',
    age18OrOlder: '',
    desiredSalary: 0,
    workAuthorization: '',
    accountPassword: '',
  })

  const loadPersonalInfo = async () => {
    const data = await chrome.storage.local.get('personalInfo')
    if (data.personalInfo) {
      personalInfo.value = {
        ...personalInfo.value,
        ...data.personalInfo,
      }
    }
    return personalInfo.value
  }

  const savePersonalInfo = async (updatedInfo?: PersonalInfo) => {
    if (updatedInfo) {
      personalInfo.value = {
        ...personalInfo.value,
        ...updatedInfo,
      }
    }

    await chrome.storage.local.set({
      personalInfo: JSON.parse(JSON.stringify(personalInfo.value)),
    })
  }

  return {
    personalInfo,
    loadPersonalInfo,
    savePersonalInfo,
  }
}
