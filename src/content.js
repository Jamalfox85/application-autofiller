// Runs on all pages on load

import { FIELD_PATTERNS } from './utils/fieldPatterns.ts'

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillPage().then((result) => {
      sendResponse(result)
    })
    return true // Keep message channel open for async response
  }
})

// Main autofill function
async function autofillPage() {
  try {
    // Get stored personal info
    const data = await chrome.storage.local.get('personalInfo')
    const personalInfo = data.personalInfo

    if (!personalInfo) {
      return { success: false, message: 'No personal info saved' }
    }

    // Find all input fields and textareas
    const inputs = document.querySelectorAll('input, textarea, select')
    let filledCount = 0

    inputs.forEach((input) => {
      // Skip hidden, submit, button inputs
      if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
        return
      }

      // Skip if already filled
      if (input.value && input.value.trim() !== '') {
        return
      }

      // Get field identifiers
      const name = (input.name || '').toLowerCase()
      const id = (input.id || '').toLowerCase()
      const placeholder = (input.placeholder || '').toLowerCase()
      const label = getFieldLabel(input)
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()

      // Combine all identifiers
      const fieldText = `${name} ${id} ${placeholder} ${label} ${ariaLabel}`.toLowerCase()

      // Try to match field to our data
      const fieldValue = matchFieldToData(fieldText, personalInfo)

      if (fieldValue) {
        // Fill the field
        input.value = fieldValue

        // Trigger input events so the page recognizes the change
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))

        filledCount++
      }
    })

    return {
      success: filledCount > 0,
      fieldsCount: filledCount,
      message: filledCount > 0 ? `Filled ${filledCount} fields` : 'No matching fields found',
    }
  } catch (error) {
    console.error('Autofill error:', error)
    return { success: false, message: 'Error during autofill' }
  }
}

// Match field text to personal data
function matchFieldToData(fieldText, personalInfo) {
  // Check each field pattern
  for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      if (fieldText.includes(pattern)) {
        return personalInfo[key] || null
      }
    }
  }

  // Special case: full name
  if (
    fieldText.includes('fullname') ||
    fieldText.includes('full_name') ||
    fieldText.includes('full-name') ||
    (fieldText.includes('name') && !fieldText.includes('user'))
  ) {
    const firstName = personalInfo.firstName || ''
    const lastName = personalInfo.lastName || ''
    return `${firstName} ${lastName}`.trim()
  }

  return null
}

// Get label text for an input field
function getFieldLabel(input) {
  // Try to find label by 'for' attribute
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`)
    if (label) {
      return label.textContent.toLowerCase()
    }
  }

  // Try to find parent label
  const parentLabel = input.closest('label')
  if (parentLabel) {
    return parentLabel.textContent.toLowerCase()
  }

  // Try to find previous sibling label
  let sibling = input.previousElementSibling
  while (sibling) {
    if (sibling.tagName === 'LABEL') {
      return sibling.textContent.toLowerCase()
    }
    sibling = sibling.previousElementSibling
  }

  return ''
}

// Add a subtle indicator when extension is ready
function addExtensionIndicator() {
  // Only add on job application sites
  const url = window.location.href.toLowerCase()
  const jobSites = [
    'greenhouse',
    'workday',
    'lever',
    'indeed',
    'linkedin',
    'apply',
    'careers',
    'jobs',
  ]

  if (!jobSites.some((site) => url.includes(site))) {
    return
  }

  const indicator = document.createElement('div')
  indicator.id = 'job-autofill-indicator'
  indicator.innerHTML = '⚡ Autofill Ready'
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: pointer;
    transition: transform 0.2s;
  `

  indicator.addEventListener('mouseenter', () => {
    indicator.style.transform = 'scale(1.05)'
  })

  indicator.addEventListener('mouseleave', () => {
    indicator.style.transform = 'scale(1)'
  })

  indicator.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' })
  })

  document.body.appendChild(indicator)

  // Auto-hide after 5 seconds
  setTimeout(() => {
    indicator.style.opacity = '0'
    indicator.style.transition = 'opacity 0.5s'
    setTimeout(() => indicator.remove(), 500)
  }, 5000)
}

// Initialize when page loads
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', addExtensionIndicator)
//   document.addEventListener('DOMContentLoaded', () => {
//     setTimeout(autofillPage, 500)
//   })
// } else {
//   addExtensionIndicator()
//   setTimeout(autofillPage, 500)
// }

function attachFormListeners() {
  const forms = document.querySelectorAll('form')

  forms.forEach((form, index) => {
    if (form.dataset.autofillListenerAttached) return
    form.dataset.autofillListenerAttached = 'true'

    form.addEventListener('submit', async (e) => {
      const capturedData = {}
      const inputs = form.querySelectorAll('input, textarea, select')

      inputs.forEach((input) => {
        // Skip empty, hidden, password, submit buttons
        if (
          !input.value ||
          input.type === 'hidden' ||
          input.type === 'password' ||
          input.type === 'submit' ||
          input.type === 'button'
        ) {
          return
        }

        const name = input.name || input.id || input.placeholder || 'unknown'
        const value = input.value.trim()

        capturedData[name] = value
      })

      await saveLearnedData(capturedData)
    })
  })
}

async function saveLearnedData(capturedData) {
  const data = await chrome.storage.local.get('personalInfo')
  const existingInfo = data.personalInfo || {}

  const learnedInfo = {}

  Object.entries(capturedData).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase().replace(/\s+/g, '') // Remove spaces for better matching

    for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
      const matches = patterns.some((pattern) => lowerKey.includes(pattern))

      if (matches) {
        learnedInfo[fieldName] = value
        break // Stop checking other patterns once we find a match
      }
    }
  })

  const mergedInfo = { ...existingInfo }
  Object.entries(learnedInfo).forEach(([key, value]) => {
    if (value && value.trim() !== '') {
      // skip empty values
      mergedInfo[key] = value
    }
  })

  await chrome.storage.local.set({ personalInfo: mergedInfo })
}

function initialize() {
  addExtensionIndicator()
  attachFormListeners()
  setTimeout(autofillPage, 500)

  // Watch for dynamically added forms
  const observer = new MutationObserver(() => {
    attachFormListeners()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
