import type { SiteRule, FieldMatch, FieldHandler, PersonalInfo } from '../../types/index.ts'
import { commitWorkdayTextValue, fillWorkdayInput, setReactInputValue } from '../inputHandlers.ts'
import {
  getWorkdayAccount,
  hasSavedWorkdayApplicationAccount,
  hasWorkdayAccountCredentials,
  isWorkdayApplyHost,
} from './workdayAccount.ts'
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
  workdayApplyChooserTarget,
  workdaySignInWithEmailButton,
  listWorkdayPanels,
  matchingOptionText,
  workdayExperiencePanelIsBlank,
  workdayInputInExperiencePanel,
  workdayPanelMatchesExperience,
  nextWorkdayFormSignature,
  workdayAccountCredentialKind,
  workdayAccountInputs,
  workdayAccountSubmitControl,
  workdayActivePrompt,
  workdayApplicationQuestionKind,
  workdayContactKeyFromElement,
  workdayContactTextNeedsCommit,
  workdayDatePartInput,
  workdayDegreeOption,
  workdayDisabilityOptionIndex,
  workdayElementIsDegree,
  workdayElementIsFormerEmployee,
  workdayElementIsPhoneDeviceType,
  workdayElementIsSchool,
  workdayElementIsSource,
  workdaySchoolPromptNeedsFill,
  workdayIsPhoneDeviceTypeOptionList,
  workdayExperienceLocation,
  workdayFieldControl,
  workdayFormerEmployeeListboxButton,
  workdayButtonShowsAnswer,
  workdayListboxButton,
  workdayListboxIsEmpty,
  workdayListboxValue,
  workdayPromptFaceIsEmpty,
  workdayProfileChoice,
  workdayListedSearchText,
  workdayListedValueMatches,
  workdayOptionElement,
  workdayOptionElements,
  workdayOptionLabels,
  workdayPromptRowIsFolder,
  workdayPhoneDeviceTypeButton,
  workdayPhoneTypeOption,
  workdayIndeedSourceOption,
  workdayJobBoardFolderOption,
  workdayPromptSearchInput,
  workdaySafeNoOption,
  workdaySourceListboxButton,
  workdaySourceOption,
  workdaySuggestionOption,
  workdaySelectKind,
  workdaySelectValue,
} from './workdayFields.ts'
import {
  attachWorkdaySavedResume,
  createWorkdayResumeAttempt,
  isWorkdayCoverLetterFileInput,
  isWorkdayResumeFileInput,
  requestWorkdaySavedResume,
  workdayResumeAlreadyPresent,
} from './workdayResume.ts'

var lastFormSignature = ''

type WorkdayResumeLoader = () => Promise<File | null>
let workdayResumeLoader: WorkdayResumeLoader = requestWorkdaySavedResume
let workdayResumeTask: Promise<File | null> | null = null

// Tests pass the already-saved file here. Production reads the shared
// loadSavedResume reply, including the base64 copy messaging actually delivers.
export function setWorkdayResumeLoader(loader: WorkdayResumeLoader | null) {
  workdayResumeLoader = loader ?? requestWorkdaySavedResume
  workdayResumeTask = null
}

function loadWorkdaySavedResume(): Promise<File | null> {
  if (!workdayResumeTask) {
    workdayResumeTask = Promise.resolve()
      .then(() => workdayResumeLoader())
      .then((file) => {
        if (!file) workdayResumeTask = null
        return file
      })
      .catch(() => {
        workdayResumeTask = null
        return null
      })
  }
  return workdayResumeTask
}

export default function workdayConfig(): SiteRule {
  return {
    detect: () => isWorkdayApplyHost(window.location.hostname),
    // "0 items selected" is a non-empty value, so autofill would skip the source
    // input. Revisit that control only while the closed face is still a placeholder.
    includeFilled: (input) =>
      (workdayElementIsSource(input) && workdayPromptFaceIsEmpty(input)) ||
      workdaySchoolPromptNeedsFill(input) ||
      workdayContactTextNeedsCommit(input),
    // In your onMount:
    onMount: (personalInfo) => {
      console.log('PING - Plugin initialized')
      void announceMissingWorkdayAccount(personalInfo)
      let jobApplyClicked = false
      let applyManuallyClicked = false
      let resumeAttached = false
      // A missing file does not count as attached. A later resume input, including
      // the dropzone that appears after the first look, still gets the saved file.
      const fillResume = createWorkdayResumeAttempt(() => workdayResumeLoader())
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
          if (!resumeAttached) {
            if (await fillResume(document)) resumeAttached = true
          }

          // Step 1: Apply on the job page, then Apply Manually. The chooser also
          // shows Autofill with Resume and Use My Last Application. Those are not
          // clicked. Submit, Submit Application, and Send are not clicked.
          if (!applyManuallyClicked) {
            const target = workdayApplyChooserTarget(document, { jobApplyClicked })
            if (target) {
              const manual = target.getAttribute('data-automation-id') === 'applyManually'
              if (manual) applyManuallyClicked = true
              else jobApplyClicked = true
              console.log(manual ? '✓ Found and clicking Apply Manually link' : '✓ Found and clicking Apply')
              target.click()
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
            if (!hasSavedWorkdayApplicationAccount(latest)) {
              await publishMissingWorkdayAccountNotice()
            }
            if (!hasWorkdayAccountCredentials(latest)) {
              accountCredentialsMissing = true
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
                await fillWorkdayWorkExperience(document, personalInfo)
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

              await fillWorkdayApplicationQuestions(document, personalInfo)

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
    apply: async (input, fieldText, personalInfo) => {
      if (isWorkdayResumeFileInput(input as HTMLInputElement)) {
        const fileInput = input as HTMLInputElement
        // Workday clears the file input after a successful upload. A new input
        // in a dropzone that already shows the resume is not another attach.
        if (workdayResumeAlreadyPresent(fileInput)) return 'skip'
        if ((fileInput.files?.length ?? 0) > 0) return 'skip'
        const saved = await loadWorkdaySavedResume()
        if (!saved) return 'skip'
        return (await attachWorkdaySavedResume(fileInput, saved)) ? true : 'skip'
      }
      if (isWorkdayCoverLetterFileInput(input as HTMLInputElement)) return 'skip'
      // Experience rows are filled by the section handler. The generic matcher
      // only knows the first profile job, so letting it through copies that job
      // into every empty row.
      if (workdayInputInExperiencePanel(input)) return 'skip'
      // Education From / To years stay blank. Experience dates are a different
      // panel and are still filled from the profile.
      if (workdayInputIsEducationYear(input)) return 'skip'
      // School or University is a single-select prompt. The closed box can show
      // the profile name while Workday still has no selected school. Field of
      // Study's list icon is a different control. Typed text is not success.
      if (workdayElementIsSchool(input, fieldText)) {
        const school = profileSchoolName(input, personalInfo)
        if (!school) return 'skip'
        const selected = await selectWorkdayPromptQuery(input, school, undefined, { pillPrompt: true })
        return selected ? true : 'skip'
      }
      // A degree that already shows the chosen label must not be typed again.
      // On Adobe that label is Bachelors. On Cisco it is Bachelor of Science
      // when that row is listed. Typing the other string clears the face.
      if (workdayElementIsDegree(input, fieldText)) {
        const degree = profileDegreeType(input, personalInfo)
        if (!degree) return 'skip'
        // Cisco My Experience can render Degree as a native select. Mapping
        // still has to run: Bachelor of Science stays that option, and an
        // Adobe-only list still becomes Bachelors.
        if (input.tagName === 'SELECT') {
          return commitWorkdayDegreeSelect(input as HTMLSelectElement, degree) ? true : 'skip'
        }
        const button = degreeButtonFor(input)
        if (button) {
          const label = await selectWorkdayListedDegree(button, degree)
          return label ? true : 'skip'
        }
        const select = degreeSelectFor(input)
        if (select) return commitWorkdayDegreeSelect(select, degree) ? true : 'skip'
        return 'skip'
      }
      const application = await workdayApplicationApply(input, fieldText, personalInfo)
      if (application !== false) return application
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
      // Legacy accountEmail / accountPassword can still fill. The notice is
      // specifically a missing Application Accounts row for this Workday login.
      if (!hasSavedWorkdayApplicationAccount(latest)) {
        await publishMissingWorkdayAccountNotice()
      }
      if (!hasWorkdayAccountCredentials(latest)) return true
      const account = getWorkdayAccount(latest)
      const value = kind === 'email' ? account.email : account.password
      if (!value) return true
      await fillWorkdayAccountValue(input as HTMLInputElement, value)
      return true
    },
  },
  {
    match: (input) => workdayContactKeyFromElement(input) === 'firstName',
    handle: async (input, _, personalInfo) => {
      await fillCommittedWorkdayText(input as HTMLInputElement, personalInfo.firstName || '')
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
      await fillCommittedWorkdayText(input as HTMLInputElement, personalInfo.lastName || '')
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
      await fillCommittedWorkdayText(input as HTMLInputElement, personalInfo.email || '')
      return true
    },
  },
]

async function fillCommittedWorkdayText(input: HTMLInputElement, value: string) {
  await fillWorkdayInput(input, value)
  commitWorkdayTextValue(input)
}

// Account email and password are the same uncontrolled Workday text as My
// Information. React 17 copies the value on focusout. This is not the contact
// name/email path and does not change fillWorkdayInput.
async function fillWorkdayAccountValue(input: HTMLInputElement, value: string) {
  const type = (input.getAttribute('type') || '').toLowerCase()
  if (type === 'password') {
    setReactInputValue(input, value)
    const EventCtor = input.ownerDocument?.defaultView?.Event ?? Event
    input.dispatchEvent(new EventCtor('change', { bubbles: true, composed: true }))
  } else {
    await fillWorkdayInput(input, value)
  }
  commitWorkdayTextValue(input)
}

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
  if (!hasSavedWorkdayApplicationAccount(latest)) {
    await publishMissingWorkdayAccountNotice()
  }
}

let openListbox: HTMLElement | null = null

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
  accept?: (button: HTMLButtonElement) => boolean,
): Promise<string | null> {
  const shown = () => workdayListboxValue(button)
  const matches = () => (accept ? accept(button) : listboxShowsLabel(button, label))
  if (matches()) return shown() || label
  const doc = button.ownerDocument
  const view = doc?.defaultView
  if (!doc || !view) return null
  const KeyCtor = view.KeyboardEvent ?? KeyboardEvent
  const press = (key: string) => {
    button.dispatchEvent(new KeyCtor('keydown', { key, bubbles: true, cancelable: true }))
  }
  button.focus()
  for (const character of label) {
    press(character)
    // Stop once the closed face is the label being typed. Another character
    // is not a prefix of that option and clears it back to Select One.
    if (matches()) return shown() || label
  }
  press('Enter')
  const started = Date.now()
  while (Date.now() - started < 300) {
    if (matches()) return shown() || label
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
  if (scanPortals) {
    await commitListedDegreeByKeyboard(button, label)
    if (listboxShowsLabel(button, label)) return label
    // Click and ArrowDown do not change a Canvas degree face. The closed
    // label updates when the mapped option ("Bachelors") is typed.
    if (listboxIsPlaceholder(button)) {
      const typed = await commitCanvasDegreeTypeahead(button, label)
      if (typed) return typed
    }
  }
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
      // The open degree list is already painted. Waiting cannot add a degree
      // the catalog does not offer.
      if (substantive.length > 0) break
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

// aria-controls can point at an empty anchor while the rows are in a portal.
// Country and state stay on the controlled list. Source may read the portal.
function activeSourcePrompt(button: HTMLElement): ParentNode | null {
  const prompt = workdayActivePrompt(button)
  const ownLabels = prompt ? substantivePromptLabels(workdayOptionLabels(prompt)) : []
  if (ownLabels.length > 0 && !workdayIsPhoneDeviceTypeOptionList(ownLabels)) return prompt
  const doc = button.ownerDocument
  if (!doc) return prompt
  const popups = promptPopups(doc, elementNode(prompt)).filter((node) => !button.contains(node))
  for (let index = popups.length - 1; index >= 0; index--) {
    const labels = substantivePromptLabels(workdayOptionLabels(popups[index]))
    if (labels.length === 0 || workdayIsPhoneDeviceTypeOptionList(labels)) continue
    return popups[index]
  }
  return prompt
}

function normalizedSourceLabel(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

// The closed face "0 items selected" and the open list name "Options Expanded"
// are not a chosen value. A real pill changes the instruction to include the label.
function sourceInstructionShows(text: string, label: string): boolean {
  const shown = normalizedSourceLabel(text)
  const want = normalizedSourceLabel(label)
  if (!shown || !want) return false
  const key = shown.replace(/[^a-z0-9]+/g, ' ').trim()
  if (/^(?:0|no|none) items? selected(?: press enter.*)?$/.test(key)) return false
  if (key === 'options expanded' || key === 'search results') return false
  return shown === want || shown.includes(want)
}

function sourceFieldRoot(button: HTMLElement): ParentNode | null {
  return button.closest('[data-automation-id^="formField-"], [data-fkit-id]') || button.parentElement
}

// A selected pill's visible text node is promptOption inside selectedItem. The
// delete charm sits beside it, so the container's full text is not just the label.
function sourceControlShows(button: HTMLElement, label: string): boolean {
  if (listboxShowsLabel(button, label)) return true
  const want = normalizedSourceLabel(label)
  if (!want) return false
  if (button.tagName === 'INPUT' || button.tagName === 'TEXTAREA') {
    const value = normalizedSourceLabel((button as HTMLInputElement).value)
    if (value === want) return true
  }
  const field = sourceFieldRoot(button)
  if (!field) return false
  const pills = field.querySelectorAll(
    '[data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"]',
  )
  for (const pill of Array.from(pills)) {
    const own = normalizedSourceLabel(pill.getAttribute('data-automation-label') || pill.textContent || '')
    if (own === want) return true
    const option = pill.querySelector('[data-automation-id="promptOption"]')
    if (!option) continue
    const optionLabel = normalizedSourceLabel(
      option.getAttribute('data-automation-label') || option.textContent || '',
    )
    if (optionLabel === want) return true
  }
  const instruction = field.querySelector('[data-automation-id="promptAriaInstruction"]')
  if (instruction && sourceInstructionShows(instruction.textContent || '', label)) return true
  return false
}

async function waitForSourceLabels(
  button: HTMLElement,
  accept: (labels: string[]) => boolean,
  timeout = 1500,
): Promise<string[] | null> {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const prompt = activeSourcePrompt(button)
    const labels = prompt ? substantivePromptLabels(workdayOptionLabels(prompt)) : []
    if (accept(labels)) return labels
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  return null
}

function sourceLabelKey(labels: string[]): string {
  return labels.join('\n')
}

// A highlighted search row is not a pill. Close the prompt only after the
// closed face shows the committed label, and keep that label when it closes.
function closeCommittedSourcePrompt(button: HTMLElement, label: string): boolean {
  const prompt = activeSourcePrompt(button)
  const open = prompt ? substantivePromptLabels(workdayOptionLabels(prompt)).length > 0 : false
  if (!open) {
    openListbox = null
    return sourceControlShows(button, label)
  }
  collapseOpenListbox()
  return sourceControlShows(button, label)
}

// A highlighted row is not a pill. Indeed counts only when the closed face shows
// that label. The list can change before the pill is painted; closing on that
// change sends Escape, and Workday drops a folder load that has not finished.
async function commitIndeedPill(button: HTMLElement, prompt: ParentNode, label: string): Promise<string | null> {
  const option = workdayOptionElement(prompt, label)
  if (!option) return null
  activateWorkdayOption(promptRowTarget(option))
  const started = Date.now()
  while (Date.now() - started < 1200) {
    if (sourceControlShows(button, label)) {
      return closeCommittedSourcePrompt(button, label) ? label : null
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return null
}

function sourcePromptElement(button: HTMLElement): Element | null {
  const prompt = activeSourcePrompt(button)
  if (!prompt || !('querySelector' in prompt)) return null
  return prompt as Element
}

// Folder children are a network load. The popup shows a busy panel, then the
// rows. Escape while that panel is up aborts the load and leaves no pill.
function sourceListIsBusy(button: HTMLElement): boolean {
  const element = sourcePromptElement(button)
  if (!element) return false
  if (element.getAttribute('aria-busy') === 'true') return true
  return !!element.querySelector('[aria-busy="true"], [data-automation-id="wd-LoadingPanel"]')
}

// Job Board and Job Sites open children. The folder name itself is not a pill.
// A row with no chevron still opens its children on this catalog. A search
// flash or a loading row is not that child list.
async function openJobBoardFolder(button: HTMLElement, prompt: ParentNode): Promise<ParentNode | null> {
  const labels = substantivePromptLabels(workdayOptionLabels(prompt))
  const folder = workdayJobBoardFolderOption(labels)
  if (!folder) return null
  const option = workdayOptionElement(prompt, folder)
  if (!option) return null
  const before = sourceLabelKey(labels)
  activateWorkdayOption(promptRowTarget(option))
  const started = Date.now()
  while (Date.now() - started < 4000) {
    if (sourceControlShows(button, folder)) return null
    const current = activeSourcePrompt(button)
    const next = current ? substantivePromptLabels(workdayOptionLabels(current)) : []
    const changed = !!current && next.length > 0 && sourceLabelKey(next) !== before
    if (changed && !sourceListIsBusy(button) && !sourcePromptIsSearchResult(button)) return current
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return null
}

// The icon handler searches when the box has a value, then clears the box.
// Two ENTER hits stay open and highlighted. That highlight is not a pill.
// An empty box opens the catalog. Drop a leftover query before the icon click.
function clearSourceSearch(control: HTMLElement) {
  if (control.tagName !== 'INPUT' && control.tagName !== 'TEXTAREA') return
  const input = control as HTMLInputElement
  if (input.value) setReactInputValue(input, '')
  input.blur()
}

// Search Results is the filtered list (Amazon Career Choice, Other), not the
// catalog a plain icon click shows. A highlighted catalog row is not that list:
// aria-selected marks keyboard focus, and it is not a selected pill.
function sourcePromptIsSearchResult(button: HTMLElement): boolean {
  const element = sourcePromptElement(button)
  if (!element) return false
  const text = (element.textContent || '').replace(/\s+/g, ' ').toLowerCase()
  return text.includes('search results')
}

async function openSourceCatalog(button: HTMLElement): Promise<string[] | null> {
  clearSourceSearch(button)
  openListbox = button
  openWorkdayPrompt(button, false)
  const labels = await waitForSourceLabels(button, (rows) => rows.length > 0)
  if (!labels || !sourcePromptIsSearchResult(button)) return labels
  collapseOpenListbox()
  clearSourceSearch(button)
  openListbox = button
  openWorkdayPrompt(button, false)
  return waitForSourceLabels(button, (rows) => rows.length > 0)
}

// A chevron row is a parent. Job Sites on the Blue Origin catalog has no chevron
// and still opens children, so the folder check is the label, not the icon.
function sourceLeafLabels(prompt: ParentNode): string[] {
  return workdayOptionElements(prompt)
    .filter((choice) => !workdayPromptRowIsFolder(choice.element))
    .map((choice) => choice.label)
}

// Open Job Board (or Job Sites) and commit Indeed. Indeed already sitting on
// the list is committed directly. No Indeed on that path leaves the field empty.
async function chooseWorkdaySource(button: HTMLElement): Promise<string | null> {
  collapseOpenListbox()
  const labels = await openSourceCatalog(button)
  const prompt = activeSourcePrompt(button)
  if (!labels || !prompt) {
    collapseOpenListbox()
    return null
  }
  // A search list can still be what the second open painted. Leave it closed.
  if (sourcePromptIsSearchResult(button)) {
    collapseOpenListbox()
    return null
  }
  const listedIndeed = workdayIndeedSourceOption(sourceLeafLabels(prompt))
  if (listedIndeed) {
    const committed = await commitIndeedPill(button, prompt, listedIndeed)
    if (!committed) collapseOpenListbox()
    return committed
  }
  const opened = await openJobBoardFolder(button, prompt)
  if (!opened) {
    collapseOpenListbox()
    return null
  }
  const childIndeed = workdayIndeedSourceOption(sourceLeafLabels(opened))
  if (!childIndeed) {
    collapseOpenListbox()
    return null
  }
  const committed = await commitIndeedPill(button, opened, childIndeed)
  if (!committed) collapseOpenListbox()
  return committed
}

export async function selectWorkdaySource(button: HTMLElement): Promise<string | null> {
  return chooseWorkdaySource(button)
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

async function chooseWorkdaySourceControl(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): Promise<boolean> {
  if (input.tagName === 'SELECT') return chooseWorkdaySelect(input, '', 'source')
  if (input.tagName === 'INPUT' && (input as HTMLInputElement).type === 'radio') {
    return chooseWorkdayRadio(input as HTMLInputElement, workdaySourceOption)
  }
  // A custom text input opens a flat list. Claiming it without that click left
  // "0 items selected" in place. Still claim the field when Indeed is not listed
  // so the generic matcher cannot invent LinkedIn.
  if (!workdayPromptFaceIsEmpty(input)) return true
  await chooseWorkdaySource(input)
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

function workdayInputIsEducationYear(input: Element): boolean {
  const panel = input.closest('[role="group"][aria-labelledby$="-panel"]')
  if (!panel) return false
  const labelledBy = panel.getAttribute('aria-labelledby') || ''
  const doc = input.ownerDocument
  const heading = (
    doc?.getElementById(labelledBy)?.textContent ||
    labelledBy.replace(/-panel$/, '').replace(/-/g, ' ')
  )
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  if (!heading.includes('education') && !heading.includes('academic')) return false
  if (heading.includes('experience')) return false
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  const blob = [
    input.id,
    input.getAttribute('name'),
    input.getAttribute('data-automation-id'),
    field?.getAttribute('data-automation-id'),
    field?.getAttribute('data-fkit-id'),
  ]
    .join(' ')
    .toLowerCase()
  return (
    blob.includes('firstyearattended') ||
    blob.includes('lastyearattended') ||
    blob.includes('datesectionyear')
  )
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

function promptFieldScope(control: HTMLElement): ParentNode | null {
  return (
    control.closest('[data-automation-id^="formField-"], [data-fkit-id]') ||
    control.closest('[data-automation-id="multiSelectContainer"]') ||
    control.parentElement
  )
}

function promptBackedField(control: HTMLElement): boolean {
  const scope = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  if (!scope) return false
  return !!scope.querySelector(
    '[data-automation-id="multiSelectContainer"], [data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
  )
}

// The list icon on this field. Field of Study's icon sits in the next form
// field and must not be used to open School.
function promptHasIcon(control: HTMLElement): boolean {
  const scope = promptFieldScope(control)
  if (!scope) return false
  return !!scope.querySelector(
    '[data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
  )
}

function schoolTypeaheadInput(control: HTMLElement): HTMLInputElement | null {
  if (control.tagName === 'INPUT') return control as HTMLInputElement
  const scope = promptFieldScope(control)
  const input = scope?.querySelector('input')
  if (!input || input.tagName !== 'INPUT') return null
  if (input.closest('[data-automation-id="responsiveMonikerPrompt"], [data-automation-id="promptPopup"]')) {
    return null
  }
  return input as HTMLInputElement
}

function cleanVisibleLabel(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function pillTextWithoutQuery(item: Element): string {
  const clone = item.cloneNode(true) as HTMLElement
  clone.querySelectorAll('input, textarea').forEach((node) => node.remove())
  return clone.textContent || ''
}

// A selected school is a pill node. The list's own text is the search query or
// a suggestion menu, and an empty list has no selected school.
function selectedPillLabels(root: ParentNode): string[] {
  const labels: string[] = []
  root.querySelectorAll('[data-automation-id="selectedItemList"]').forEach((list) => {
    list
      .querySelectorAll('[data-automation-id="selectedItem"], [data-automation-id="selectedItemLabel"]')
      .forEach((item) => {
        if (item.tagName === 'INPUT' || item.tagName === 'TEXTAREA') return
        const option = item.querySelector('[data-automation-id="promptOption"]')
        const raw = option
          ? option.getAttribute('data-automation-label') || option.textContent || ''
          : item.getAttribute('data-automation-label') || pillTextWithoutQuery(item)
        const text = cleanVisibleLabel(raw)
        if (text && text.toLowerCase() !== 'delete') labels.push(text)
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

// The opener is the prompt icon inside this multiselect, not another promptIcon
// elsewhere on the page. A listbox button has no icon, so the control itself opens.
function promptOpenTarget(control: HTMLElement): HTMLElement {
  const container = control.closest('[data-automation-id="multiSelectContainer"]')
  const scope = container || control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
  const icon = scope?.querySelector(
    '[data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
  )
  if (icon) return icon as HTMLElement
  return control
}

function openWorkdayPrompt(control: HTMLElement, focusControl = true) {
  // element.click() does not fire mousedown. This multiselect opens on the same
  // pointer sequence as a prompt row, so a bare click leaves the list closed.
  activateWorkdayOption(promptOpenTarget(control))
  // School types into the search box, so that caller still focuses it. Source
  // passes false: a value in this box makes the icon run a search instead of
  // opening the catalog, and the highlighted hit is not a selected pill.
  if (!focusControl) return
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
// A school prompt's closed input can already be marked searchBox. Typing there
// shows the name and never opens a suggestion list. pillPrompt waits for the
// search box the icon press paints, which may be a different node.
async function resolveCatalogSearch(
  control: HTMLElement,
  pillPrompt = false,
): Promise<HTMLInputElement | null> {
  const own = control.tagName === 'INPUT' ? (control as HTMLInputElement) : null
  const promptBacked = promptBackedField(control)
  if (own && isCatalogSearchInput(own) && !(pillPrompt && promptBacked)) return own
  const started = Date.now()
  const giveUpAt = promptBacked ? 700 : 40
  while (Date.now() - started < 700) {
    const doc = control.ownerDocument
    const field = control.closest('[data-automation-id^="formField-"], [data-fkit-id]')
    if (pillPrompt) {
      const prompts = promptPopups(doc, null)
      for (let index = prompts.length - 1; index >= 0; index--) {
        const found = workdayPromptSearchInput(prompts[index])
        if (found && found !== own) return found
      }
    }
    const inField = field ? workdayPromptSearchInput(field) : null
    if (inField && (inField !== own || isCatalogSearchInput(inField))) {
      if (!(pillPrompt && promptBacked && inField === own && !catalogShellOpen(doc))) return inField
    }
    if (!pillPrompt) {
      const prompts = promptPopups(doc, null)
      for (let index = prompts.length - 1; index >= 0; index--) {
        const found = workdayPromptSearchInput(prompts[index])
        if (found) return found
      }
    }
    if (Date.now() - started >= giveUpAt && !catalogShellOpen(doc)) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  // Typing into the closed prompt leaves the query visible and unselected.
  if (promptBacked && own && (!isCatalogSearchInput(own) || pillPrompt)) return null
  return own && own.isConnected ? own : null
}

function clearSchoolQuery(input: HTMLInputElement) {
  setReactInputValue(input, '')
  const view = input.ownerDocument?.defaultView
  const EventCtor = view?.Event ?? Event
  input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  if (input.value.trim()) {
    const proto = view?.HTMLInputElement?.prototype ?? HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, '')
  }
  const propsKey = Object.keys(input).find((key) => key.startsWith('__reactProps'))
  const props = propsKey
    ? (input as unknown as Record<string, { onChange?: (event: { target: HTMLInputElement }) => void }>)[propsKey]
    : null
  props?.onChange?.({ target: input })
}

function clearClosedPromptQuery(control: HTMLElement) {
  const field = control.closest('[data-automation-id^="formField-"], [data-fkit-id]') || control.parentElement
  const inputs = field ? Array.from(field.querySelectorAll('input')) : []
  const targets = control.tagName === 'INPUT' ? [control as HTMLInputElement, ...inputs] : inputs
  const seen = new Set<HTMLInputElement>()
  for (const input of targets) {
    if (input.tagName !== 'INPUT' || seen.has(input)) continue
    seen.add(input)
    if (!input.value.trim()) continue
    if (input.closest('[data-automation-id="responsiveMonikerPrompt"], [data-automation-id="promptPopup"]')) continue
    setReactInputValue(input, '')
  }
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

// Adobe School or University has no prompt icon. The input is the typeahead:
// an input event asks schools?search=, and the selected instance is a pill.
// Text left in the box is the query, not the school. Field of Study's icon is
// not this opener.
type SchoolTypeaheadResult = 'pill' | 'miss' | 'no-menu'

// Focus matters: the suggestion popup is not painted while the box is
// unfocused, so a value write alone leaves the school name as plain text.
// menuGraceMs lets a field that also has its own prompt icon fall through
// when typing never paints a menu. A menu that does not offer this school
// is a miss, not a reason to click a different row.
async function commitSchoolTypeahead(
  input: HTMLInputElement,
  query: string,
  pick: (labels: string[]) => string | null,
  menuGraceMs = 1800,
): Promise<SchoolTypeaheadResult> {
  if (promptSelectionCommitted(input, pick)) return 'pill'
  try {
    input.focus()
  } catch {
    // A detached school box cannot take focus. Typing still asks for suggestions.
  }
  setReactInputValue(input, query)
  let pressedEnter = false
  let sawMenu = false
  const started = Date.now()
  while (Date.now() - started < 1800) {
    if (promptSelectionCommitted(input, pick)) return 'pill'
    const option = matchingSuggestionRow(input, pick)
    if (option) {
      sawMenu = true
      activateWorkdayOption(promptRowTarget(option))
      await new Promise((resolve) => setTimeout(resolve, 40))
      if (promptSelectionCommitted(input, pick)) return 'pill'
      if (!pressedEnter) {
        dispatchEnter(input)
        pressedEnter = true
      }
    } else if (!sawMenu && menuGraceMs < 1800 && Date.now() - started >= menuGraceMs) {
      return 'no-menu'
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (promptSelectionCommitted(input, pick)) return 'pill'
  clearSchoolQuery(input)
  return sawMenu ? 'miss' : 'no-menu'
}

// Type into a school or field-of-study prompt and click the matching suggestion.
// The catalog reads the prompt's search box, which appears when the multiselect
// opens. A typed query is not a selected school. Enter asks a catalog that does
// not search on each keystroke to show rows; the committed value is the pill.
export async function selectWorkdayPromptQuery(
  control: HTMLElement,
  query: string,
  pick: (labels: string[]) => string | null = (labels) => workdaySuggestionOption(labels, query),
  options?: { pillPrompt?: boolean },
): Promise<boolean> {
  const trimmed = query.trim()
  if (!trimmed) return false
  if (promptSelectionCommitted(control, pick)) return true
  const pillPrompt = !!options?.pillPrompt
  // School suggestions come from this field's input. A prompt icon on Field
  // of Study is not the school opener. This field's own icon is only a
  // fallback when typing never paints a menu.
  if (pillPrompt) {
    const typeahead = schoolTypeaheadInput(control)
    if (typeahead) {
      const grace = promptHasIcon(control) ? 1500 : 1800
      const outcome = await commitSchoolTypeahead(typeahead, trimmed, pick, grace)
      if (outcome === 'pill') return true
      if (outcome === 'miss' || !promptHasIcon(control)) {
        clearClosedPromptQuery(control)
        return false
      }
      clearClosedPromptQuery(control)
    } else if (!promptHasIcon(control)) {
      return false
    }
  }
  // The icon opens the catalog only while the closed input is empty. A name
  // already sitting in that box is not a selected school, and it makes the
  // icon search instead of opening the list.
  if (pillPrompt && promptBackedField(control)) clearClosedPromptQuery(control)
  openWorkdayPrompt(control, !pillPrompt)
  const search = await resolveCatalogSearch(control, pillPrompt)
  if (!search) {
    if (pillPrompt) {
      // The icon did not paint a popup search. The closed input is the
      // typeahead, including when a prompt icon is present but does not open.
      const typeahead = schoolTypeaheadInput(control)
      if (typeahead) {
        const outcome = await commitSchoolTypeahead(typeahead, trimmed, pick)
        if (outcome === 'pill') return true
      }
      clearClosedPromptQuery(control)
    }
    return false
  }
  setReactInputValue(search, trimmed)
  let pressedEnter = false
  const started = Date.now()
  while (Date.now() - started < 1800) {
    if (promptSelectionCommitted(control, pick)) return true
    const option = matchingSuggestionRow(search, pick)
    if (option) {
      activateWorkdayOption(promptRowTarget(option))
      await new Promise((resolve) => setTimeout(resolve, 40))
      if (promptSelectionCommitted(control, pick)) return true
      // A click that leaves the query in the box did not select a school.
      // pillPrompt waits for the pill. Other prompts still accept the click
      // when the field does not track pills.
      if (!pillPrompt && !promptTracksPills(control)) return true
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
  if (promptTracksPills(control) || pillPrompt) {
    // The icon catalog can miss on this page. School suggestions also open
    // from the field's own input, and a pill is still the only success.
    const typeahead = pillPrompt ? schoolTypeaheadInput(control) : null
    if (typeahead && typeahead !== search) {
      const outcome = await commitSchoolTypeahead(typeahead, trimmed, pick)
      if (outcome === 'pill') return true
    }
    if (search.isConnected && search.value.trim()) setReactInputValue(search, '')
    if (pillPrompt) clearClosedPromptQuery(control)
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

function visibleDegreeLabels(button: HTMLButtonElement): string[] {
  const prompt = workdayActivePrompt(button)
  if (!prompt) return []
  return substantivePromptLabels(workdayOptionLabels(prompt))
}

export async function selectWorkdayListedDegree(
  button: HTMLButtonElement,
  degreeType: string,
): Promise<string | null> {
  const trimmed = degreeType.trim()
  if (!trimmed) return null
  // A later autofill must not reopen a degree that already shows the right
  // label. A generic face ("Bachelors") is that label only when the catalog
  // does not also list the exact profile degree. Cisco lists Bachelor of
  // Science itself; typing the shorter word selects the wrong row.
  if (!listboxIsPlaceholder(button)) {
    const shown = workdayListboxValue(button)
    const visible = visibleDegreeLabels(button)
    if (visible.length > 0) {
      const best = workdayDegreeOption(visible, trimmed)
      if (best && listboxShowsLabel(button, best)) return best
      if (best) {
        const option = listedOptionElement(button, best)
        if (option) {
          const settled = await settleListedChoice(button, option, best, true)
          if (settled) return settled
        }
        const typed = await commitCanvasDegreeTypeahead(button, best)
        if (typed) return typed
      }
    }
    const mapped = workdayDegreeOption([shown], trimmed)
    if (mapped && listboxShowsLabel(button, mapped)) return mapped
    return null
  }
  // Read the catalog before typing. "Bachelor of Science" is not a prefix of
  // the Workday option "Bachelors", so typing the profile string clears an
  // Adobe face that only offers Bachelors. When the exact title is listed,
  // that title is what gets typed.
  // A catalog that stays on "No Items." until the search box has a query is
  // the same shape as School. The profile title is that query. Adobe's short
  // list is read on the first open, so this search does not replace a mapped
  // Bachelors label with the raw profile string.
  const picked = await chooseFirstListedOption(
    button,
    (labels) => workdayDegreeOption(labels, trimmed),
    [trimmed],
    true,
  )
  if (picked) return picked
  if (!listboxIsPlaceholder(button)) return null
  return commitCanvasDegreeTypeahead(button, trimmed)
}

const applicationChoiceAttempts = new WeakMap<HTMLButtonElement, number>()

async function selectWorkdayProfileChoice(
  button: HTMLButtonElement,
  kind: 'authorized' | 'sponsorship',
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): Promise<string | null> {
  const answer = workdayProfileChoice(kind, info)
  if (!answer) return null
  // The live menu is not in the document until it opens, and opening it is what
  // left the closed label on Select One: no rows were readable, so nothing was
  // typed. The closed button commits from its own key handler, the same way
  // Degree does. Yes/No is only kept when that handler actually changes the label.
  if (workdayButtonShowsAnswer(button, answer)) return workdayListboxValue(button) || wordFor(answer)
  const word = wordFor(answer)
  // The closed face can be the question plus the answer, so an exact "Yes"
  // comparison misses a commit the page is already showing.
  const committed = await commitCanvasDegreeTypeahead(button, word, (target) =>
    workdayButtonShowsAnswer(target, answer),
  )
  if (!committed) return null
  return committed
}

function wordFor(answer: 'yes' | 'no'): string {
  return answer === 'yes' ? 'Yes' : 'No'
}

function applicationChoiceButton(input: Element): HTMLButtonElement | null {
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]') || input.parentElement
  if (!field) return null
  const button = field.querySelector('button[aria-haspopup="listbox"]')
  if (!button || button.tagName !== 'BUTTON') return null
  return button as HTMLButtonElement
}

export async function fillWorkdayApplicationQuestions(
  root: ParentNode,
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): Promise<number> {
  let filled = 0
  const buttons = Array.from(root.querySelectorAll('button[aria-haspopup="listbox"]'))
  for (const node of buttons) {
    if (node.tagName !== 'BUTTON') continue
    const button = node as HTMLButtonElement
    const kind = workdayApplicationQuestionKind(button)
    if (kind !== 'authorized' && kind !== 'sponsorship') continue
    const answer = workdayProfileChoice(kind, info)
    if (!answer) continue
    // Already showing the profile answer. Counting it is what keeps the autofill
    // message from saying nothing matched after the closed label changed.
    if (workdayButtonShowsAnswer(button, answer)) {
      filled += 1
      continue
    }
    if (!workdayListboxIsEmpty(button)) continue
    const tries = applicationChoiceAttempts.get(button) || 0
    if (tries >= 2) continue
    applicationChoiceAttempts.set(button, tries + 1)
    const label = await selectWorkdayProfileChoice(button, kind, info)
    if (!label) continue
    filled += 1
    console.log('✓ Selected application answer:', label)
  }
  return filled
}

// Same discovery autofill uses: inputs, textareas, and selects, plus the Canvas
// buttons those queries miss. A menu that never opens is not a reason to report
// that the questions were not there.
export async function workdayQuestionAutofillResult(
  root: ParentNode,
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): Promise<{ filled: number; message: string }> {
  let filled = await fillWorkdayApplicationQuestions(root, info)
  const inputs = Array.from(root.querySelectorAll('input, textarea, select'))
  for (const node of inputs) {
    const tag = node.tagName
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') continue
    const input = node as HTMLInputElement
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    if (type === 'hidden' || type === 'submit' || type === 'button') continue
    if (String(input.value || '').trim()) continue
    const result = await workdayApplicationApply(input, '', info)
    if (result === true) filled += 1
  }
  return {
    filled,
    message: filled > 0 ? `Filled ${filled} fields` : 'No matching fields found',
  }
}

export async function workdayApplicationApply(
  input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  fieldText: string,
  info: { workAuthorization?: string | null; sponsorshipRequired?: string | null },
): Promise<boolean | 'skip'> {
  const kind = workdayApplicationQuestionKind(input, fieldText)
  if (!kind) return false
  if (kind === 'years' || kind === 'government') return 'skip'
  const button = applicationChoiceButton(input)
  if (!button || !workdayListboxIsEmpty(button)) return 'skip'
  if (!workdayProfileChoice(kind, info)) return 'skip'
  const label = await selectWorkdayProfileChoice(button, kind, info)
  return label ? true : 'skip'
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
    if (!hasSavedWorkdayApplicationAccount(latest)) {
      await publishMissingWorkdayAccountNotice()
    }
    if (!hasWorkdayAccountCredentials(latest)) return
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

    await fillWorkdayAccountValue(emailInput, workdayAccount.email)
    await fillWorkdayAccountValue(passwordInput, workdayAccount.password)
    if (verifyPasswordInput) {
      await fillWorkdayAccountValue(verifyPasswordInput, workdayAccount.password)
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

function experienceDatePartsEmpty(section: ParentNode, metadataId: string): boolean {
  const scope = fieldScope(section, metadataId)
  if (!scope) return false
  const month = workdayDatePartInput(scope, 'month')
  const year = workdayDatePartInput(scope, 'year')
  if (!month && !year) return false
  return !month?.value.trim() || !year?.value.trim()
}

async function ensureExperiencePanel(section: Element, experience: PersonalInfo['experience'][number]) {
  const jobTitleInput = workdayFieldControl(section, 'jobTitle') as HTMLInputElement | null
  const companyInput = workdayFieldControl(section, 'companyName') as HTMLInputElement | null
  const descriptionInput = workdayFieldControl(section, 'roleDescription') as HTMLTextAreaElement | null
  const locationInput = workdayFieldControl(section, 'location') as HTMLInputElement | null

  if (jobTitleInput && !jobTitleInput.value.trim() && experience.jobTitle) {
    await fillWorkdayInput(jobTitleInput, experience.jobTitle)
  }
  if (companyInput && !companyInput.value.trim() && experience.companyName) {
    await fillWorkdayInput(companyInput, experience.companyName)
  }
  if (descriptionInput && !descriptionInput.value.trim() && experience.description) {
    await fillWorkdayInput(descriptionInput, experience.description)
  }
  const location = workdayExperienceLocation(experience.locationCity, experience.locationState)
  if (locationInput && !locationInput.value.trim() && location) {
    await fillWorkdayInput(locationInput, location)
  }

  if (experience.startDate && experienceDatePartsEmpty(section, 'startDate')) {
    await fillWorkdayDate(section, 'startDate', experience.startDate)
  }

  // A current role has no end date on the profile. Check the box. Do not write a To date.
  if (experience.present || !experience.endDate) {
    const currentlyScope = fieldScope(section, 'currentlyWorkHere')
    const currentlyWorkHere = currentlyScope?.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null
    if (currentlyWorkHere && !currentlyWorkHere.checked) currentlyWorkHere.click()
    return
  }

  if (experienceDatePartsEmpty(section, 'endDate')) {
    await fillWorkdayDate(section, 'endDate', experience.endDate)
  }
}

async function waitForAddedExperiencePanel(root: ParentNode, before: number): Promise<Element | null> {
  for (let attempt = 0; attempt < 11; attempt++) {
    const sectionsNow = listWorkdayPanels(root, 'experience')
    if (sectionsNow.length > before) return sectionsNow[sectionsNow.length - 1]
    if (attempt === 10) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

let experienceFillQueue: Promise<unknown> = Promise.resolve()

// One row per profile job. A job whose title and company are already on the page
// is left in place. A fully blank row is reused. Add is only for a job that is
// not on the page yet. Calls are serialized so a second autofill cannot click
// Add while the first is still writing the title.
export function fillWorkdayWorkExperience(
  root: ParentNode,
  personalInfo: PersonalInfo | null | undefined,
): Promise<number> {
  const run = experienceFillQueue.then(() => fillWorkdayWorkExperienceOnce(root, personalInfo))
  experienceFillQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function fillWorkdayWorkExperienceOnce(
  root: ParentNode,
  personalInfo: PersonalInfo | null | undefined,
): Promise<number> {
  const jobs = personalInfo?.experience || []
  if (jobs.length === 0) return 0
  let filled = 0
  for (const experience of jobs) {
    const panels = listWorkdayPanels(root, 'experience')
    const existing = panels.find((panel) => workdayPanelMatchesExperience(panel, experience))
    if (existing) {
      await ensureExperiencePanel(existing, experience)
      continue
    }

    let section = panels.find((panel) => workdayExperiencePanelIsBlank(panel)) || null
    let added = false
    if (!section) {
      const addBtn = findWorkdaySectionAddButton(root, 'experience')
      if (!addBtn) break
      const sectionsBefore = panels.length
      addBtn.click()
      added = true
      section = await waitForAddedExperiencePanel(root, sectionsBefore)
      if (!section) break
    }

    await ensureExperiencePanel(section, experience)
    filled += 1
    if (added) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  return filled
}

function educationRow(input: Element, info: PersonalInfo) {
  const education = info.education || []
  if (education.length === 0) return null
  const doc = input.ownerDocument
  const panels = doc ? listWorkdayPanels(doc, 'education') : []
  const panel = input.closest('[role="group"][aria-labelledby$="-panel"]')
  const index = panel ? panels.indexOf(panel) : 0
  return education[index >= 0 ? index : 0] || education[0]
}

function profileSchoolName(input: Element, info: PersonalInfo): string {
  return (educationRow(input, info)?.schoolName || '').trim()
}

function profileDegreeType(input: Element, info: PersonalInfo): string {
  return (educationRow(input, info)?.degreeType || '').trim()
}

function degreeFaceButton(buttons: HTMLButtonElement[]): HTMLButtonElement | null {
  const popup = buttons.find((button) => button.getAttribute('aria-haspopup') === 'listbox')
  if (popup) return popup
  const named = buttons.find((button) => {
    const blob = `${button.id} ${button.getAttribute('name') || ''} ${button.getAttribute('data-automation-id') || ''}`
      .toLowerCase()
      .replace(/[^a-z]/g, '')
    return blob.includes('degree')
  })
  if (named) return named
  return buttons[0] || null
}

function degreeButtonFor(input: Element): HTMLButtonElement | null {
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]') || input.parentElement
  if (!field) return null
  const buttons = Array.from(field.querySelectorAll('button')).filter(
    (node): node is HTMLButtonElement => node.tagName === 'BUTTON',
  )
  return degreeFaceButton(buttons)
}

function degreeSelectFor(input: Element): HTMLSelectElement | null {
  if (input.tagName === 'SELECT') return input as HTMLSelectElement
  const field = input.closest('[data-automation-id^="formField-"], [data-fkit-id]') || input.parentElement
  const select = field?.querySelector('select')
  if (!select || select.tagName !== 'SELECT') return null
  return select as HTMLSelectElement
}

const DEGREE_FIELD_IDS = ['degree', 'degreeType']

function educationDegreeButton(section: ParentNode): HTMLButtonElement | null {
  const listed = firstListbox(section, DEGREE_FIELD_IDS)
  if (listed) return listed
  for (const id of DEGREE_FIELD_IDS) {
    const scope = fieldScope(section, id)
    if (!scope) continue
    const buttons = Array.from(scope.querySelectorAll('button')).filter(
      (node): node is HTMLButtonElement => node.tagName === 'BUTTON',
    )
    const button = degreeFaceButton(buttons)
    if (button) return button
  }
  return null
}

function educationDegreeSelect(section: ParentNode): HTMLSelectElement | null {
  for (const id of DEGREE_FIELD_IDS) {
    const scope = fieldScope(section, id)
    const select = scope?.querySelector('select')
    if (select && select.tagName === 'SELECT') return select as HTMLSelectElement
  }
  return null
}

function degreeOptionLabel(option: HTMLOptionElement): string {
  return (option.text || option.label || option.value || '').replace(/\s+/g, ' ').trim()
}

function degreeSelectIsPlaceholder(select: HTMLSelectElement): boolean {
  const option = select.options[select.selectedIndex]
  const key = (option ? degreeOptionLabel(option) : '').toLowerCase().replace(/[^a-z]/g, '')
  return !key || key === 'selectone' || key === 'select' || key === 'pleaseselect' || key === 'chooseone'
}

// Native degree <select>. The option text is what workdayDegreeOption maps.
// Cisco keeps Bachelor of Science when that option is listed. Adobe's list,
// which has no exact title, becomes Bachelors. A listed label that is already
// selected is left alone.
function commitWorkdayDegreeSelect(select: HTMLSelectElement, degreeType: string): string | null {
  const trimmed = degreeType.trim()
  if (!trimmed) return null
  const options = Array.from(select.options)
  const picked = workdayDegreeOption(options.map(degreeOptionLabel), trimmed)
  if (!picked) return null
  const wanted = picked.replace(/\s+/g, ' ').trim().toLowerCase()
  const match = options.find((option) => degreeOptionLabel(option).toLowerCase() === wanted)
  if (!match) return null
  const current = options[select.selectedIndex]
  if (current && degreeOptionLabel(current).toLowerCase() === wanted) return picked
  select.value = match.value
  if (degreeOptionLabel(options[select.selectedIndex] || match).toLowerCase() !== wanted) {
    match.selected = true
  }
  const EventCtor = select.ownerDocument?.defaultView?.Event ?? Event
  select.dispatchEvent(new EventCtor('input', { bubbles: true }))
  select.dispatchEvent(new EventCtor('change', { bubbles: true }))
  return picked
}

function educationFieldPills(panel: Element, ids: string[]): string[] {
  const scope = ids.map((id) => fieldScope(panel, id)).find((node) => node) || panel
  return selectedPillLabels(scope)
}

function educationPanelMatches(
  panel: Element,
  education: { schoolName?: string | null },
): boolean {
  const school = (education.schoolName || '').trim()
  if (!school) return false
  return !!workdaySuggestionOption(
    educationFieldPills(panel, ['school', 'schoolName', 'schoolItem']),
    school,
  )
}

// Typed school text is not a filled row. Degree still on Select One, with no
// school pill, is the empty Education 1 Workday inserts for a required section.
function educationPanelIsBlank(panel: Element): boolean {
  if (educationFieldPills(panel, ['school', 'schoolName', 'schoolItem']).length > 0) return false
  const degree = educationDegreeButton(panel)
  if (degree && !listboxIsPlaceholder(degree)) return false
  const degreeSelect = educationDegreeSelect(panel)
  if (degreeSelect && !degreeSelectIsPlaceholder(degreeSelect)) return false
  const gpa = workdayFieldControl(panel, 'gradeAverage') as HTMLInputElement | null
  if (gpa?.value.trim()) return false
  if (educationFieldPills(panel, ['fieldOfStudy', 'major']).length > 0) return false
  return true
}

async function waitForEducationPanels(root: ParentNode): Promise<Element[]> {
  const started = Date.now()
  let panels = listWorkdayPanels(root, 'education')
  while (panels.length === 0 && Date.now() - started < 1200) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    panels = listWorkdayPanels(root, 'education')
  }
  return panels
}

async function educationSectionFor(
  root: ParentNode,
  education: { schoolName?: string | null },
  index: number,
): Promise<Element | null> {
  let panels = listWorkdayPanels(root, 'education')
  // Workday inserts the required Education 1 row in an effect. Clicking Add
  // in that same moment creates Education 2 and leaves Education 1 empty.
  if (panels.length === 0 && findWorkdaySectionAddButton(root, 'education')) {
    panels = await waitForEducationPanels(root)
  }
  const matched = panels.find((panel) => educationPanelMatches(panel, education))
  if (matched) return matched
  const blank = panels.find((panel) => educationPanelIsBlank(panel))
  if (blank) return blank
  if (panels[index]) return panels[index]
  const addBtn = findWorkdaySectionAddButton(root, 'education')
  if (!addBtn) return null
  const before = panels.length
  addBtn.click()
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    const now = listWorkdayPanels(root, 'education')
    if (now.length > before) {
      return now.find((panel) => educationPanelIsBlank(panel)) || now[now.length - 1]
    }
  }
  return null
}

async function fillEducationSection(section: Element, education: PersonalInfo['education'][number]) {
  const schoolQuery = (education.schoolName || '').trim()
  if (schoolQuery) {
    console.log('Filling school name:', schoolQuery)
    const schoolIds = ['schoolName', 'school', 'schoolItem']
    const schoolInput = firstTextControl(section, schoolIds)
    let schoolSelected = schoolInput
      ? await selectWorkdayPromptQuery(schoolInput, schoolQuery, undefined, { pillPrompt: true })
      : false
    if (!schoolSelected) {
      const scope = schoolIds.map((id) => fieldScope(section, id)).find((node) => node)
      const container = scope?.querySelector(
        '[data-automation-id="multiSelectContainer"], [data-automation-id="promptIcon"], [data-automation-id="promptSearchButton"]',
      )
      if (container && container !== schoolInput) {
        schoolSelected = await selectWorkdayPromptQuery(container as HTMLElement, schoolQuery, undefined, {
          pillPrompt: true,
        })
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
    const degreeBtn = educationDegreeButton(section)
    let degreeLabel = degreeBtn ? await selectWorkdayListedDegree(degreeBtn, degreeQuery) : null
    if (!degreeLabel) {
      const degreeSelect = educationDegreeSelect(section)
      if (degreeSelect) degreeLabel = commitWorkdayDegreeSelect(degreeSelect, degreeQuery)
    }
    if (!degreeLabel) {
      const degreeInput = firstTextControl(section, ['degree', 'degreeType'])
      if (degreeInput) {
        const selected = await selectWorkdayPromptQuery(degreeInput, degreeQuery, (labels) =>
          workdayDegreeOption(labels, degreeQuery),
        )
        if (selected) degreeLabel = degreeQuery
      }
    }
    if (degreeLabel) console.log('✓ Selected degree:', degreeLabel)
    else console.error('Degree not found for:', degreeQuery)
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

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
}

let educationFillQueue: Promise<unknown> = Promise.resolve()

// One row per profile education. An empty Education 1 is filled in place.
// Add is only for a later education when no blank row is left. From / To
// years are not written.
export function fillWorkdayEducation(
  root: ParentNode,
  personalInfo: PersonalInfo | null | undefined,
): Promise<number> {
  const run = educationFillQueue.then(() => fillWorkdayEducationOnce(root, personalInfo))
  educationFillQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

async function fillWorkdayEducationOnce(
  root: ParentNode,
  personalInfo: PersonalInfo | null | undefined,
): Promise<number> {
  const rows = personalInfo?.education || []
  if (rows.length === 0) return 0
  let filled = 0
  for (let idx = 0; idx < rows.length; idx++) {
    const education = rows[idx]
    console.log(`Processing education ${idx + 1}/${rows.length}`)
    const section = await educationSectionFor(root, education, idx)
    if (!section) {
      console.error('Education section not found')
      break
    }
    await fillEducationSection(section, education)
    filled += 1
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  console.log('✓ Finished handling all education')
  return filled
}

const handleEducation = async (personalInfo: PersonalInfo) => {
  await fillWorkdayEducation(document, personalInfo)
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
