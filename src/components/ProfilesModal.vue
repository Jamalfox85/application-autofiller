<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FullScreenSheet from './dialogs/FullScreenSheet.vue'
import ConfirmDeleteDialog from './dialogs/ConfirmDeleteDialog.vue'
import CreateProfile from './profiles/CreateProfile.vue'
import { useProfiles } from '@/composables/useProfiles'
import {
  MAX_PROFILES,
  PROFILE_ERROR_COPY,
  duplicateProfileName,
  isProfileNameTaken,
  profileErrorCode,
  profileErrorMessage,
  type CreateProfileRequest,
  type ProfileSummary,
} from '@/lib/sync/profiles'
import { editedAgo } from '@/lib/sync/activeProfile'
import {
  PROFILE_EVENT,
  profileCountProps,
  profileCreatedProps,
} from '@/services/profileEvents'
import { trackProfileEvent } from '@/services/trackProfileEvent'
import { ICON_LOCK } from '@/utils/icons'

const props = defineProps<{
  show: boolean
  isPro: boolean
}>()

const emit = defineEmits<{
  close: []
  // The active profile changed (swap, create, or deleting the active one). App reloads it.
  activeChanged: [payload: { name: string; reason: 'switched' | 'created' | 'deleted'; resumeWarning?: string | null }]
  // "Start from a resume": the new blank profile is active; App runs the upload/review flow.
  startFromResume: [payload: { file: File; name: string }]
  upgrade: [mode: 'multi_profile' | 'locked_profile']
}>()

const store = useProfiles()
const view = ref<'list' | 'create'>('list')
const loading = ref(false)
const busyId = ref<string | null>(null)
const creating = ref(false)
const error = ref('')
const createError = ref('')
const menuFor = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const confirmDelete = ref<ProfileSummary | null>(null)

const profiles = computed(() => store.profiles.value)
const atLimit = computed(() => profiles.value.length >= MAX_PROFILES)
const lockedCount = computed(() => profiles.value.filter((p) => p.locked).length)

const resetView = () => {
  view.value = 'list'
  error.value = ''
  createError.value = ''
  menuFor.value = null
  renamingId.value = null
}

// Re-verify Pro (plan refresh) and list on every open so locks are current.
watch(
  () => props.show,
  async (show) => {
    if (!show) return
    resetView()
    loading.value = true
    try {
      await store.refresh({ verifyPlan: true })
      if (lockedCount.value > 0) {
        void trackProfileEvent(
          PROFILE_EVENT.lockedViewed,
          profileCountProps(profiles.value.length, { locked_count: lockedCount.value }),
        )
      }
    } catch (err) {
      error.value = profileErrorMessage(err)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

// pro_required / profile_locked go to the paywall instead of an inline error.
const handleError = (err: unknown, target: 'list' | 'create' = 'list') => {
  const code = profileErrorCode(err)
  if (code === 'pro_required') {
    emit('upgrade', 'multi_profile')
    return
  }
  if (code === 'profile_locked') {
    emit('upgrade', 'locked_profile')
    void store.refresh().catch(() => {})
    return
  }
  if (target === 'create') createError.value = profileErrorMessage(err)
  else error.value = profileErrorMessage(err)
}

const toggleMenu = (profile: ProfileSummary) => {
  menuFor.value = menuFor.value === profile.id ? null : profile.id
  renamingId.value = null
}

const onRowClick = (profile: ProfileSummary) => {
  if (profile.locked) {
    emit('upgrade', 'locked_profile')
    return
  }
  toggleMenu(profile)
}

const useProfile = async (profile: ProfileSummary) => {
  if (profile.locked) {
    emit('upgrade', 'locked_profile')
    return
  }
  if (profile.is_active) {
    menuFor.value = null
    return
  }
  error.value = ''
  busyId.value = profile.id
  try {
    await store.activate(profile.id)
    void trackProfileEvent(PROFILE_EVENT.switched, profileCountProps(profiles.value.length))
    emit('activeChanged', { name: profile.name, reason: 'switched' })
    emit('close')
  } catch (err) {
    handleError(err)
  } finally {
    busyId.value = null
    menuFor.value = null
  }
}

const startRename = (profile: ProfileSummary) => {
  renamingId.value = profile.id
  renameDraft.value = profile.name
  menuFor.value = null
}

const submitRename = async (profile: ProfileSummary) => {
  const clean = renameDraft.value.trim().replace(/\s+/g, ' ')
  if (clean === profile.name) {
    renamingId.value = null
    return
  }
  if (!clean || clean.length > 60) {
    error.value = PROFILE_ERROR_COPY.invalid_name
    return
  }
  if (isProfileNameTaken(profiles.value, clean, profile.id)) {
    error.value = PROFILE_ERROR_COPY.name_taken
    return
  }
  error.value = ''
  busyId.value = profile.id
  try {
    await store.rename(profile.id, clean)
    void trackProfileEvent(PROFILE_EVENT.renamed, profileCountProps(profiles.value.length))
    // refresh() already rewrote the activeProfile mirror, so the Pro row, the autofill
    // button and the fill toast pick up the new name without a reload.
    renamingId.value = null
  } catch (err) {
    handleError(err)
  } finally {
    busyId.value = null
  }
}

const openCreate = () => {
  if (!props.isPro) {
    emit('upgrade', 'multi_profile')
    return
  }
  if (atLimit.value) return
  createError.value = ''
  view.value = 'create'
}

const duplicate = async (profile: ProfileSummary) => {
  if (!props.isPro) {
    emit('upgrade', 'multi_profile')
    return
  }
  if (atLimit.value) {
    error.value = PROFILE_ERROR_COPY.profile_limit
    return
  }
  error.value = ''
  busyId.value = profile.id
  try {
    const name = duplicateProfileName(profiles.value, profile.name)
    const result = await store.create(name, profile.id)
    void trackProfileEvent(
      PROFILE_EVENT.created,
      profileCreatedProps({ source: 'copy', profileCount: profiles.value.length, resumeCopied: !result.resumeWarning }),
    )
    emit('activeChanged', { name, reason: 'created', resumeWarning: result.resumeWarning })
    emit('close')
  } catch (err) {
    handleError(err)
  } finally {
    busyId.value = null
    menuFor.value = null
  }
}

const submitCreate = async (request: CreateProfileRequest) => {
  createError.value = ''
  creating.value = true
  try {
    const result = await store.create(request.name, request.start === 'copy' ? request.copyFrom : null)
    void trackProfileEvent(
      PROFILE_EVENT.created,
      profileCreatedProps({
        source: request.start,
        profileCount: profiles.value.length,
        resumeCopied: request.start === 'copy' ? !result.resumeWarning : null,
      }),
    )
    if (request.start === 'resume' && request.file) {
      emit('startFromResume', { file: request.file, name: request.name })
    } else {
      emit('activeChanged', { name: request.name, reason: 'created', resumeWarning: result.resumeWarning })
    }
    emit('close')
  } catch (err) {
    handleError(err, 'create')
  } finally {
    creating.value = false
  }
}

const askDelete = (profile: ProfileSummary) => {
  menuFor.value = null
  if (profiles.value.length <= 1) {
    error.value = PROFILE_ERROR_COPY.last_profile
    return
  }
  confirmDelete.value = profile
}

const doDelete = async () => {
  const profile = confirmDelete.value
  confirmDelete.value = null
  if (!profile) return
  error.value = ''
  busyId.value = profile.id
  try {
    const { wasActive } = await store.remove(profile.id)
    void trackProfileEvent(
      PROFILE_EVENT.deleted,
      profileCountProps(profiles.value.length, { was_active: wasActive, was_locked: profile.locked }),
    )
    if (wasActive) {
      emit('activeChanged', { name: store.activeProfile.value?.name ?? '', reason: 'deleted' })
    }
  } catch (err) {
    handleError(err)
  } finally {
    busyId.value = null
  }
}

const subtitle = (profile: ProfileSummary) =>
  [profile.hint, editedAgo(profile.updated_at)].filter(Boolean).join(' · ')
</script>

<template>
  <FullScreenSheet :show="show" :title="view === 'create' ? 'New profile' : 'Profiles'" @close="view === 'create' ? (view = 'list') : emit('close')">
    <template #status>{{ profiles.length }} of {{ MAX_PROFILES }}</template>

    <CreateProfile
      v-if="view === 'create'"
      :profiles="profiles"
      :busy="creating"
      :error="createError"
      @submit="submitCreate"
      @cancel="view = 'list'"
    />

    <template v-else>
      <p class="profiles-intro">
        Autofill uses the active profile. Each profile has its own details, resume, and custom responses.
      </p>

      <div v-if="loading && profiles.length === 0" class="profiles-loading"><div class="spinner"></div></div>

      <div v-else class="profiles-list">
        <div
          v-for="profile in profiles"
          :key="profile.id"
          class="profile-row"
          :class="{ active: profile.is_active, locked: profile.locked, busy: busyId === profile.id }"
        >
          <div class="profile-main" role="button" tabindex="0" @click="onRowClick(profile)" @keydown.enter="onRowClick(profile)">
            <template v-if="renamingId === profile.id">
              <input
                v-model="renameDraft"
                class="rename-input"
                type="text"
                maxlength="60"
                autofocus
                @click.stop
                @keydown.enter.prevent="submitRename(profile)"
                @keydown.esc="renamingId = null"
              />
            </template>
            <template v-else>
              <div class="profile-name-row">
                <span class="profile-name">{{ profile.name }}</span>
                <span v-if="profile.is_active" class="badge-active">Active</span>
                <span v-if="profile.locked" class="lock-icon" aria-label="Locked" v-html="ICON_LOCK"></span>
              </div>
              <div class="profile-sub">{{ profile.locked ? 'Resubscribe to use this profile again.' : subtitle(profile) }}</div>
            </template>
          </div>

          <div v-if="renamingId === profile.id" class="rename-actions">
            <button type="button" class="row-btn" @click="renamingId = null">Cancel</button>
            <button type="button" class="row-btn primary" :disabled="busyId === profile.id" @click="submitRename(profile)">Save</button>
          </div>
          <button
            v-else
            type="button"
            class="menu-btn"
            :aria-expanded="menuFor === profile.id"
            aria-label="Profile actions"
            @click.stop="toggleMenu(profile)"
          >
            ⋯
          </button>

          <div v-if="menuFor === profile.id" class="row-menu">
            <template v-if="!profile.locked">
              <button v-if="!profile.is_active" type="button" class="row-btn primary" @click="useProfile(profile)">Use</button>
              <button type="button" class="row-btn" @click="startRename(profile)">Rename</button>
              <button type="button" class="row-btn" :disabled="atLimit" @click="duplicate(profile)">Duplicate</button>
            </template>
            <button
              type="button"
              class="row-btn danger"
              :disabled="profiles.length <= 1"
              @click="askDelete(profile)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <p v-if="error" class="fs-error profiles-error">{{ error }}</p>
    </template>

    <template v-if="view === 'list'" #footer>
      <button type="button" class="btn-primary-dialog" :disabled="loading || (isPro && atLimit)" @click="openCreate">
        {{ isPro ? 'New profile' : 'New profile · Pro' }}
      </button>
    </template>
  </FullScreenSheet>

  <p v-if="show && view === 'list' && isPro && atLimit" class="limit-note">You can have up to 5 profiles.</p>

  <ConfirmDeleteDialog
    :show="confirmDelete !== null"
    :item="confirmDelete ? { id: confirmDelete.id, title: confirmDelete.name } : null"
    label="profile"
    message="Deletes this profile and its resume. This can't be undone."
    @close="confirmDelete = null"
    @delete="doDelete"
  />
</template>

<style scoped>
.profiles-intro {
  margin: 0 0 12px;
  font-size: 11.5px;
  color: #8f8f99;
  line-height: 1.45;
}

.profiles-loading {
  display: flex;
  justify-content: center;
  padding: 30px 0;
}

.spinner {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 3px solid #23272f;
  border-top-color: #7c3aed;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.profiles-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 8px;
  border: 1px solid #22222a;
  background: #17171b;
  border-radius: 9px;
  padding: 9px 10px 9px 11px;
}

.profile-row.active {
  border-color: #2b2440;
  background: linear-gradient(180deg, #1b1727 0%, #17161c 100%);
}

.profile-row.locked .profile-name,
.profile-row.locked .profile-sub {
  color: #6f6f7a;
}

.profile-row.busy {
  opacity: 0.6;
  pointer-events: none;
}

.profile-main {
  min-width: 0;
  cursor: pointer;
  outline: none;
}

.profile-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.profile-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #ebebee;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.badge-active {
  flex-shrink: 0;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #c4b5fd;
  border: 1px solid #4c3a86;
  border-radius: 5px;
  padding: 1px 5px;
}

.lock-icon {
  display: inline-flex;
  width: 12px;
  height: 12px;
  color: #8f8f99;
  flex-shrink: 0;
}

.lock-icon :deep(svg) {
  width: 12px;
  height: 12px;
}

.profile-sub {
  margin-top: 3px;
  font-family: 'IBM Plex Mono', monospace;
  font-size: 10.5px;
  color: #7c7c86;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-btn {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 6px;
  width: 26px;
  height: 24px;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.menu-btn:hover {
  color: #ebebee;
  border-color: #47475a;
}

.row-menu,
.rename-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.row-menu {
  grid-column: 1 / -1;
  padding-top: 4px;
}

.row-btn {
  border: 1px solid #2e2e36;
  background: #1a1a1f;
  color: #b9b9c2;
  border-radius: 7px;
  padding: 6px 10px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.row-btn:hover:not(:disabled) {
  color: #ebebee;
  border-color: #47475a;
}

.row-btn.primary {
  border-color: #7c3aed;
  background: #7c3aed;
  color: #fff;
}

.row-btn.danger {
  color: #e08a8a;
}

.row-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.rename-input {
  width: 100%;
  border: 1px solid #47475a;
  background: #0c0c0e;
  color: #ebebee;
  border-radius: 6px;
  padding: 6px 8px;
  font-family: inherit;
  font-size: 12.5px;
}

.profiles-error {
  margin-top: 10px;
}

.limit-note {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 58px;
  margin: 0;
  text-align: center;
  font-size: 10.5px;
  color: #8f8f99;
  z-index: 1001;
}
</style>
