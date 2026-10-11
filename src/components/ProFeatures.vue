<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  RESUME_MATCHING_DEFAULT,
  RESUME_MATCHING_KEY,
  resumeMatchingEnabled,
} from '../services/matchScore/setting.ts'
import { truncateProfileName } from '../lib/sync/activeProfile.ts'
import { proFeatureMeta, profilesRowAction, profilesRowMeta, type PlanIsPro } from '../lib/popupPlanGate.ts'
import { ICON_SWAP } from '../utils/icons.ts'

type ProUpgradeSource = 'resume_ai' | 'multi_profile'

const props = defineProps<{
  isPro: PlanIsPro
  activeProfileName?: string | null
  profileCount?: number
}>()
const emit = defineEmits<{
  upgrade: [source: ProUpgradeSource]
  openProfiles: []
}>()

const profileLabel = computed(() => truncateProfileName(props.activeProfileName || 'Primary', 18))
const fillsMeta = computed(() => proFeatureMeta(props.isPro, 'Included'))
const matchMeta = computed(() => proFeatureMeta(props.isPro, ''))
const profilesMeta = computed(() =>
  profilesRowMeta(props.isPro, props.profileCount ?? 1, profileLabel.value),
)

// Pro opens the Profiles modal. Free with a single profile gets the multi-profile paywall.
// Free with 2+ profiles (Pro lapsed) still opens the modal: it shows the locked rows and
// lets the user delete them. An unloaded plan does neither.
const onProfilesClick = () => {
  const action = profilesRowAction(props.isPro, props.profileCount ?? 1)
  if (action === 'wait') return
  if (action === 'open') {
    emit('openProfiles')
    return
  }
  emit('upgrade', 'multi_profile')
}

const matchingEnabled = ref(RESUME_MATCHING_DEFAULT)

onMounted(async () => {
  const stored = await chrome.storage.local.get(RESUME_MATCHING_KEY)
  matchingEnabled.value = resumeMatchingEnabled(stored[RESUME_MATCHING_KEY])
})

// Free accounts see the switch locked; clicking the row opens the paywall instead.
const onMatchingClick = async () => {
  if (props.isPro == null) return
  if (!props.isPro) {
    emit('upgrade', 'resume_ai')
    return
  }
  matchingEnabled.value = !matchingEnabled.value
  await chrome.storage.local.set({ [RESUME_MATCHING_KEY]: matchingEnabled.value })
}
</script>

<template>
  <div class="section-list" :aria-busy="isPro == null">
    <div class="section-row pro-row static">
      <span class="section-num">UF</span>
      <span class="section-label">Unlimited Fills</span>
      <span class="section-meta">{{ fillsMeta }}</span>
      <span class="section-dot" :class="{ done: isPro === true }"></span>
    </div>
    <button
      class="section-row pro-row"
      type="button"
      :role="isPro ? 'switch' : undefined"
      :aria-checked="isPro ? matchingEnabled : undefined"
      @click="onMatchingClick"
    >
      <span class="section-num">AI</span>
      <span class="section-label">Score matching</span>
      <span class="section-meta">{{ matchMeta }}</span>
      <span
        class="toggle-track"
        :class="{ active: isPro === true && matchingEnabled, locked: isPro === false }"
        aria-hidden="true"
      >
        <span class="toggle-knob"></span>
      </span>
    </button>
    <button class="section-row pro-row profiles-row" type="button" @click="onProfilesClick">
      <span class="section-num">PR</span>
      <span class="section-label">Profiles</span>
      <span class="section-meta" :title="isPro == null ? undefined : activeProfileName || undefined">
        {{ profilesMeta }}
      </span>
      <span class="swap-icon" aria-hidden="true" v-html="ICON_SWAP"></span>
    </button>
  </div>
</template>

<style scoped>
.swap-icon {
  display: inline-flex;
  width: 14px;
  height: 14px;
  color: #8f8f99;
  flex-shrink: 0;
}

.swap-icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.profiles-row:hover .swap-icon {
  color: #c4b5fd;
}

.pro-row.static {
  cursor: default;
}

.pro-row.static:hover {
  background: #17171b;
  border-color: #22222a;
}

.toggle-track {
  position: relative;
  flex-shrink: 0;
  width: 30px;
  height: 18px;
  border-radius: 20px;
  border: 1px solid #33333d;
  background: #1e1e24;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.toggle-track.active {
  border-color: #7c3aed;
  background: #7c3aed;
}

.toggle-track.locked {
  opacity: 0.45;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: left 140ms ease;
}

.toggle-track.active .toggle-knob {
  left: 14px;
}
</style>
