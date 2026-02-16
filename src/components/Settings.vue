<!-- src/components/Settings.vue -->
<template>
  <div class="settings">
    <div v-if="loading">Loading...</div>

    <template v-else-if="usage?.isPro">
      <div class="plan-badge pro">Pro Plan</div>
      <p>Unlimited applications and custom responses</p>
      <button @click="handleManageSubscription">Manage Subscription</button>
    </template>

    <template v-else>
      <div class="plan-badge free">Free Plan</div>

      <div class="usage">
        <p>Applications: {{ usage?.usage.applications }} / {{ usage?.limits.applications }}</p>
        <p>
          Custom Responses: {{ usage?.usage.customResponses }} / {{ usage?.limits.customResponses }}
        </p>
      </div>

      <div class="upgrade-options">
        <button @click="handleUpgrade('monthly')">Upgrade to Pro — $7/mo</button>
        <button @click="handleUpgrade('yearly')">Upgrade to Pro — $49/yr (save 40%)</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

// Replace with your actual Stripe price IDs
const PRICES = {
  monthly: 'price_xxxxxxxxxxxxx',
  yearly: 'price_xxxxxxxxxxxxx',
}

const loading = ref(true)
const usage = ref<any>(null)

onMounted(async () => {
  await loadUsage()
})

async function loadUsage() {
  try {
    usage.value = await api.getUsage()
  } catch (err) {
    console.error('Failed to load usage:', err)
  } finally {
    loading.value = false
  }
}

async function handleUpgrade(interval: 'monthly' | 'yearly') {
  try {
    const { url } = await api.createCheckout(PRICES[interval])
    window.open(url, '_blank')
  } catch (err) {
    console.error('Checkout failed:', err)
  }
}

async function handleManageSubscription() {
  try {
    const { url } = await api.openBillingPortal()
    window.open(url, '_blank')
  } catch (err) {
    console.error('Portal failed:', err)
  }
}
</script>
