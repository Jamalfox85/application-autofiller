import { autofillPage } from './autofill.ts'

export function showAutofillNotification(fieldsCount: number) {
  // Remove existing notification if present
  const existing = document.querySelector('.gofillr-autofill-notification')
  if (existing) {
    existing.remove()
  }

  const notification = document.createElement('div')
  notification.className = 'gofillr-autofill-notification'

  // Add inline styles since this is injected into external pages
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 2147483647;
    background: #1a1a2e;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    opacity: 0;
    transform: translateY(-80px);
    transition: opacity 0.3s ease, transform 0.3s ease;
  `

  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <img src="${chrome.runtime.getURL('assets/images/logo.png')}" width="20" height="20" style="flex-shrink: 0;" />
      <span>Auto-filled ${fieldsCount} field${fieldsCount !== 1 ? 's' : ''} ✨</span>
    </div>
  `

  document.body.appendChild(notification)

  // Fade in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      notification.style.opacity = '1'
      notification.style.transform = 'translateY(0)'
    })
  })

  // Auto-remove after 4 seconds
  setTimeout(() => {
    notification.style.opacity = '0'
    notification.style.transform = 'translateY(-20px)'
    setTimeout(() => notification.remove(), 300)
  }, 4000)
}

export function showErrorNotification(message: string) {
  const notification = document.createElement('div')
  notification.className = 'gofillr-autofill-notification gofillr-error'
  notification.innerHTML = `
    <div class="gofillr-notification-content">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
        <circle cx="10" cy="10" r="10" fill="#EF4444"/>
        <path d="M6 6l8 8M14 6l-8 8" stroke="white" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span>${message}</span>
    </div>
  `

  document.body.appendChild(notification)

  setTimeout(() => {
    notification.style.opacity = '1'
    notification.style.transform = 'translateY(0)'
  }, 10)

  setTimeout(() => {
    notification.style.opacity = '0'
    notification.style.transform = 'translateY(-20px)'
    setTimeout(() => notification.remove(), 300)
  }, 4000)
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
    background: #1a1a2e;
    color: white;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
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
        <span style="font-weight: 600; font-size: 15px;">gofillr</span>
      </div>
      <p style="margin: 0 0 14px; color: #ccc; line-height: 1.4;">
        Job application detected! Would you like to auto-fill this form?
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button data-action="dismiss" style="
          background: transparent;
          border: 1px solid #444;
          color: #aaa;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Not now</button>
        <button data-action="autofill" style="
          background: #4F7CFF;
          border: none;
          color: white;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
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
