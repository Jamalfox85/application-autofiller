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
      const autoComplete = (input.autocomplete || '').toLowerCase().replace(/\s+/g, '_')

      const fieldText =
        `${name} ${id} ${placeholder} ${label} ${ariaLabel} ${autoComplete}`.toLowerCase()

      const fieldValue = matchFieldToData(fieldText, personalInfo, savedResponses)

      if (fieldValue) {
        // Handle SELECT elements differently
        if (input.tagName === 'SELECT') {
          if (setSelectValue(input, fieldValue)) {
            filledCount++
          }
        } else if (input.type === 'checkbox' || input.type === 'radio') {
          const normalizedFieldValue = String(fieldValue).toLowerCase()
          const isChecked =
            normalizedFieldValue === 'true' ||
            normalizedFieldValue === 'yes' ||
            normalizedFieldValue === '1'

          input.checked = isChecked

          // Trigger change event
          input.dispatchEvent(new Event('change', { bubbles: true }))

          filledCount++
        } else {
          // Handle regular inputs and textareas
          input.value = fieldValue

          // Trigger input events so the page recognizes the change
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))

          filledCount++
        }
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
  const normalizedFieldText = fieldText.toLowerCase().replace(/[\s_-]/g, '')

  // Special exclusion checks  i.e. - Don't match "city" if field contains these
  const exclusions = {
    address: ['2'],
    city: ['ethnicity', 'ethnic', 'race'],
    state: ['estate', 'statement', 'realestate'],
  }

  // Check standard fields
  for (const [key, patterns] of Object.entries(FIELD_PATTERNS)) {
    for (const pattern of patterns) {
      const normalizedPattern = pattern.toLowerCase().replace(/[\s_-]/g, '')
      if (normalizedFieldText.includes(normalizedPattern)) {
        if (exclusions[key]) {
          const hasExclusion = exclusions[key].some((excl) =>
            normalizedFieldText.includes(excl.toLowerCase()),
          )
          if (hasExclusion) {
            continue // Skip this pattern match
          }
        }

        return personalInfo[key] || null
      }
    }
  }

  // Special case: full name
  if (normalizedFieldText.includes('fullname')) {
    const firstName = personalInfo.firstName || ''
    const lastName = personalInfo.lastName || ''
    return `${firstName} ${lastName}`.trim()
  }

  // Special case: Current loccation (May only be jobs.lever.co)
  if (normalizedFieldText.includes('location-input')) {
    const city = personalInfo.city || ''
    const state = personalInfo.state || ''
    return `${city}, ${state}`.trim()
  }

  // Education fields - use most recent education entry
  if (personalInfo.education && personalInfo.education.length > 0) {
    const latestEducation = personalInfo.education[0]

    if (
      normalizedFieldText.includes('school') ||
      normalizedFieldText.includes('university') ||
      normalizedFieldText.includes('college')
    ) {
      return latestEducation.schoolName || null
    }

    if (normalizedFieldText.includes('degree') && !normalizedFieldText.includes('type')) {
      return latestEducation.degreeType || null
    }

    if (normalizedFieldText.includes('major') || normalizedFieldText.includes('study')) {
      return latestEducation.major || null
    }

    if (
      normalizedFieldText.includes('graduation') ||
      (normalizedFieldText.includes('year') && normalizedFieldText.includes('grad'))
    ) {
      return latestEducation.graduationYear || null
    }

    if (normalizedFieldText.includes('gpa')) {
      return latestEducation.gpa || null
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

function setSelectValue(selectElement, desiredValue) {
  const options = Array.from(selectElement.options)
  const normalizedDesired = desiredValue.toLowerCase().trim()

  // Try 1: Exact match (case-insensitive)
  let matchedOption = options.find(
    (opt) =>
      opt.value.toLowerCase() === normalizedDesired || opt.text.toLowerCase() === normalizedDesired,
  )

  // Try 2: Partial match - option contains desired value
  if (!matchedOption) {
    matchedOption = options.find(
      (opt) =>
        opt.value.toLowerCase().includes(normalizedDesired) ||
        opt.text.toLowerCase().includes(normalizedDesired),
    )
  }

  // Try 3: Partial match - desired value contains option
  if (!matchedOption) {
    matchedOption = options.find(
      (opt) =>
        normalizedDesired.includes(opt.value.toLowerCase()) ||
        normalizedDesired.includes(opt.text.toLowerCase()),
    )
  }

  if (matchedOption) {
    selectElement.value = matchedOption.value

    // Trigger change events
    selectElement.dispatchEvent(new Event('change', { bubbles: true }))
    selectElement.dispatchEvent(new Event('input', { bubbles: true }))

    return true
  }

  return false
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
// function addExtensionIndicator() {
//   // Only add on job application sites
//   const url = window.location.href.toLowerCase()
//   const jobSites = [
//     'greenhouse',
//     'workday',
//     'lever',
//     'indeed',
//     'linkedin',
//     'apply',
//     'careers',
//     'jobs',
//   ]

//   if (!jobSites.some((site) => url.includes(site))) {
//     return
//   }

//   const indicator = document.createElement('div')
//   indicator.id = 'job-autofill-indicator'
//   indicator.innerHTML = '⚡ Autofill Ready'
//   indicator.style.cssText = `
//     position: fixed;
//     bottom: 20px;
//     right: 20px;
//     background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
//     color: white;
//     padding: 8px 16px;
//     border-radius: 20px;
//     font-size: 12px;
//     font-weight: 600;
//     z-index: 999999;
//     box-shadow: 0 4px 12px rgba(0,0,0,0.15);
//     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
//     cursor: pointer;
//     transition: transform 0.2s;
//   `

//   indicator.addEventListener('mouseenter', () => {
//     indicator.style.transform = 'scale(1.05)'
//   })

//   indicator.addEventListener('mouseleave', () => {
//     indicator.style.transform = 'scale(1)'
//   })

//   indicator.addEventListener('click', () => {
//     chrome.runtime.sendMessage({ action: 'openPopup' })
//   })

//   document.body.appendChild(indicator)

//   // Auto-hide after 5 seconds
//   setTimeout(() => {
//     indicator.style.opacity = '0'
//     indicator.style.transition = 'opacity 0.5s'
//     setTimeout(() => indicator.remove(), 500)
//   }, 5000)
// }

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

  // Add notification and prompt styles
  const styles = document.createElement('style')
  styles.textContent = `
    /* Autofill Notification */
    .rapidapply-autofill-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      background: white;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      border-radius: 12px;
      padding: 16px 20px;
      opacity: 0;
      transform: translateY(-20px);
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
    }
    
    .rapidapply-autofill-notification.rapidapply-error {
      background: #FEE2E2;
    }
    
    .rapidapply-notification-content {
      display: flex;
      align-items: center;
      gap: 12px;
      color: #1a202c;
      font-size: 14px;
      font-weight: 500;
    }
    
    /* Autofill Prompt */
    .rapidapply-autofill-prompt {
      position: fixed;
      bottom: 30px;
      right: 30px;
      z-index: 999999;
      background: white;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      border-radius: 16px;
      padding: 0;
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.3s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
      max-width: 360px;
    }
    
    .rapidapply-prompt-content {
      padding: 20px;
    }
    
    .rapidapply-prompt-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 16px;
      font-weight: 700;
      color: #1a202c;
    }
    
    .rapidapply-prompt-content p {
      margin: 0 0 16px 0;
      color: #4a5568;
      font-size: 14px;
      line-height: 1.5;
    }
    
    .rapidapply-prompt-actions {
      display: flex;
      gap: 10px;
    }
    
    .rapidapply-btn-secondary {
      flex: 1;
      padding: 10px 16px;
      background: #f7fafc;
      color: #4a5568;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      font-family: inherit;
    }
    
    .rapidapply-btn-secondary:hover {
      background: #e2e8f0;
    }
    
    .rapidapply-btn-primary {
      flex: 1;
      padding: 10px 16px;
      background: #4f7cff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      font-family: inherit;
    }
    
    .rapidapply-btn-primary:hover {
      background: #4169e1;
    }
  `
  document.head.appendChild(styles)
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
        const matches = patterns.some((pattern) => {
          // IMPORTANT: Strip pattern of special chars too!
          const normalizedPattern = pattern.toLowerCase().replace(/[\s_-]/g, '')
          return lowerKey.includes(normalizedPattern)
        })
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

let hasShownPopup = false
let lastUrl = window.location.href
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

function debounceAutofill(autoDetectEnabled) {
  // Clear existing timer
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
  }

  // Wait 800ms after changes stop before autofilling
  autofillDebounceTimer = setTimeout(async () => {
    console.log('🟡 CONTENT: Form changed, checking autofill...')

    if (autoDetectEnabled) {
      // Auto-fill the new form
      const result = await autofillPage()
      if (result.success) {
        showAutofillNotification(result.fieldsCount)
      }
    } else {
      // Show prompt if we haven't already for this form
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }
  }, 800)
}

// function initialize() {
//   addExtensionIndicator()
//   attachFormListeners()

//   // Initial autofill after page loads
//   setTimeout(() => {
//     autofillPage()
//   }, 1000)

//   // Watch for form changes (multi-step forms)
//   const observer = new MutationObserver((mutations) => {
//     // Check if forms were added or changed
//     const hasFormMutation = mutations.some((mutation) => {
//       return Array.from(mutation.addedNodes).some((node) => {
//         return (
//           node.nodeType === 1 &&
//           (node.tagName === 'FORM' ||
//             node.querySelector('form') ||
//             node.querySelector('input') ||
//             node.querySelector('textarea'))
//         )
//       })
//     })

//     if (hasFormMutation || hasFormChanged()) {
//       attachFormListeners()
//       debounceAutofill() // Auto-fill after changes settle
//     }
//   })

//   observer.observe(document.body, {
//     childList: true,
//     subtree: true,
//   })
// }
// Add this function to your content.js
function isLikelyJobApplicationPage() {
  // Check URL for job-related keywords
  const url = window.location.href.toLowerCase()
  const jobKeywords = [
    'job',
    'career',
    'apply',
    'application',
    'applications',
    'recruit',
    'hiring',
    'employment',
    'position',
    'vacancy',
    'vacancies',
    'greenhouse',
    'workday',
    'lever',
    'indeed',
    'linkedin',
    'icims',
    'taleo',
    'smartrecruiters',
    'bamboohr',
  ]

  const hasJobKeyword = jobKeywords.some((keyword) => url.includes(keyword))

  // Check page content for job-related forms
  const forms = document.querySelectorAll('form')
  const inputs = document.querySelectorAll('input, textarea, select')

  // Look for job application field patterns
  const hasJobInputs = Array.from(inputs).some((input) => {
    const text =
      `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase()
    return (
      text.includes('resume') ||
      text.includes('cover') ||
      text.includes('application') ||
      text.includes('first name') ||
      text.includes('last name') ||
      text.includes('firstname') ||
      text.includes('lastname') ||
      text.includes('phone') ||
      text.includes('experience') ||
      text.includes('education')
    )
  })

  // Only consider it a job page if:
  // 1. URL has job keywords, OR
  // 2. Page has forms AND job-related input fields
  return hasJobKeyword || (forms.length > 0 && hasJobInputs)
}

async function initialize() {
  // Check if this is a job application page
  if (!isLikelyJobApplicationPage()) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'autofill') {
        sendResponse({
          success: false,
          message: 'This does not appear to be a job application page',
        })
      }
    })
    return
  }

  console.log('🟢 CONTENT: Job application page detected')

  addExtensionIndicator()
  attachFormListeners()

  // Get user's auto-detect preference
  const settings = await chrome.storage.local.get('autoDetectEnabled')
  const autoDetectEnabled = settings.autoDetectEnabled ?? true

  console.log('🔵 CONTENT: Auto-detect enabled:', autoDetectEnabled)

  if (autoDetectEnabled) {
    // Auto-detect is ON - auto-fill after delay
    setTimeout(async () => {
      const result = await autofillPage()
      if (result.success) {
        showAutofillNotification(result.fieldsCount)
      }
    }, 1000)
  } else {
    // Auto-detect is OFF - show popup prompt to user
    setTimeout(() => {
      if (!hasShownPopup) {
        showAutofillPrompt()
        hasShownPopup = true
      }
    }, 1000)
  }

  // Watch for form changes (multi-step forms)
  const observer = new MutationObserver((mutations) => {
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
      console.log('🟡 CONTENT: Form mutation detected!')
      hasShownPopup = false
      attachFormListeners()
      debounceAutofill(autoDetectEnabled)
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  // Watch for URL changes (SPA navigation)
  setInterval(() => {
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
      console.log('🟡 CONTENT: URL changed (SPA navigation)')
      lastUrl = currentUrl
      hasShownPopup = false

      setTimeout(async () => {
        if (autoDetectEnabled) {
          const result = await autofillPage()
          if (result.success) {
            showAutofillNotification(result.fieldsCount)
          }
        } else {
          showAutofillPrompt()
          hasShownPopup = true
        }
      }, 1000)
    }
  }, 500)
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}

function showAutofillNotification(fieldsCount) {
  // Remove existing notification if present
  const existing = document.querySelector('.rapidapply-autofill-notification')
  if (existing) {
    existing.remove()
  }

  const notification = document.createElement('div')
  notification.className = 'rapidapply-autofill-notification'
  notification.innerHTML = `
    <div class="rapidapply-notification-content">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="flex-shrink: 0;">
        <circle cx="10" cy="10" r="10" fill="#10B981"/>
        <path d="M6 10l3 3 5-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>✨ Auto-filled ${fieldsCount} field${fieldsCount !== 1 ? 's' : ''}</span>
    </div>
  `

  document.body.appendChild(notification)

  // Fade in
  setTimeout(() => {
    notification.style.opacity = '1'
    notification.style.transform = 'translateY(0)'
  }, 10)

  // Auto-remove after 4 seconds
  setTimeout(() => {
    notification.style.opacity = '0'
    notification.style.transform = 'translateY(-20px)'
    setTimeout(() => notification.remove(), 300)
  }, 4000)
}

function showAutofillPrompt() {
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
  prompt.querySelector('[data-action="dismiss"]').addEventListener('click', () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(-20px)'
    setTimeout(() => prompt.remove(), 300)
  })

  prompt.querySelector('[data-action="autofill"]').addEventListener('click', async () => {
    prompt.style.opacity = '0'
    prompt.style.transform = 'translateY(-20px)'
    setTimeout(() => prompt.remove(), 300)

    // Run autofill
    const result = await autofillPage()
    if (result.success) {
      showAutofillNotification(result.fieldsCount)
    } else {
      showErrorNotification(result.message)
    }
  })
}

function showErrorNotification(message) {
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
