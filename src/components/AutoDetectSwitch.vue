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
</template>

<style scoped lang="scss">
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
    .toggle-btn {
      width: 40px;
      height: 24px;
      background: #4a5568;
      border: none;
      border-radius: 12px;
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      &.active {
        background: rgb(72, 9, 233);
        .toggle-slider {
          transform: translateX(16px);
        }
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
    }
  }
}
</style>
