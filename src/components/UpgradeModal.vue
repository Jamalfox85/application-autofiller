<!-- src/components/UpgradeModal.vue -->
<template>
  <div class="modal-overlay">
    <div class="modal">
      <h2>You've hit your limit</h2>
      <p>Upgrade to Pro for unlimited applications and custom responses.</p>

      <button @click="handleUpgrade('monthly')">Go Pro — $7/mo</button>
      <button @click="handleUpgrade('yearly')">Go Pro — $49/yr (save 40%)</button>
      <button @click="$emit('close')">Maybe later</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { api } from '../lib/api'

const emit = defineEmits(['close'])

const PRICES = {
  monthly: 'price_xxxxxxxxxxxxx',
  yearly: 'price_xxxxxxxxxxxxx',
}

async function handleUpgrade(interval: 'monthly' | 'yearly') {
  try {
    const { url } = await api.createCheckout(PRICES[interval])
    window.open(url, '_blank')
    emit('close')
  } catch (err) {
    console.error('Checkout failed:', err)
  }
}
</script>
