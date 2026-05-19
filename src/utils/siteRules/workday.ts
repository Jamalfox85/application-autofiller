import type { SiteRule, FieldMatch, FieldHandler } from '../../types/index.ts'
import { fillWorkdayInput } from '../inputHandlers.ts'
import { PersonalInfo } from '../../types/index.ts'

var lastFormSignature = ''

export default function workdayConfig(): SiteRule {
  return {
    detect: () => window.location.hostname.includes('myworkday'),
    // In your onMount:
    onMount: (personalInfo) => {
      console.log('PING - Plugin initialized')
      let applyManuallyClicked = false
      let signInWithEmailClicked = false
      let createAccountClicked = false
      let accountInputHandled = false
      let formStarted = false
      let phoneTypeHandled = false
      let stateHandled = false
      let disabilityHandled = false
      let selfIdNameHandled = false
      let selfIdDateHandled = false

      const observer = new MutationObserver(async () => {
        try {
          // Step 1: Click "Apply Manually" link
          if (!applyManuallyClicked) {
            const applyManuallyLink = document.querySelector(
              '[data-automation-id="applyManually"]',
            ) as HTMLElement

            if (applyManuallyLink) {
              applyManuallyClicked = true
              console.log('✓ Found and clicking Apply Manually link')
              applyManuallyLink.click()
              await new Promise((resolve) => setTimeout(resolve, 1500))
              return
            }
          }

          // Step 2: Click "Sign in with email" button
          if (!signInWithEmailClicked) {
            const signInWithEmailBtn = document.querySelector(
              'button[data-automation-id="SignInWithEmailButton"]',
            ) as HTMLButtonElement

            if (signInWithEmailBtn) {
              signInWithEmailClicked = true
              console.log('✓ Found and clicking Sign in with email button')
              signInWithEmailBtn.click()
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
          }

          // Step 3: Click "Create Account" button
          if (!createAccountClicked) {
            const createAccountBtn = document.querySelector(
              'button[data-automation-id="createAccountLink"]',
            ) as HTMLButtonElement

            if (createAccountBtn) {
              createAccountClicked = true
              console.log('✓ Found and clicking Create Account button')
              createAccountBtn.click()
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
          }

          // Step 4: Fill in account information
          if (!accountInputHandled) {
            const accountEmailInput = document.querySelector(
              '[data-automation-id="email"]',
            ) as HTMLInputElement

            if (accountEmailInput) {
              accountInputHandled = true
              console.log('✓ Account form loaded, filling account details')
              await handleAccountInput(personalInfo)
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
          }

          // Step 5: Fill in work experience and education once those buttons appear
          if (!formStarted) {
            const experienceAddBtn = document.querySelector(
              '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
            ) as HTMLElement
            const educationAddBtn = document.querySelector(
              '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
            ) as HTMLElement

            if (experienceAddBtn && educationAddBtn) {
              formStarted = true
              console.log('✓ Application form loaded, starting to fill fields')

              try {
                await handleWorkExperience(personalInfo)
              } catch (e) {
                console.error('Error handling work experience:', e)
              }

              try {
                await handleEducation(personalInfo)
              } catch (e) {
                console.error('Error handling education:', e)
              }

              try {
                // await handleSkills(personalInfo)
              } catch (e) {
                console.error('Error handling skills:', e)
              }
            }
          }

          // Step 6: Fill phone type select
          if (!phoneTypeHandled) {
            const phoneTypeButton = document.querySelector(
              'button[name="phoneType"]',
            ) as HTMLButtonElement

            console.log('Phone type button found:', !!phoneTypeButton)
            console.log('Phone type button text:', phoneTypeButton?.textContent)

            if (phoneTypeButton && !phoneTypeButton.textContent?.includes('Mobile')) {
              phoneTypeHandled = true
              console.log('✓ Phone type select found, filling...')

              // Click the button to open the dropdown
              phoneTypeButton.click()
              console.log('✓ Clicked phone type button to open dropdown')
              await new Promise((resolve) => setTimeout(resolve, 1000))

              // Log all available options
              const allOptions = Array.from(document.querySelectorAll('[role="option"]'))
              console.log('All options found:', allOptions.length)
              console.log(
                'Option texts:',
                allOptions.map((el) => el.textContent?.trim()),
              )

              // Find and click "Mobile" option
              const mobileOption = allOptions.find(
                (el) => el.textContent?.trim() === 'Mobile',
              ) as HTMLElement

              console.log('Mobile option found:', !!mobileOption)
              console.log('Mobile option element:', mobileOption)

              if (mobileOption) {
                mobileOption.click()
                console.log('✓ Selected "Mobile"')
                await new Promise((resolve) => setTimeout(resolve, 500))
              } else {
                console.error('Mobile option not found')
              }
            }
          }

          // Step 7: Fill state select
          if (!stateHandled) {
            const stateButton = document.querySelector(
              'button[name="countryRegion"]',
            ) as HTMLButtonElement

            console.log('State button found:', !!stateButton)
            console.log('State button text:', stateButton?.textContent)

            if (stateButton && !stateButton.textContent?.includes(personalInfo.state)) {
              stateHandled = true
              console.log('✓ State select found, filling...')

              // Click the button to open the dropdown
              stateButton.click()
              console.log('✓ Clicked state button to open dropdown')
              await new Promise((resolve) => setTimeout(resolve, 1000))

              // Find and click the state option matching personalInfo.state
              const stateOption = Array.from(document.querySelectorAll('[role="option"]')).find(
                (el) => el.textContent?.trim() === personalInfo.state,
              ) as HTMLElement

              console.log('State option found:', !!stateOption)
              console.log('Looking for state:', personalInfo.state)

              if (stateOption) {
                stateOption.click()
                console.log('✓ Selected state:', personalInfo.state)
                await new Promise((resolve) => setTimeout(resolve, 500))
              } else {
                console.error('State option not found for:', personalInfo.state)
                // Log available states for debugging
                const allOptions = Array.from(document.querySelectorAll('[role="option"]'))
                console.log(
                  'Available states:',
                  allOptions.map((el) => el.textContent?.trim()),
                )
              }
            }
          }

          // Step 8: Fill disability status
          if (!disabilityHandled) {
            const disabilityCheckboxes = document.querySelectorAll(
              '[data-automation-id="disabilityStatus-CheckboxGroup"] input[type="checkbox"]',
            )

            console.log('Disability checkboxes found:', disabilityCheckboxes.length)

            if (disabilityCheckboxes.length > 0 && personalInfo.disabilityStatus) {
              disabilityHandled = true
              console.log('✓ Disability form found, selecting:', personalInfo.disabilityStatus)

              // Map personalInfo.disabilityStatus to checkbox position
              let checkboxIndex = -1
              if (personalInfo.disabilityStatus === 'yes') {
                checkboxIndex = 0 // "Yes, I have a disability..."
              } else if (personalInfo.disabilityStatus === 'no') {
                checkboxIndex = 1 // "No, I do not have a disability..."
              } else if (personalInfo.disabilityStatus === 'decline') {
                checkboxIndex = 2 // "I do not want to answer"
              }

              if (checkboxIndex >= 0 && checkboxIndex < disabilityCheckboxes.length) {
                const targetCheckbox = disabilityCheckboxes[checkboxIndex] as HTMLInputElement
                targetCheckbox.click()
                console.log('✓ Selected disability option:', personalInfo.disabilityStatus)
                await new Promise((resolve) => setTimeout(resolve, 500))
              } else {
                console.error('Invalid disability status:', personalInfo.disabilityStatus)
              }
            }
          }
          // Step 9: Fill self-identification name
          if (!selfIdNameHandled) {
            const nameInput = document.querySelector(
              '[data-automation-id="formField-name"] input',
            ) as HTMLInputElement

            if (nameInput) {
              selfIdNameHandled = true
              console.log('✓ Self-identification name field found')
              const fullName = `${personalInfo.firstName} ${personalInfo.lastName}`
              await fillWorkdayInput(nameInput, fullName)
              console.log('✓ Filled self-identification name:', fullName)
              await new Promise((resolve) => setTimeout(resolve, 500))
            }
          }

          // Step 10: Fill self-identification date (current date)
          if (!selfIdDateHandled) {
            const dateWrapper = document.querySelector(
              '[id="selfIdentifiedDisabilityData--dateSignedOn"]',
            ) as HTMLElement

            if (dateWrapper) {
              selfIdDateHandled = true
              console.log('✓ Self-identification date wrapper found')

              // Get today's date
              const today = new Date()
              const month = String(today.getMonth() + 1).padStart(2, '0')
              const day = String(today.getDate()).padStart(2, '0')
              const year = String(today.getFullYear())

              // Fill month
              const monthInput = dateWrapper.querySelector(
                '[data-automation-id="dateSectionMonth-input"]',
              ) as HTMLInputElement
              if (monthInput) {
                await fillWorkdayInput(monthInput, month)
                console.log('✓ Filled month:', month)
                await new Promise((resolve) => setTimeout(resolve, 300))
              }

              // Fill day
              const dayInput = dateWrapper.querySelector(
                '[data-automation-id="dateSectionDay-input"]',
              ) as HTMLInputElement
              if (dayInput) {
                await fillWorkdayInput(dayInput, day)
                console.log('✓ Filled day:', day)
                await new Promise((resolve) => setTimeout(resolve, 300))
              }

              // Fill year
              const yearInput = dateWrapper.querySelector(
                '[data-automation-id="dateSectionYear-input"]',
              ) as HTMLInputElement
              if (yearInput) {
                await fillWorkdayInput(yearInput, year)
                console.log('✓ Filled year:', year)
                await new Promise((resolve) => setTimeout(resolve, 300))
              }

              console.log('✓ Filled self-identification date:', `${month}/${day}/${year}`)
            }
          }
        } catch (error) {
          console.error('Error in mutation observer:', error)
        }
      })

      observer.observe(document.body, { childList: true, subtree: true })
      return () => observer.disconnect()
    },
    apply: (input, fieldText, personalInfo) => {
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
    match: (_, fieldText) => {
      return fieldText.includes('howdidyouhearaboutus')
    },
    handle: async (input, _, personalInfo) => {
      try {
        console.log('Handling "How Did You Hear About Us" field')

        // Find the search input
        const searchInput = document.querySelector(
          '[data-uxi-widget-type="selectinput"][id*="source"]',
        ) as HTMLInputElement

        if (!searchInput) {
          console.error('Search input not found')
          return false
        }

        // Click to open dropdown
        searchInput.click()
        console.log('✓ Clicked search input to open dropdown')

        // Wait for options to load and appear in the DOM
        await new Promise((resolve) => setTimeout(resolve, 1000))

        // Now find "Internet Job Board" option by text and click it
        let internetJobBoardOption = Array.from(
          document.querySelectorAll('[data-automation-id="promptOption"]'),
        ).find((el) => el.textContent?.trim() === 'Internet Job Board') as HTMLElement

        if (internetJobBoardOption) {
          console.log('✓ Found "Internet Job Board" option, clicking...')
          internetJobBoardOption.click()
          console.log('✓ Clicked "Internet Job Board"')
          await new Promise((resolve) => setTimeout(resolve, 1000))
        } else {
          console.error('Internet Job Board option not found')
          console.log(
            'Available options:',
            Array.from(document.querySelectorAll('[data-automation-id="promptOption"]')).map((el) =>
              el.textContent?.trim(),
            ),
          )
          return false
        }

        // Find and click "Indeed" option
        const indeedOption = Array.from(
          document.querySelectorAll('[data-automation-id="promptOption"]'),
        ).find((el) => el.textContent?.trim() === 'Indeed') as HTMLElement

        if (indeedOption) {
          console.log('✓ Found "Indeed" option, clicking...')
          indeedOption.click()
          console.log('✓ Clicked "Indeed"')
          return true
        } else {
          console.error('Indeed option not found')
          console.log(
            'Available options:',
            Array.from(document.querySelectorAll('[data-automation-id="promptOption"]')).map((el) =>
              el.textContent?.trim(),
            ),
          )
          return false
        }
      } catch (error) {
        console.error('Error in "How Did You Hear About Us" handler:', error)
        return false
      }
    },
  },
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
      return input.getAttribute('id') == 'name--legalName--middleName'
    },
    handle: async (input, _, personalInfo) => {
      return true // skip middle name on workday
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

const handleAccountInput = async (personalInfo: PersonalInfo) => {
  try {
    console.log('Starting account input fill...')

    // Wait longer for the form to fully render
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get the form inputs
    const emailInput = document.querySelector('[data-automation-id="email"]') as HTMLInputElement
    const passwordInput = document.querySelector(
      '[data-automation-id="password"]',
    ) as HTMLInputElement
    const verifyPasswordInput = document.querySelector(
      '[data-automation-id="verifyPassword"]',
    ) as HTMLInputElement
    const createAccountCheckbox = document.querySelector(
      '[data-automation-id="createAccountCheckbox"]',
    ) as HTMLInputElement

    console.log('Email input found:', !!emailInput)
    console.log('Password input found:', !!passwordInput)
    console.log('Verify password input found:', !!verifyPasswordInput)
    console.log('Checkbox found:', !!createAccountCheckbox)

    // Fill email
    if (emailInput) {
      console.log('Filling email with:', personalInfo.accountEmail)
      emailInput.value = personalInfo.accountEmail || ''
      emailInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      emailInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      await new Promise((resolve) => setTimeout(resolve, 300))
      console.log('Email filled. Input now shows:', emailInput.value)
    }

    // Fill password
    if (passwordInput) {
      console.log('Filling password')
      passwordInput.value = personalInfo.accountPassword || ''
      passwordInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      passwordInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      await new Promise((resolve) => setTimeout(resolve, 300))
      console.log('Password filled. Input now shows:', passwordInput.value)
    }

    // Fill verify password
    if (verifyPasswordInput) {
      console.log('Filling verify password')
      verifyPasswordInput.value = personalInfo.accountPassword || ''
      verifyPasswordInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      verifyPasswordInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
      await new Promise((resolve) => setTimeout(resolve, 300))
      console.log('Verify password filled. Input now shows:', verifyPasswordInput.value)
    }

    // Check the agreement checkbox
    if (createAccountCheckbox && !createAccountCheckbox.checked) {
      createAccountCheckbox.click()
      console.log('✓ Checked account agreement')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Wait for form to stabilize after all inputs are filled
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // The actual clickable element is the div with data-automation-id="click_filter"
    // The submit button is hidden (aria-hidden="true")
    const clickFilterDiv = document.querySelector(
      '[data-automation-id="click_filter"]',
    ) as HTMLElement

    if (clickFilterDiv && document.body.contains(clickFilterDiv)) {
      console.log('✓ Click filter div found')
      clickFilterDiv.click()
      console.log('✓ Clicked Create Account (via click_filter div)')
    } else {
      console.error('Click filter div not found')
    }
  } catch (error) {
    console.error('Error handling account input:', error)
  }
}

const handleWorkExperience = async (personalInfo: PersonalInfo) => {
  for (let idx = 0; idx < personalInfo.experience.length; idx++) {
    const experience = personalInfo.experience[idx]
    console.log(`Processing work experience ${idx + 1}/${personalInfo.experience.length}`)

    const addBtn = document.querySelector(
      '[aria-labelledby="Work-Experience-section"] [data-automation-id="add-button"]',
    ) as HTMLElement

    if (!addBtn) {
      console.error('Add button not found')
      break
    }

    // Count how many sections exist before clicking
    const sectionsBefore = document.querySelectorAll(
      '[aria-labelledby^="Work-Experience-"][aria-labelledby$="-panel"]',
    ).length
    console.log(`Sections before add: ${sectionsBefore}`)

    addBtn.click()
    console.log('✓ Clicked add button')

    // Wait for a new section to be added
    let section: Element | null = null
    let attempts = 0
    while (!section && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const sectionsNow = document.querySelectorAll(
        '[aria-labelledby^="Work-Experience-"][aria-labelledby$="-panel"]',
      )
      if (sectionsNow.length > sectionsBefore) {
        // Found a new section - get the last one (most recently added)
        section = sectionsNow[sectionsNow.length - 1]
        console.log(`✓ Found new section (attempt ${attempts + 1})`)
        break
      }
      attempts++
    }

    if (!section) {
      console.error('Could not find new work experience section')
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

    console.log(
      'Inputs found - jobTitle:',
      !!jobTitleInput,
      'company:',
      !!companyInput,
      'description:',
      !!descriptionInput,
      'location:',
      !!locationInput,
    )

    if (jobTitleInput) {
      await fillWorkdayInput(jobTitleInput, experience.jobTitle || '')
      console.log('✓ Filled job title:', experience.jobTitle)
    }
    if (companyInput) {
      await fillWorkdayInput(companyInput, experience.companyName || '')
      console.log('✓ Filled company:', experience.companyName)
    }
    if (descriptionInput) {
      await fillWorkdayInput(descriptionInput, experience.description || '')
      console.log('✓ Filled description')
    }
    if (locationInput) {
      await fillWorkdayInput(
        locationInput,
        `${experience.locationCity}, ${experience.locationState}` || '',
      )
      console.log('✓ Filled location')
    }

    // Fill dates
    if (experience.startDate) {
      await fillWorkdayDate(section, 'formField-startDate', experience.startDate)
      console.log('✓ Filled start date')
    }

    // Handle endDate - check "currently work here" if no end date
    if (experience.present || !experience.endDate) {
      const currentlyWorkHere = section.querySelector(
        '[data-automation-id="formField-currentlyWorkHere"] input[type="checkbox"]',
      ) as HTMLInputElement
      if (currentlyWorkHere) {
        currentlyWorkHere.click()
        console.log('✓ Checked currently work here')
      }
    } else {
      await fillWorkdayDate(section, 'formField-endDate', experience.endDate)
      console.log('✓ Filled end date')
    }

    // Wait before adding the next experience
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log('✓ Finished handling all work experiences')
}

const handleEducation = async (personalInfo: PersonalInfo) => {
  const normalize = (str: string) => str.toLowerCase().replace(/[^a-z]/g, '')

  for (let idx = 0; idx < personalInfo.education.length; idx++) {
    const education = personalInfo.education[idx]
    console.log(`Processing education ${idx + 1}/${personalInfo.education.length}`)

    const addBtn = document.querySelector(
      '[aria-labelledby="Education-section"] [data-automation-id="add-button"]',
    ) as HTMLElement

    if (!addBtn) {
      console.error('Education add button not found')
      break
    }

    const sectionsBefore = document.querySelectorAll(
      '[aria-labelledby^="Education-"][aria-labelledby$="-panel"]',
    ).length

    addBtn.click()
    console.log('✓ Clicked add education button')

    let section: Element | null = null
    let attempts = 0
    while (!section && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const sectionsNow = document.querySelectorAll(
        '[aria-labelledby^="Education-"][aria-labelledby$="-panel"]',
      )
      if (sectionsNow.length > sectionsBefore) {
        section = sectionsNow[sectionsNow.length - 1]
        console.log(`✓ Found new education section`)
        break
      }
      attempts++
    }

    if (!section) {
      console.error('Could not find new education section')
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    // School Name
    const schoolNameInput = section.querySelector(
      '[data-automation-id="formField-schoolName"] input',
    ) as HTMLInputElement
    if (schoolNameInput && education.schoolName) {
      console.log('Filling school name:', education.schoolName)
      schoolNameInput.click()
      schoolNameInput.focus()
      await fillWorkdayInput(schoolNameInput, education.schoolName)
      await new Promise((r) => setTimeout(r, 200))
      schoolNameInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
      )
      schoolNameInput.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }),
      )
      await new Promise((r) => setTimeout(r, 300))
      console.log('✓ Filled school name')
    }

    // Degree — button-based listbox
    const degreeBtn = section.querySelector(
      '[data-automation-id="formField-degree"] button[aria-haspopup="listbox"]',
    ) as HTMLElement
    if (degreeBtn && education.degreeType) {
      console.log('Clicking degree button for:', education.degreeType)
      degreeBtn.click()
      await new Promise((resolve) => setTimeout(resolve, 800))

      const options = Array.from(document.querySelectorAll('[role="option"]'))
      console.log('Degree options found:', options.length)

      const match = options.find((el) =>
        normalize(el.textContent || '').includes(normalize(education.degreeType)),
      ) as HTMLElement | undefined

      if (match) {
        console.log('Found matching degree:', match.textContent?.trim())
        match.click()
        console.log('✓ Selected degree')
        await new Promise((resolve) => setTimeout(resolve, 500))
      } else {
        console.error('Degree not found for:', education.degreeType)
        // Try clicking button again to close
        degreeBtn.click()
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    // Field of study - also needs Enter key
    const majorInput = section.querySelector(
      '[data-automation-id="formField-fieldOfStudy"] input',
    ) as HTMLInputElement
    if (majorInput && education.major) {
      console.log('Filling major:', education.major)
      majorInput.click()
      majorInput.focus()
      await new Promise((r) => setTimeout(r, 300))
      await fillWorkdayInput(majorInput, education.major)
      await new Promise((r) => setTimeout(r, 300))
      majorInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }),
      )
      majorInput.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Enter', keyCode: 13, bubbles: true }),
      )
      await new Promise((r) => setTimeout(r, 300))
      console.log('✓ Filled major')
    }

    // GPA
    const gpaInput = section.querySelector(
      '[data-automation-id="formField-gradeAverage"] input',
    ) as HTMLInputElement
    if (gpaInput && education.gpa) {
      console.log('Filling GPA:', education.gpa)
      await fillWorkdayInput(gpaInput, education.gpa)
      console.log('✓ Filled GPA')
    }

    // Years
    const fromYear = section.querySelector(
      '[data-automation-id="formField-firstYearAttended"] [data-automation-id="dateSectionYear-input"]',
    ) as HTMLInputElement
    const toYear = section.querySelector(
      '[data-automation-id="formField-lastYearAttended"] [data-automation-id="dateSectionYear-input"]',
    ) as HTMLInputElement

    if (fromYear && education.startYear) {
      console.log('Filling start year:', education.startYear)
      await fillWorkdayInput(fromYear, education.startYear.toString())
      console.log('✓ Filled start year')
    }

    if (toYear && education.graduationYear) {
      console.log('Filling graduation year:', education.graduationYear)
      await fillWorkdayInput(toYear, education.graduationYear.toString())
      console.log('✓ Filled graduation year')
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log('✓ Finished handling all education')
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
