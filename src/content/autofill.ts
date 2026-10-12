import { linkedinProfileUrl } from '../utils/profileUrl.ts'
import { matchFieldToData } from './fieldMatch.ts'
import { embeddedIcimsFillableFields } from '../utils/siteRules/icimsFrameAutofill.js'
import { icimsSelectNeedsFill } from '../utils/siteRules/icimsFields.ts'
import { coerceFillText, refuseAutofill } from '../utils/fillValue.ts'
import { hasStoredSession } from '../lib/storedSession.ts'
import { siteRules } from '../utils/siteRules/index.ts'
import { isWorkdayApplyHost } from '../utils/siteRules/workdayAccount.ts'
import {
  fillWorkdayApplicationQuestions,
  fillWorkdayEducation,
  fillWorkdayWorkExperience,
} from '../utils/siteRules/workday.ts'
import { beginLeverFill, readLeverEeoTelemetry } from '../utils/siteRules/lever.ts'
import { isWorkableApplyPage } from '../utils/siteRules/workable.ts'
import {
  workableApplicationFailed,
  WORKABLE_PAGE_FAILED_MESSAGE,
} from '../utils/siteRules/workablePage.ts'
import {
  presentFillFailure,
  showAutofillNotification,
  showAutofillPrompt,
} from './notifications.ts'
import {
  comboboxSearchIsUncommitted,
  fillNativeInput,
  setSelectValue,
  setCheckboxValue,
  setRadioValue,
  fillReactSelectAnswer,
} from '@/utils/inputHandlers.ts'
import { normalizeText } from '@/utils/helpers.ts'
import { trackFillContract, type TrackFillContractContext } from '@/services/fillTelemetry'
import type { AutofillFailureReason } from '@/utils/fillContract'
import { commitSuccessfulFill, evaluateFillAccess } from '@/services/billing/fillAccess'
import { rememberFillBlock } from '@/services/billing/proUnlock'
import { PAYWALL_COPY } from '@/services/billing/copy'
import { showFillPaywall } from './fillPaywall'
import { getSiteLabel } from '../utils/jobSitePatterns.ts'
import { loadFillPersonalInfo } from '../lib/fillProfile.ts'
import { isPagePatternError } from '../lib/pagePatternError.ts'
import { openStoredPersonalInfo } from '../lib/openStoredPersonalInfo.ts'
import {
  isSavedPasswordPromptOpen,
  resetSavedPasswordFillConfirmation,
} from '../lib/savedAccountConfirmation.ts'
import {
  isGenericAccountPasswordField,
  legacyAccountPasswordLocked,
  noteSkippedAccountPassword,
  resetSkippedAccountPasswordNote,
} from '../lib/accountPasswordFill.ts'
import { withTimeout } from '../utils/withTimeout.ts'
import {
  SUBMITTED_APPLICATIONS_KEY,
  planFillCharge,
  quotaPageKey,
  rememberSubmittedApplication,
} from '@/services/billing/quotaPage'
import {
  captureFieldSnapshot,
  fieldWasWritten,
  type FieldSnapshot,
} from './fieldWrite.ts'

export { captureFieldSnapshot, fieldWasWritten, type FieldSnapshot }

// import { api } from '../lib/api'

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
type AutofillTriggerSource = 'auto_on_detect' | 'user_clicked_button' | 'resync'

type FillRecord = FieldSnapshot & { input: FormField }

let autofillDebounceTimer: ReturnType<typeof setTimeout> | null = null
let hasShownPopup = false

const REVIEW_HIGHLIGHT_CLASS = 'job-autofill-filled'
const REVIEW_NEEDS_ANSWER_CLASS = 'job-autofill-needs-answer'
const REVIEW_HIGHLIGHT_DURATION_MS = 6000

// Populated by the most recent autofillPage() run, consumed by the on-page confirmation
// widget's "Undo fill" and "Jump to first" actions. A fresh run overwrites both — there's
// only ever one page's worth of in-flight fill state to act on.
let lastFillRecords: FillRecord[] = []
let lastUnfilledInputs: FormField[] = []

let lastAutofillTriggeredAt: number | null = null

// Same-frame guard. The service worker claim is what stops a second frame of the
// same tab from charging again; this set stops a resync that overlaps the claim.
// The key is the application, so a later step in this document does not charge.
const quotaCountedPages = new Set<string>()
// A charge that has reserved the key but has not finished. A top-up that starts
// while it is running is the same fill, not a repeat.
const quotaInFlightPages = new Set<string>()
// Pro fills are stored in History but do not count toward the free cap.
let lastCountedTowardFreeQuota = true

const AUTOFILL_TRIGGERED_AT_KEY = 'lastAutofillTriggeredAt'
const AUTOFILL_JOB_SITE_KEY = 'lastAutofillJobSite'
const AUTOFILL_APPLICATION_KEY = 'lastAutofillApplicationKey'
const submittedApplicationKeys = new Set<string>()
let lastAutofillApplicationKey = ''

export function getLastAutofillTriggeredAt() {
  return lastAutofillTriggeredAt
}

export async function markAutofillTriggered() {
  lastAutofillTriggeredAt = Date.now()
  lastAutofillApplicationKey = quotaPageKey(window.location.href)
  try {
    await chrome.storage.session.set({
      [AUTOFILL_TRIGGERED_AT_KEY]: lastAutofillTriggeredAt,
      [AUTOFILL_JOB_SITE_KEY]: window.location.hostname,
      [AUTOFILL_APPLICATION_KEY]: lastAutofillApplicationKey,
    })
  } catch {
    // chrome.storage.session is unavailable in some test/old contexts — memory is enough
    // for same-page submit tracking.
  }
  return lastAutofillTriggeredAt
}

export async function readAutofillTriggerForSubmission(): Promise<{
  triggeredAt: number
  jobSite: string
  applicationKey: string
} | null> {
  try {
    const data = await chrome.storage.session.get([
      AUTOFILL_TRIGGERED_AT_KEY,
      AUTOFILL_JOB_SITE_KEY,
      AUTOFILL_APPLICATION_KEY,
    ])
    const triggeredAt = data[AUTOFILL_TRIGGERED_AT_KEY] as number | undefined
    if (!triggeredAt) {
      if (!lastAutofillTriggeredAt) return null
      return {
        triggeredAt: lastAutofillTriggeredAt,
        jobSite: window.location.hostname,
        applicationKey: lastAutofillApplicationKey,
      }
    }
    return {
      triggeredAt,
      jobSite: (data[AUTOFILL_JOB_SITE_KEY] as string) || window.location.hostname,
      applicationKey: (data[AUTOFILL_APPLICATION_KEY] as string) || lastAutofillApplicationKey,
    }
  } catch {
    if (!lastAutofillTriggeredAt) return null
    return {
      triggeredAt: lastAutofillTriggeredAt,
      jobSite: window.location.hostname,
      applicationKey: lastAutofillApplicationKey,
    }
  }
}

// Returns true the first time this application is submitted. A later step, a
// second autofill, or a confirmation page for the same key does not claim again.
export async function claimSubmittedApplications(keys: string[]): Promise<boolean> {
  const incoming = [...new Set(keys.filter((key) => typeof key === 'string' && key.length > 0))]
  if (incoming.length === 0) return false
  if (incoming.some((key) => submittedApplicationKeys.has(key))) return false
  for (const key of incoming) submittedApplicationKeys.add(key)

  try {
    const claim = await chrome.runtime.sendMessage({ action: 'claimApplicationSubmitted', keys: incoming })
    if (claim?.claimed === true) return true
    if (claim?.claimed === false && claim?.error !== true) return false
  } catch {
    // Worker unreachable: this frame still records the claim below.
  }

  try {
    const data = await chrome.storage.session.get(SUBMITTED_APPLICATIONS_KEY)
    const stored = data[SUBMITTED_APPLICATIONS_KEY]
    const existing = Array.isArray(stored)
      ? stored.filter((key): key is string => typeof key === 'string')
      : []
    const decision = rememberSubmittedApplication(existing, incoming)
    if (!decision.first) return false
    await chrome.storage.session.set({ [SUBMITTED_APPLICATIONS_KEY]: decision.keys })
    return true
  } catch {
    return true
  }
}

// Country/state menus and the resume file commit in the page world after
// apply() returns. A same-tick value check would drop those fills. Email and
// other text fields are written before apply() returns.
function icimsDeferredWrite(input: FormField): boolean {
  const tag = (input.tagName || '').toUpperCase()
  const type = (input.type || '').toLowerCase()
  return tag === 'SELECT' || type === 'file'
}

function isSkippableField(input: FormField, includeFilled?: (input: FormField) => boolean) {
  if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
    return true
  }
  // Auth0 Universal Login puts a hidden password decoy on the identifier step.
  // The HTML hidden attribute is not type=hidden. It is not a field to fill.
  if (input.hidden) return true
  if (
    (input.type || '').toLowerCase() === 'password' &&
    (input.getAttribute('aria-hidden') || '').toLowerCase() === 'true'
  ) {
    return true
  }

  const automationId = (input.getAttribute('data-automation-id') || '').toLowerCase()
  if (automationId.includes('beecatcher') || automationId.includes('honeypot')) {
    return true
  }

  // iCIMS country/state widgets keep a non-empty placeholder value ("-999" or the
  // "— Make a Selection —" option) until the dropdown is committed. That is not a
  // filled answer. Other portals are unchanged.
  const icimsPlaceholder =
    typeof window !== 'undefined' &&
    window.location.hostname.toLowerCase().includes('icims.com') &&
    icimsSelectNeedsFill(input)
  if (
    !icimsPlaceholder &&
    input.value &&
    input.value.trim() !== '' &&
    input.type != 'checkbox' &&
    input.type != 'radio' &&
    !comboboxSearchIsUncommitted(input)
  ) {
    // BambooHR country is preselected to the job location. That value has to
    // be revisited. Every other prefilled control stays skipped.
    if (includeFilled?.(input)) return false
    return true
  }

  return false
}

// One run that may write over values already on the page. iCIMS reloads its form
// with its own reading of the resume the fill just attached; this run puts the
// profile back. The resume field itself is left as iCIMS holds it.
let overwriteFilledThisRun = false

// Set once the user has clicked fill on this page. Only then may a form that grows
// (Greenhouse education rows) be topped up without another click.
let userStartedFillOnPage = false

// A client-side navigation is a new page. The click that filled the previous URL
// must not top up the next one, and a resync already queued for the old form must not fire.
export function pageNavigated() {
  userStartedFillOnPage = false
  resetSavedPasswordFillConfirmation()
  hasShownPopup = false
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
    autofillDebounceTimer = null
  }
}

async function requestActiveProfileForFill(): Promise<unknown> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    return await chrome.runtime.sendMessage({ action: 'loadActiveProfileForFill' })
  } catch {
    return null
  }
}

export async function autofillPage(triggerSource: AutofillTriggerSource = 'user_clicked_button') {
  resetSkippedAccountPasswordNote()
  // No fill without a user click. A detection-triggered call must not write, count or
  // record history; a resync is only a continuation of a fill the user already started.
  if (triggerSource === 'auto_on_detect' || (triggerSource === 'resync' && !userStartedFillOnPage)) {
    return { success: false, code: 'needs_click', message: 'Click Auto-fill to fill this form.' }
  }
  let filledCount = 0
  let attemptedCount = 0
  let reportedAttempt = false

  const fillContext: TrackFillContractContext = {
    hostname: window.location.hostname,
    href: window.location.href,
    document,
  }
  const reportAttempt = async () => {
    if (reportedAttempt) return
    reportedAttempt = true
    await trackFillContract('autofill_attempted', fillContext)
  }
  const reportFailed = async (failureReason: AutofillFailureReason) => {
    await trackFillContract('autofill_failed', { ...fillContext, failureReason })
  }

  try {
    const startTime = Date.now()
    const stored = await chrome.storage.local.get(null)
    // Current company and title come from get_profile, the same rows the popup
    // shows. The personalInfo mirror and resumeUploadJob parse are leftover
    // copies and are not used when that read succeeds, including after the
    // work history was cleared.
    const personalInfo = await openStoredPersonalInfo(
      await loadFillPersonalInfo({
        mirror: stored.personalInfo,
        parsedResume: stored.resumeUploadJob,
        requestActive: requestActiveProfileForFill,
      }),
    )
    // A LinkedIn link saved before the www form, including in the local mirror.
    if (personalInfo && typeof personalInfo.linkedin === 'string' && personalInfo.linkedin) {
      personalInfo.linkedin = linkedinProfileUrl(personalInfo.linkedin)
    }
    const customResponses = stored.customResponses || {}
    const reviewHighlightEnabled = stored.reviewHighlightEnabled ?? true

    // {} is what background.js writes on install, and it is truthy. Filling it
    // used to type the literal "undefined" into name and email. A signed-out
    // browser has no profile mirror (sign-out wipes it) and must ask the user
    // to sign in — not claim the profile is empty. A signed-in empty profile
    // still records the attempt: that is a failed fill, not a skip.
    const refusal = refuseAutofill({ signedIn: hasStoredSession(stored), personalInfo })
    if (refusal) {
      await reportAttempt()
      await reportFailed(refusal.code === 'signed_out' ? 'signed_out' : 'empty_profile')
      return {
        success: false,
        code: refusal.code,
        message: refusal.message,
      }
    }

    // Free weekly quota is extension-local. A storage failure must not block a
    // claim-safe Greenhouse fill, and this path never calls the Resume API.
    let access: Awaited<ReturnType<typeof evaluateFillAccess>> | null = null
    try {
      access = await evaluateFillAccess(fillContext)
    } catch (error) {
      console.error('[billing] quota check failed', error)
    }
    if (access?.decision === 'block') {
      rememberFillBlock({ code: 'hard_cap', paywall: 'hard' })
      return {
        success: false,
        code: 'hard_cap',
        paywall: 'hard' as const,
        fillCount: access.fillCount,
        fillsRemaining: access.fillsRemaining,
        ats: access.ats,
        message: PAYWALL_COPY.hard.title,
      }
    }

    // Arm resync only after the click is allowed to write. A hard-cap or empty-profile
    // click must not fill a later mutation on its own.
    if (triggerSource === 'user_clicked_button') userStartedFillOnPage = true

    const activeSiteRule = siteRules.find((rule) => rule.detect())
    const includeFilled = (input: FormField) =>
      (overwriteFilledThisRun && (input as HTMLInputElement).type !== 'file') ||
      Boolean(activeSiteRule?.includeFilled?.(input))
    const inputs = deepQuerySelectorAll(document, 'input, textarea, select') as FormField[]
    const fillableInputs = inputs.filter((input) => !isSkippableField(input, includeFilled))
    // Application Questions are Canvas buttons. The input scan does not see
    // them, and the years box is the only input, so a skip there used to report
    // that nothing on the page matched.
    const onWorkday = isWorkdayApplyHost(window.location.hostname)
    const questionFills = onWorkday ? await fillWorkdayApplicationQuestions(document, personalInfo) : 0
    // A later click must not append another copy of a job already on My Experience.
    const experienceFills = onWorkday ? await fillWorkdayWorkExperience(document, personalInfo) : 0
    // Education rows skip the input loop below, so the click fills them here. The
    // handler is queued with the page-load pass and reuses a row it already filled.
    const educationFills = onWorkday ? await fillWorkdayEducation(document, personalInfo) : 0
    beginLeverFill()

    // The iCIMS career shell counts hidden inputs and has no application fields.
    // PortalProfileFields.Resume_File lives in the same-origin content iframe.
    // Include that frame before reporting that nothing can be filled.
    let embeddedInputs: FormField[] = []
    if (
      fillableInputs.length === 0 &&
      triggerSource === 'user_clicked_button' &&
      window.location.hostname.toLowerCase().includes('icims.com')
    ) {
      embeddedInputs = embeddedIcimsFillableFields(document, (input) =>
        isSkippableField(input as FormField, includeFilled),
      ) as FormField[]
    }
    const inputsToFill = fillableInputs.length > 0 ? fillableInputs : embeddedInputs

    await reportAttempt()

    if (inputsToFill.length === 0 && questionFills === 0 && experienceFills === 0 && educationFills === 0) {
      await reportFailed('no_fillable_fields')
      return { success: false, message: 'No fillable fields found' }
    }

    await markAutofillTriggered()
    activeSiteRule?.prepareFill?.()

    const fillRecords: FillRecord[] = []
    const unfilledInputs: FormField[] = []
    filledCount += questionFills + experienceFills + educationFills

    const onIcims = window.location.hostname.toLowerCase().includes('icims.com')

    for (const input of inputsToFill) {
      try {
      attemptedCount++
      const fieldText = constructFieldText(input)
      const snapshot = captureFieldSnapshot(input)

      // Try site-specific handling first. 'skip' means the rule recognized the
      // field and left it blank (custom screening questions, resume file, an
      // unmatched radio). Do not count or highlight those, and do not fall
      // through to the generic matcher.
      const applyResult = activeSiteRule
        ? await activeSiteRule.apply(input, normalizeText(fieldText), personalInfo)
        : false
      if (applyResult === 'skip') continue
      // Workday commits through page-world commands that land after apply()
      // returns. iCIMS dropdowns and resume files do too. Text and email are
      // same-tick writes: an empty css_loginName is not a fill.
      const icimsWriteLandsLater = onIcims && icimsDeferredWrite(input)
      const strictWriteCheck = !isWorkdayApplyHost(window.location.hostname) && !icimsWriteLandsLater
      if (applyResult === true && strictWriteCheck && !fieldWasWritten(input, snapshot)) continue
      let handled = !!applyResult
      // Site rules return true for fields they own even when they had nothing to
      // write. Only a field whose value or visible selection changed is a fill.
      if (handled) {
        filledCount++
        fillRecords.push({ input, ...snapshot })
        if (reviewHighlightEnabled) highlightFilledField(input)
        continue
      }

      // A sealed legacy account password that did not open is not a match and
      // is not a successful fill. Skip the field and keep the status to one line.
      if (
        legacyAccountPasswordLocked(personalInfo) &&
        isGenericAccountPasswordField(input)
      ) {
        noteSkippedAccountPassword()
        continue
      }

      // Fill by default matching logic second
      const matchedResult = matchFieldToData(
        normalizeText(fieldText),
        personalInfo,
        customResponses,
      )
      const { matchedValue, relativeMatchKey } = matchedResult || {}
      if (!matchedValue) {
        unfilledInputs.push(input)
        continue
      }

      handled = await fillByDefault(input, matchedValue, relativeMatchKey)
      if (handled) {
        filledCount++
        fillRecords.push({ input, ...snapshot })
        if (reviewHighlightEnabled) highlightFilledField(input)
        continue
      }

      unfilledInputs.push(input)
      } catch (error) {
        // One field whose pattern attribute is not a valid regular expression
        // must not abort the rest of the fill.
        if (!isPagePatternError(error)) console.error('[autofill] field skipped', error)
        if (!fillRecords.some((record) => record.input === input) && !unfilledInputs.includes(input)) {
          unfilledInputs.push(input)
        }
      }
    }

    lastFillRecords = fillRecords
    lastUnfilledInputs = unfilledInputs

    const telemetry = activeSiteRule?.fillTelemetry?.() ?? null
    let paywall: 'soft' | null = null
    let fillCount = access?.fillCount
    let fillsRemaining = access?.fillsRemaining
    const ats = access?.ats

    // Decided by this fill's own claim, not a module flag a second frame or a
    // mid-fill top-up can flip after the weekly count has already gone up.
    let repeatFill = false
    if (filledCount > 0) {
      // Analytics and billing are network calls. Bound the wait so a slow one cannot hold back
      // the "Autofill completed" toast; the work still finishes in the background.
      const charge = (async () => {
        const outcome = await chargeFillQuota(ats || 'other', startTime)
        repeatFill = outcome.repeatFill
        const charged = outcome.charged
        if (charged) {
          // One counted fill is one History row and one autofill_succeeded. A later
          // step of the same application is not a new claim, so it does not emit
          // another success or first-fill. Popup, toast, shortcut, and resync all
          // come through here. Record History before the telemetry wait so a slow
          // autofill_succeeded cannot return the fill with no footer row.
          await recordFillHistory(filledCount, attemptedCount)
          await withTimeout(
            trackFillContract('autofill_succeeded', {
              ...fillContext,
              eeo: readLeverEeoTelemetry(),
              telemetry,
            }),
            2500,
            undefined,
          )
        }
        return charged
      })()
      try {
        const charged = await withTimeout(charge, 6000, null)
        if (charged) {
          paywall = charged.nudge
          fillCount = charged.fillCount
          fillsRemaining = charged.fillsRemaining
        }
      } catch (error) {
        console.error('[billing] quota update failed', error)
      }
    } else if (!isSavedPasswordPromptOpen()) {
      await trackFillContract('autofill_failed', {
        ...fillContext,
        failureReason: 'no_matching_fields',
        telemetry,
      })
    }

    // A saved password that is waiting on "Fill password" matched. The prompt is
    // the UI. "No matching fields found" is for a page that had nothing to fill.
    const awaitingPassword = filledCount === 0 && isSavedPasswordPromptOpen()
    const workablePageFailed =
      filledCount > 0 &&
      typeof document !== 'undefined' &&
      isWorkableApplyPage() &&
      workableApplicationFailed(document)

    return {
      success: filledCount > 0 && !workablePageFailed,
      code: awaitingPassword ? 'awaiting_password' : undefined,
      fieldsCount: filledCount,
      totalCount: attemptedCount,
      unfilledCount: unfilledInputs.length,
      elapsedMs: Date.now() - startTime,
      roleGuess: guessJobTitle(),
      message: workablePageFailed
        ? WORKABLE_PAGE_FAILED_MESSAGE
        : filledCount > 0 ? `Filled ${filledCount} fields` : awaitingPassword ? '' : 'No matching fields found',
      paywall,
      fillCount,
      fillsRemaining,
      // Fill worked but is not a new counted fill (same application, same week): no History row.
      repeatFill: filledCount > 0 && repeatFill,
      ats,
    }
  } catch {
    await reportAttempt()
    await reportFailed('error')
    return { success: false, message: 'Error during autofill' }
  }
}

// Best-effort job title guess for the fill-history entry — not authoritative, just a label.
function guessJobTitle(): string {
  const heading = document.querySelector('h1')?.textContent?.trim()
  if (heading) return heading

  const title = document.title.trim()
  return title || 'Untitled application'
}

function highlightFilledField(input: FormField) {
  input.classList.add(REVIEW_HIGHLIGHT_CLASS)
  setTimeout(() => input.classList.remove(REVIEW_HIGHLIGHT_CLASS), REVIEW_HIGHLIGHT_DURATION_MS)
}

type ChargeOutcome = {
  charged: Awaited<ReturnType<typeof commitSuccessfulFill>> | null
  repeatFill: boolean
}

// Reserve this application, then ask the worker. The worker's tab URL is shared
// by every frame, so an embed and its shell cannot both increment the weekly
// count. The key ignores step changes, so the next page of the same application
// does not increment it either. The repeat flag is this call's result: a sibling
// frame that claimed during this click, or a top-up still in flight, did count.
async function chargeFillQuota(ats: string, fillStartedAt: number): Promise<ChargeOutcome> {
  const pageKey = quotaPageKey(window.location.href) || window.location.href.split('#')[0]
  const early = planFillCharge({
    filledCount: 1,
    sameFrameInFlight: quotaInFlightPages.has(pageKey),
    sameFrameAlreadyCounted: quotaCountedPages.has(pageKey),
    claim: 'granted',
    fillStartedAt,
  })
  if (!early.increment) return { charged: null, repeatFill: early.repeatFill }

  quotaInFlightPages.add(pageKey)
  try {
    let claimKind: 'granted' | 'already_counted' | 'unavailable' = 'granted'
    let claimedAt: number | null = null
    try {
      const claim = (await chrome.runtime.sendMessage({ action: 'claimFillQuota', pageKey })) as
        | { claimed?: boolean; error?: boolean; claimedAt?: number }
        | undefined
      if (claim?.claimed === false && claim.error !== true) {
        claimKind = 'already_counted'
        claimedAt = typeof claim.claimedAt === 'number' ? claim.claimedAt : null
      }
    } catch {
      // Worker unreachable: this frame's set still blocks a second charge here.
      claimKind = 'unavailable'
    }

    const planned = planFillCharge({
      filledCount: 1,
      sameFrameInFlight: false,
      sameFrameAlreadyCounted: false,
      claim: claimKind === 'unavailable' ? 'granted' : claimKind,
      claimedAt,
      fillStartedAt,
    })
    if (!planned.increment) {
      // Remember a claim this click lost, including one a sibling frame just won,
      // so the next click in this document says it was already counted.
      if (claimKind === 'already_counted') quotaCountedPages.add(pageKey)
      return { charged: null, repeatFill: planned.repeatFill }
    }

    try {
      const charged = await commitSuccessfulFill(ats)
      lastCountedTowardFreeQuota = charged.countedTowardFreeQuota !== false
      quotaCountedPages.add(pageKey)
      return { charged, repeatFill: false }
    } catch (error) {
      quotaCountedPages.delete(pageKey)
      void chrome.runtime.sendMessage({ action: 'releaseFillQuota', pageKey }).catch(() => {})
      throw error
    }
  } finally {
    quotaInFlightPages.delete(pageKey)
  }
}

async function recordFillHistory(filledCount: number, totalCount: number) {
  try {
    const host = window.location.hostname
    await chrome.runtime.sendMessage({
      action: 'trackAutofill',
      entry: {
        role: guessJobTitle(),
        site: `${getSiteLabel(host)} · ${host}`,
        filledCount,
        totalCount,
        timestamp: Date.now(),
        countedTowardFreeQuota: lastCountedTowardFreeQuota,
      },
    })
  } catch (error) {
    console.error('[history] could not record fill', error)
  }
}

// Restores every field the most recent autofillPage() run changed, back to its pre-fill
// value. Generic across fill paths (site rules and the default matcher alike) since it
// snapshots before the fill rather than reasoning about how each path writes values.
export function undoLastFill(): number {
  const records = lastFillRecords
  lastFillRecords = []
  lastUnfilledInputs = []

  let restoredCount = 0
  for (const { input, prevValue, prevChecked } of records) {
    if (!input.isConnected) continue

    if (
      input instanceof HTMLInputElement &&
      (input.type === 'checkbox' || input.type === 'radio')
    ) {
      if (input.checked !== !!prevChecked) {
        input.checked = !!prevChecked
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }
      restoredCount++
      continue
    }

    if (input instanceof HTMLSelectElement) {
      input.value = prevValue
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      restoredCount++
      continue
    }

    const proto =
      input instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    nativeSetter?.call(input, prevValue)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    restoredCount++
  }

  return restoredCount
}

// Scrolls to and focuses the first field the last fill left unanswered, for the on-page
// confirmation widget's "Jump to first" button.
export function jumpToFirstUnfilled(): boolean {
  const target = lastUnfilledInputs.find((input) => input.isConnected)
  if (!target) return false

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.focus({ preventScroll: true })
  target.classList.add(REVIEW_NEEDS_ANSWER_CLASS)
  setTimeout(() => target.classList.remove(REVIEW_NEEDS_ANSWER_CLASS), REVIEW_HIGHLIGHT_DURATION_MS)
  return true
}

function deepQuerySelectorAll(root: Document | Element | ShadowRoot, selector: string): Element[] {
  const results: Element[] = []

  // Query within the current root
  results.push(...Array.from(root.querySelectorAll(selector)))

  // Recurse into shadow roots
  const allElements = root.querySelectorAll('*')
  for (const el of Array.from(allElements)) {
    if (el.shadowRoot) {
      results.push(...deepQuerySelectorAll(el.shadowRoot, selector))
    }
  }

  return results
}

function constructFieldText(input: FormField) {
  const name = (input.name || '').toLowerCase()
  const id = (input.id || '').toLowerCase()
  const placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
  const label = getFieldLabel(input)
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase()
  const autoComplete = (input.autocomplete || '').toLowerCase().replace(/\s+/g, '_')
  const type = (input.type || '').toLowerCase()

  // Keep spaces! Just normalize special chars to spaces
  const fieldText = `${name} ${id} ${placeholder} ${label} ${ariaLabel} ${autoComplete} ${type}`
    .toLowerCase()
    .replace(/[_,-]/g, ' ') // Convert separators to spaces, don't remove them
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()

  return fieldText
}

function getFieldLabel(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`)
    if (label) {
      return label.textContent.toLowerCase()
    }
  }

  if (input.name) {
    const label = document.querySelector(`label[for="${input.name}"]`)
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

async function fillByDefault(
  input: FormField,
  matchedValue: string,
  relativeMatchKey: string | undefined,
) {
  const text = coerceFillText(matchedValue)
  if (!text) return false

  if (input instanceof HTMLInputElement && input.classList.contains('select__input')) {
    // Greenhouse react-select question with a vault or saved-response answer. Select the
    // matching option; leave it empty and closed when the list has no such answer.
    return fillReactSelectAnswer(input, text)
  }
  if (input instanceof HTMLSelectElement && relativeMatchKey) {
    const handled = setSelectValue(input, text, relativeMatchKey)
    if (handled) {
      return true
    }
  } else if (input instanceof HTMLInputElement && input.type === 'checkbox') {
    const handled = setCheckboxValue(input, text)
    if (handled) {
      return true
    }
  } else if (input instanceof HTMLInputElement && input.type === 'radio' && relativeMatchKey) {
    const handled = setRadioValue(input, text, relativeMatchKey)
    if (handled) {
      return true
    }
  } else {
    // Handle regular inputs and textareas (both have .value)
    const wrote = await fillNativeInput(input as HTMLInputElement | HTMLTextAreaElement, text)
    if (!wrote) return false
    await new Promise((resolve) => setTimeout(resolve, 100))
    return true
  }
  return false
}

// The fill the person started before a site reload, run once more on the reloaded
// form. It is the same application, so the weekly claim treats it as a repeat.
export async function continueFillAfterReload() {
  userStartedFillOnPage = true
  overwriteFilledThisRun = true
  try {
    return await autofillPage('resync')
  } finally {
    overwriteFilledThisRun = false
  }
}

export function debounceAutofill(autoDetectEnabled: boolean) {
  if (autofillDebounceTimer) {
    clearTimeout(autofillDebounceTimer)
  }

  autofillDebounceTimer = setTimeout(async () => {
    if (userStartedFillOnPage) {
      // The user already clicked fill here; top up the rows the form just revealed.
      // That top-up is the same fill. It must not replace the toast with
      // "already counted this week" when the click itself was counted.
      const result = await autofillPage('resync')
      if (result.code === 'hard_cap' || result.paywall === 'hard') {
        void showFillPaywall('hard', result)
      } else if (result.success && !result.repeatFill) {
        showAutofillNotification(result)
        if (result.paywall === 'soft') void showFillPaywall('soft', result)
      } else if (result.code === 'empty_profile' || result.code === 'signed_out') {
        presentFillFailure(result)
      }
    } else if (autoDetectEnabled && !hasShownPopup) {
      // Detect ON offers the fill; Detect OFF stays silent.
      showAutofillPrompt()
      hasShownPopup = true
    }
  }, 800)
}
