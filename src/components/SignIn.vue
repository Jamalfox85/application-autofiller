<script setup lang="ts">
defineProps<{
  loading: boolean
  error: string
}>()

defineEmits<{
  signIn: []
}>()
</script>

<template>
  <div class="signin-view">
    <img class="logo-mark" src="/assets/logo/gofillr-icon-small.svg" alt="" width="36" height="36" />
    <h1 class="signin-title">Sign in to GoFillr</h1>
    <p class="signin-subtitle">
      Sign in with Google to upload your resume and sync your profile across devices.
    </p>

    <button class="google-btn" :disabled="loading" @click="$emit('signIn')">
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92a8.78 8.78 0 0 0 2.68-6.61Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.19l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l3.01-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
        />
      </svg>
      <span>{{ loading ? 'Signing in…' : 'Sign in with Google' }}</span>
    </button>

    <p v-if="error" class="signin-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.signin-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  padding: 24px;
}

.logo-mark {
  display: block;
  margin-bottom: 4px;
}

.signin-title {
  font-size: 15px;
  font-weight: 600;
  color: #ebebee;
  margin: 0;
  letter-spacing: -0.01em;
}

.signin-subtitle {
  font-size: 12px;
  color: #8f8f99;
  line-height: 1.5;
  margin: 0 0 6px;
  max-width: 280px;
}

.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  max-width: 260px;
  border: 1px solid #2e2e36;
  border-radius: 9px;
  background: #ebebee;
  color: #1c1c22;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.google-btn:hover:not(:disabled) {
  background: #fff;
}

.google-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.signin-error {
  font-size: 11.5px;
  color: #f3dede;
  background: #1c1414;
  border: 1px solid #4a2727;
  border-radius: 8px;
  padding: 8px 10px;
  max-width: 280px;
}
</style>
