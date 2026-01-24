<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Linkedin, Globe, Github, Phone, Mail } from 'lucide-vue-next'

// Types
interface PersonalInfo {
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  state: string
  zip: string
  linkedin?: string
  website: string
  github?: string
  resumeFile?: string
  education: Education[]
}

interface Education {
  id: number
  schoolName: string
  degreeType: string
  major: string
  graduationYear: string
  gpa?: string
}

interface SavedResponse {
  id: number
  title: string
  text: string
  tags: string[]
  createdAt: string
}

// State
const activeView = ref<'main' | 'success'>('main')
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
})

const savedResponses = ref<SavedResponse[]>([])
const autoDetectEnabled = ref(true)
const fieldsDetected = ref(0)
const platformDetected = ref('LINKEDIN')
const showMissingField = ref(false)

const notification = ref({
  show: false,
  message: '',
  type: 'success' as 'success' | 'error',
})

// Computed
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

// Methods
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

const loadSavedResponses = async () => {
  const data = await chrome.storage.local.get('savedResponses')
  if (data.savedResponses) {
    savedResponses.value = data.savedResponses
  }
}

const addEducation = () => {
  editableProfile.value.education.push({
    id: Date.now(),
    schoolName: '',
    degreeType: '',
    major: '',
    graduationYear: '',
    gpa: '',
  })
}

const removeEducation = (index: number) => {
  editableProfile.value.education = editableProfile.value.education.filter((_, i) => i !== index)
}

const savePersonalInfo = async () => {
  await chrome.storage.local.set({ personalInfo: personalInfo.value })
  showNotification('Profile updated!')
}

const autofillCurrentPage = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

  chrome.tabs.sendMessage(tab.id!, { action: 'autofill' }, (response) => {
    if (chrome.runtime.lastError) {
      showNotification('Unable to autofill this page', 'error')
      return
    }

    if (response && response.success) {
      fieldsDetected.value = response.fieldsCount
      activeView.value = 'success'
      setTimeout(() => {
        activeView.value = 'main'
      }, 3000)
    } else {
      showNotification('No available fields found to autofill', 'error')
    }
  })
}

const detectCurrentPlatform = () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.url) {
      const url = tabs[0].url.toLowerCase()
      if (url.includes('linkedin')) platformDetected.value = 'LINKEDIN'
      else if (url.includes('workday')) platformDetected.value = 'WORKDAY ACTIVE'
      else if (url.includes('greenhouse')) platformDetected.value = 'GREENHOUSE'
      else if (url.includes('lever')) platformDetected.value = 'LEVER'
      else platformDetected.value = 'DETECTED'

      // Random fields detected for demo
      fieldsDetected.value = Math.floor(Math.random() * 8) + 3
    }
  })
}

const openSettings = () => {
  // Could open a full settings page or show inline
  showNotification('Settings coming soon!')
}

const addPortfolioLink = () => {
  const link = prompt('Enter your portfolio URL:')
  if (link) {
    personalInfo.value.website = link
    savePersonalInfo()
    showMissingField.value = false
  }
}

const replaceResume = () => {
  showNotification('Resume upload coming soon!')
}

const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
  notification.value = { show: true, message, type }
  setTimeout(() => {
    notification.value.show = false
  }, 10000)
}

const showEditProfileDialog = ref(false)
const editableProfile = ref<PersonalInfo>({
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
})

const editProfile = () => {
  const educationArray = Object.values(personalInfo.value.education)

  editableProfile.value = {
    ...personalInfo.value,
    education: educationArray,
  }
  showEditProfileDialog.value = true
}

const saveProfileFromDialog = async () => {
  personalInfo.value = { ...editableProfile.value }
  await chrome.storage.local.set({ personalInfo: personalInfo.value })
  showEditProfileDialog.value = false
  showNotification('Profile updated!')
}

// Check for missing fields
const checkMissingFields = () => {
  showMissingField.value = !personalInfo.value.website
}

const showQuestionsDialog = ref(false)
const newResponse = ref({
  title: '',
  text: '',
  tags: '',
})

const showCreateResponseForm = ref(false)

const addResponseFromDialog = async () => {
  if (!newResponse.value.title.trim() || !newResponse.value.text.trim()) {
    showNotification('Please fill in title and response', 'error')
    return
  }

  const response: SavedResponse = {
    id: Date.now(),
    title: newResponse.value.title.trim(),
    text: newResponse.value.text.trim(),
    tags: newResponse.value.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t),
    createdAt: new Date().toISOString(),
  }

  savedResponses.value.push(response)
  await chrome.storage.local.set({
    savedResponses: JSON.parse(JSON.stringify(savedResponses.value)),
  })

  // Clear form
  newResponse.value = { title: '', text: '', tags: '' }
  showCreateResponseForm.value = false

  showNotification('Response saved!')
}

const deleteSavedResponse = async (responseId: number) => {
  savedResponses.value = savedResponses.value.filter((r) => r.id !== responseId)
  await chrome.storage.local.set({
    savedResponses: JSON.parse(JSON.stringify(savedResponses.value)),
  })
  showNotification('Response deleted!')
}

const closeDialog = () => {
  showQuestionsDialog.value = false
  showCreateResponseForm.value = false
  // Clear form when closing
  newResponse.value = { title: '', text: '', tags: '' }
}

// Lifecycle
onMounted(async () => {
  await loadPersonalInfo()
  await loadSavedResponses()
  detectCurrentPlatform()
  checkMissingFields()
})
</script>

<template>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#4F7CFF" opacity="0.4" />
        </svg>
        <h1>RapidApply</h1>
      </div>
      <div class="header-actions">
        <span class="platform-badge">{{ platformDetected }}</span>
        <button class="icon-btn" @click="openSettings">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path
              d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z"
            />
          </svg>
        </button>
      </div>
    </header>

    <!-- Main View -->
    <div v-if="activeView === 'main'" class="content">
      <!-- Switch -->
      <div class="switch-container">
        <div class="auto-detect">
          <span>Auto-detect</span>
          <button
            class="toggle-btn"
            :class="{ active: autoDetectEnabled }"
            @click="autoDetectEnabled = !autoDetectEnabled"
          >
            <span class="toggle-slider"></span>
          </button>
        </div>
      </div>
      <!-- Profile Card -->
      <div class="section">
        <h3 class="section-title">PROFILE</h3>
        <div class="profile-card">
          <div class="profile-info">
            <div>
              <h2 class="profile-name">{{ fullName }}</h2>
              <div class="profile-details">
                <div class="primary-details">
                  <div class="detail-group" v-if="displayEmail">
                    <Mail :size="14" />
                    <p class="">{{ displayEmail }}</p>
                  </div>
                  <div class="detail-group" v-if="displayPhone">
                    <Phone :size="14" />
                    <p class="">{{ displayPhone }}</p>
                  </div>
                </div>
                <!-- <div class="detail-group" v-if="displayLinkedin">
                  <Linkedin :size="14" />
                  <p class="">{{ displayLinkedin }}</p>
                </div>
                <div class="detail-group" v-if="displayWebsite">
                  <Globe :size="14" />
                  <p class="">{{ displayWebsite }}</p>
                </div>
                <div class="detail-group" v-if="displayGithub">
                  <Github :size="14" />
                  <p class="">{{ displayGithub }}</p>
                </div> -->
              </div>
              <button class="edit-btn" @click="editProfile">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path
                    d="M0 11.083V14h2.917l8.6-8.6-2.917-2.917-8.6 8.6zM13.733 2.483a.774.774 0 000-1.096L12.613.267a.774.774 0 00-1.096 0l-.88.88 2.917 2.916.88-.88z"
                  />
                </svg>
                Edit Profile
              </button>
              <!-- Edit Profile Dialog Overlay -->
              <Transition name="dialog">
                <div
                  v-if="showEditProfileDialog"
                  class="dialog-overlay"
                  @click.self="showEditProfileDialog = false"
                >
                  <div class="dialog">
                    <div class="dialog-header">
                      <h2>Edit Profile</h2>
                      <button class="close-btn" @click="showEditProfileDialog = false">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fill-rule="evenodd"
                            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      </button>
                    </div>

                    <div class="dialog-content">
                      <form @submit.prevent="saveProfileFromDialog" class="edit-profile-form">
                        <div class="form-section">
                          <h3>Basic Information</h3>
                          <div class="form-row">
                            <div class="form-group">
                              <label for="editFirstName">First Name</label>
                              <input
                                type="text"
                                id="editFirstName"
                                v-model="editableProfile.firstName"
                                placeholder="John"
                              />
                            </div>
                            <div class="form-group">
                              <label for="editLastName">Last Name</label>
                              <input
                                type="text"
                                id="editLastName"
                                v-model="editableProfile.lastName"
                                placeholder="Doe"
                              />
                            </div>
                          </div>

                          <div class="form-group">
                            <label for="editEmail">Email</label>
                            <input
                              type="email"
                              id="editEmail"
                              v-model="editableProfile.email"
                              placeholder="john@example.com"
                            />
                          </div>

                          <div class="form-group">
                            <label for="editPhone">Phone</label>
                            <input
                              type="tel"
                              id="editPhone"
                              v-model="editableProfile.phone"
                              placeholder="(555) 123-4567"
                            />
                          </div>
                        </div>

                        <div class="form-section">
                          <h3>Address</h3>
                          <div class="form-group">
                            <label for="editAddress">Street Address</label>
                            <input
                              type="text"
                              id="editAddress"
                              v-model="editableProfile.address"
                              placeholder="123 Main St"
                            />
                          </div>

                          <div class="form-row">
                            <div class="form-group">
                              <label for="editCity">City</label>
                              <input
                                type="text"
                                id="editCity"
                                v-model="editableProfile.city"
                                placeholder="New York"
                              />
                            </div>
                            <div class="form-group form-group-small">
                              <label for="editState">State</label>
                              <input
                                type="text"
                                id="editState"
                                v-model="editableProfile.state"
                                placeholder="NY"
                              />
                            </div>
                            <div class="form-group form-group-small">
                              <label for="editZip">ZIP</label>
                              <input
                                type="text"
                                id="editZip"
                                v-model="editableProfile.zip"
                                placeholder="10001"
                              />
                            </div>
                          </div>
                        </div>

                        <div class="form-section">
                          <div class="section-header">
                            <h3>Education</h3>
                            <button type="button" class="btn-add-small" @click="addEducation">
                              + Add School
                            </button>
                          </div>

                          <div
                            v-if="editableProfile.education.length === 0"
                            class="empty-education"
                          >
                            <p>No education added yet. Click "+ Add School" to get started.</p>
                          </div>

                          <div
                            v-for="(edu, index) in editableProfile.education"
                            :key="edu.id"
                            class="education-item"
                          >
                            <div class="education-header">
                              <span class="education-number">School {{ index + 1 }}</span>
                              <button
                                type="button"
                                class="btn-remove-small"
                                @click="removeEducation(index)"
                              >
                                Remove
                              </button>
                            </div>

                            <div class="form-group">
                              <label :for="'schoolName' + index">School Name</label>
                              <input
                                type="text"
                                :id="'schoolName' + index"
                                v-model="edu.schoolName"
                                placeholder="University of Example"
                              />
                            </div>

                            <div class="form-row">
                              <div class="form-group">
                                <label :for="'degreeType' + index">Degree Type</label>
                                <select :id="'degreeType' + index" v-model="edu.degreeType">
                                  <option value="">Select degree...</option>
                                  <option value="High School Diploma">High School Diploma</option>
                                  <option value="Associate's">Associate's</option>
                                  <option value="Bachelor's">Bachelor's</option>
                                  <option value="Master's">Master's</option>
                                  <option value="PhD">PhD</option>
                                  <option value="Certificate">Certificate</option>
                                  <option value="Bootcamp">Bootcamp</option>
                                </select>
                              </div>

                              <div class="form-group">
                                <label :for="'major' + index">Major/Field of Study</label>
                                <input
                                  type="text"
                                  :id="'major' + index"
                                  v-model="edu.major"
                                  placeholder="Computer Science"
                                />
                              </div>
                            </div>

                            <div class="form-row">
                              <div class="form-group">
                                <label :for="'gradYear' + index">Graduation Year</label>
                                <input
                                  type="text"
                                  :id="'gradYear' + index"
                                  v-model="edu.graduationYear"
                                  placeholder="2024"
                                />
                              </div>

                              <div class="form-group">
                                <label :for="'gpa' + index">GPA (optional)</label>
                                <input
                                  type="text"
                                  :id="'gpa' + index"
                                  v-model="edu.gpa"
                                  placeholder="3.8"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div class="form-section">
                          <h3>Social & Portfolio</h3>
                          <div class="form-group">
                            <label for="editLinkedin">LinkedIn URL</label>
                            <input
                              type="url"
                              id="editLinkedin"
                              v-model="editableProfile.linkedin"
                              placeholder="https://linkedin.com/in/johndoe"
                            />
                          </div>

                          <div class="form-group">
                            <label for="editWebsite">Portfolio/Website</label>
                            <input
                              type="url"
                              id="editWebsite"
                              v-model="editableProfile.website"
                              placeholder="https://johndoe.com"
                            />
                          </div>

                          <div class="form-group">
                            <label for="editGithub">GitHub URL</label>
                            <input
                              type="url"
                              id="editGithub"
                              v-model="editableProfile.github"
                              placeholder="https://github.com/johndoe"
                            />
                          </div>
                        </div>
                      </form>
                    </div>

                    <div class="dialog-footer">
                      <button class="btn-secondary-dialog" @click="showEditProfileDialog = false">
                        Cancel
                      </button>
                      <button class="btn-primary-dialog" @click="saveProfileFromDialog">
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="profile-avatar">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="#2D3748" />
                <circle cx="24" cy="20" r="8" fill="#4F7CFF" />
                <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" fill="#4F7CFF" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Resume Section -->
      <div class="section">
        <h3 class="section-title">RESUME</h3>
        <div class="resume-item">
          <div class="file-info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#4F7CFF">
              <path
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              />
            </svg>
            <span>John_Doc_CV.pdf</span>
          </div>
          <button class="replace-btn" @click="replaceResume">Replace</button>
        </div>
      </div>

      <!-- Saved Responses Section -->
      <div class="section">
        <h3 class="section-title">SAVED RESPONSES</h3>
        <div class="questions-item">
          <div class="questions-info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#4F7CFF">
              <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
              <path
                fill-rule="evenodd"
                d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                clip-rule="evenodd"
              />
            </svg>
            <span>
              {{ savedResponses.length }} saved response{{ savedResponses.length !== 1 ? 's' : '' }}
            </span>
          </div>
          <button class="view-btn" @click="showQuestionsDialog = true">View Responses</button>
        </div>
      </div>

      <!-- Questions Dialog Overlay -->
      <Transition name="dialog">
        <div
          v-if="showQuestionsDialog"
          class="dialog-overlay"
          @click.self="showQuestionsDialog = false"
        >
          <div class="dialog">
            <div class="dialog-header">
              <h2>Saved Responses</h2>
              <button class="close-btn" @click="showQuestionsDialog = false">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>

            <div class="dialog-content">
              <!-- Create New Response Form -->
              <div v-if="showCreateResponseForm" class="create-response-form">
                <h3>Create New Response</h3>
                <form @submit.prevent="addResponseFromDialog">
                  <div class="form-group">
                    <label for="dialogResponseTitle">Question/Title</label>
                    <input
                      type="text"
                      id="dialogResponseTitle"
                      v-model="newResponse.title"
                      placeholder="e.g., Why do you want this job?"
                    />
                  </div>
                  <div class="form-group">
                    <label for="dialogResponseText">Your Response</label>
                    <textarea
                      id="dialogResponseText"
                      v-model="newResponse.text"
                      rows="4"
                      placeholder="Enter your response..."
                    ></textarea>
                  </div>
                  <div class="form-group">
                    <label for="dialogResponseTags">Tags (comma-separated)</label>
                    <input
                      type="text"
                      id="dialogResponseTags"
                      v-model="newResponse.tags"
                      placeholder="e.g., motivation, culture-fit"
                    />
                  </div>
                  <div class="form-actions">
                    <button
                      type="button"
                      class="btn-cancel"
                      @click="showCreateResponseForm = false"
                    >
                      Cancel
                    </button>
                    <button type="submit" class="btn-save">Save Response</button>
                  </div>
                </form>
              </div>

              <!-- Responses List -->
              <div v-else>
                <div v-if="savedResponses.length === 0" class="empty-state">
                  <p>No saved responses yet.</p>
                  <p class="hint">
                    Responses are automatically saved when you submit job applications.
                  </p>
                </div>

                <div v-else class="responses-list">
                  <div v-for="response in savedResponses" :key="response.id" class="response-item">
                    <div class="response-header">
                      <h4>{{ response.title }}</h4>
                      <button
                        class="delete-btn"
                        title="Delete response"
                        @click="deleteSavedResponse(response.id)"
                      >
                        ×
                      </button>
                    </div>
                    <p class="response-text">{{ response.text }}</p>
                    <div v-if="response.tags.length > 0" class="response-tags">
                      <span v-for="tag in response.tags" :key="tag" class="tag">
                        {{ tag }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="dialog-footer">
              <button
                v-if="!showCreateResponseForm"
                class="btn-primary-dialog"
                @click="showCreateResponseForm = true"
              >
                + Create New Response
              </button>
              <button class="btn-secondary-dialog" @click="closeDialog">Close</button>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Success View -->
    <div v-if="activeView === 'success'" class="success-view">
      <div class="success-card">
        <div class="success-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="#10B981" />
            <path
              d="M18 24l6 6 12-12"
              stroke="white"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <h2 class="success-title">Form Successfully Filled</h2>
        <p class="success-message">
          Automation engine successfully identified and populated {{ fieldsDetected }} fields on
          {{ platformDetected }}.
        </p>
      </div>

      <div class="success-info">
        <h3>CANDIDATE PROFILE</h3>
        <div class="info-field">
          <label>FULL NAME</label>
          <div class="info-value">{{ fullName }}</div>
        </div>
        <div class="info-field">
          <label>EMAIL ADDRESS</label>
          <div class="info-value">{{ displayEmail }}</div>
        </div>
        <div class="info-field">
          <label>LINKEDIN URL</label>
          <div class="info-value">{{ personalInfo.linkedin || 'linkedin.com/in/johndoe-ux' }}</div>
        </div>
      </div>

      <div class="success-info">
        <h3>DOCUMENTS</h3>
        <div class="document-item">
          <div class="doc-info">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="#4F7CFF">
              <path
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              />
            </svg>
            <div>
              <div class="doc-name">John_Doe_Resume_2024.pdf</div>
              <div class="doc-status">Ready for auto-upload</div>
            </div>
          </div>
          <button class="remove-btn">×</button>
        </div>
      </div>

      <button class="success-btn" @click="activeView = 'main'">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          />
        </svg>
        Auto-fill Successful
      </button>
    </div>

    <!-- Footer -->

    <div class="autofill-bttn-container">
      <button class="autofill-btn" @click="autofillCurrentPage">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"
          />
        </svg>
        Auto-fill Current Page
      </button>
    </div>

    <footer class="footer">
      <button class="footer-link">Support</button>
      <button class="footer-link">Documentation</button>
      <span class="version">v1.0.0</span>
    </footer>

    <!-- Notification -->
    <Transition name="notification">
      <div v-if="notification.show" :class="['notification', notification.type]">
        {{ notification.message }}
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
* {
  box-sizing: border-box;
}

.container {
  width: 400px;
  background: #1a202c;
  color: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
  //   min-height: 600px;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #2d3748;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand h1 {
  font-size: 18px;
  font-weight: 700;
  color: #f7fafc;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.platform-badge {
  padding: 4px 12px;
  background: #10b981;
  color: white;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.icon-btn {
  background: none;
  border: none;
  color: #a0aec0;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.icon-btn:hover {
  color: #e2e8f0;
}

/* Content */
.content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* Switch */
.switch-container {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
  .auto-detect {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #a0aec0;
  }
}

/* Profile Card */
.profile-card {
  background: #2d3748;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.profile-info {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.profile-name {
  font-size: 18px;
  font-weight: 600;
  color: #f7fafc;
  margin: 0 0 4px 0;
}

.profile-email,
.profile-phone {
  font-size: 13px;
  color: #a0aec0;
  margin: 2px 0;
}
.profile-details {
  margin-top: 8px;
  margin-bottom: 1em;
  .detail-group {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    color: #a0aec0;
    font-size: 13px;
    * {
      margin-right: 2px;
    }
  }
  .primary-details {
    margin-bottom: 1em;
    .detail-group {
      color: #e2e8f0;
      font-weight: 500;
    }
  }
}

.edit-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-top: 8px;
  transition: opacity 0.2s;
}

.edit-btn:hover {
  opacity: 0.8;
}

.profile-avatar {
  flex-shrink: 0;
}

.toggle-btn {
  width: 40px;
  height: 24px;
  background: #4a5568;
  border: none;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-btn.active {
  background: #4f7cff;
}

.toggle-slider {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-btn.active .toggle-slider {
  transform: translateX(16px);
}

/* Section */
.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #a0aec0;
  margin: 0 0 12px 0;
}

.resume-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-radius: 8px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #e2e8f0;
}

.replace-btn {
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

/* Missing Field */
.missing-field {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.05) 100%);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 20px;
}

.missing-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.missing-text {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #f59e0b;
}

.missing-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #e2e8f0;
  font-size: 14px;
}

.add-now-btn {
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

/* Success View */
.success-view {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.success-card {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.05) 100%);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  margin-bottom: 24px;
}

.success-icon {
  margin: 0 auto 16px;
  width: 48px;
  height: 48px;
}

.success-title {
  font-size: 18px;
  font-weight: 600;
  color: #f7fafc;
  margin: 0 0 8px 0;
}

.success-message {
  font-size: 13px;
  color: #a0aec0;
  line-height: 1.5;
  margin: 0;
}

.success-info {
  margin-bottom: 20px;
}

.success-info h3 {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #a0aec0;
  margin: 0 0 12px 0;
}

.info-field {
  margin-bottom: 16px;
}

.info-field label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #4f7cff;
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.info-value {
  background: #2d3748;
  padding: 12px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: #e2e8f0;
}

.document-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #2d3748;
  border: 2px dashed #4a5568;
  border-radius: 8px;
}

.doc-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.doc-name {
  font-size: 14px;
  color: #e2e8f0;
  font-weight: 500;
}

.doc-status {
  font-size: 12px;
  color: #a0aec0;
}

.remove-btn {
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  line-height: 20px;
}

.success-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: #10b981;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 20px;
  transition: all 0.2s;
}

.success-btn:hover {
  background: #059669;
}

/* Footer */

/* Autofill Button */
.autofill-bttn-container {
  padding: 0 20px;
  margin-bottom: 12px;
  .autofill-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    background: #4f7cff;
    color: white;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    margin-bottom: 16px;
    transition: all 0.2s;
    &:hover {
      background: #4169e1;
      transform: translateY(-1px);
      box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
    }
  }
}

.footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-top: 1px solid #2d3748;
}

.footer-link {
  background: none;
  border: none;
  color: #a0aec0;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.footer-link:hover {
  color: #e2e8f0;
}

.version {
  margin-left: auto;
  font-size: 12px;
  color: #4a5568;
}

.share-btn {
  width: calc(100% - 40px);
  margin: 0 20px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: #2d3748;
  color: #e2e8f0;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.share-btn:hover {
  background: #4a5568;
}

/* Notification */
.notification {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: #10b981;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.notification.error {
  background: #ef4444;
}

.notification-enter-active,
.notification-leave-active {
  transition: all 0.3s ease;
}

.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}

/* Questions Item */
.questions-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-radius: 8px;
}

.questions-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #e2e8f0;
}

.view-btn {
  background: none;
  border: none;
  color: #4f7cff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.view-btn:hover {
  opacity: 0.8;
}

/* Dialog Overlay */
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
  background: #1a202c;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
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
}

.dialog-header h2 {
  font-size: 18px;
  font-weight: 600;
  color: #f7fafc;
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
}

.close-btn:hover {
  color: #e2e8f0;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid #2d3748;
  display: flex;
  justify-content: flex-end;
}

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

/* Empty State in Dialog */
.dialog-content .empty-state {
  text-align: center;
  padding: 40px 20px;
}

.dialog-content .empty-state p {
  color: #a0aec0;
  font-size: 14px;
  margin: 8px 0;
}

.dialog-content .empty-state .hint {
  font-size: 13px;
  color: #718096;
}

/* Responses List in Dialog */
.responses-list .response-item {
  background: #2d3748;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid #4a5568;
  .response-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    h4 {
      font-size: 16px;
      font-weight: 600;
      color: #f7fafc;
      margin: 0;
    }
    .delete-btn {
      background: none;
      border: none;
      color: #e53e3e;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      line-height: 16px;
      transition: color 0.2s;
      &:hover {
        color: #c53030;
      }
    }
  }
  .response-text {
    font-size: 14px;
    color: #e2e8f0;
    margin: 0 0 8px 0;
  }
  .response-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    .tag {
      background: #4a5568;
      color: #e2e8f0;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }
  }
}

/* Dialog Transitions */
.dialog-enter-active,
.dialog-leave-active {
  transition: all 0.3s ease;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog,
.dialog-leave-to .dialog {
  transform: scale(0.9) translateY(20px);
}

.dialog-enter-active .dialog,
.dialog-leave-active .dialog {
  transition: all 0.3s ease;
}

/* Create Response Form */
.create-response-form {
  background: #2d3748;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.create-response-form h3 {
  font-size: 16px;
  font-weight: 600;
  color: #f7fafc;
  margin: 0 0 16px 0;
}

.create-response-form .form-group {
  margin-bottom: 16px;
}

.create-response-form label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.create-response-form input[type='text'],
.create-response-form textarea {
  width: 100%;
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
}

.create-response-form input:focus,
.create-response-form textarea:focus {
  outline: none;
  border-color: #4f7cff;
}

.create-response-form textarea {
  resize: vertical;
  min-height: 80px;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 16px;
}

.btn-cancel {
  padding: 10px 20px;
  background: #2d3748;
  color: #e2e8f0;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-cancel:hover {
  background: #4a5568;
}

.btn-save {
  padding: 10px 20px;
  background: #4f7cff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-save:hover {
  background: #4169e1;
}

.btn-primary-dialog {
  padding: 10px 20px;
  background: #4f7cff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  margin-right: auto;
}

.btn-primary-dialog:hover {
  background: #4169e1;
}

.dialog-footer {
  display: flex;
  gap: 10px;
}

/* Edit Profile Form */
.edit-profile-form {
  width: 100%;
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
  color: #f7fafc;
  margin: 0 0 16px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-row .form-group-small {
  grid-column: span 1;
}

.edit-profile-form .form-group {
  margin-bottom: 16px;
}

.edit-profile-form label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
  color: #e2e8f0;
}

.edit-profile-form input[type='text'],
.edit-profile-form input[type='email'],
.edit-profile-form input[type='tel'],
.edit-profile-form input[type='url'] {
  width: 100%;
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  transition: border-color 0.2s;
}

.edit-profile-form input:focus {
  outline: none;
  border-color: #4f7cff;
}

.edit-profile-form input::placeholder {
  color: #718096;
}

/* Make dialog wider for the form */
.dialog-overlay:has(.edit-profile-form) .dialog {
  max-width: 550px;
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
  background: #4f7cff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-add-small:hover {
  background: #4169e1;
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
  color: #4f7cff;
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

/* Select dropdown styling */
.edit-profile-form select {
  width: 100%;
  padding: 10px 12px;
  background: #1a202c;
  border: 1px solid #4a5568;
  border-radius: 6px;
  font-size: 14px;
  color: #e2e8f0;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.2s;
}

.edit-profile-form select:focus {
  outline: none;
  border-color: #4f7cff;
}

.edit-profile-form select option {
  background: #1a202c;
  color: #e2e8f0;
}
</style>
