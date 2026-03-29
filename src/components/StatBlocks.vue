<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePersonalInfo } from '../composables/usePersonalInfo'

const { personalInfo } = usePersonalInfo()

const profileHealthValue = computed(() => {
  let score = 0
  if (personalInfo.value.firstName) score += 10
  if (personalInfo.value.lastName) score += 10
  if (personalInfo.value.email) score += 15
  if (personalInfo.value.phone) score += 15
  if (personalInfo.value.address) score += 10
  if (personalInfo.value.linkedin) score += 10
  if (personalInfo.value.education && personalInfo.value.education.length > 0) score += 10
  if (personalInfo.value.experience && personalInfo.value.experience.length > 0) score += 10
  if (personalInfo.value.skills && personalInfo.value.skills.length > 0) score += 10
  return Math.min(score, 100)
})
</script>
<template lang="">
  <div class="stat-blocks">
    <div class="stat-block">
      <h3 class="stat-title">APPLIED TODAY</h3>
      <div class="stat-content">
        <span class="stat-value"> 12 </span>
        <span class="stat-change positive">
          +20% <span v-html="ICON_ARROW_UP" alt="Arrow Up Icon" class="icon" />
        </span>
      </div>
    </div>
    <div class="stat-block">
      <h3 class="stat-title">PROFILE HEALTH</h3>
      <div class="stat-content progress-group">
        <div class="progress-bar">
          <div class="progress" :style="{ width: profileHealthValue + '%' }"></div>
        </div>
        <span class="progress-value">{{ profileHealthValue }}% Complete</span>
      </div>
    </div>
  </div>
</template>
<style lang="scss">
.stat-blocks {
  display: flex;
  gap: 20px;
}
.stat-block {
  background: #1c2128;
  border: 0.5px solid #30363d;
  padding: 20px;
  border-radius: 8px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  &:first-of-type {
    border: solid 2px red;
  }
  &:hover {
    transform: translateY(-1px);
    .positive {
      color: #3baef6;
    }
    .progress {
      background: #3baef6;
    }
  }
}
.stat-content {
  display: flex;
  align-items: end;
  &.progress-group {
    flex-direction: column;
    align-items: start;
  }
}
.stat-value {
  color: #f0f6fc;
  font-size: 24px;
  font-weight: 600;
  margin-right: 8px;
}
.stat-change {
  font-size: 14px;
  &.positive {
    color: #3b82f6;
  }
  &.negative {
    color: rgb(233, 9, 9);
  }
}
.progress-bar {
  width: 100%;
  height: 6px;
  background: #0d1117;
  border-radius: 6px;
  overflow: hidden;
}
.progress {
  height: 100%;
  background: #3b82f6;
  border-radius: 6px 0 0 6px;
}
.progress-value {
  color: #f0f6fc;
  font-size: 14px;
  margin-top: 6px;
}
</style>
