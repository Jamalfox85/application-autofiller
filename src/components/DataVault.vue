<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useNotification } from '../composables/useNotification'
import UpdatePersonalInfoDialog from './dialogs/UpdatePersonalInfoDialog.vue'
import UpdateSocialProfilesDialog from './dialogs/UpdateSocialProfilesDialog.vue'
import UpdateResumeDialog from './dialogs/UpdateResumeDialog.vue'
import UpdateEducationDialog from './dialogs/UpdateEducationDialog.vue'
import UpdateExperienceDialog from './dialogs/UpdateExperienceDialog.vue'
import UpdateSkillsDialog from './dialogs/UpdateSkillsDialog.vue'
import UpdateEEODialog from './dialogs/UpdateEEODialog.vue'
import UpdateOtherInfoDialog from './dialogs/UpdateOtherInfoDialog.vue'
import type { PersonalInfo } from '../types/index.ts'
import {
  coloredIcon,
  ICON_USER,
  ICON_EDIT,
  ICON_SOCIAL_LINKS,
  ICON_LINK,
  ICON_RESUME,
  ICON_FOLDER,
  ICON_EDUCATION,
  ICON_BOOK,
  ICON_EXPERIENCE,
  ICON_BUILDING,
  ICON_STARS,
  ICON_HAND_SPARKLES,
  ICON_EEO,
  ICON_INFO,
  ICON_OTHER_DETAILS,
  ICON_PEN_RULER,
} from '@/utils/icons'

const props = defineProps<{
  personalInfo: PersonalInfo
  showSetupProfileModal: boolean
}>()
const emit = defineEmits<{
  save: [profile: PersonalInfo]
}>()

const { notification, showNotification } = useNotification()

const dialogs: Record<string, any> = {
  personalInfo: ref(false),
  socialProfiles: ref(false),
  resume: ref(false),
  education: ref(false),
  experience: ref(false),
  skills: ref(false),
  eeoInfo: ref(false),
  otherDetails: ref(false),
}

const openDialog = (key: string) => {
  if (dialogs[key]) {
    if (key == 'resume') {
      showNotification('Resume management is coming soon!', 'info')
      return
    }
    dialogs[key].value = true
  }
}

const closeDialog = (key: string) => {
  if (dialogs[key]) {
    dialogs[key].value = false
  }
}

const handleSave = (profile: any) => {
  emit('save', profile)
  showNotification('Information updated successfully', 'success')
}

const infoCards = [
  {
    title: 'Personal Info',
    description: 'Name, Email, Phone, Address',
    color: '#3B82F6',
    icon: ICON_USER,
    actionIcon: ICON_EDIT,
    dialog: 'personalInfo',
  },
  {
    title: 'Social Profiles',
    description: 'LinkedIn, Portfolio, Github',
    color: '#3B82F6',
    // color: '#F59E0B',
    icon: ICON_SOCIAL_LINKS,
    actionIcon: ICON_LINK,
    dialog: 'socialProfiles',
  },
  {
    title: 'Resume',
    description: 'Upload your latest resume',
    color: '#3B82F6',
    // color: '#22C55E',
    icon: ICON_RESUME,
    actionIcon: ICON_FOLDER,
    dialog: 'resume',
  },
  {
    title: 'Education',
    description: 'Degree, School, Graduation Year',
    color: '#3B82F6',
    // color: '#C084FC',
    icon: ICON_EDUCATION,
    actionIcon: ICON_BOOK,
    dialog: 'education',
  },
  {
    title: 'Experience',
    description: 'Previous jobs and roles',
    color: '#3B82F6',
    icon: ICON_EXPERIENCE,
    actionIcon: ICON_BUILDING,
    dialog: 'experience',
  },
  {
    title: 'Skills',
    description: 'List your key skills',
    color: '#3B82F6',
    // color: '#F59E0B',
    icon: ICON_STARS,
    actionIcon: ICON_HAND_SPARKLES,
    dialog: 'skills',
  },
  {
    title: 'EEO Info',
    description: 'Race, Gender, Veteran Status',
    color: '#3B82F6',
    // color: '#22C55E',
    icon: ICON_EEO,
    actionIcon: ICON_INFO,
    dialog: 'eeoInfo',
  },
  {
    title: 'Other Details',
    description: 'Salary, Work Authorization, etc.',
    color: '#3B82F6',
    // color: '#C084FC',
    icon: ICON_OTHER_DETAILS,
    actionIcon: ICON_PEN_RULER,
    dialog: 'otherDetails',
  },
]

onMounted(() => {
  if (props.showSetupProfileModal) {
    openDialog('personalInfo')
  }
})
</script>
<template>
  <div
    class="info-card"
    v-for="card in infoCards"
    @click="openDialog(card.dialog)"
    :key="card.title"
  >
    <div class="card-icon" :style="{ background: `${card.color}25` }">
      <span v-html="coloredIcon(card.icon, card.color)" alt="User Icon" class="icon" />
    </div>
    <div class="card-content">
      <h3 class="card-title">{{ card.title }}</h3>
      <p class="card-description">{{ card.description }}</p>
    </div>
    <div class="card-icon-2">
      <span v-html="card.actionIcon" alt="Edit Icon" class="icon" />
    </div>
  </div>
  <UpdatePersonalInfoDialog
    :show="dialogs.personalInfo.value"
    :personalInfo="personalInfo"
    @close="closeDialog('personalInfo')"
    @save="handleSave"
  />
  <UpdateSocialProfilesDialog
    :show="dialogs.socialProfiles.value"
    :personalInfo="personalInfo"
    @close="closeDialog('socialProfiles')"
    @save="handleSave"
  />
  <UpdateResumeDialog
    :show="dialogs.resume.value"
    :personalInfo="personalInfo"
    @close="closeDialog('resume')"
    @save="handleSave"
  />
  <UpdateEducationDialog
    :show="dialogs.education.value"
    :personalInfo="personalInfo"
    @close="closeDialog('education')"
    @save="handleSave"
  />
  <UpdateExperienceDialog
    :show="dialogs.experience.value"
    :personalInfo="personalInfo"
    @close="closeDialog('experience')"
    @save="handleSave"
  />
  <UpdateSkillsDialog
    :show="dialogs.skills.value"
    :personalInfo="personalInfo"
    @close="closeDialog('skills')"
    @save="handleSave"
  />
  <UpdateEEODialog
    :show="dialogs.eeoInfo.value"
    :personalInfo="personalInfo"
    @close="closeDialog('eeoInfo')"
    @save="handleSave"
  />
  <UpdateOtherInfoDialog
    :show="dialogs.otherDetails.value"
    :personalInfo="personalInfo"
    @close="closeDialog('otherDetails')"
    @save="handleSave"
  />
  <!-- Notification -->
  <Transition name="notification">
    <div v-if="notification.show" :class="['notification', notification.type]">
      {{ notification.message }}
    </div>
  </Transition>
</template>
<style lang="scss">
.info-card {
  display: flex;
  align-items: center;
  background: #1c2128;
  border: 0.5px solid #30363d;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 12px;
  cursor: pointer;
  &:hover {
    transform: translateY(-1px);
  }
}
.card-icon {
  width: 40px;
  height: 40px;
  background: #0d1117;
  border: 0.5px solid #30363d;
  border-radius: 8px;
  margin-right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #f0f6fc;
  margin-bottom: 4px;
}
.card-description {
  color: #8b949e;
}
.card-icon-2 {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

// Modal Styles
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.dialog {
  background: #1c2128;
  border: 0.5px solid #30363d;
  border-radius: 12px;
  width: 100%;
  max-width: 550px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
  flex-shrink: 0; /* Don't let header shrink */
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
  flex-shrink: 0; /* Don't let close button shrink */
}

.close-btn:hover {
  color: #e2e8f0;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  min-height: 0; /* Important for flex overflow */
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #2d3748;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0; /* Don't let footer shrink */
}

/* Form Styles */
.edit-profile-form {
  width: 100%;
  max-width: 100%; /* Prevent overflow */
}

.form-section {
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #4a5568;
}

.form-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.form-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #f0f6fc;
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%; /* Explicit width */
}

.form-group {
  margin-bottom: 16px;
  min-width: 0; /* Allow grid items to shrink */
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.form-group input[type='text'],
.form-group input[type='number'],
.form-group input[type='email'],
.form-group input[type='tel'],
.form-group input[type='url'],
.form-group input[type='password'],
.form-group select {
  width: 100%;
  max-width: 100%; /* Prevent overflow */
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box; /* Critical! */
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #4f7cff;
}

.form-group input::placeholder {
  color: #718096;
}

.form-group select {
  cursor: pointer;
}

.form-group select option {
  background: #1a202c;
  color: #e2e8f0;
}

/* Education Section */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
}

.btn-add-small {
  padding: 6px 12px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-small:hover {
  background: #3baef6;
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.empty-education {
  text-align: center;
  padding: 24px;
  background: #2d3748;
  border-radius: 8px;
  border: 2px dashed #4a5568;
}

.empty-education p {
  color: #a0aec0;
  font-size: 13px;
  margin: 0;
}

.education-item {
  background: #2d3748;
  border: 1px solid #4a5568;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.education-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #4a5568;
}

.education-number {
  font-size: 13px;
  font-weight: 600;
  color: #3b82f6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.btn-remove-small {
  padding: 4px 10px;
  background: none;
  color: #ef4444;
  border: 1px solid #ef4444;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-remove-small:hover {
  background: #ef4444;
  color: white;
}

/* Footer Buttons */
.btn-secondary-dialog {
  padding: 10px 20px;
  background: #2d3748;
  color: #e2e8f0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-secondary-dialog:hover {
  background: #4a5568;
}

.btn-primary-dialog {
  padding: 10px 20px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary-dialog:hover {
  background: #3baef6;
  box-shadow: 0 4px 8px rgba(59, 130, 246, 0.3);
}

.section-note {
  font-size: 12px;
  color: #a0aec0;
  margin: 0 0 16px 0;
  font-style: italic;
  line-height: 1.4;
}

.form-group textarea {
  width: 100%;
  max-width: 100%;
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
  box-sizing: border-box;
  resize: vertical;
  min-height: 80px;
}

.form-group textarea:focus {
  outline: none;
  border-color: #4f7cff;
}

.form-group textarea::placeholder {
  color: #718096;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: #e2e8f0;
}

.checkbox-label input[type='checkbox'] {
  width: auto;
  cursor: pointer;
}

.checkbox-label span {
  user-select: none;
}

/* Tags styling */
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
  min-height: 32px;
}

/* Override Naive UI NTag styles */
:deep(.n-tag) {
  background: #4a5568 !important;
  color: #e2e8f0 !important;
  border: none !important;
  padding: 4px 10px !important;
  border-radius: 12px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
}

:deep(.n-tag .n-tag__close) {
  color: #e2e8f0 !important;
  margin-left: 6px !important;
}

:deep(.n-tag .n-tag__close:hover) {
  color: #ef4444 !important;
}

/* Override Naive UI NInput styles */
:deep(.n-input) {
  background: #1a202c !important;
  border: 1px solid #4a5568 !important;
  border-radius: 6px !important;
}

:deep(.n-input__input-el) {
  padding: 10px 12px !important;
  background: transparent !important;
  color: #e2e8f0 !important;
  font-size: 14px !important;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif !important;
}

:deep(.n-input__input-el::placeholder) {
  color: #718096 !important;
}

:deep(.n-input:hover) {
  border-color: #4a5568 !important;
}

:deep(.n-input.n-input--focus) {
  border-color: #4f7cff !important;
  box-shadow: none !important;
}

:deep(.n-input__state-border) {
  display: none !important;
}

/* Remove default Naive UI box shadow */
:deep(.n-input__border),
:deep(.n-input__state-border) {
  border: none !important;
  box-shadow: none !important;
}
</style>
