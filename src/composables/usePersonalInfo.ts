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
    linkedin: '',
    website: '',
    github: '',
    resumeFile: '',
    education: [],
    gender: '',
    raceEthnicity: '',
    disabilityStatus: '',
    veteranStatus: '',
    age18OrOlder: '',
    desiredSalary: 0,
    workAuthorization: '',
    accountPassword: '',
  })

  const fullName = computed(() => {
    return `${personalInfo.value.firstName} ${personalInfo.value.lastName}`.trim() || 'John Doe'
  })

  const displayEmail = computed(() => {
    return personalInfo.value.email || 'john.doe@email.com'
  })

  const displayPhone = computed(() => {
    return personalInfo.value.phone || '+1 234 567 890'
  })

  const displayLinkedin = computed(() => {
    return personalInfo.value.linkedin || 'linkedin.com/in/johndoe-ux'
  })

  const displayWebsite = computed(() => {
    return personalInfo.value.website || 'www.johndoe.com'
  })

  const displayGithub = computed(() => {
    return personalInfo.value.github || 'github.com/johndoe'
  })

  const loadPersonalInfo = async () => {
    const data = await chrome.storage.local.get('personalInfo')
    if (data.personalInfo) {
      personalInfo.value = {
        ...personalInfo.value,
        ...data.personalInfo,
        education: data.personalInfo.education || [],
      }
    }
  }

  const savePersonalInfo = async (updatedInfo?: PersonalInfo) => {
    if (updatedInfo) {
      personalInfo.value = updatedInfo
    }

    await chrome.storage.local.set({
      personalInfo: JSON.parse(JSON.stringify(personalInfo.value)),
    })
  }

  return {
    personalInfo,
    fullName,
    displayEmail,
    displayPhone,
    displayLinkedin,
    displayWebsite,
    displayGithub,
    loadPersonalInfo,
    savePersonalInfo,
  }
}
