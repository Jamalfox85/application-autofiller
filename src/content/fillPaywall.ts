import { openProCheckout, openProLogin } from '@/services/billing/client'
import { PAYWALL_COPY } from '@/services/billing/copy'
import {
  PAID_EVENT,
  hardPaywallCtaProps,
  hardPaywallDismissedProps,
  hardPaywallShownProps,
  softPaywallCtaProps,
  softPaywallDismissedProps,
  softPaywallShownProps,
  type PaidEventContext,
} from '@/services/billing/paidEvents'
import { paidEventContext, trackPaid } from '@/services/billing/trackPaid'
import type { HardPaywallCta, SoftPaywallCta } from '@/services/billing/plans'

export interface FillPaywallResult {
  code?: string
  paywall?: 'soft' | 'hard' | null
  message?: string
  fillCount?: number
  fillsRemaining?: number
  ats?: string
}

function contextFor(result: FillPaywallResult, base: PaidEventContext): PaidEventContext & {
  fillCount: number
  fillsRemaining: number
} {
  const fillCount = result.fillCount ?? 0
  return {
    ...base,
    atsSite: result.ats || 'other',
    fillCount,
    fillsRemaining: result.fillsRemaining ?? Math.max(0, 25 - fillCount),
  }
}

function button(label: string, variant: 'primary' | 'secondary' | 'text'): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = label
  const background = variant === 'primary' ? '#7c3aed' : variant === 'secondary' ? '#17171b' : 'transparent'
  const color = variant === 'primary' ? '#fff' : '#d5d5dc'
  const border = variant === 'primary' ? 'none' : '1px solid #2e2e36'
  el.style.cssText = `
    width: 100%;
    border: ${border};
    border-radius: 9px;
    background: ${background};
    color: ${color};
    font: 600 13px/1.3 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: ${variant === 'text' ? '8px 10px' : '11px 12px'};
    cursor: pointer;
  `
  return el
}

// On-page gate for auto-fill and the shortcut. The popup draws its own sheet
// when it initiated the fill, so this is not also shown in that case.
export async function showFillPaywall(mode: 'soft' | 'hard', result: FillPaywallResult): Promise<void> {
  document.querySelector('.gofillr-paywall')?.remove()

  const ctx = contextFor(result, await paidEventContext())
  if (mode === 'soft') {
    await trackPaid(PAID_EVENT.softShown, softPaywallShownProps(ctx))
  } else {
    await trackPaid(PAID_EVENT.hardShown, hardPaywallShownProps(ctx))
  }

  const overlay = document.createElement('div')
  overlay.className = 'gofillr-paywall'
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `

  const card = document.createElement('div')
  card.style.cssText = `
    width: min(340px, calc(100vw - 32px));
    background: #16161a;
    color: #ebebee;
    border: 1px solid #2e2e36;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.55);
    display: flex;
    flex-direction: column;
    gap: 8px;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size: 15px; font-weight: 650; letter-spacing: -0.01em;'
  title.textContent = mode === 'soft' ? PAYWALL_COPY.soft.title : PAYWALL_COPY.hard.title

  const body = document.createElement('div')
  body.style.cssText = 'font-size: 12.5px; line-height: 1.45; color: #b9b9c2;'
  body.textContent = mode === 'soft' ? PAYWALL_COPY.soft.body : PAYWALL_COPY.hard.body

  const error = document.createElement('div')
  error.style.cssText = 'font-size: 12px; color: #f0a8a8; display: none;'

  const close = async () => {
    if (mode === 'soft') await trackPaid(PAID_EVENT.softDismissed, softPaywallDismissedProps(ctx))
    else await trackPaid(PAID_EVENT.hardDismissed, hardPaywallDismissedProps(ctx))
    overlay.remove()
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) void close()
  })

  const showError = (message: string) => {
    error.style.display = 'block'
    error.textContent = message
  }

  const checkout = async (plan: 'monthly' | 'annual', cta: SoftPaywallCta | HardPaywallCta) => {
    if (mode === 'soft') {
      await trackPaid(PAID_EVENT.softCta, softPaywallCtaProps({ ...ctx, cta: cta as SoftPaywallCta }))
    } else {
      await trackPaid(PAID_EVENT.hardCta, hardPaywallCtaProps({ ...ctx, cta: cta as HardPaywallCta }))
    }
    const opened = await openProCheckout({
      plan,
      source: mode === 'soft' ? 'soft_gate' : 'hard_cap',
      fillCount: ctx.fillCount,
      atsSite: ctx.atsSite,
    })
    if (!opened.ok) {
      showError(
        opened.error === 'extensionpay_not_configured'
          ? 'Checkout needs VITE_EXTENSIONPAY_EXTENSION_ID in this build.'
          : 'Couldn’t open checkout. Try again.',
      )
      return
    }
    overlay.remove()
  }

  card.append(title, body, error)

  if (mode === 'soft') {
    const monthly = button(PAYWALL_COPY.soft.primary, 'primary')
    monthly.addEventListener('click', () => void checkout('monthly', 'upgrade_monthly'))
    const keep = button(PAYWALL_COPY.soft.secondary, 'secondary')
    keep.addEventListener('click', async () => {
      await trackPaid(PAID_EVENT.softCta, softPaywallCtaProps({ ...ctx, cta: 'continue_free' }))
      overlay.remove()
    })
    const annual = button(PAYWALL_COPY.soft.tertiary, 'text')
    annual.addEventListener('click', () => void checkout('annual', 'see_annual'))
    card.append(monthly, keep, annual)
  } else {
    const monthly = button(PAYWALL_COPY.hard.primary, 'primary')
    monthly.addEventListener('click', () => void checkout('monthly', 'upgrade_monthly'))
    const annual = button(PAYWALL_COPY.hard.annual, 'secondary')
    annual.addEventListener('click', () => void checkout('annual', 'upgrade_annual'))
    const dismiss = button('Close', 'text')
    dismiss.addEventListener('click', () => void close())
    card.append(monthly, annual, dismiss)
  }

  const restore = button('Already paid? Sign in', 'text')
  restore.addEventListener('click', async () => {
    const opened = await openProLogin(mode === 'soft' ? 'soft_gate' : 'hard_cap')
    if (!opened.ok) showError('Couldn’t open the payment sign-in page.')
  })
  card.append(restore)

  overlay.append(card)
  document.body.append(overlay)
}
