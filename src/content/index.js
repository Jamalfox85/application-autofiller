// Runs on all pages on load
console.log('LOADED CONTENT SCRIPT')

import { autofillPage, debounceAutofill } from './autofill.ts'
import { showAutofillNotification, showAutofillPrompt } from './notifications.ts'
import { jobPlatforms, excludePatterns, applicationUrlPatterns } from '../utils/jobSitePatterns.ts'
import { siteRules } from '../utils/siteRules.ts'

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'autofill') {
    autofillPage().then((result) => {
      sendResponse(result)
    })
    return true // Keep message channel open for async response
  }
})

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

      //   await saveLearnedData(capturedData)
    })
  })
}

// async function saveLearnedData(capturedData) {
//   const data = await chrome.storage.local.get('personalInfo')
//   const existingInfo = data.personalInfo || {}

//   const learnedInfo = {}
//   const learnedEducation = {}

//   Object.entries(capturedData).forEach(([key, value]) => {
//     const lowerKey = key.toLowerCase().replace(/[\s_-]/g, '')

//     // Check for education fields
//     if (lowerKey.includes('school') || lowerKey.includes('university')) {
//       learnedEducation.schoolName = value
//     } else if (lowerKey.includes('degree') && !lowerKey.includes('type')) {
//       learnedEducation.degreeType = value
//     } else if (lowerKey.includes('major') || lowerKey.includes('field')) {
//       learnedEducation.major = value
//     } else if (lowerKey.includes('graduation') || lowerKey.includes('gradyear')) {
//       learnedEducation.graduationYear = value
//     } else if (lowerKey.includes('gpa')) {
//       learnedEducation.gpa = value
//     } else {
//       // Match against FIELD_PATTERNS for other fields
//       for (const [fieldName, patterns] of Object.entries(FIELD_PATTERNS)) {
//         const matches = patterns.some((pattern) => {
//           // IMPORTANT: Strip pattern of special chars too!
//           const normalizedPattern = pattern.toLowerCase().replace(/[\s_-]/g, '')
//           return lowerKey.includes(normalizedPattern)
//         })
//         if (matches) {
//           learnedInfo[fieldName] = value
//           break
//         }
//       }
//     }
//   })

//   // If we learned education fields, add to education array
//   if (Object.keys(learnedEducation).length > 0) {
//     const education = existingInfo.education || []

//     // Check if this school already exists
//     const existingSchool = education.find((e) => e.schoolName === learnedEducation.schoolName)

//     if (!existingSchool && learnedEducation.schoolName) {
//       education.unshift({
//         id: Date.now(),
//         schoolName: learnedEducation.schoolName || '',
//         degreeType: learnedEducation.degreeType || '',
//         major: learnedEducation.major || '',
//         graduationYear: learnedEducation.graduationYear || '',
//         gpa: learnedEducation.gpa || '',
//       })
//       learnedInfo.education = education
//     }
//   }

//   // Merge and save
//   const mergedInfo = { ...existingInfo, ...learnedInfo }
//   await chrome.storage.local.set({ personalInfo: mergedInfo })

//   const totalLearned = Object.keys(learnedInfo).length + (learnedEducation.schoolName ? 1 : 0)
// }

let lastFormSignature = ''

function hasFormChanged() {
  const activeSiteRule = siteRules.find((rule) => rule.detect())
  const currentSignature = activeSiteRule?.formChanged
    ? activeSiteRule.formChanged()
    : getDefaultFormSignature()

  if (currentSignature !== lastFormSignature && currentSignature.length > 0) {
    lastFormSignature = currentSignature
    return true
  }
  return false
}

function getDefaultFormSignature() {
  const forms = document.querySelectorAll('form')

  // Create a signature of current forms (IDs + input count + input names)
  const currentSignature = Array.from(forms)
    .map((f) => {
      const formId = f.id || f.className || 'unnamed'
      const inputs = f.querySelectorAll('input, textarea, select')
      const inputSignature = Array.from(inputs)
        .map((input) => `${input.tagName}:${input.name || input.id || input.type}`)
        .join(',')
      return `${formId}:[${inputSignature}]`
    })
    .join('|')

  return currentSignature
}

function isLikelyJobApplicationPage() {
  const url = window.location.href.toLowerCase()

  const isJobPlatform = jobPlatforms.some((platform) => url.includes(platform))
  if (isJobPlatform) {
    return true
  }

  if (excludePatterns.some((pattern) => url.includes(pattern))) {
    return false
  }

  const hasApplicationUrl = applicationUrlPatterns.some((pattern) => url.includes(pattern))

  // Check for job application input fields
  const inputs = document.querySelectorAll('input, textarea, select')
  const jobFieldPatterns = [
    'resume',
    'cv',
    'cover.letter',
    'coverletter',
    'linkedin',
    'portfolio',
    'salary',
    'visa',
    'sponsor',
    'authorized',
    'work.authorization',
  ]

  const basicFieldPatterns = ['first.?name', 'last.?name', 'email', 'phone']

  let jobFieldCount = 0
  let basicFieldCount = 0

  inputs.forEach((input) => {
    const text =
      `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase()

    if (jobFieldPatterns.some((p) => new RegExp(p).test(text))) {
      jobFieldCount++
    }
    if (basicFieldPatterns.some((p) => new RegExp(p).test(text))) {
      basicFieldCount++
    }
  })

  // It's likely a job application if:
  // 1. URL suggests application page AND has basic form fields, OR
  // 2. Page has job-specific fields (resume, cover letter, etc.)
  const hasForm = document.querySelectorAll('form').length > 0

  return (hasApplicationUrl && hasForm && basicFieldCount >= 2) || jobFieldCount >= 1
}

async function initialize() {
  // Check if this is a job application page
  if (!isLikelyJobApplicationPage()) {
    return
  }

  attachFormListeners()

  // Get user's auto-detect preference
  const settings = await chrome.storage.local.get('autoDetectEnabled')
  const autoDetectEnabled = settings.autoDetectEnabled ?? true

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
    const hasStructuralChange = mutations.some(
      (mutation) => mutation.type === 'childList' && mutation.addedNodes.length > 0,
    )

    if (hasStructuralChange && hasFormChanged()) {
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
    let lastUrl = window.location.href
    const currentUrl = window.location.href
    if (currentUrl !== lastUrl) {
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
