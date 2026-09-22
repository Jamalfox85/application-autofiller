<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PersonalInfo } from '@/types'
import {
  addRosterProfile,
  readRoster,
  writeRoster,
  type ProfileRoster,
  type RosterProfile,
} from '@/services/billing/profileRoster'

const props = defineProps<{
  show: boolean
  personalInfo: PersonalInfo
}>()

const emit = defineEmits<{
  close: []
  use: [profile: PersonalInfo]
}>()

const roster = ref<ProfileRoster | null>(null)
const draftName = ref('')

watch(
  () => props.show,
  async (show) => {
    if (!show) return
    roster.value = await readRoster(props.personalInfo)
  },
)

async function useProfile(profile: RosterProfile) {
  if (!roster.value) return
  const next = { ...roster.value, activeId: profile.id }
  await writeRoster(next)
  roster.value = next
  emit('use', profile.personalInfo)
  emit('close')
}

async function addProfile() {
  if (!roster.value) return
  const next = addRosterProfile(roster.value, draftName.value, props.personalInfo)
  await writeRoster(next)
  roster.value = next
  draftName.value = ''
  const created = next.profiles[next.profiles.length - 1]
  emit('use', created.personalInfo)
  emit('close')
}
</script>

<template>
  <div v-if="show" class="paywall-overlay" @click.self="emit('close')">
    <div class="paywall-card" role="dialog" aria-modal="true">
      <button class="paywall-x" type="button" aria-label="Close" @click="emit('close')">×</button>
      <h2>Profiles</h2>
      <p>The active profile is what autofill and sync use. Others stay on this device.</p>
      <button
        v-for="profile in roster?.profiles || []"
        :key="profile.id"
        class="paywall-secondary"
        type="button"
        @click="useProfile(profile)"
      >
        {{ profile.name }}{{ profile.id === roster?.activeId ? ' · active' : '' }}
      </button>
      <input v-model="draftName" type="text" placeholder="New profile name" />
      <button class="paywall-primary" type="button" @click="addProfile">Add profile</button>
    </div>
  </div>
</template>

<style scoped>
.paywall-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.paywall-card {
  width: 100%;
  max-height: 100%;
  overflow: auto;
  background: #16161a;
  border: 1px solid #2e2e36;
  border-radius: 12px;
  padding: 16px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
}
.paywall-x {
  position: absolute;
  top: 8px;
  right: 8px;
  border: none;
  background: none;
  color: #8f8f99;
  font-size: 16px;
  cursor: pointer;
}
h2 {
  margin: 0 18px 0 0;
  font-size: 15px;
  font-weight: 650;
}
p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: #b9b9c2;
}
input {
  width: 100%;
  border-radius: 8px;
  border: 1px solid #2e2e36;
  background: #0c0c0e;
  color: #ebebee;
  font: 13px inherit;
  padding: 8px;
}
.paywall-primary,
.paywall-secondary {
  width: 100%;
  border-radius: 9px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 11px 12px;
  cursor: pointer;
  text-align: left;
}
.paywall-primary {
  border: none;
  background: #7c3aed;
  color: #fff;
  text-align: center;
}
.paywall-secondary {
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #ebebee;
}
</style>
