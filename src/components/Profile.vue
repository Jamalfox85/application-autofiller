<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import type { PersonalInfo } from '../types'
import {
  ICON_USER,
  ICON_MAIL,
  ICON_PHONE,
  ICON_LINKEDIN,
  ICON_WEBSITE,
  ICON_GITHUB,
  ICON_HOME,
  ICON_LOCATION,
  ICON_COUNTRY,
} from '@/utils/icons'
import { usePersonalInfo } from '../composables/usePersonalInfo'
import { useNotification } from '../composables/useNotification'

const { personalInfo, displayEmail, displayPhone, loadPersonalInfo, savePersonalInfo } =
  usePersonalInfo()

const fullName = ref('')
const editableProfile = ref<PersonalInfo>({
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

watch(
  [fullName, editableProfile],
  () => {
    const [firstName, ...lastNameParts] = fullName.value.trim().split(' ')
    const lastName = lastNameParts.join(' ')

    const updatedInfo: PersonalInfo = {
      ...editableProfile.value,
      firstName: firstName || '',
      lastName: lastName || '',
    }

    savePersonalInfo(updatedInfo)
  },
  { deep: true },
)

onMounted(async () => {
  await loadPersonalInfo()

  fullName.value = [personalInfo.value.firstName, personalInfo.value.lastName]
    .filter(Boolean)
    .join(' ')

  editableProfile.value = {
    ...personalInfo.value,
  }
})
</script>

<template>
  <div>
    <div class="section">
      <h3 class="section-title">PROFILE</h3>
      <div class="edit-group primary">
        <span v-html="ICON_USER" alt="User Icon" class="icon primary" />
        <input v-model="fullName" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_MAIL" alt="Mail Icon" class="icon" />
        <input v-model="editableProfile.email" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_PHONE" alt="Phone Icon" class="icon" />
        <input v-model="editableProfile.phone" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_LINKEDIN" alt="LinkedIn Icon" class="icon" />
        <input v-model="editableProfile.linkedin" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_WEBSITE" alt="Website Icon" class="icon" />
        <input v-model="editableProfile.website" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_GITHUB" alt="Github Icon" class="icon" />
        <input v-model="editableProfile.github" type="text" class="input" />
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">ADDRESS</h3>
      <div class="edit-group primary">
        <span v-html="ICON_HOME" alt="Home Icon" class="icon primary" />
        <input v-model="editableProfile.address" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_LOCATION" alt="City Icon" class="icon" />
        <input v-model="editableProfile.city" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_LOCATION" alt="state Icon" class="icon" />
        <input v-model="editableProfile.state" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_LOCATION" alt="Zip Icon" class="icon" />
        <input v-model="editableProfile.zip" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_COUNTRY" alt="Country Icon" class="icon" />
        <input v-model="editableProfile.country" type="text" class="input" />
      </div>
    </div>
    <div class="section">
      <h3 class="section-title">PROFILE</h3>
      <div class="edit-group primary">
        <span v-html="ICON_USER" alt="User Icon" class="icon primary" />
        <input v-model="fullName" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_MAIL" alt="User Icon" class="icon" />
        <input v-model="editableProfile.email" type="text" class="input" />
      </div>
      <div class="edit-group">
        <span v-html="ICON_PHONE" alt="User Icon" class="icon" />
        <input v-model="editableProfile.phone" type="text" class="input" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.edit-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: rgb(197, 197, 197);
  &.primary {
    margin-bottom: 8px;
    color: #f7fafc;
    font-size: 18px;
    font-weight: 600;
  }
}
.edit-group:not(.primary) {
  margin-left: 24px;
}
.input {
  background: none;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
  padding: 4px 8px;
  border-radius: 4px;
  color: #f7fafc;
  transition: border-color 0.15s ease;
  width: 75%;
  &:focus {
    outline: solid 2px rgb(72, 9, 233);
    background: none; /* or a subtle tint */
    outline: none;
    cursor: text;
  }
  &:hover {
    outline: solid 2px rgb(72, 9, 233);
    cursor: pointer;
  }
}

// .profile-name {
//   font-size: 18px;
//   font-weight: 600;
//   color: #f7fafc;
//   margin: 0 0 4px 0;
// }
// .profile-details {
//   margin-top: 8px;
//   margin-bottom: 1em;
//   .detail-group {
//     display: flex;
//     align-items: center;
//     gap: 6px;
//     margin-bottom: 4px;
//     color: #a0aec0;
//     font-size: 13px;
//     * {
//       margin-right: 2px;
//     }
//   }
//   .primary-details {
//     margin-bottom: 1em;
//     .detail-group {
//       color: #e2e8f0;
//       font-weight: 500;
//     }
//   }
// }
.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #59c9a5;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-top: 8px;
  transition: opacity 0.2s;
  &:hover {
    opacity: 0.8;
  }
}
</style>
