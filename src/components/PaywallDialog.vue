<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { openProCheckout, openProLogin } from '@/services/billing/client'
import { PAYWALL_COPY } from '@/services/billing/copy'
import type { CheckoutSource, HardPaywallCta, SoftPaywallCta } from '@/services/billing/plans'
import {
  PAID_EVENT,
  hardPaywallCtaProps,
  hardPaywallDismissedProps,
  hardPaywallShownProps,
  softPaywallCtaProps,
  softPaywallDismissedProps,
  softPaywallShownProps,
  surfaceCtaProps,
  surfaceShownProps,
  type ProSurface,
} from '@/services/billing/paidEvents'
import { paidEventContext, trackPaid } from '@/services/billing/trackPaid'

const props = defineProps<{
  mode: 'soft' | 'hard' | 'resume_ai' | 'multi_profile'
  fillCount?: number
  fillsRemaining?: number
  ats?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const error = ref('')

const sourceFor = (): CheckoutSource => {
  if (props.mode === 'hard') return 'hard_cap'
  if (props.mode === 'resume_ai') return 'resume_ai'
  if (props.mode === 'multi_profile') return 'multi_profile'
  return 'soft_gate'
}

const counts = () => {
  const fillCount = props.fillCount ?? 0
  return {
    fillCount,
    fillsRemaining: props.fillsRemaining ?? Math.max(0, 25 - fillCount),
    atsSite: props.ats || 'other',
  }
}

onMounted(async () => {
  const ctx = await paidEventContext(counts())
  if (props.mode === 'soft') {
    await trackPaid(PAID_EVENT.softShown, softPaywallShownProps({ ...ctx, ...counts() }))
  } else if (props.mode === 'hard') {
    await trackPaid(PAID_EVENT.hardShown, hardPaywallShownProps({ ...ctx, fillCount: counts().fillCount }))
  } else {
    const surface: ProSurface = props.mode === 'resume_ai' ? 'resume_ai' : 'multi_profile'
    await trackPaid(PAID_EVENT.surfaceShown, surfaceShownProps({ ...ctx, surface, atsSite: props.ats }))
  }
})

async function dismiss() {
  const ctx = await paidEventContext(counts())
  if (props.mode === 'soft') {
    await trackPaid(PAID_EVENT.softDismissed, softPaywallDismissedProps({ ...ctx, ...counts() }))
  } else if (props.mode === 'hard') {
    await trackPaid(PAID_EVENT.hardDismissed, hardPaywallDismissedProps({ ...ctx, fillCount: counts().fillCount }))
  }
  emit('close')
}

async function checkout(plan: 'monthly' | 'annual', cta: SoftPaywallCta | HardPaywallCta | 'upgrade') {
  error.value = ''
  const ctx = await paidEventContext(counts())
  if (props.mode === 'soft') {
    await trackPaid(PAID_EVENT.softCta, softPaywallCtaProps({ ...ctx, ...counts(), cta: cta as SoftPaywallCta }))
  } else if (props.mode === 'hard') {
    await trackPaid(PAID_EVENT.hardCta, hardPaywallCtaProps({ ...ctx, fillCount: counts().fillCount, cta: cta as HardPaywallCta }))
  } else {
    const surface: ProSurface = props.mode === 'resume_ai' ? 'resume_ai' : 'multi_profile'
    await trackPaid(PAID_EVENT.surfaceCta, surfaceCtaProps({ ...ctx, surface, atsSite: props.ats }))
  }

  const opened = await openProCheckout({
    plan,
    source: sourceFor(),
    fillCount: counts().fillCount,
    atsSite: props.ats || null,
  })
  if (!opened.ok) {
    error.value =
      opened.error === 'extensionpay_not_configured'
        ? 'Checkout needs VITE_EXTENSIONPAY_EXTENSION_ID in this build.'
        : 'Couldn’t open checkout. Try again.'
    return
  }
  emit('close')
}

async function continueFree() {
  const ctx = await paidEventContext(counts())
  await trackPaid(PAID_EVENT.softCta, softPaywallCtaProps({ ...ctx, ...counts(), cta: 'continue_free' }))
  emit('close')
}

async function restore() {
  const opened = await openProLogin(sourceFor())
  if (!opened.ok) error.value = 'Couldn’t open the payment sign-in page.'
}
</script>

<template>
  <div class="paywall-overlay" @click.self="dismiss">
    <div class="paywall-card" role="dialog" aria-modal="true">
      <button class="paywall-x" type="button" aria-label="Close" @click="dismiss">×</button>

      <template v-if="mode === 'soft'">
        <h2>{{ PAYWALL_COPY.soft.title }}</h2>
        <p>{{ PAYWALL_COPY.soft.body }}</p>
        <button class="paywall-primary" type="button" @click="checkout('monthly', 'upgrade_monthly')">
          {{ PAYWALL_COPY.soft.primary }}
        </button>
        <button class="paywall-secondary" type="button" @click="continueFree">
          {{ PAYWALL_COPY.soft.secondary }}
        </button>
        <button class="paywall-text" type="button" @click="checkout('annual', 'see_annual')">
          {{ PAYWALL_COPY.soft.tertiary }}
        </button>
      </template>

      <template v-else-if="mode === 'hard'">
        <h2>{{ PAYWALL_COPY.hard.title }}</h2>
        <p>{{ PAYWALL_COPY.hard.body }}</p>
        <button class="paywall-primary" type="button" @click="checkout('monthly', 'upgrade_monthly')">
          {{ PAYWALL_COPY.hard.primary }}
        </button>
        <button class="paywall-secondary" type="button" @click="checkout('annual', 'upgrade_annual')">
          {{ PAYWALL_COPY.hard.annual }}
        </button>
        <button class="paywall-text" type="button" @click="dismiss">Close</button>
      </template>

      <template v-else-if="mode === 'resume_ai'">
        <h2>{{ PAYWALL_COPY.resumeAi.title }}</h2>
        <button class="paywall-primary" type="button" @click="checkout('monthly', 'upgrade')">
          {{ PAYWALL_COPY.resumeAi.cta }}
        </button>
      </template>

      <template v-else>
        <h2>{{ PAYWALL_COPY.multiProfile.title }}</h2>
        <button class="paywall-primary" type="button" @click="checkout('monthly', 'upgrade')">
          {{ PAYWALL_COPY.multiProfile.cta }}
        </button>
      </template>

      <p v-if="error" class="paywall-error">{{ error }}</p>
      <button class="paywall-text" type="button" @click="restore">Already paid? Sign in</button>
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
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: -0.01em;
}
p {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: #b9b9c2;
}
.paywall-primary,
.paywall-secondary,
.paywall-text {
  width: 100%;
  border-radius: 9px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 11px 12px;
  cursor: pointer;
}
.paywall-primary {
  border: none;
  background: #7c3aed;
  color: #fff;
}
.paywall-secondary {
  border: 1px solid #2e2e36;
  background: #17171b;
  color: #ebebee;
}
.paywall-text {
  border: none;
  background: none;
  color: #b9b9c2;
  padding: 6px;
  font-weight: 500;
}
.paywall-error {
  color: #f0a8a8;
}
</style>
