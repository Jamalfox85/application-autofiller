<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PersonalInfo } from '../../types'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  save: [profile: PersonalInfo]
}>()

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
  gender: '',
  raceEthnicity: '',
  disabilityStatus: '',
  veteranStatus: '',
  age18OrOlder: '',
  desiredSalary: 0,
  workAuthorization: '',
  accountPassword: '',
})

// Watch for when dialog opens to populate form
watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
        education: props.personalInfo.education || [],
        experience: props.personalInfo.experience || [],
      }
    }
  },
)

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

const addExperience = () => {
  editableProfile.value.experience.push({
    id: Date.now(),
    companyName: '',
    jobTitle: '',
    startDate: '',
    endDate: '',
    present: false,
    description: '',
  })
}

const removeExperience = (index: number) => {
  editableProfile.value.experience = editableProfile.value.experience.filter((_, i) => i !== index)
}

const handleSave = () => {
  emit('save', editableProfile.value)
}

const handleClose = () => {
  emit('close')
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Edit Profile</h2>
          <button class="close-btn" @click="handleClose">
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
          <form @submit.prevent="handleSave" class="edit-profile-form">
            <!-- Basic Information -->
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

            <!-- Address -->
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
                <div class="form-group form-group-small">
                  <label for="editCountry">Country</label>
                  <input
                    type="text"
                    id="editCountry"
                    v-model="editableProfile.country"
                    placeholder="USA"
                  />
                </div>
              </div>
            </div>

            <!-- Education -->
            <div class="form-section">
              <div class="section-header">
                <h3>Education</h3>
                <button type="button" class="btn-add-small" @click="addEducation">
                  + Add School
                </button>
              </div>

              <div v-if="editableProfile.education.length === 0" class="empty-education">
                <p>No education added yet. Click "+ Add School" to get started.</p>
              </div>

              <div
                v-for="(edu, index) in editableProfile.education"
                :key="edu.id"
                class="education-item"
              >
                <div class="education-header">
                  <span class="education-number">School {{ index + 1 }}</span>
                  <button type="button" class="btn-remove-small" @click="removeEducation(index)">
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
                    <input type="text" :id="'gpa' + index" v-model="edu.gpa" placeholder="3.8" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Experience -->
            <div class="form-section">
              <div class="section-header">
                <h3>Experience</h3>
                <button type="button" class="btn-add-small" @click="addExperience">
                  + Add Experience
                </button>
              </div>

              <div v-if="editableProfile.experience.length === 0" class="empty-education">
                <p>No experience added yet. Click "+ Add Experience" to get started.</p>
              </div>

              <div
                v-for="(exp, index) in editableProfile.experience"
                :key="exp.id"
                class="education-item"
              >
                <div class="education-header">
                  <span class="education-number">Experience {{ index + 1 }}</span>
                  <button type="button" class="btn-remove-small" @click="removeExperience(index)">
                    Remove
                  </button>
                </div>

                <div class="form-group">
                  <label :for="'companyName' + index">Company Name</label>
                  <input
                    type="text"
                    :id="'companyName' + index"
                    v-model="exp.companyName"
                    placeholder="Acme Corp"
                  />
                </div>

                <div class="form-group">
                  <label :for="'jobTitle' + index">Job Title</label>
                  <input
                    type="text"
                    :id="'jobTitle' + index"
                    v-model="exp.jobTitle"
                    placeholder="Software Engineer"
                  />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label :for="'startDate' + index">Start Date</label>
                    <input
                      type="month"
                      :id="'startDate' + index"
                      v-model="exp.startDate"
                      placeholder="2020-01"
                    />
                  </div>

                  <div class="form-group">
                    <label :for="'endDate' + index">End Date</label>
                    <input
                      type="month"
                      :id="'endDate' + index"
                      v-model="exp.endDate"
                      placeholder="2023-12"
                      :disabled="exp.present"
                    />
                  </div>
                </div>

                <div class="form-group">
                  <label class="checkbox-label">
                    <input
                      type="checkbox"
                      v-model="exp.present"
                      @change="exp.present ? (exp.endDate = '') : null"
                    />
                    <span>I currently work here</span>
                  </label>
                </div>

                <div class="form-group">
                  <label :for="'description' + index">Description</label>
                  <textarea
                    :id="'description' + index"
                    v-model="exp.description"
                    placeholder="Describe your responsibilities and achievements..."
                    rows="4"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- Social & Portfolio -->
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

            <!-- Demographic Information -->
            <div class="form-section">
              <h3>Demographic Information</h3>
              <p class="section-note">
                This information is optional and used for Equal Employment Opportunity (EEO)
                reporting.
              </p>

              <div class="form-group">
                <label for="editGender">Gender</label>
                <select id="editGender" v-model="editableProfile.gender">
                  <option value="">Prefer not to answer</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editRaceEthnicity">Race/Ethnicity</label>
                <select id="editRaceEthnicity" v-model="editableProfile.raceEthnicity">
                  <option value="">Prefer not to answer</option>
                  <option value="Hispanic or Latino">Hispanic or Latino</option>
                  <option value="White">White</option>
                  <option value="Black or African American">Black or African American</option>
                  <option value="Native Hawaiian or Other Pacific Islander">
                    Native Hawaiian or Other Pacific Islander
                  </option>
                  <option value="Asian">Asian</option>
                  <option value="American Indian or Alaska Native">
                    American Indian or Alaska Native
                  </option>
                  <option value="Two or More Races">Two or More Races</option>
                  <option value="Decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editDisabilityStatus">Disability Status</label>
                <select id="editDisabilityStatus" v-model="editableProfile.disabilityStatus">
                  <option value="">Prefer not to answer</option>
                  <option value="Yes">
                    Yes, I have a disability (or previously had a disability)
                  </option>
                  <option value="No">No, I do not have a disability</option>
                  <option value="Decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editVeteranStatus">Veteran Status</label>
                <select id="editVeteranStatus" v-model="editableProfile.veteranStatus">
                  <option value="">Prefer not to answer</option>
                  <option value="Not a Veteran">I am not a protected veteran</option>
                  <option value="Veteran">
                    I identify as one or more of the classifications of protected veteran
                  </option>
                  <option value="Decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editAge18OrOlder">Are you 18 years of age or older?</label>
                <select id="editAge18OrOlder" v-model="editableProfile.age18OrOlder">
                  <option value="">Prefer not to answer</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
            </div>

            <!-- Other Information -->
            <div class="form-section">
              <h3>Other Information</h3>

              <div class="form-group">
                <label for="editDesiredSalary">Desired Salary</label>
                <input
                  type="number"
                  min="0"
                  id="editDesiredSalary"
                  v-model="editableProfile.desiredSalary"
                  placeholder="80,000"
                />
              </div>

              <div class="form-group">
                <label for="editWorkAuthorization">Work Authorization</label>
                <select id="editWorkAuthorization" v-model="editableProfile.workAuthorization">
                  <option value="">Select...</option>
                  <option value="US Citizen">U.S. Citizen</option>
                  <option value="Green Card">Green Card Holder (Permanent Resident)</option>
                  <option value="Work Visa">Work Visa (H1B, etc.)</option>
                  <option value="Need Sponsorship">Will require sponsorship</option>
                </select>
              </div>
            </div>

            <!-- Password Management -->
            <div class="form-section">
              <h3>Application Account Password (common on Workday)</h3>

              <div class="form-group">
                <label for="accountPassword">Password</label>
                <input
                  type="password"
                  id="accountPassword"
                  v-model="editableProfile.accountPassword"
                  placeholder="Enter your application account password"
                />
              </div>
            </div>
          </form>
        </div>

        <div class="dialog-footer">
          <button class="btn-secondary-dialog" @click="handleClose">Cancel</button>
          <button class="btn-primary-dialog" @click="handleSave">Save Changes</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Add box-sizing to everything */
* {
  box-sizing: border-box;
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
  color: #f7fafc;
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
  background: #4f7cff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary-dialog:hover {
  background: #4169e1;
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
</style>
