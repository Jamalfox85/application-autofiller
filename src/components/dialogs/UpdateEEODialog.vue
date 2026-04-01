<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PersonalInfo } from '../../types/index.ts'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  save: [profile: PersonalInfo]
}>()

const editableProfile = ref<PersonalInfo>({
  ...props.personalInfo,
})

const handleSave = () => {
  emit('save', editableProfile.value)
  handleClose()
}

const handleClose = () => {
  emit('close')
}

watch(
  () => props.show,
  (isShowing) => {
    if (isShowing) {
      editableProfile.value = {
        ...props.personalInfo,
      }
    }
  },
)
</script>
<template>
  <Transition name="dialog">
    <div v-if="show" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog">
        <div class="dialog-header">
          <h2>Edit EEO Information</h2>
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
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editRaceEthnicity">Race/Ethnicity</label>
                <select id="editRaceEthnicity" v-model="editableProfile.raceEthnicity">
                  <option value="">Prefer not to answer</option>
                  <option value="hispanic_or_latino">Hispanic or Latino</option>
                  <option value="white">White</option>
                  <option value="black_or_african_american">Black or African American</option>
                  <option value="native_hawaiian_or_other_pacific_islander">
                    Native Hawaiian or Other Pacific Islander
                  </option>
                  <option value="asian">Asian</option>
                  <option value="american_indian_or_alaska_native">
                    American Indian or Alaska Native
                  </option>
                  <option value="two_or_more_races">Two or More Races</option>
                  <option value="decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editDisabilityStatus">Disability Status</label>
                <select id="editDisabilityStatus" v-model="editableProfile.disabilityStatus">
                  <option value="">Prefer not to answer</option>
                  <option value="yes">
                    Yes, I have a disability (or previously had a disability)
                  </option>
                  <option value="no">No, I do not have a disability</option>
                  <option value="decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editVeteranStatus">Veteran Status</label>
                <select id="editVeteranStatus" v-model="editableProfile.veteranStatus">
                  <option value="">Prefer not to answer</option>
                  <option value="not_a_veteran">I am not a protected veteran</option>
                  <option value="veteran">
                    I identify as one or more of the classifications of protected veteran
                  </option>
                  <option value="decline">Decline to self-identify</option>
                </select>
              </div>

              <div class="form-group">
                <label for="editAge18OrOlder">Are you 18 years of age or older?</label>
                <select id="editAge18OrOlder" v-model="editableProfile.age18OrOlder">
                  <option value="">Prefer not to answer</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
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
