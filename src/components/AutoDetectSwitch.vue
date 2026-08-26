<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const autoDetectEnabled = ref(false)

onMounted(async () => {
  const settings = await chrome.storage.local.get('autoDetectEnabled')
  autoDetectEnabled.value = settings.autoDetectEnabled ?? true
})

watch(autoDetectEnabled, async (newValue) => {
  await chrome.storage.local.set({ autoDetectEnabled: newValue })
})
</script>

<template>
  <div class="auto-detect-row">
    <div class="auto-detect-copy">
      <div class="auto-detect-title">Detect forms as I browse</div>
      <div class="auto-detect-hint">
        {{ autoDetectEnabled ? 'Scanning pages as you browse' : 'Off — fill manually from here' }}
      </div>
    </div>
    <button
      class="toggle-track"
      :class="{ active: autoDetectEnabled }"
      role="switch"
      :aria-checked="autoDetectEnabled"
      @click="autoDetectEnabled = !autoDetectEnabled"
    >
      <span class="toggle-knob"></span>
    </button>
  </div>
</template>

<style scoped>
.auto-detect-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #26262c;
  background: #17171b;
  border-radius: 9px;
  padding: 9px 11px;
}

.auto-detect-copy {
  min-width: 0;
}

.auto-detect-title {
  font-size: 12.5px;
  font-weight: 500;
  color: #ebebee;
}

.auto-detect-hint {
  font-size: 11px;
  color: #7c7c86;
  margin-top: 2px;
}

.toggle-track {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  border-radius: 20px;
  border: 1px solid #33333d;
  background: #1e1e24;
  cursor: pointer;
  padding: 0;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.toggle-track.active {
  border-color: #7c3aed;
  background: #7c3aed;
}

.toggle-track:hover {
  border-color: #47475a;
}

.toggle-track.active:hover {
  border-color: #8b5cf6;
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: left 140ms ease;
}

.toggle-track.active .toggle-knob {
  left: 18px;
}
</style>
