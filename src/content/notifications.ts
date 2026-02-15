import { autofillPage } from './autofill.ts'

export function showAutofillNotification(fieldsCount: number) {
  console.log('SHOW AUTOFILL NOTIFICATION')

  // Remove existing notification if present
  const existing = document.querySelector('.rapidapply-autofill-notification')
  if (existing) {
    existing.remove()
  }

  const notification = document.createElement('div')
  notification.className = 'rapidapply-autofill-notification'

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
  notification.className = 'rapidapply-autofill-notification rapidapply-error'
  notification.innerHTML = `
    <div class="rapidapply-notification-content">
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
  // Remove existing prompt if present
  const existing = document.querySelector('.rapidapply-autofill-prompt')
  if (existing) {
    existing.remove()
  }

  const prompt = document.createElement('div')
  prompt.className = 'rapidapply-autofill-prompt'
  prompt.innerHTML = `
    <div class="rapidapply-prompt-content">
      <div class="rapidapply-prompt-header">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#4F7CFF" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#4F7CFF" opacity="0.4" />
        </svg>
        <span>RapidApply</span>
      </div>
      <p>Job application detected! Would you like to auto-fill this form?</p>
      <div class="rapidapply-prompt-actions">
        <button class="rapidapply-btn-secondary" data-action="dismiss">Not now</button>
        <button class="rapidapply-btn-primary" data-action="autofill">Auto-fill Form</button>
      </div>
    </div>
  `

  document.body.appendChild(prompt)

  // Fade in
  setTimeout(() => {
    prompt.style.opacity = '1'
    prompt.style.transform = 'translateY(0)'
  }, 10)

  // Handle button clicks
  prompt.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(-20px)'
    setTimeout(() => prompt.remove(), 300)
  })

  prompt.querySelector('[data-action="autofill"]')?.addEventListener('click', async () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(-20px)'
    setTimeout(() => prompt.remove(), 300)

    // Run autofill
    const result = await autofillPage()
    if (result.success) {
      showAutofillNotification(result.fieldsCount ?? 0)
    } else {
      showErrorNotification(result.message)
    }
  })
}
