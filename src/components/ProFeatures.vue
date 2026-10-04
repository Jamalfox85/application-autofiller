<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  RESUME_MATCHING_DEFAULT,
  RESUME_MATCHING_KEY,
  resumeMatchingEnabled,
} from '../services/matchScore/setting.ts'

const props = defineProps<{
  isPro: boolean
}>()
const emit = defineEmits<{
  upgrade: []
}>()

const matchingEnabled = ref(RESUME_MATCHING_DEFAULT)

onMounted(async () => {
  const stored = await chrome.storage.local.get(RESUME_MATCHING_KEY)
  matchingEnabled.value = resumeMatchingEnabled(stored[RESUME_MATCHING_KEY])
})

// Free accounts see the switch locked; clicking the row opens the paywall instead.
const onMatchingClick = async () => {
  if (!props.isPro) {
    emit('upgrade')
    return
  }
  matchingEnabled.value = !matchingEnabled.value
  await chrome.storage.local.set({ [RESUME_MATCHING_KEY]: matchingEnabled.value })
}
</script>

<template>
  <div class="section-list">
    <div class="section-row pro-row static">
      <span class="section-num">UF</span>
      <span class="section-label">Unlimited Fills</span>
      <span class="section-meta">{{ isPro ? 'Included' : 'Pro feature' }}</span>
      <span class="section-dot" :class="{ done: isPro }"></span>
    </div>
    <button
      class="section-row pro-row"
      type="button"
      :role="isPro ? 'switch' : undefined"
      :aria-checked="isPro ? matchingEnabled : undefined"
      @click="onMatchingClick"
    >
      <span class="section-num">AI</span>
      <span class="section-label">Resume Matching Analysis</span>
      <span class="section-meta">{{ isPro ? '' : 'Pro feature' }}</span>
      <span
        class="toggle-track"
        :class="{ active: isPro && matchingEnabled, locked: !isPro }"
        aria-hidden="true"
      >
        <span class="toggle-knob"></span>
      </span>
    </button>
  </div>
</template>

<style scoped>
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
