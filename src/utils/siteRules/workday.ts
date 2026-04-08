import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillWorkdayInput } from '../inputHandlers.ts'
import { PersonalInfo } from '../../types/index.ts'

var lastFormSignature = ''

export default function workdayConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('myworkday'),
    // In your onMount:
    onMount: (personalInfo) => {
      let step2Handled = false

      const observer = new MutationObserver(async () => {
        const experienceAddBtn = document.querySelector(
          '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
        ) as HTMLElement
        const educationAddBtn = document.querySelector(
          '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
        ) as HTMLElement

        if (experienceAddBtn && educationAddBtn && !step2Handled) {
          step2Handled = true
          try {
            await handleWorkExperience(personalInfo)
          } catch (e) {}

          try {
            await handleEducation(personalInfo)
          } catch (e) {}

          try {
            await handleSkills(personalInfo)
          } catch (e) {}
        }
      })

      observer.observe(document.body, { childList: true, subtree: true })
      return () => observer.disconnect()
    },
    apply: (input, fieldText, personalInfo) => {
      const inputLabel =
        input.closest('[aria-labelledby="country-section"]')?.querySelector('label')?.textContent ||
        ''
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: (mutations) => {
      const container = document.querySelector('[data-automation-id="applyFlowPage"]')
      if (!container) return false

      const form = document.querySelector<HTMLFormElement>(
        '[data-automation-id="applyFlowMyInfoPage"]',
      )
      if (!form) return false

      const formId = form.id || form.className || 'unnamed'
      const inputs = form.querySelectorAll<HTMLInputElement>('input, textarea, select')
      const inputSignature = Array.from(inputs)
        .map((input) => `${input.tagName}:${input.name || input.id || input.type}`)
        .join(',')
      const currentSignature = `${formId}:[${inputSignature}]`

      if (currentSignature !== lastFormSignature && currentSignature.length > 0) {
        lastFormSignature = currentSignature
        return true
      }
      return false
    },
  }
}

const fieldHandlers: Array<{
  match: FieldMatch
  handle: FieldHandler
}> = [
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'name--legalName--firstName'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.firstName || '')
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'name--legalName--lastName'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.lastName || '')
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'address--addressLine1'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.address || '')
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'address--addressLine2'
    },
    handle: async () => {
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'address--city'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.city || '')
      // also match state

      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'address--postalCode'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.zip || '')
      return true
    },
  },
  {
    match: (input, _) => {
      return input.getAttribute('id') == 'phoneNumber--phoneNumber'
    },
    handle: async (input, _, personalInfo) => {
      fillWorkdayInput(input as HTMLInputElement, personalInfo.phone || '')
      return true
    },
  },
]

// helpers

const waitForElement = (selector: string, timeout = 3000): Promise<Element> =>
  new Promise((resolve, reject) => {
    const el = document.querySelector(selector)
    if (el) return resolve(el)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => {
      observer.disconnect()
      reject(`Timeout: ${selector}`)
    }, timeout)
  })

const fillWorkdaySection = (
  section: Element,
  fields: { automationId: string; value: string | null; isDate?: boolean }[],
) => {
  for (const field of fields) {
    if (!field.value) continue

    if (field.isDate) {
      fillWorkdayDate(section, field.automationId, field.value)
      continue
    }

    const input = section.querySelector(
      `[data-automation-id="${field.automationId}"] input, [data-automation-id="${field.automationId}"] textarea`,
    ) as HTMLInputElement | HTMLTextAreaElement | null

    if (input) fillWorkdayInput(input, field.value)
  }
}

const fillWorkdayDate = (section: Element, fieldAutomationId: string, value: string) => {
  // value expected as YYYY-MM or MM/YYYY
  let month: string, year: string
  if (value.includes('-')) {
    ;[year, month] = value.split('-') // handles "2023-03"
  } else {
    ;[month, year] = value.split('/') // handles "03/2023"
  }

  const monthInput = section.querySelector(
    `[data-automation-id="${fieldAutomationId}"] [data-automation-id="dateSectionMonth-input"]`,
  ) as HTMLInputElement
  const yearInput = section.querySelector(
    `[data-automation-id="${fieldAutomationId}"] [data-automation-id="dateSectionYear-input"]`,
  ) as HTMLInputElement

  if (monthInput) fillWorkdayInput(monthInput, month)
  if (yearInput) fillWorkdayInput(yearInput, year)
}

const handleWorkExperience = async (personalInfo: PersonalInfo) => {
  for (const experience of personalInfo.experience) {
    const addBtn = document.querySelector(
      '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
    ) as HTMLElement
    if (!addBtn) break

    addBtn.click()

    // Wait for the inline form to appear
    let section: Element | null = null
    try {
      const el = await waitForElement(
        '[aria-labelledby^="Work-Experience-"][aria-labelledby$="-panel"] [data-automation-id="formField-jobTitle"]',
      )
      section = el.closest('[role="group"]')
      if (!section) {
        break
      }
    } catch (e) {
      break
    }

    // Fill text inputs
    const jobTitleInput = section.querySelector(
      '[data-automation-id="formField-jobTitle"] input',
    ) as HTMLInputElement
    const companyInput = section.querySelector(
      '[data-automation-id="formField-companyName"] input',
    ) as HTMLInputElement
    const descriptionInput = section.querySelector(
      '[data-automation-id="formField-roleDescription"] textarea',
    ) as HTMLTextAreaElement
    const locationInput = section.querySelector(
      '[data-automation-id="formField-location"] input',
    ) as HTMLInputElement

    if (jobTitleInput) fillWorkdayInput(jobTitleInput, experience.jobTitle || '')
    if (companyInput) fillWorkdayInput(companyInput, experience.companyName || '')
    if (descriptionInput) fillWorkdayInput(descriptionInput, experience.description || '')
    if (locationInput)
      fillWorkdayInput(
        locationInput,
        `${experience.locationCity}, ${experience.locationState}` || '',
      )

    // Fill dates
    if (experience.startDate) fillWorkdayDate(section, 'formField-startDate', experience.startDate)

    // Handle endDate - check "currently work here" if no end date
    if (experience.present || !experience.endDate) {
      const currentlyWorkHere = section.querySelector(
        '[data-automation-id="formField-currentlyWorkHere"] input[type="checkbox"]',
      ) as HTMLInputElement
      if (currentlyWorkHere) currentlyWorkHere.click()
    } else {
      fillWorkdayDate(section, 'formField-endDate', experience.endDate)
    }
  }
}

const handleEducation = async (personalInfo: PersonalInfo) => {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '')

  const typeAndEnter = async (input: HTMLInputElement, value: string) => {
    input.click()
    input.focus()
    await fillWorkdayInput(input, value)
    await new Promise((r) => setTimeout(r, 200))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }))
    await new Promise((r) => setTimeout(r, 200))
  }

  for (const education of personalInfo.education) {
    const addBtn = document.querySelector(
      '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
    ) as HTMLElement
    if (!addBtn) break
    addBtn.click()

    let section: Element
    try {
      const el = await waitForElement(
        '[aria-labelledby^="Education-"][aria-labelledby$="-panel"] [data-automation-id="formField-school"]',
      )
      section = el.closest('[role="group"]')!
      if (!section) break
    } catch (e) {
      break
    }

    // School
    const schoolInput = section.querySelector(
      '[data-automation-id="formField-school"] input',
    ) as HTMLInputElement
    if (schoolInput && education.schoolName) {
      await typeAndEnter(schoolInput, education.schoolName)
    }

    // Degree — button-based listbox
    const degreeBtn = section.querySelector(
      '[data-automation-id="formField-degree"] button[aria-haspopup="listbox"]',
    ) as HTMLElement
    if (degreeBtn && education.degreeType) {
      degreeBtn.click()
      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject('Degree timeout'), 5000)
          const observer = new MutationObserver(() => {
            const opts = document.querySelectorAll('[role="option"]')
            if (opts.length > 1) {
              clearTimeout(timeout)
              observer.disconnect()
              resolve()
            }
          })
          observer.observe(document.body, { childList: true, subtree: true })
        })
        const options = document.querySelectorAll('[role="option"]')
        const match = Array.from(options).find((el) =>
          normalize(el.textContent || '').includes(normalize(education.degreeType)),
        ) as HTMLElement | undefined
        match ? match.click() : degreeBtn.click()
      } catch {
        degreeBtn.click()
      }
    }

    // Field of study
    const majorInput = section.querySelector(
      '[data-automation-id="formField-fieldOfStudy"] input',
    ) as HTMLInputElement
    if (majorInput && education.major) {
      await typeAndEnter(majorInput, education.major)
    }

    // GPA
    const gpaInput = section.querySelector(
      '[data-automation-id="formField-gradeAverage"] input',
    ) as HTMLInputElement
    if (gpaInput && education.gpa) {
      await fillWorkdayInput(gpaInput, education.gpa)
    }

    // Years
    const fromYear = section.querySelector(
      '[data-automation-id="formField-firstYearAttended"] [data-automation-id="dateSectionYear-input"]',
    ) as HTMLInputElement
    const toYear = section.querySelector(
      '[data-automation-id="formField-lastYearAttended"] [data-automation-id="dateSectionYear-input"]',
    ) as HTMLInputElement

    if (fromYear && education.startYear) {
      await fillWorkdayInput(fromYear, education.startYear.toString())
    }
    if (toYear && education.graduationYear) {
      await fillWorkdayInput(toYear, education.graduationYear.toString())
    }
  }
}
const handleSkills = async (personalInfo: PersonalInfo) => {
  if (!personalInfo.skills?.length) return

  const skillsInput = document.querySelector('#skills--skills') as HTMLInputElement
  if (!skillsInput) return

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '')

  const reactPropsKey = Object.keys(skillsInput).find((key) => key.startsWith('__reactProps'))
  const reactProps = reactPropsKey ? (skillsInput as any)[reactPropsKey] : null
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set

  // Type the full value at once via React's onChange if available,
  // otherwise fall back to nativeSetter + input event
  const typeIntoInput = (value: string) => {
    nativeSetter?.call(skillsInput, value)
    if (reactProps?.onChange) {
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, 'target', { writable: false, value: skillsInput })
      reactProps.onChange(event)
    } else {
      skillsInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  // MutationObserver-based wait — resolves as soon as options appear, no polling delay
  const waitForOptions = (timeout = 5000) =>
    new Promise<NodeListOf<Element>>((resolve, reject) => {
      const existing = document.querySelectorAll('[data-automation-id="promptOption"]')
      if (existing.length > 0) return resolve(existing)

      const timer = setTimeout(() => {
        observer.disconnect()
        reject('Skills options timeout')
      }, timeout)

      const observer = new MutationObserver(() => {
        const options = document.querySelectorAll('[data-automation-id="promptOption"]')
        if (options.length > 0) {
          clearTimeout(timer)
          observer.disconnect()
          resolve(options)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })

  for (const skill of personalInfo.skills) {
    skillsInput.focus()
    typeIntoInput(skill)

    try {
      const options = await waitForOptions()

      const exactMatch = Array.from(options).find(
        (el) => normalize(el.textContent || '') === normalize(skill),
      ) as HTMLElement | undefined

      const firstOption = options[0] as HTMLElement

      // Prefer exact match, fall back to first option
      ;(exactMatch ?? firstOption)?.click()

      // Only wait long enough for Workday to register the selection
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Clear for next skill
      typeIntoInput('')
      await new Promise((resolve) => setTimeout(resolve, 150))
    } catch {
      typeIntoInput('')
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
}
