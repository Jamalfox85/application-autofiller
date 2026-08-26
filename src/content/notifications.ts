import { autofillPage } from './autofill.ts'

// Shared "on-page toast" chrome: a dark card with a colored accent bar on the left, sized to
// stay legible when injected into an arbitrary page's own styles/zoom level. Uses the system
// font stack (not IBM Plex, which the popup uses) since loading a webfont into every page a
// user visits isn't worth the privacy/perf cost for a small toast.
function createToast(accentColor: string, title: string, subtitle?: string) {
  const toast = document.createElement('div')
  toast.className = 'gofillr-autofill-notification'
  toast.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 2147483647;
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
    transform: translateY(-20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `

  toast.innerHTML = `
    <span style="width: 6px; height: 30px; border-radius: 4px; background: ${accentColor}; flex-shrink: 0;"></span>
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 12.5px; font-weight: 500;">${title}</div>
      ${subtitle ? `<div style="font-size: 11px; color: #8f8f99; margin-top: 2px;">${subtitle}</div>` : ''}
    </div>
  `

  return toast
}

function showToast(toast: HTMLElement) {
  document.body.appendChild(toast)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1'
      toast.style.transform = 'translateY(0)'
    })
  })

  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-20px)'
    setTimeout(() => toast.remove(), 300)
  }, 4000)
}

export function showAutofillNotification(fieldsCount: number) {
  // Remove existing notification if present
  const existing = document.querySelector('.gofillr-autofill-notification')
  if (existing) {
    existing.remove()
  }

  showToast(createToast('#4ea172', `Auto-filled ${fieldsCount} field${fieldsCount !== 1 ? 's' : ''}`))
}

export function showErrorNotification(message: string) {
  showToast(createToast('#b05454', message))
}

export function showAutofillPrompt() {
  const existing = document.querySelector('.gofillr-autofill-prompt')
  if (existing) existing.remove()

  const prompt = document.createElement('div')
  prompt.className = 'gofillr-autofill-prompt'

  // All styles inline — external pages don't have your stylesheet
  prompt.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
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
        <img src="${chrome.runtime.getURL('assets/images/logo.png')}" width="20" height="20" style="flex-shrink: 0;" />
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

  document.body.appendChild(prompt)

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
    if (result.success) {
      showAutofillNotification(result.fieldsCount ?? 0)
    } else {
      showErrorNotification(result.message)
    }
  })
}
