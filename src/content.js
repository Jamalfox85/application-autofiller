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

async function autofillPage() {
  try {
    const personalInfoData = await chrome.storage.local.get('personalInfo')
    const personalInfo = personalInfoData.personalInfo

    const savedResponsesData = await chrome.storage.local.get('savedResponses')
    const savedResponses = savedResponsesData.savedResponses || {}

    if (!personalInfo) {
      return { success: false, message: 'No personal info saved' }
    }

    const inputs = document.querySelectorAll('input, textarea, select')
    let filledCount = 0

    inputs.forEach((input) => {
      // Skip hidden, submit, button inputs
      if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
        return
      }

      if (input.value && input.value.trim() !== '') {
        return
      }

      const name = (input.name || '').toLowerCase()
      const id = (input.id || '').toLowerCase()
      const placeholder = (input.placeholder || '').toLowerCase()
      const label = getFieldLabel(input)
      const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()

      const fieldText = `${name} ${id} ${placeholder} ${label} ${ariaLabel}`.toLowerCase()

      const fieldValue = matchFieldToData(fieldText, personalInfo, savedResponses)

      if (fieldValue) {
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

function matchFieldToData(fieldText, personalInfo, savedResponses) {
  console.log('Matching field:', fieldText)
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

  // Special case: Current loccation (May only be jobs.lever.co)
  if (fieldText.includes('location-input')) {
    const city = personalInfo.city || ''
    const state = personalInfo.state || ''
    return `${city}, ${state}`.trim()
  }

  // Education fields - use most recent education entry
  if (personalInfo.education && personalInfo.education.length > 0) {
    const latestEducation = personalInfo.education[0]

    // Check education patterns
    const educationFields = {
      schoolName: latestEducation.schoolName,
      degreeType: latestEducation.degreeType,
      major: latestEducation.major,
      graduationYear: latestEducation.graduationYear,
      gpa: latestEducation.gpa,
    }

    for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
      if (!educationFields.hasOwnProperty(fieldName)) continue

      for (const pattern of patterns) {
        if (fieldText.includes(pattern)) {
          return educationFields[fieldName] || null
        }
      }
    }
  }

  // Check special cases for saved responses
  const saved = matchSavedResponse(fieldText, savedResponses)
  if (saved != null) return saved

  return null
}

/**

 * Autopopulate if:
 *  - >= 3 tags appear in fieldText (substring or token hit), OR
 *  - >= 80% of title tokens appear in fieldText
 *
 * Returns best matching savedResponse.text, else null
 */
function matchSavedResponse(fieldText, savedResponses) {
  if (!fieldText || !Array.isArray(savedResponses) || savedResponses.length === 0) {
    return null
  }

  // Build token set once for fast membership checks
  const fieldTokens = new Set(tokenize(fieldText))

  let best = null

  for (const r of savedResponses) {
    const text = String(r?.text ?? '').trim()
    if (!text) continue

    // Keep this small and tuned to your domain; expand as needed.
    const STOPWORDS = new Set([])

    const titleNorm = normalizeText(r?.title ?? '')
    const titleTokens = tokenize(titleNorm).filter((t) => !STOPWORDS.has(t))
    const titleCoverage = coverageRatio(titleTokens, fieldTokens) // 0..1

    // Tag hits (>= 3)
    // Treat "tag found" as: any token from that tag exists in fieldTokens.
    const tags = Array.isArray(r?.tags) ? r.tags : []
    const tagTokens = tags.map(normalizeText).flatMap(tokenize).filter(Boolean)

    const uniqueTagTokens = [...new Set(tagTokens)]
    let tagHits = 0
    for (const t of uniqueTagTokens) {
      if (fieldTokens.has(t)) tagHits++
    }

    const passes = tagHits >= 3 || titleCoverage >= 0.8
    if (!passes) continue

    // Prefer title match strongly; tags are secondary
    const score = titleCoverage * 1000 + tagHits * 10 + titleTokens.length

    if (!best || score > best.score) {
      best = { score, text }
    }
  }

  return best ? best.text : null
}

// ---- helpers (keep consistent with your normalizer) ----

function tokenize(normStr) {
  if (!normStr) return []
  return String(normStr)
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function normalizeText(s) {
  // Use only if your saved response title/tags are not already normalized
  return String(s ?? '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function coverageRatio(titleTokens, fieldTokenSet) {
  if (!Array.isArray(titleTokens) || titleTokens.length === 0) return 0

  let hit = 0
  for (const t of titleTokens) {
    if (fieldTokenSet.has(t)) hit++
  }
  return hit / titleTokens.length
}

function getFieldLabel(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`)
    if (label) {
      return label.textContent.toLowerCase()
    }
  }

  const parentLabel = input.closest('label')
  if (parentLabel) {
    return parentLabel.textContent.toLowerCase()
  }

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
  const learnedEducation = {}

  Object.entries(capturedData).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase().replace(/[\s_-]/g, '')

    // Check for education fields
    if (lowerKey.includes('school') || lowerKey.includes('university')) {
      learnedEducation.schoolName = value
    } else if (lowerKey.includes('degree') && !lowerKey.includes('type')) {
      learnedEducation.degreeType = value
    } else if (lowerKey.includes('major') || lowerKey.includes('field')) {
      learnedEducation.major = value
    } else if (lowerKey.includes('graduation') || lowerKey.includes('gradyear')) {
      learnedEducation.graduationYear = value
    } else if (lowerKey.includes('gpa')) {
      learnedEducation.gpa = value
    } else {
      // Match against FIELD_PATTERNS for other fields
      for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
        const matches = patterns.some((pattern) => lowerKey.includes(pattern))
        if (matches) {
          learnedInfo[fieldName] = value
          break
        }
      }
    }
  })

  // If we learned education fields, add to education array
  if (Object.keys(learnedEducation).length > 0) {
    const education = existingInfo.education || []

    // Check if this school already exists
    const existingSchool = education.find((e) => e.schoolName === learnedEducation.schoolName)

    if (!existingSchool && learnedEducation.schoolName) {
      education.unshift({
        id: Date.now(),
        schoolName: learnedEducation.schoolName || '',
        degreeType: learnedEducation.degreeType || '',
        major: learnedEducation.major || '',
        graduationYear: learnedEducation.graduationYear || '',
        gpa: learnedEducation.gpa || '',
      })
      learnedInfo.education = education
    }
  }

  // Merge and save
  const mergedInfo = { ...existingInfo, ...learnedInfo }
  await chrome.storage.local.set({ personalInfo: mergedInfo })

  const totalLearned = Object.keys(learnedInfo).length + (learnedEducation.schoolName ? 1 : 0)
  showLearnNotification(totalLearned)
}

// function initialize() {
//   addExtensionIndicator()
//   attachFormListeners()

//   // Wait for real job form to appear (not captcha)
//   const foundForm = await waitForJobForm()

//   if (foundForm) {
//     // Add a small delay to ensure everything is loaded
//     setTimeout(autofillPage, 1000)
//   }

//   // Watch for dynamically added forms
//   const observer = new MutationObserver(() => {
//     attachFormListeners()
//   })

//   observer.observe(document.body, {
//     childList: true,
//     subtree: true,
//   })
// }

// // Initialize when page loads
// if (document.readyState === 'loading') {
//   document.addEventListener('DOMContentLoaded', initialize)
// } else {
//   initialize()
// }

let lastFormHtml = ''
let autofillDebounceTimer = null

function hasFormChanged() {
  const forms = document.querySelectorAll('form')
  const currentFormHtml = Array.from(forms)
    .map((f) => f.innerHTML)
    .join('')

  if (currentFormHtml !== lastFormHtml && currentFormHtml.length > 100) {
    lastFormHtml = currentFormHtml
    return true
  }
  return false
}

function debounceAutofill() {
  // Clear existing timer
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
  }

  // Wait 500ms after changes stop before autofilling
  autofillDebounceTimer = setTimeout(() => {
    console.log('🟡 CONTENT: Form changed, auto-filling...')
    autofillPage()
  }, 500)
}

function initialize() {
  addExtensionIndicator()
  attachFormListeners()

  // Initial autofill after page loads
  setTimeout(() => {
    autofillPage()
  }, 1000)

  // Watch for form changes (multi-step forms)
  const observer = new MutationObserver((mutations) => {
    // Check if forms were added or changed
    const hasFormMutation = mutations.some((mutation) => {
      return Array.from(mutation.addedNodes).some((node) => {
        return (
          node.nodeType === 1 &&
          (node.tagName === 'FORM' ||
            node.querySelector('form') ||
            node.querySelector('input') ||
            node.querySelector('textarea'))
        )
      })
    })

    if (hasFormMutation || hasFormChanged()) {
      console.log('🟡 CONTENT: Form structure changed!')
      attachFormListeners()
      debounceAutofill() // Auto-fill after changes settle
    }
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
