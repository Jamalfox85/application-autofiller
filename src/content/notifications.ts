import { autofillPage, undoLastFill } from './autofill.ts'
import { brandIcon, mountInToastStack } from './toastStack.ts'
import { ACTIVE_PROFILE_KEY, fillToastSubtitle, parseActiveProfile } from '../lib/sync/activeProfile.ts'

// Shared "on-page toast" chrome: a dark card with a colored accent bar on the left, sized to
// stay legible when injected into an arbitrary page's own styles/zoom level. Uses the system
// font stack (not IBM Plex, which the popup uses) since loading a webfont into every page a
// user visits isn't worth the privacy/perf cost for a small toast.
// Bottom-right, same corner as the other in-page cards. The browser-action popup is separate.
function createToast(accentColor: string, title: string, subtitle?: string) {
  const toast = document.createElement('div')
  toast.className = 'gofillr-autofill-notification'
  toast.style.cssText = `
    display: flex;
    align-items: center;
    gap: 10px;
    background: #1b1b21;
    border: 1px solid #2e2e36;
    border-radius: 10px;
    padding: 10px 11px;
    box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.7);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #ebebee;
    max-width: 300px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `

  toast.innerHTML = `
    <span style="width: 6px; height: 30px; border-radius: 4px; background: ${accentColor}; flex-shrink: 0;"></span>
    ${brandIcon(18)}
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 12.5px; font-weight: 600;">${title}</div>
      ${subtitle ? `<div style="font-size: 11px; color: #8f8f99; margin-top: 2px;">${subtitle}</div>` : ''}
    </div>
  `

  return toast
}

function showToast(toast: HTMLElement) {
  mountInToastStack(toast)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1'
      toast.style.transform = 'translateY(0)'
    })
  })

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(20px)'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

// Post-fill confirmation card: bottom-right so it never covers the form, dark against the
// page so it reads as the extension rather than site content. Auto-hides after 6s; hovering
// holds it open so a mid-read hover doesn't get cut off.
function removeFillToasts() {
  document.querySelectorAll('.gofillr-autofill-notification').forEach((node) => {
    if (node.id === 'match-score') return
    node.remove()
  })
}

export function showAutofillNotification(_summary?: { fieldsCount?: number; totalCount?: number }) {
  removeFillToasts()

  const card = document.createElement('div')
  card.className = 'gofillr-autofill-notification'
  card.style.cssText = `
    width: 280px;
    background: #16161a;
    border: 1px solid #2e2e36;
    border-radius: 11px;
    box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.55);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #ebebee;
    overflow: hidden;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `

  card.innerHTML = `
    <div style="display: flex; align-items: center; gap: 9px; padding: 11px 12px;">
      ${brandIcon(20)}
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 12.5px; font-weight: 600; letter-spacing: -0.01em;">GoFillr</div>
        <div data-role="subtitle" style="font-size: 11px; color: #8f8f99; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Autofill completed</div>
      </div>
      <button type="button" data-action="close" style="border: none; background: none; color: #6f6f7a; cursor: pointer; font-size: 13px; line-height: 1; padding: 2px 3px; flex-shrink: 0;">×</button>
    </div>

    <div style="height: 1px; background: #22222a;"></div>

    <div style="padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <button type="button" data-action="undo" style="border: none; background: none; color: #8f8f99; font-size: 10.5px; cursor: pointer; padding: 0; font-family: inherit;">Undo fill</button>
      <span data-role="countdown" style="font-family: 'IBM Plex Mono', Menlo, monospace; font-size: 10px; color: #5c5c66;">Hides in 6s</span>
    </div>
  `

  mountInToastStack(card)

  // "Filled with {name}" for accounts with 2+ profiles. Read from the activeProfile mirror the
  // popup keeps next to personalInfo, so it names the profile this fill actually used.
  void (async () => {
    try {
      const data = await chrome.storage.local.get(ACTIVE_PROFILE_KEY)
      const subtitle = card.querySelector('[data-role="subtitle"]')
      if (subtitle) subtitle.textContent = fillToastSubtitle(parseActiveProfile(data[ACTIVE_PROFILE_KEY]))
    } catch {
      // Keep the generic subtitle.
    }
  })()

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.opacity = '1'
      card.style.transform = 'translateY(0)'
    })
  })

  const countdownEl = card.querySelector('[data-role="countdown"]') as HTMLElement
  let remaining = 6
  let hideTimer: ReturnType<typeof setInterval> | undefined

  const dismiss = () => {
    if (hideTimer) clearInterval(hideTimer)
    card.style.opacity = '0'
    card.style.transform = 'translateY(16px)'
    setTimeout(() => card.remove(), 300)
  }

  const startCountdown = () => {
    if (hideTimer) clearInterval(hideTimer)
    hideTimer = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        dismiss()
        return
      }
      countdownEl.textContent = `Hides in ${remaining}s`
    }, 1000)
  }

  startCountdown()

  card.addEventListener('mouseenter', () => {
    if (hideTimer) clearInterval(hideTimer)
    countdownEl.textContent = 'Paused'
  })

  card.addEventListener('mouseleave', () => {
    remaining = 6
    countdownEl.textContent = `Hides in ${remaining}s`
    startCountdown()
  })

  card.querySelector('[data-action="close"]')?.addEventListener('click', dismiss)

  card.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
    undoLastFill()
    dismiss()
  })
}

export function showErrorNotification(message: string) {
  showToast(createToast('#b05454', 'GoFillr', message))
}

export function showAutofillPrompt() {
  const existing = document.querySelector('.gofillr-autofill-prompt')
  if (existing) existing.remove()

  const prompt = document.createElement('div')
  prompt.className = 'gofillr-autofill-prompt'

  // All styles inline — external pages don't have your stylesheet
  prompt.style.cssText = `
    background: #1b1b21;
    border: 1px solid #2e2e36;
    color: #ebebee;
    border-radius: 12px;
    box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.7);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    width: 280px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    overflow: hidden;
  `

  prompt.innerHTML = `
    <div style="padding: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        ${brandIcon(20)}
        <span style="font-weight: 600; font-size: 15px;">GoFillr</span>
      </div>
      <p style="margin: 0 0 14px; color: #8f8f99; line-height: 1.4;">
        Job application detected! Would you like to auto-fill this form?
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button data-action="dismiss" style="
          background: #232329;
          border: 1px solid #33333d;
          color: #ebebee;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Not now</button>
        <button data-action="autofill" style="
          background: #7c3aed;
          border: none;
          color: white;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        ">Auto-fill Form</button>
      </div>
    </div>
  `

  mountInToastStack(prompt)

  // Fade in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      prompt.style.opacity = '1'
      prompt.style.transform = 'translateY(0)'
    })
  })

  prompt.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(20px)'
    setTimeout(() => prompt.remove(), 300)
  })

  prompt.querySelector('[data-action="autofill"]')?.addEventListener('click', async () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(20px)'
    setTimeout(() => prompt.remove(), 300)

    const result = await autofillPage()
    if (result.code === 'hard_cap' || result.paywall === 'hard') {
      const { showFillPaywall } = await import('./fillPaywall')
      void showFillPaywall('hard', result)
    } else if (result.success) {
      showAutofillNotification(result)
      if (result.paywall === 'soft') {
        const { showFillPaywall } = await import('./fillPaywall')
        void showFillPaywall('soft', result)
      }
    } else {
      showErrorNotification(result.message)
    }
  })
}
