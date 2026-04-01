<script setup lang="ts">
const emit = defineEmits<{
  'setup-profile': []
}>()

const handleSetUpProfile = () => {
  emit('setup-profile')
}
</script>

<template>
  <div class="intro-screen">
    <div class="content">
      <div class="logo-box"></div>
      <div class="text-block">
        <h1 class="title">Welcome to GoFillr</h1>
        <p class="subtitle">
          Automate your job applications in seconds. Enter your profile details once and let us do
          the rest.
        </p>
      </div>

      <button class="cta-button" @click="handleSetUpProfile">
        <span>Set Up My Profile</span>
        <span class="arrow">→</span>
      </button>

      <div class="version-row">
        <span class="version-badge">V1.0.0</span>
        <span class="version-label">READY TO LAUNCH</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro-screen {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  background-color: #0f1117;
  overflow: hidden;
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 28px;
  padding: 48px 32px;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.logo-box {
  width: 88px;
  height: 88px;
  border-radius: 22px;
  background: #1c1f2a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

.text-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  font-size: 1.75rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.subtitle {
  font-size: 0.975rem;
  color: #8a8f9e;
  margin: 0;
  line-height: 1.65;
}

.cta-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 16px 24px;
  border-radius: 14px;
  border: none;
  background: #3b82f6;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    transform 0.15s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.35);
}

.cta-button:hover {
  background: #3baef6;
  box-shadow: 0 8px 16px rgba(79, 124, 255, 0.3);
  transform: translateY(-1px);
}

.cta-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
}

.arrow {
  font-size: 1.1rem;
  transition: transform 0.2s ease;
}

.cta-button:hover .arrow {
  transform: translateX(3px);
}

/* Version row */
.version-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.version-badge {
  font-size: 0.7rem;
  font-weight: 600;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 6px;
  padding: 3px 8px;
  letter-spacing: 0.04em;
}

.version-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: #4b5263;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>
