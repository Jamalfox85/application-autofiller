import type { SiteRule, FieldMatch, FieldHandler, PersonalInfo } from '../../types/index.ts'
import { fillWorkdayInput, setReactInputValue } from '../inputHandlers.ts'
import { getWorkdayAccount, hasWorkdayAccountCredentials, isWorkdayApplyHost } from './workdayAccount.ts'
import {
  publishMissingWorkdayAccountNotice,
  readPersonalInfoForWorkday,
} from './workdayAccountNotice.ts'
import {
  findWorkdaySectionAddButton,
  isWorkdayAccountCreationForm,
  isWorkdaySignInForm,
  workdayAccountAgreementCheckbox,
  workdayCreateAccountLink,
  workdayJobApplyButton,
  workdaySignInWithEmailButton,
  listWorkdayPanels,
  matchingOptionText,
  nextWorkdayFormSignature,
  workdayAccountCredentialKind,
  workdayAccountInputs,
  workdayAccountSubmitControl,
  workdayActivePrompt,
  workdayContactKeyFromElement,
  workdayDatePartInput,
  workdayDegreeOption,
  workdayDegreeSearchTexts,
  workdayDisabilityOptionIndex,
  workdayElementIsFormerEmployee,
  workdayElementIsPhoneDeviceType,
  workdayElementIsSource,
  workdayExperienceLocation,
  workdayFieldControl,
  workdayFormerEmployeeListboxButton,
  workdayListboxButton,
  workdayListboxIsEmpty,
  workdayListboxValue,
  workdayListedSearchText,
  workdayListedValueMatches,
  workdayOptionElement,
  workdayOptionLabels,
  workdayPhoneDeviceTypeButton,
  workdayPhoneTypeOption,
  workdayPreferredSourceOption,
  workdayPromptSearchInput,
  workdaySafeNoOption,
  workdaySourceListboxButton,
  workdaySourceOption,
  workdaySuggestionOption,
  workdaySelectKind,
  workdaySelectValue,
} from './workdayFields.ts'

var lastFormSignature = ''

export default function workdayConfig(): SiteRule {
  return {
    detect: () => isWorkdayApplyHost(window.location.hostname),
    // In your onMount:
    onMount: (personalInfo) => {
      console.log('PING - Plugin initialized')
      void announceMissingWorkdayAccount(personalInfo)
      let jobApplyClicked = false
      let applyManuallyClicked = false
      let signInWithEmailClicked = false
      let createAccountClicked = false
      let accountInputHandled = false
      let accountFormMode = ''
      let accountCredentialsMissing = false
      let formStarted = false
      let educationStarted = false
      let phoneTypeAttempts = 0
      let countryHandled = false
      let stateHandled = false
      let sourceHandled = false
      let formerEmployeeHandled = false
      let listboxBusy = false
      let disabilityHandled = false
      let selfIdNameHandled = false
      let selfIdDateHandled = false

      const observer = new MutationObserver(async () => {
        try {
          // Step 1a: Job postings (Cisco, Salesforce, Zillow, and the same external
          // careers page) show Apply before the method chooser. Clicking it opens
          // Apply Manually. It is not Submit.
          if (!jobApplyClicked && !applyManuallyClicked) {
            const jobApply = workdayJobApplyButton(document)
            if (jobApply) {
              jobApplyClicked = true
              console.log('✓ Found and clicking Apply')
              jobApply.click()
              await new Promise((resolve) => setTimeout(resolve, 1500))
              return
            }
          }

          // Step 1b: Click "Apply Manually"
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

          // Step 2: Sign in with email. Cisco skips this and opens Create Account
          // directly. Absent means continue; do not wait on it.
          if (!signInWithEmailClicked) {
            const signInWithEmailBtn = workdaySignInWithEmailButton(document)
            if (signInWithEmailBtn) {
              signInWithEmailClicked = true
              console.log('✓ Found and clicking Sign in with email button')
              signInWithEmailBtn.click()
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
            if (isWorkdayAccountCreationForm(document) || isWorkdaySignInForm(document)) {
              signInWithEmailClicked = true
            }
          }

          // Step 3: Click "Create Account" only when that link is showing and the
          // account form is not already open. /login is a sign-in form; do not
          // click Create Account again after that redirect.
          if (!createAccountClicked) {
            if (isWorkdaySignInForm(document)) createAccountClicked = true
            const createAccountBtn = createAccountClicked ? null : workdayCreateAccountLink(document)

            if (createAccountBtn) {
              createAccountClicked = true
              console.log('✓ Found and clicking Create Account button')
              createAccountBtn.click()
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
          }

          // Step 4: Fill in account information. Never write empty credentials or click
          // the account submit control when the vault has no Workday login — tell the
          // user instead, and keep walking the rest of the form. My Information email
          // is a different control and must not be treated as this form.
          // Create Account can client-route to /login without remounting. Salesforce
          // and Zillow share that sign-in form, so fill its password even after the
          // create form was already handled.
          const accountMode = isWorkdayAccountCreationForm(document)
            ? 'create'
            : isWorkdaySignInForm(document)
              ? 'sign-in'
              : ''
          if (accountMode === 'sign-in' && accountFormMode !== 'sign-in') accountInputHandled = false
          if (accountMode) accountFormMode = accountMode
          if (
            !accountInputHandled &&
            !accountCredentialsMissing &&
            (isWorkdayAccountCreationForm(document) || isWorkdaySignInForm(document))
          ) {
            const latest = await readPersonalInfoForWorkday(personalInfo)
            if (!hasWorkdayAccountCredentials(latest)) {
              accountCredentialsMissing = true
              await publishMissingWorkdayAccountNotice()
            } else {
              accountInputHandled = true
              console.log('✓ Account form loaded, filling account details')
              await handleAccountInput(latest)
              await new Promise((resolve) => setTimeout(resolve, 2000))
              return
            }
          }

          // Step 5: Fill work experience and education independently. A tenant that
          // hides one section used to block the other because both add buttons
          // had to be present. Heading text is matched, not only the English
          // "Work Experience" / "Education" aria ids.
          if (!formStarted) {
            const experienceAddBtn = findWorkdaySectionAddButton(document, 'experience')
            if (experienceAddBtn) {
              formStarted = true
              console.log('✓ Work experience section found')
              try {
                await handleWorkExperience(personalInfo)
              } catch (e) {
                console.error('Error handling work experience:', e)
              }
            }
          }

          if (!educationStarted) {
            const educationAddBtn = findWorkdaySectionAddButton(document, 'education')
            if (educationAddBtn) {
              educationStarted = true
              console.log('✓ Education section found')
              try {
                await handleEducation(personalInfo)
              } catch (e) {
                console.error('Error handling education:', e)
              }
            }
          }

          // Steps 6–8 share one pass. A mutation while a menu is open used to start
          // the state click against the still-open country list, and Georgia (the
          // country) was selected for a Georgia address.
          if (!listboxBusy) {
            listboxBusy = true
            try {
              // Step 7: Country before state. The region list is empty until a country is chosen.
              // Profile values are slugs ("united_states"); the option label is not.
              if (!countryHandled && personalInfo.country) {
                const countryButton = workdayListboxButton(document, 'country')
                if (countryButton) {
                  countryHandled = true
                  if (!workdayListedValueMatches(workdayListboxValue(countryButton), personalInfo.country, 'country')) {
                    const label = await chooseWorkdayListOption(
                      countryButton,
                      (labels) => matchingOptionText(labels, personalInfo.country, 'country'),
                      workdayListedSearchText(personalInfo.country, 'country'),
                    )
                    if (label) {
                      console.log('✓ Selected country:', label)
                      await new Promise((resolve) => setTimeout(resolve, 500))
                    } else {
                      console.error('Country option not found for:', personalInfo.country)
                    }
                  }
                }
              }

              // Step 8: State / region. Match the full name when the profile stores an abbreviation or slug.
              if (!stateHandled && personalInfo.state) {
                const stateButton = workdayListboxButton(document, 'countryRegion')
                if (stateButton) {
                  stateHandled = true
                  if (!workdayListedValueMatches(workdayListboxValue(stateButton), personalInfo.state, 'state')) {
                    const label = await chooseWorkdayListOption(
                      stateButton,
                      (labels) => matchingOptionText(labels, personalInfo.state, 'state'),
                      workdayListedSearchText(personalInfo.state, 'state'),
                    )
                    if (label) {
                      console.log('✓ Selected state:', label)
                      await new Promise((resolve) => setTimeout(resolve, 500))
                    } else {
                      console.error('State option not found for:', personalInfo.state)
                    }
                  }
                }
              }

              // Required source and former-employee questions have no vault answer.
              // Never answer Yes. These prompts are not Phone Device Type.
              if (!sourceHandled) {
                const sourceButton = workdaySourceListboxButton(document)
                if (sourceButton && !workdayElementIsPhoneDeviceType(sourceButton)) {
                  sourceHandled = true
                  if (workdayListboxIsEmpty(sourceButton)) {
                    const optionText = await chooseWorkdaySource(sourceButton)
                    if (optionText) {
                      console.log('✓ Selected how you heard about us:', optionText)
                      await new Promise((resolve) => setTimeout(resolve, 500))
                    } else {
                      console.error('Source option not found')
                    }
                  }
                }
              }

              if (!formerEmployeeHandled) {
                const formerButton = workdayFormerEmployeeListboxButton(document)
                if (formerButton && !workdayElementIsPhoneDeviceType(formerButton)) {
                  formerEmployeeHandled = true
                  if (workdayListboxIsEmpty(formerButton)) {
                    const optionText = await chooseFirstListedOption(formerButton, workdaySafeNoOption, ['no'])
                    if (optionText) {
                      console.log('✓ Selected former employee: No')
                      await new Promise((resolve) => setTimeout(resolve, 500))
                    } else {
                      console.error('Former employee No option not found')
                    }
                  }
                }
              }

              // Phone device type last, after source and former-employee. Those
              // passes must not claim this prompt. No profile field; Mobile or Cell
              // is the default. A miss can be a menu that was still the other
              // question, so try once more on a later pass.
              if (phoneTypeAttempts < 2) {
                const phoneTypeButton = workdayPhoneDeviceTypeButton(document)
                if (phoneTypeButton) {
                  const already = workdayPhoneTypeOption([workdayListboxValue(phoneTypeButton)])
                  if (already) {
                    phoneTypeAttempts = 2
                  } else {
                    phoneTypeAttempts += 1
                    const optionText = await chooseWorkdayListOption(phoneTypeButton, workdayPhoneTypeOption, '')
                    if (optionText) {
                      phoneTypeAttempts = 2
                      console.log('✓ Selected phone type:', optionText)
                      await new Promise((resolve) => setTimeout(resolve, 500))
                    } else if (phoneTypeAttempts >= 2) {
                      console.error('Mobile phone type option not found')
                    }
                  }
                }
              }
            } finally {
              listboxBusy = false
            }
          }

          const eeoEnabled = personalInfo.eeoAnswersEnabled !== false

          // Step 9: Disability status. Match the option label. Index is only a fallback.
          if (!disabilityHandled) {
            if (!eeoEnabled) {
              disabilityHandled = true
            } else {
              const disabilityCheckboxes = document.querySelectorAll(
                '[data-automation-id="disabilityStatus-CheckboxGroup"] input[type="checkbox"]',
              )
              if (disabilityCheckboxes.length > 0 && personalInfo.disabilityStatus) {
                disabilityHandled = true
                const labels = Array.from(disabilityCheckboxes).map((node) =>
                  checkboxLabel(node as HTMLInputElement),
                )
                let checkboxIndex = workdayDisabilityOptionIndex(labels, personalInfo.disabilityStatus)
                if (checkboxIndex < 0) {
                  if (personalInfo.disabilityStatus === 'yes') checkboxIndex = 0
                  else if (personalInfo.disabilityStatus === 'no') checkboxIndex = 1
                  else if (personalInfo.disabilityStatus === 'decline') checkboxIndex = 2
                }
                if (checkboxIndex >= 0 && checkboxIndex < disabilityCheckboxes.length) {
                  ;(disabilityCheckboxes[checkboxIndex] as HTMLInputElement).click()
                  console.log('✓ Selected disability option:', personalInfo.disabilityStatus)
                  await new Promise((resolve) => setTimeout(resolve, 500))
                } else {
                  console.error('Invalid disability status:', personalInfo.disabilityStatus)
                }
              }
            }
          }

          // Step 10: Self-identification name, only inside the disability form.
          if (!selfIdNameHandled) {
            if (!eeoEnabled) {
              selfIdNameHandled = true
            } else {
              const nameInput = selfIdentificationNameInput()
              if (nameInput && personalInfo.firstName && personalInfo.lastName) {
                selfIdNameHandled = true
                const fullName = `${personalInfo.firstName} ${personalInfo.lastName}`
                await fillWorkdayInput(nameInput, fullName)
                console.log('✓ Filled self-identification name:', fullName)
                await new Promise((resolve) => setTimeout(resolve, 500))
              }
            }
          }

          // Step 11: Self-identification date (current date).
          if (!selfIdDateHandled) {
            if (!eeoEnabled) {
              selfIdDateHandled = true
            } else {
              const dateWrapper = document.querySelector(
                '[id="selfIdentifiedDisabilityData--dateSignedOn"], [data-fkit-id="selfIdentifiedDisabilityData--dateSignedOn"], [data-automation-id="formField-dateSignedOn"]',
              ) as HTMLElement | null

              if (dateWrapper) {
                selfIdDateHandled = true
                const today = new Date()
                const month = String(today.getMonth() + 1).padStart(2, '0')
                const day = String(today.getDate()).padStart(2, '0')
                const year = String(today.getFullYear())
                const monthInput = workdayDatePartInput(dateWrapper, 'month')
                const dayInput = workdayDatePartInput(dateWrapper, 'day')
                const yearInput = workdayDatePartInput(dateWrapper, 'year')
                if (monthInput) await fillWorkdayInput(monthInput, month)
                if (dayInput) await fillWorkdayInput(dayInput, day)
                if (yearInput) await fillWorkdayInput(yearInput, year)
                console.log('✓ Filled self-identification date:', `${month}/${day}/${year}`)
              }
            }
          }
        } catch (error) {
          console.error('Error in mutation observer:', error)
        }
      })

      observer.observe(document.body, { childList: true, subtree: true })

      // If the user adds a Workday login in the popup while this page is open, fill the
      // account form on the next profile write instead of staying stuck on the notice.
      const onStoredProfile = (
        changes: { [key: string]: chrome.storage.StorageChange },
        areaName: chrome.storage.AreaName,
      ) => {
        if (areaName !== 'local' || accountInputHandled || !changes.personalInfo) return
        const next = changes.personalInfo.newValue as PersonalInfo | undefined
        if (!hasWorkdayAccountCredentials(next)) return
        if (!isWorkdayAccountCreationForm(document) && !isWorkdaySignInForm(document)) return
        accountCredentialsMissing = false
        accountInputHandled = true
        void handleAccountInput(next)
      }

      let removeProfileListener = () => {}
      if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
        chrome.storage.onChanged.addListener(onStoredProfile)
        removeProfileListener = () => chrome.storage.onChanged.removeListener(onStoredProfile)
      }

      return () => {
        observer.disconnect()
        removeProfileListener()
      }
    },
    apply: (input, fieldText, personalInfo) => {
      for (const { match, handle } of fieldHandlers) {
        if (match(input, fieldText)) {
          return handle(input, fieldText, personalInfo, '')
        }
      }
      return false
    },
    formChanged: () => {
      const currentSignature = nextWorkdayFormSignature(document)
      if (!currentSignature) return false
      if (currentSignature !== lastFormSignature) {
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
    // "How did you hear" is a dropdown. Pick a listed option. Claiming the field
    // keeps the generic matcher from inventing LinkedIn or clicking Yes.
    match: (input, fieldText) => workdayElementIsSource(input, fieldText),
    handle: async (input) => chooseWorkdaySourceControl(input),
  },
  {
    // Former / previous employee and "have you worked here" are Yes/No. Safe answer is No.
    match: (input, fieldText) => workdayElementIsFormerEmployee(input, fieldText),
    handle: async (input) => chooseWorkdayNoControl(input),
  },
  {
    match: (input, fieldText) => workdaySelectKind(input, fieldText) === 'country',
    handle: async (input, _, personalInfo) => {
      return chooseWorkdaySelect(input, personalInfo.country || '', 'country')
    },
  },
  {
    match: (input, fieldText) => workdaySelectKind(input, fieldText) === 'state',
    handle: async (input, _, personalInfo) => {
      return chooseWorkdaySelect(input, personalInfo.state || '', 'state')
    },
  },
  {
    match: (input, fieldText) => workdaySelectKind(input, fieldText) === 'phone',
    handle: async (input) => chooseWorkdaySelect(input, '', 'phone'),
  },
  {
    // Create Account and /login. The password lives on the Workday Application
    // Accounts row, not the legacy accountPassword field the generic matcher reads.
    match: (input) => workdayAccountCredentialKind(input) != null,
    handle: async (input, _, personalInfo) => {
      const kind = workdayAccountCredentialKind(input)
      if (!kind || input.tagName !== 'INPUT') return false
      const latest = await readPersonalInfoForWorkday(personalInfo)
      if (!hasWorkdayAccountCredentials(latest)) {
        await publishMissingWorkdayAccountNotice()
        return true
      }
      const account = getWorkdayAccount(latest)
      const value = kind === 'email' ? account.email : account.password
      if (!value) return true
      const field = input as HTMLInputElement
      if (kind === 'email') {
        await fillWorkdayInput(field, value)
      } else {
        setReactInputValue(field, value)
        const EventCtor = field.ownerDocument?.defaultView?.Event ?? Event
        field.dispatchEvent(new EventCtor('change', { bubbles: true, composed: true }))
      }
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'firstName',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.firstName || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'middleName',
    handle: async () => true,
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'lastName',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.lastName || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'address1',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.address || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'address2',
    handle: async (input, _, personalInfo) => {
      const line2 = personalInfo.addressLine2 || ''
      if (line2) await fillWorkdayInput(input as HTMLInputElement, line2)
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'city',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.city || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'postal',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.zip || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'phone',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.phone || '')
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'email',
    handle: async (input, _, personalInfo) => {
      await fillWorkdayInput(input as HTMLInputElement, personalInfo.email || '')
      return true
    },
  },
]

// helpers

// Top frame only. An embedded myworkday iframe would otherwise toast again; the frame that
// actually renders the account form still notifies from the account-fill step.
const announceMissingWorkdayAccount = async (personalInfo: PersonalInfo | null | undefined) => {
  let topFrame = true
  try {
    topFrame = window.top === window
  } catch {
    topFrame = false
  }
  if (!topFrame) return

  const latest = await readPersonalInfoForWorkday(personalInfo)
  if (!hasWorkdayAccountCredentials(latest)) {
    await publishMissingWorkdayAccountNotice()
  }
}

let openListbox: HTMLButtonElement | null = null

function collapseOpenListbox() {
  const button = openListbox
  openListbox = null
  if (!button?.isConnected) return
  if (button.getAttribute('aria-expanded') === 'true') {
    button.click()
    return
  }
  const KeyCtor = button.ownerDocument?.defaultView?.KeyboardEvent
  if (!KeyCtor) return
  button.dispatchEvent(new KeyCtor('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
}

// Rows for this button that were painted outside its aria-controls node.
// Country and state stay on the controlled list so Georgia cannot be taken
// from the menu that is still open. Degree and school opt in.
// Finds the portal row. The click and the Canvas value write happen once in
// settleListedChoice, so a degree menu is not dismissed before its id is read.
function activateMatchingPortalOption(
  button: HTMLButtonElement,
  controlled: ParentNode | null,
  pick: (labels: string[]) => string | null,
): string | null {
  const doc = button.ownerDocument
  if (!doc) return null
  const popups = promptPopups(doc, elementNode(controlled)).filter(
    (node) => !button.contains(node),
  )
  for (let index = popups.length - 1; index >= 0; index--) {
    const labels = workdayOptionLabels(popups[index])
    if (substantivePromptLabels(labels).length === 0) continue
    const label = pick(labels)
    if (!label) continue
    const option = workdayOptionElement(popups[index], label)
    if (!option) continue
    return label
  }
  return null
}

function listboxShowsLabel(button: HTMLElement, label: string): boolean {
  const value = workdayListboxValue(button).replace(/\s+/g, ' ').trim().toLowerCase()
  return !!value && value === label.trim().toLowerCase()
}

// Degree is a Canvas Select. The closed label changes when that select's key
// handler commits an option. Writing the hidden input does not change the label.
function canvasSelectInput(button: HTMLElement): HTMLInputElement | null {
  const field = button.closest('[data-automation-id^="formField-"], [data-fkit-id]') || button.parentElement
  if (!field) return null
  const inputs = Array.from(field.querySelectorAll('input')).filter((node): node is HTMLInputElement => {
    if (node.tagName !== 'INPUT') return false
    const type = (node.getAttribute('type') || 'text').toLowerCase()
    if (type === 'checkbox' || type === 'radio' || type === 'file' || type === 'hidden') return false
    return !isCatalogSearchInput(node as HTMLInputElement)
  })
  return inputs[0] || null
}

function optionDataValue(option: HTMLElement): string {
  const row = option.closest('[role="option"]') || option
  return row.getAttribute('data-value') || ''
}

function writeCanvasSelectValue(button: HTMLElement, option: HTMLElement): boolean {
  const input = canvasSelectInput(button)
  const value = optionDataValue(option)
  if (!input || !value) return false
  setReactInputValue(input, value)
  const view = input.ownerDocument?.defaultView
  const EventCtor = view?.Event ?? Event
  input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return true
}

function listboxIsPlaceholder(button: HTMLElement): boolean {
  const key = workdayListboxValue(button).toLowerCase().replace(/[^a-z]/g, '')
  return !key || key === 'selectone' || key === 'select' || key === 'pleaseselect' || key === 'chooseone'
}

// The Canvas select commits from its own key handler. While the menu is closed,
// each typed character selects the first enabled option whose label starts with
// the characters so far. While it is open, those characters only move focus and
// Enter commits. "B" alone is Bachelor of Arts when that row is listed first, so
// the whole degree name is typed before Enter.
async function commitCanvasDegreeTypeahead(
  button: HTMLButtonElement,
  label: string,
): Promise<string | null> {
  if (listboxShowsLabel(button, label)) return workdayListboxValue(button)
  const doc = button.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return null
  const KeyCtor = view.KeyboardEvent ?? KeyboardEvent
  const press = (key: string) => {
    button.dispatchEvent(new KeyCtor('keydown', { key, bubbles: true, cancelable: true }))
  }
  button.focus()
  for (const character of label) press(character)
  press('Enter')
  const started = Date.now()
  while (Date.now() - started < 300) {
    if (listboxShowsLabel(button, label)) return workdayListboxValue(button)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return null
}

// Canvas Select commits the focused row on Enter. A mousedown on the row can
// dismiss the menu before click, so ArrowDown until that row is active and then
// Enter. Stop on the requested label so Associate of Science is not chosen.
async function commitListedDegreeByKeyboard(button: HTMLButtonElement, label: string): Promise<void> {
  if (!listboxIsPlaceholder(button) || listboxShowsLabel(button, label)) return
  const doc = button.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return
  const KeyCtor = view.KeyboardEvent ?? KeyboardEvent
  const press = (key: string) => {
    button.dispatchEvent(new KeyCtor('keydown', { key, bubbles: true, cancelable: true }))
  }
  const wanted = label.trim().toLowerCase()
  button.focus()
  for (let step = 0; step < 8; step++) {
    if (listboxShowsLabel(button, label)) return
    const prompt = workdayActivePrompt(button)
    const activeId =
      prompt && 'getAttribute' in prompt ? prompt.getAttribute('aria-activedescendant') || '' : ''
    const active = activeId ? doc.getElementById(activeId) : null
    const activeLabel = (active?.getAttribute('data-automation-label') || active?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    if (active && activeLabel === wanted) {
      press('Enter')
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (listboxShowsLabel(button, label)) return
    }
    press('ArrowDown')
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

// A prompt row can commit on click. A Canvas degree select does not: its closed
// label changes only after its own key handler commits. An option id written
// into the hidden input is ignored unless that label actually changes.
async function settleListedChoice(
  button: HTMLButtonElement,
  option: HTMLElement,
  label: string,
  scanPortals: boolean,
): Promise<string | null> {
  activateWorkdayOption(promptRowTarget(option))
  if (listboxShowsLabel(button, label)) return label
  const canvas = canvasSelectInput(button)
  if (canvas && optionDataValue(option)) writeCanvasSelectValue(button, option)
  if (listboxShowsLabel(button, label)) return label
  if (scanPortals) await commitListedDegreeByKeyboard(button, label)
  if (listboxShowsLabel(button, label)) return label
  if (canvas) return null
  return label
}

function listedOptionElement(button: HTMLButtonElement, label: string): HTMLElement | null {
  const prompt = workdayActivePrompt(button)
  if (prompt) {
    const option = workdayOptionElement(prompt, label)
    if (option) return option
  }
  const popups = promptPopups(button.ownerDocument, elementNode(prompt))
  for (let index = popups.length - 1; index >= 0; index--) {
    const option = workdayOptionElement(popups[index], label)
    if (option) return option
  }
  return null
}

// Open one prompt, optionally filter it, and click the picked label inside that
// prompt only. Escape closes a miss so the next field cannot click a leftover option.
// scanPortals is for degree and school: the open menu's rows can arrive after
// the click, and they can live outside the empty aria-controls anchor.
async function chooseWorkdayListOption(
  button: HTMLButtonElement,
  pick: (labels: string[]) => string | null,
  searchText: string,
  scanPortals = false,
): Promise<string | null> {
  collapseOpenListbox()
  openListbox = button
  button.click()
  const started = Date.now()
  let typed = false
  let missesAfterType = 0
  while (Date.now() - started < 1500) {
    const prompt = workdayActivePrompt(button)
    if (prompt && searchText && !typed) {
      let search = workdayPromptSearchInput(prompt)
      // The catalog search lives in the field or the open prompt, not in an
      // empty aria-controls anchor. Degree and school opt into that lookup.
      if (!search && scanPortals) {
        const field = button.closest('[data-automation-id^="formField-"], [data-fkit-id]')
        if (field) search = workdayPromptSearchInput(field)
        if (!search) {
          const popups = promptPopups(button.ownerDocument, elementNode(prompt))
          for (let index = popups.length - 1; index >= 0 && !search; index--) {
            search = workdayPromptSearchInput(popups[index])
          }
        }
      }
      if (search) {
        if (scanPortals) setReactInputValue(search, searchText)
        else await fillWorkdayInput(search, searchText)
        typed = true
        await new Promise((resolve) => setTimeout(resolve, 200))
        continue
      }
    }
    const labels = prompt ? workdayOptionLabels(prompt) : []
    const substantive = substantivePromptLabels(labels)
    // "Select One" alone is the closed-state placeholder, not the degree list.
    // Clicking before the real rows exist closes the menu with nothing selected.
    if (substantive.length === 0) {
      if (scanPortals) {
        const portalLabel = activateMatchingPortalOption(button, prompt, pick)
        if (portalLabel) {
          const portalOption = listedOptionElement(button, portalLabel)
          const settled = portalOption
            ? await settleListedChoice(button, portalOption, portalLabel, scanPortals)
            : portalLabel
          if (settled) {
            openListbox = null
            return settled
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      continue
    }
    const label = pick(labels)
    if (label && prompt) {
      const option = workdayOptionElement(prompt, label)
      if (option) {
        const settled = await settleListedChoice(button, option, label, scanPortals)
        if (settled) {
          openListbox = null
          return settled
        }
      }
    }
    // Another field's list can be the only role=listbox on the page. Degree
    // has to keep waiting for its own menu instead of treating that list as a miss.
    if (scanPortals) {
      const portalLabel = activateMatchingPortalOption(button, prompt, pick)
      if (portalLabel) {
        const portalOption = listedOptionElement(button, portalLabel)
        const settled = portalOption
          ? await settleListedChoice(button, portalOption, portalLabel, scanPortals)
          : portalLabel
        if (settled) {
          openListbox = null
          return settled
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      continue
    }
    // A visible slice that does not contain the target is not a click. After a
    // search, give the filtered rows a moment to replace that slice.
    if (!searchText || typed) {
      if (typed && missesAfterType < 3) {
        missesAfterType++
        await new Promise((resolve) => setTimeout(resolve, 150))
        continue
      }
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  collapseOpenListbox()
  return null
}

async function chooseFirstListedOption(
  button: HTMLButtonElement,
  pick: (labels: string[]) => string | null,
  searches: string[],
  scanPortals = false,
): Promise<string | null> {
  const direct = await chooseWorkdayListOption(button, pick, '', scanPortals)
  if (direct) return direct
  for (const search of searches) {
    const label = await chooseWorkdayListOption(button, pick, search, scanPortals)
    if (label) return label
  }
  return null
}

// Prefer Other, company website, career site, or the tenant careers page.
// A later pass may use another listed option when those labels are not present.
async function chooseWorkdaySource(button: HTMLButtonElement): Promise<string | null> {
  const preferred = await chooseFirstListedOption(button, workdayPreferredSourceOption, [
    'other',
    'company website',
    'career site',
    'careers',
  ])
  if (preferred) return preferred
  return chooseWorkdayListOption(button, workdaySourceOption, '')
}

function chooseWorkdaySelect(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  desired: string,
  kind: 'country' | 'state' | 'phone' | 'source' | 'no',
): boolean {
  // tagName, not instanceof: the element can come from a frame whose
  // HTMLSelectElement is not this window's constructor.
  if (input.tagName !== 'SELECT') return true
  const select = input as HTMLSelectElement
  const value = workdaySelectValue(
    Array.from(select.options).map((option) => ({ value: option.value, text: option.text })),
    desired,
    kind,
  )
  if (!value || select.value === value) return true
  select.value = value
  const EventCtor = select.ownerDocument.defaultView?.Event ?? Event
  select.dispatchEvent(new EventCtor('input', { bubbles: true }))
  select.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return true
}

function checkboxLabel(input: HTMLInputElement): string {
  if (input.id) {
    const escape = input.ownerDocument.defaultView?.CSS?.escape
    const id = escape ? escape(input.id) : input.id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const label = input.ownerDocument.querySelector(`label[for="${id}"]`)
    if (label?.textContent) return label.textContent
  }
  return input.closest('label')?.textContent || input.parentElement?.textContent || ''
}

function selfIdentificationNameInput(): HTMLInputElement | null {
  const scoped = document.querySelector(
    '[data-fkit-id="selfIdentifiedDisabilityData--name"] input, [id="selfIdentifiedDisabilityData--name"]',
  )
  if (scoped?.tagName === 'INPUT') return scoped as HTMLInputElement
  const nested = scoped?.querySelector('input')
  if (nested) return nested as HTMLInputElement
  if (!document.querySelector('[data-automation-id="disabilityStatus-CheckboxGroup"]')) return null
  const fallback = document.querySelector('[data-automation-id="formField-name"] input')
  if (!fallback || fallback.tagName !== 'INPUT') return null
  if ((fallback.id || '').toLowerCase().includes('legalname')) return null
  return fallback as HTMLInputElement
}

function radioGroup(input: HTMLInputElement): HTMLInputElement[] {
  const name = input.getAttribute('name') || input.name
  const root = input.form || input.ownerDocument
  if (!name || !root) return [input]
  const radios = Array.from(root.querySelectorAll('input[type="radio"]')).filter(
    (radio): radio is HTMLInputElement => radio.getAttribute('name') === name,
  )
  return radios.length > 0 ? radios : [input]
}

function chooseWorkdayRadio(input: HTMLInputElement, pick: (labels: string[]) => string | null): boolean {
  const group = radioGroup(input)
  const labels = group.map((radio) => checkboxLabel(radio) || radio.value || '')
  const choice = pick(labels)
  if (!choice) return true
  const want = choice.replace(/\s+/g, ' ').trim().toLowerCase()
  const mine = (checkboxLabel(input) || input.value || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (mine !== want) return true
  if (!input.checked) input.click()
  return true
}

function chooseWorkdaySourceControl(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (input.tagName === 'SELECT') return chooseWorkdaySelect(input, '', 'source')
  if (input.tagName === 'INPUT' && (input as HTMLInputElement).type === 'radio') {
    return chooseWorkdayRadio(input as HTMLInputElement, workdaySourceOption)
  }
  return true
}

function chooseWorkdayNoControl(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (input.tagName === 'SELECT') return chooseWorkdaySelect(input, '', 'no')
  if (input.tagName === 'INPUT' && (input as HTMLInputElement).type === 'radio') {
    return chooseWorkdayRadio(input as HTMLInputElement, workdaySafeNoOption)
  }
  return true
}

function fieldScope(section: ParentNode, metadataId: string): ParentNode | null {
  return (
    section.querySelector(`[data-automation-id="formField-${metadataId}"]`) ||
    section.querySelector(`[data-fkit-id$="--${metadataId}"]`) ||
    section.querySelector(`[data-fkit-id="${metadataId}"]`)
  )
}

const fillWorkdayDate = (section: Element, metadataId: string, value: string) => {
  // value expected as YYYY-MM or MM/YYYY
  let month = ''
  let year = ''
  if (value.includes('-')) {
    ;[year, month] = value.split('-')
  } else {
    ;[month, year] = value.split('/')
  }

  const scope = fieldScope(section, metadataId)
  if (!scope) return
  const monthInput = workdayDatePartInput(scope, 'month')
  const yearInput = workdayDatePartInput(scope, 'year')
  if (monthInput && month) fillWorkdayInput(monthInput, month)
  if (yearInput && year) fillWorkdayInput(yearInput, year)
}

function elementNode(node: ParentNode | null): Element | null {
  if (!node || node.nodeType !== 1) return null
  return node as Element
}

function promptPopups(doc: Document, except: Element | null): Element[] {
  return Array.from(
    doc.querySelectorAll(
      '[data-automation-id="responsiveMonikerPrompt"], [data-automation-id="promptPopup"], [role="listbox"]',
    ),
  ).filter((node) => {
    if (node === except) return false
    if (node.getAttribute('data-automation-id') === 'selectedItemList') return false
    if (node.closest('[data-automation-id="selectedItemList"]')) return false
    return true
  })
}

function substantivePromptLabels(labels: string[]): string[] {
  return labels.filter((label) => !isPromptPlaceholderLabel(label))
}

// "No Items." is the empty catalog, not a school. "Select One" is the closed
// degree placeholder. Neither is a row that can be committed.
function isPromptPlaceholderLabel(label: string): boolean {
  const key = label.toLowerCase().replace(/[^a-z]/g, '')
  return (
    key === 'selectone' ||
    key === 'select' ||
    key === 'pleaseselect' ||
    key === 'chooseone' ||
    key === 'choose' ||
    key === 'noitems' ||
    key === 'noitem' ||
    key === 'noitemsavailable' ||
    key === 'nomatches' ||
    key === 'nomatchesfound' ||
    key === 'noresults' ||
    key === 'noresultsfound'
  )
}

function catalogShellOpen(doc: Document): boolean {
  return !!doc.querySelector(
    '[data-automation-id="responsiveMonikerPrompt"], [data-automation-id="promptPopup"], [data-automation-id="monikerSearchBox"], [data-automation-id="monikerSearchBoxFullscreen"]',
  )
}

function isCatalogSearchInput(input: HTMLInputElement): boolean {
  const id = input.getAttribute('data-automation-id') || ''
  if (id === 'searchBox' || id === 'promptSearchInput' || id === 'monikerSearchBox') return true
  return !!input.closest(
    '[data-automation-id="monikerSearchBox"], [data-automation-id="monikerSearchBoxFullscreen"]',
  )
}

function promptFieldRoot(control: HTMLElement): ParentNode {
  return (
    control.closest('[data-automation-id^="formField-"]') ||
    control.closest('[data-fkit-id]') ||
    control.parentElement ||
    control
  )
}

function promptBackedField(control: HTMLElement): boolean {
  const scope = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  if (!scope) return false
  return !!scope.querySelector(
    '[data-automation-id="multiSelectContainer"], [data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
  )
}

function cleanVisibleLabel(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function selectedPillLabels(root: ParentNode): string[] {
  const labels: string[] = []
  root.querySelectorAll('[data-automation-id="selectedItemList"]').forEach((list) => {
    const items = list.querySelectorAll(
      '[data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"]',
    )
    if (items.length === 0) {
      const text = cleanVisibleLabel(list.textContent || '')
      if (text) labels.push(text)
      return
    }
    items.forEach((item) => {
      const text = cleanVisibleLabel(item.getAttribute('data-automation-label') || item.textContent || '')
      if (text) labels.push(text)
    })
  })
  return labels
}

function promptTracksPills(control: HTMLElement): boolean {
  return !!promptFieldRoot(control).querySelector('[data-automation-id="selectedItemList"]')
}

function promptSelectionCommitted(
  control: HTMLElement,
  pick: (labels: string[]) => string | null,
): boolean {
  if (!promptTracksPills(control)) return false
  return !!pick(selectedPillLabels(promptFieldRoot(control)))
}

function openWorkdayPrompt(control: HTMLElement) {
  const scope = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  const icon = scope?.querySelector(
    '[data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
  )
  if (icon && 'click' in icon) (icon as HTMLElement).click()
  else control.click()
  if (control.tagName === 'INPUT') (control as HTMLInputElement).focus()
}

function dispatchEnter(input: HTMLInputElement) {
  const view = input.ownerDocument?.defaultView
  const KeyCtor = view?.KeyboardEvent ?? KeyboardEvent
  input.dispatchEvent(new KeyCtor('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
  input.dispatchEvent(new KeyCtor('keyup', { key: 'Enter', keyCode: 13, bubbles: true }))
}

// The closed multiselect is not the catalog. Opening it paints input[searchBox]
// inside the prompt; that box is what the school query has to reach.
async function resolveCatalogSearch(control: HTMLElement): Promise<HTMLInputElement | null> {
  const own = control.tagName === 'INPUT' ? (control as HTMLInputElement) : null
  if (own && isCatalogSearchInput(own)) return own
  const promptBacked = promptBackedField(control)
  const started = Date.now()
  const giveUpAt = promptBacked ? 700 : 40
  while (Date.now() - started < 700) {
    const doc = control.ownerDocument
    const field = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
    const inField = field ? workdayPromptSearchInput(field) : null
    if (inField && (inField !== own || isCatalogSearchInput(inField))) return inField
    const prompts = promptPopups(doc, null)
    for (let index = prompts.length - 1; index >= 0; index--) {
      const found = workdayPromptSearchInput(prompts[index])
      if (found) return found
    }
    if (Date.now() - started >= giveUpAt && !catalogShellOpen(doc)) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  // Typing into the closed prompt leaves the query visible and unselected.
  if (promptBacked && own && !isCatalogSearchInput(own)) return null
  return own && own.isConnected ? own : null
}

// A prompt row commits on the promptLeafNode (click). The selected pill commits
// on mousedown and ignores click. The visible label inside the row does neither
// when it stops the event, so the event has to start on the leaf or option.
function promptRowTarget(element: HTMLElement): HTMLElement {
  const leaf = element.closest('[data-automation-id="promptLeafNode"]')
  if (leaf) return leaf as HTMLElement
  const option = element.closest('[role="option"]')
  if (option) return option as HTMLElement
  return element
}

// Workday commits a prompt row on mousedown for a selected pill, and on click
// for a promptLeafNode. Dispatch both on the row that owns the handler.
function activateWorkdayOption(option: HTMLElement) {
  const view = option.ownerDocument?.defaultView
  const MouseCtor = view?.MouseEvent ?? MouseEvent
  const init: MouseEventInit = { bubbles: true, cancelable: true }
  option.dispatchEvent(new MouseCtor('mousedown', init))
  option.dispatchEvent(new MouseCtor('mouseup', init))
  option.dispatchEvent(new MouseCtor('click', init))
}

function ownedPrompt(input: HTMLInputElement): ParentNode | null {
  const controls = input.getAttribute('aria-controls')
  if (!controls) return null
  return input.ownerDocument.getElementById(controls)
}

// The menu Workday actually painted. An aria-controls anchor can stay empty
// while the suggestion rows are portaled elsewhere. A menu that is already
// showing other schools is not a license to click a different popup.
function matchingSuggestionRow(
  input: HTMLInputElement,
  pick: (labels: string[]) => string | null,
): HTMLElement | null {
  const owned = ownedPrompt(input)
  const ownedLabels = owned ? workdayOptionLabels(owned) : []
  if (substantivePromptLabels(ownedLabels).length > 0) {
    const label = pick(ownedLabels)
    return label && owned ? workdayOptionElement(owned, label) : null
  }
  const popups = promptPopups(input.ownerDocument, elementNode(owned)).filter(
    (node) => !input.contains(node),
  )
  for (let index = popups.length - 1; index >= 0; index--) {
    const labels = workdayOptionLabels(popups[index])
    if (substantivePromptLabels(labels).length === 0) continue
    const label = pick(labels)
    if (!label) continue
    const option = workdayOptionElement(popups[index], label)
    if (option) return option
  }
  return null
}

function suggestionMenuIsOpen(input: HTMLInputElement): boolean {
  const owned = ownedPrompt(input)
  if (owned && substantivePromptLabels(workdayOptionLabels(owned)).length > 0) return true
  return promptPopups(input.ownerDocument, elementNode(owned)).some(
    (node) => !input.contains(node) && substantivePromptLabels(workdayOptionLabels(node)).length > 0,
  )
}

// Type into a school or field-of-study prompt and click the matching suggestion.
// The catalog reads the prompt's search box, which appears when the multiselect
// opens. A typed query is not a selected school. Enter asks a catalog that does
// not search on each keystroke to show rows; the committed value is the pill.
export async function selectWorkdayPromptQuery(
  control: HTMLElement,
  query: string,
  pick: (labels: string[]) => string | null = (labels) => workdaySuggestionOption(labels, query),
): Promise<boolean> {
  const trimmed = query.trim()
  if (!trimmed) return false
  if (promptSelectionCommitted(control, pick)) return true
  openWorkdayPrompt(control)
  const search = await resolveCatalogSearch(control)
  if (!search) return false
  setReactInputValue(search, trimmed)
  let pressedEnter = false
  const started = Date.now()
  while (Date.now() - started < 1800) {
    if (promptSelectionCommitted(control, pick)) return true
    const option = matchingSuggestionRow(search, pick)
    if (option) {
      activateWorkdayOption(promptRowTarget(option))
      await new Promise((resolve) => setTimeout(resolve, 40))
      if (!promptTracksPills(control) || promptSelectionCommitted(control, pick)) return true
    } else if (
      !pressedEnter &&
      Date.now() - started > 300 &&
      (catalogShellOpen(search.ownerDocument) ||
        suggestionMenuIsOpen(search) ||
        isCatalogSearchInput(search))
    ) {
      dispatchEnter(search)
      pressedEnter = true
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (promptSelectionCommitted(control, pick)) return true
  if (promptTracksPills(control)) {
    if (search.isConnected && search.value.trim()) setReactInputValue(search, '')
    return false
  }
  const doc = search.ownerDocument
  if (!catalogShellOpen(doc) && !suggestionMenuIsOpen(search)) {
    if (!pressedEnter) dispatchEnter(search)
  } else if (search.isConnected && search.value.trim()) {
    setReactInputValue(search, '')
  }
  return false
}

export async function selectWorkdayListedDegree(
  button: HTMLButtonElement,
  degreeType: string,
): Promise<string | null> {
  const trimmed = degreeType.trim()
  if (!trimmed) return null
  const typed = await commitCanvasDegreeTypeahead(button, trimmed)
  if (typed) return typed
  return chooseFirstListedOption(
    button,
    (labels) => workdayDegreeOption(labels, trimmed),
    workdayDegreeSearchTexts(trimmed),
    true,
  )
}

function firstTextControl(section: ParentNode, ids: string[]): HTMLInputElement | null {
  for (const id of ids) {
    const control = workdayFieldControl(section, id)
    if (control && control.tagName === 'INPUT') return control as HTMLInputElement
  }
  return null
}

function firstListbox(section: ParentNode, ids: string[]): HTMLButtonElement | null {
  for (const id of ids) {
    const button = workdayListboxButton(section, id)
    if (button) return button
  }
  return null
}

const handleAccountInput = async (personalInfo: PersonalInfo | null | undefined) => {
  try {
    console.log('Starting account input fill...')
    const latest = await readPersonalInfoForWorkday(personalInfo)
    if (!hasWorkdayAccountCredentials(latest)) {
      await publishMissingWorkdayAccountNotice()
      return
    }
    const workdayAccount = getWorkdayAccount(latest)

    // Wait longer for the form to fully render
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Salesforce nests these under formField-*; Cisco puts the automation id on the input.
    // /login has email + password and no verifyPassword. A hidden decoy password
    // input must not win over the visible type=password field.
    const creating = isWorkdayAccountCreationForm(document)
    const {
      email: emailInput,
      password: passwordInput,
      verifyPassword: verifyPasswordInput,
    } = workdayAccountInputs(document)
    const createAccountCheckbox = creating ? workdayAccountAgreementCheckbox(document) : null

    console.log('Email input found:', !!emailInput)
    console.log('Password input found:', !!passwordInput)
    console.log('Verify password input found:', !!verifyPasswordInput)
    console.log('Checkbox found:', !!createAccountCheckbox)

    if (!emailInput || !passwordInput || (creating && !verifyPasswordInput)) {
      console.error('Account form inputs missing; not submitting')
      return
    }

    await fillWorkdayInput(emailInput, workdayAccount.email)
    const EventCtor = passwordInput.ownerDocument?.defaultView?.Event ?? Event
    setReactInputValue(passwordInput, workdayAccount.password)
    passwordInput.dispatchEvent(new EventCtor('change', { bubbles: true, composed: true }))
    if (verifyPasswordInput) {
      setReactInputValue(verifyPasswordInput, workdayAccount.password)
      verifyPasswordInput.dispatchEvent(new EventCtor('change', { bubbles: true, composed: true }))
    }
    await new Promise((resolve) => setTimeout(resolve, 300))

    if (!creating) {
      // Sign-in password is filled. Do not click Sign In; that is the candidate's click.
      console.log('✓ Filled sign-in email and password')
      return
    }

    // Cisco has no agreement checkbox. Only click one when the tenant renders it.
    if (createAccountCheckbox && !createAccountCheckbox.checked) {
      createAccountCheckbox.click()
      console.log('✓ Checked account agreement')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Wait for form to stabilize after all inputs are filled
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Prefer createAccountSubmitButton. click_filter is only the fallback when
    // that button is absent, and only inside the account card — never job-application Submit.
    if (!isWorkdayAccountCreationForm(document)) return
    const submitControl = workdayAccountSubmitControl(document)
    if (submitControl && document.body.contains(submitControl)) {
      submitControl.click()
      console.log('✓ Clicked Create Account')
    } else {
      console.error('Create Account submit control not found')
    }
  } catch (error) {
    console.error('Error handling account input:', error)
  }
}

const handleWorkExperience = async (personalInfo: PersonalInfo) => {
  if (!personalInfo?.experience?.length) return
  for (let idx = 0; idx < personalInfo.experience.length; idx++) {
    const experience = personalInfo.experience[idx]
    console.log(`Processing work experience ${idx + 1}/${personalInfo.experience.length}`)

    const addBtn = findWorkdaySectionAddButton(document, 'experience')

    if (!addBtn) {
      console.error('Add button not found')
      break
    }

    const sectionsBefore = listWorkdayPanels(document, 'experience').length
    console.log(`Sections before add: ${sectionsBefore}`)

    addBtn.click()
    console.log('✓ Clicked add button')

    let section: Element | null = null
    let attempts = 0
    while (!section && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const sectionsNow = listWorkdayPanels(document, 'experience')
      if (sectionsNow.length > sectionsBefore) {
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
    const jobTitleInput = workdayFieldControl(section, 'jobTitle') as HTMLInputElement | null
    const companyInput = workdayFieldControl(section, 'companyName') as HTMLInputElement | null
    const descriptionInput = workdayFieldControl(section, 'roleDescription') as HTMLTextAreaElement | null
    const locationInput = workdayFieldControl(section, 'location') as HTMLInputElement | null

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
    const location = workdayExperienceLocation(experience.locationCity, experience.locationState)
    if (locationInput && location) {
      await fillWorkdayInput(locationInput, location)
      console.log('✓ Filled location')
    }

    if (experience.startDate) {
      await fillWorkdayDate(section, 'startDate', experience.startDate)
      console.log('✓ Filled start date')
    }

    // Handle endDate - check "currently work here" if no end date
    if (experience.present || !experience.endDate) {
      const currentlyScope = fieldScope(section, 'currentlyWorkHere')
      const currentlyWorkHere = currentlyScope?.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null
      if (currentlyWorkHere) {
        currentlyWorkHere.click()
        console.log('✓ Checked currently work here')
      }
    } else {
      await fillWorkdayDate(section, 'endDate', experience.endDate)
      console.log('✓ Filled end date')
    }

    // Wait before adding the next experience
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  console.log('✓ Finished handling all work experiences')
}

const handleEducation = async (personalInfo: PersonalInfo) => {
  if (!personalInfo?.education?.length) return
  for (let idx = 0; idx < personalInfo.education.length; idx++) {
    const education = personalInfo.education[idx]
    console.log(`Processing education ${idx + 1}/${personalInfo.education.length}`)

    const addBtn = findWorkdaySectionAddButton(document, 'education')

    if (!addBtn) {
      console.error('Education add button not found')
      break
    }

    const sectionsBefore = listWorkdayPanels(document, 'education').length

    addBtn.click()
    console.log('✓ Clicked add education button')

    let section: Element | null = null
    let attempts = 0
    while (!section && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      const sectionsNow = listWorkdayPanels(document, 'education')
      if (sectionsNow.length > sectionsBefore) {
        section = sectionsNow[sectionsNow.length - 1]
        console.log('✓ Found new education section')
        break
      }
      attempts++
    }

    if (!section) {
      console.error('Could not find new education section')
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    // School is a searchable prompt. Typed text is not the selected school;
    // the matching suggestion has to be clicked. A listbox with no text input
    // uses the same option click as country and phone.
    const schoolQuery = (education.schoolName || '').trim()
    if (schoolQuery) {
      console.log('Filling school name:', schoolQuery)
      const schoolIds = ['schoolName', 'school', 'schoolItem']
      const schoolInput = firstTextControl(section, schoolIds)
      let schoolSelected = schoolInput ? await selectWorkdayPromptQuery(schoolInput, schoolQuery) : false
      if (!schoolSelected) {
        const scope = schoolIds.map((id) => fieldScope(section, id)).find((node) => node)
        const container = scope?.querySelector(
          '[data-automation-id="multiSelectContainer"], [data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
        )
        if (container && container !== schoolInput) {
          schoolSelected = await selectWorkdayPromptQuery(container as HTMLElement, schoolQuery)
        }
      }
      if (!schoolSelected) {
        const schoolButton = firstListbox(section, schoolIds)
        if (schoolButton) {
          const label = await chooseFirstListedOption(
            schoolButton,
            (labels) => workdaySuggestionOption(labels, schoolQuery),
            [schoolQuery],
            true,
          )
          schoolSelected = !!label
        }
      }
      if (schoolSelected) console.log('✓ Selected school')
      else console.error('School suggestion not selected for:', schoolQuery)
    }

    const degreeQuery = (education.degreeType || '').trim()
    if (degreeQuery) {
      console.log('Selecting degree:', degreeQuery)
      const degreeBtn = firstListbox(section, ['degree', 'degreeType'])
      if (degreeBtn) {
        const label = await selectWorkdayListedDegree(degreeBtn, degreeQuery)
        if (label) console.log('✓ Selected degree:', label)
        else console.error('Degree not found for:', degreeQuery)
      } else {
        const degreeInput = firstTextControl(section, ['degree', 'degreeType'])
        if (degreeInput) {
          const selected = await selectWorkdayPromptQuery(degreeInput, degreeQuery, (labels) =>
            workdayDegreeOption(labels, degreeQuery),
          )
          if (selected) console.log('✓ Selected degree')
          else console.error('Degree not found for:', degreeQuery)
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500))

    const majorInput = firstTextControl(section, ['fieldOfStudy', 'major'])
    if (majorInput && education.major) {
      console.log('Filling major:', education.major)
      await selectWorkdayPromptQuery(majorInput, education.major)
      console.log('✓ Filled major')
    }

    const gpaInput = workdayFieldControl(section, 'gradeAverage') as HTMLInputElement | null
    if (gpaInput && education.gpa) {
      console.log('Filling GPA:', education.gpa)
      await fillWorkdayInput(gpaInput, education.gpa)
      console.log('✓ Filled GPA')
    }

    const fromYearScope = fieldScope(section, 'firstYearAttended')
    const toYearScope = fieldScope(section, 'lastYearAttended')
    const fromYear = fromYearScope ? workdayDatePartInput(fromYearScope, 'year') : null
    const toYear = toYearScope ? workdayDatePartInput(toYearScope, 'year') : null

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
