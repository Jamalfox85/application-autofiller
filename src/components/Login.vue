<!-- src/components/Login.vue -->
<template>
  <div class="login">
    <h2>Sign in</h2>

    <form @submit.prevent="handleLogin">
      <input v-model="email" type="email" placeholder="Email" required />
      <input v-model="password" type="password" placeholder="Password" required />
      <button type="submit" :disabled="loading">
        {{ loading ? 'Signing in...' : 'Sign in' }}
      </button>
    </form>

    <p v-if="error" class="error">{{ error }}</p>

    <p class="signup-link">
      Don't have an account?
      <a href="#" @click.prevent="handleSignUp">Sign up</a>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

const emit = defineEmits(['authenticated'])

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true
  error.value = ''

  try {
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (authError) throw authError

    emit('authenticated')
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function handleSignUp() {
  loading.value = true
  error.value = ''

  try {
    const { error: authError } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
    })

    if (authError) throw authError

    error.value = 'Check your email to confirm your account'
  } catch (err: any) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}
</script>
