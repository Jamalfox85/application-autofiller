import type { SiteRule } from './index.ts'
import { fillNativeInput, fillReactSelect } from '../inputHandlers.ts'
import { PersonalInfo } from '../../types/index.ts'

var lastFormSignature = ''

export default function workdayConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('myworkday'),
    // In your onMount:
    onMount: (personalInfo) => {
      console.log('Personal info on mount: ', personalInfo)

      let step2Handled = false

      const observer = new MutationObserver(async () => {
        const experienceAddBtn = document.querySelector(
          '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
        ) as HTMLElement
        const educationAddBtn = document.querySelector(
          '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
        ) as HTMLElement

        console.log(experienceAddBtn, 'educationAddBtn:', educationAddBtn)

        if (experienceAddBtn && educationAddBtn && !step2Handled) {
          step2Handled = true
          try {
            await handleWorkExperience(personalInfo)
            console.log('Work experience done')
          } catch (e) {
            console.log('handleWorkExperience error:', e)
          }

          try {
            await handleEducation(personalInfo)
            console.log('Education done')
          } catch (e) {
            console.log('handleEducation error:', e)
          }

          try {
            await handleSkills(personalInfo)
            console.log('Skills done')
          } catch (e) {
            console.log('handleSkills error:', e)
          }
        }
      })

      observer.observe(document.body, { childList: true, subtree: true })
      return () => observer.disconnect()
    },
    apply: (input, fieldText, personalInfo) => {
      const inputLabel =
        input.closest('[aria-labelledby="country-section"]')?.querySelector('label')?.textContent ||
        ''
      //   console.log('Workday INPUT: ', input, 'FIELD TEXT: ', fieldText) // --- IGNORE ---
      if (
        input.getAttribute('id') == 'name--legalName--firstName' ||
        input.getAttribute('data-automation-id') == 'firstName'
      ) {
        fillNativeInput(input, personalInfo.firstName || '')
        return true
      } else if (
        input.getAttribute('id') == 'name--legalName--middleName' ||
        input.getAttribute('data-automation-id') == 'middleName'
      ) {
        const middleName = personalInfo.middleName || '' // Middle name field doesn't currently exist in our personal info form, so this will always be blank for now
        fillNativeInput(input, middleName)
        return true
      } else if (
        input.getAttribute('id') == 'name--legalName--lastName' ||
        input.getAttribute('data-automation-id') == 'lastName'
      ) {
        fillNativeInput(input, personalInfo.lastName || '')
        return true
      } else if (input.getAttribute('id') == 'address--addressLine2') {
        return true // Disable input
      }
      return false
    },
    formChanged: () => {
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

    if (input) fillNativeInput(input, field.value)
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

  if (monthInput) fillNativeInput(monthInput, month)
  if (yearInput) fillNativeInput(yearInput, year)
}

const handleWorkExperience = async (personalInfo: PersonalInfo) => {
  console.log('handleWorkExperience called, entries:', personalInfo.experience)

  for (const experience of personalInfo.experience) {
    const addBtn = document.querySelector(
      '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
    ) as HTMLElement
    console.log('Work experience addBtn:', addBtn)
    if (!addBtn) break

    addBtn.click()
    console.log('Clicked work experience add button')

    // Wait for the inline form to appear
    let section: Element | null = null
    try {
      const el = await waitForElement(
        '[aria-labelledby^="Work-Experience-"][aria-labelledby$="-panel"] [data-automation-id="formField-jobTitle"]',
      )
      section = el.closest('[role="group"]')
      if (!section) {
        console.log('Could not find parent section')
        break
      }
      console.log('Found work experience section:', section)
    } catch (e) {
      console.log('waitForElement failed:', e)
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

    if (jobTitleInput) fillNativeInput(jobTitleInput, experience.jobTitle || '')
    if (companyInput) fillNativeInput(companyInput, experience.companyName || '')
    if (descriptionInput) fillNativeInput(descriptionInput, experience.description || '')

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
  for (const education of personalInfo.education) {
    const addBtn = document.querySelector(
      '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
    ) as HTMLElement
    console.log('Education addBtn:', addBtn)
    if (!addBtn) break

    addBtn.click()
    console.log('Clicked education add button')

    let section: Element
    try {
      const el = await waitForElement(
        '[aria-labelledby^="Education-"][aria-labelledby$="-panel"] [data-automation-id="formField-schoolName"]',
      )
      const closest = el.closest('[role="group"]')
      if (!closest) {
        console.log('Could not find parent section')
        break
      }
      section = closest
      console.log('Found education section:', section)
    } catch (e) {
      console.log('waitForElement failed:', e)
      break
    }

    const degreeBtn = section.querySelector(
      '[data-automation-id="formField-degree"] button[aria-haspopup="listbox"]',
    )
    const degreeInput = section.querySelector(
      '[data-automation-id="formField-degree"] input[type="text"]',
    )
    const majorInput = section.querySelector('[data-automation-id="formField-fieldOfStudy"] input')
    const fromYear = section.querySelector(
      '[data-automation-id="formField-firstYearAttended"] [data-automation-id="dateSectionYear-input"]',
    )

    console.log('degreeBtn:', degreeBtn)
    console.log('degreeInput:', degreeInput)
    console.log('majorInput:', majorInput)
    console.log('fromYear:', fromYear)
    console.log('education.degreeType:', education.degreeType)
    console.log('education.major:', education.major)
    console.log('education.graduationYear:', education.graduationYear)

    // School name - plain text input
    const schoolInput = section.querySelector(
      '[data-automation-id="formField-schoolName"] input',
    ) as HTMLInputElement
    if (schoolInput) fillNativeInput(schoolInput, education.schoolName || '')

    // Degree - Workday custom select (button-based)
    if (degreeBtn && degreeInput) {
      ;(degreeBtn as HTMLElement).click()

      try {
        // Wait until real options load (more than just "Select One")
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject('Degree options timeout'), 5000)
          const interval = setInterval(() => {
            const options = document.querySelectorAll('[role="option"]')
            if (options.length > 1) {
              clearInterval(interval)
              clearTimeout(timeout)
              resolve()
            }
          }, 100)
        })

        const options = document.querySelectorAll('[role="option"]')
        console.log(
          'Options found:',
          options.length,
          Array.from(options).map((o) => o.textContent),
        )

        const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '')

        const match = Array.from(options).find((el) =>
          normalize(el.textContent || '').includes(normalize(education.degreeType)),
        ) as HTMLElement | undefined

        console.log('Matched option:', match?.textContent)
        if (match) {
          match.click()
        } else {
          ;(degreeBtn as HTMLElement).click()
        }
      } catch (e) {
        ;(degreeBtn as HTMLElement).click() // close listbox to unblock
      }
    }

    // Field of study - multiselect search input
    if (education.major) {
      const majorInput = section.querySelector(
        '[data-automation-id="formField-fieldOfStudy"] [data-automation-id="searchBox"]',
      ) as HTMLInputElement

      if (majorInput) {
        // Focus and type to trigger search
        majorInput.click()
        majorInput.focus()
        fillNativeInput(majorInput, education.major)

        // Wait for options to appear then click the match
        try {
          await waitForElement('[role="option"]')
          const options = document.querySelectorAll('[role="option"]')
          const match = Array.from(options).find((el) =>
            el.textContent?.toLowerCase().includes(education.major.toLowerCase()),
          ) as HTMLElement | undefined

          if (match) {
            match.click()
          } else {
            // No exact match - click first option
            ;(options[0] as HTMLElement)?.click()
          }
        } catch (e) {
          console.log('No field of study options appeared:', e)
        }
      }
    }

    // GPA
    const gpaInput = section.querySelector(
      '[data-automation-id="formField-gradeAverage"] input',
    ) as HTMLInputElement
    if (gpaInput && education.gpa) fillNativeInput(gpaInput, education.gpa)

    // Dates - education only has YYYY, not MM/YYYY
    if (education.graduationYear) {
      const fromYear = section.querySelector(
        '[data-automation-id="formField-firstYearAttended"] [data-automation-id="dateSectionYear-input"]',
      ) as HTMLInputElement
      const toYear = section.querySelector(
        '[data-automation-id="formField-lastYearAttended"] [data-automation-id="dateSectionYear-input"]',
      ) as HTMLInputElement

      // Use graduation year as the "To" year
      if (fromYear) fillNativeInput(fromYear, education.graduationYear.toString())
      if (toYear) fillNativeInput(toYear, education.graduationYear.toString())
    }
  }
}

const handleSkills = async (personalInfo: PersonalInfo) => {
  if (!personalInfo.skills?.length) return

  const skillsInput = document.querySelector('#skills--skills') as HTMLInputElement
  if (!skillsInput) {
    console.log('Skills input not found')
    return
  }

  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '')
  const nativeSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set

  const typeSkill = async (skill: string) => {
    nativeSetter?.call(skillsInput, '')
    skillsInput.dispatchEvent(new Event('input', { bubbles: true }))

    for (const char of skill) {
      nativeSetter?.call(skillsInput, skillsInput.value + char)
      skillsInput.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
      skillsInput.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }))
      skillsInput.dispatchEvent(new Event('input', { bubbles: true }))
      skillsInput.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }))
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  const waitForOptions = () =>
    new Promise<NodeListOf<Element>>((resolve, reject) => {
      const timeout = setTimeout(() => reject('Skills options timeout'), 5000)
      const interval = setInterval(() => {
        const options = document.querySelectorAll('[data-automation-id="promptOption"]')
        if (options.length > 0) {
          clearInterval(interval)
          clearTimeout(timeout)
          resolve(options)
        }
      }, 1000)
    })

  const clearInput = async () => {
    nativeSetter?.call(skillsInput, '')
    skillsInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 800))
  }

  for (const skill of personalInfo.skills) {
    console.log('Adding skill:', skill)

    skillsInput.click()
    skillsInput.focus()
    await new Promise((resolve) => setTimeout(resolve, 300))

    await typeSkill(skill)

    // Wait after typing before pressing Enter
    await new Promise((resolve) => setTimeout(resolve, 1250))
    skillsInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
    )
    skillsInput.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }),
    )

    try {
      const options = await waitForOptions()

      // Wait after options appear before clicking
      await new Promise((resolve) => setTimeout(resolve, 2500))

      console.log(
        'Options found:',
        Array.from(options).map((o) => o.textContent),
      )

      const exactMatch = Array.from(options).find(
        (el) => normalize(el.textContent || '') === normalize(skill),
      ) as HTMLElement | undefined

      if (exactMatch) {
        console.log('Clicking exact match:', exactMatch.textContent)
        exactMatch.click()

        // Wait after clicking before clearing
        await new Promise((resolve) => setTimeout(resolve, 800))
        await clearInput()

        // Wait after clearing before next skill
        await new Promise((resolve) => setTimeout(resolve, 500))
      } else {
        console.log('No exact match, skipping skill:', skill)
        await clearInput()
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    } catch (e) {
      console.log('No options appeared for skill:', skill, e)
      await clearInput()
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}
