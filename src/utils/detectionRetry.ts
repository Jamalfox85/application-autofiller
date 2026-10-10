// Application detection used to be one-shot: the popup sent a single message
// and trusted whichever frame answered first. A tab whose content script was
// not ready, or whose form (a Greenhouse embed inside the company page) had not
// rendered yet, reported "No application form found" even though a later open
// found 45 fields.

export interface Detection {
  detected: boolean
  siteLabel: string | null
  fieldCount: number
}

export const NOT_DETECTED: Detection = { detected: false, siteLabel: null, fieldCount: 0 }

// How long an application frame polls for controls. The popup waits for every
// frame and keeps the one with the most fields, so this wait is not raced
// against a sibling that answers "not found" first.
export const FIELD_WAIT_MS = 4000
export const FIELD_POLL_MS = 250

export interface DetectDeps {
  // Ask every frame of the tab. Rejects when no content script answers.
  ask: () => Promise<Detection | undefined>
  // Inject the content script into all frames of the tab.
  inject: () => Promise<void>
  wait: (ms: number) => Promise<void>
}

export async function detectWithRetry(
  deps: DetectDeps,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<Detection> {
  const attempts = options.attempts ?? 3
  const delayMs = options.delayMs ?? 600
  let injected = false
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response: Detection | undefined
    let failed = false
    try {
      response = await deps.ask()
    } catch {
      failed = true
    }
    if (response?.detected && response.fieldCount > 0) return response
    if ((failed || !response) && !injected) {
      injected = true
      try {
        await deps.inject()
      } catch {
        // Page not injectable (chrome://, store pages): retries will fail too.
      }
    }
    if (attempt < attempts - 1) await deps.wait(delayMs)
  }
  return NOT_DETECTED
}

// Poll until the page has at least one form control, or the timeout passes.
export async function waitForFieldCount(
  count: () => number,
  wait: (ms: number) => Promise<void>,
  timeoutMs = 2500,
  stepMs = 250,
): Promise<number> {
  let n = count()
  for (let waited = 0; n === 0 && waited < timeoutMs; waited += stepMs) {
    await wait(stepMs)
    n = count()
  }
  return n
}

// chrome.tabs.sendMessage without a frame id returns whichever frame answers
// first. An empty shell used to answer in 800ms, before an embed finished this
// wait, and the popup treated that as the only result. Ask each frame, then
// keep the populated one.
export function preferDetection(responses: Array<Detection | null | undefined>): Detection {
  let best: Detection = NOT_DETECTED
  for (const response of responses) {
    if (!response?.detected || response.fieldCount <= 0) continue
    if (response.fieldCount > best.fieldCount) best = response
  }
  return best
}

export async function collectFrameDetections(
  frameIds: readonly number[],
  askFrame: (frameId: number) => Promise<Detection | undefined>,
): Promise<Detection> {
  if (frameIds.length === 0) throw new Error('Receiving end does not exist')
  const responses = await Promise.all(
    frameIds.map(async (frameId) => {
      try {
        return await askFrame(frameId)
      } catch {
        return undefined
      }
    }),
  )
  const detection = preferDetection(responses)
  const missingFrame = responses.some((response) => response == null)
  // No listener at all, or only empty answers while some frame never answered:
  // the embed may not have the content script yet. A frame that already found
  // the form is kept even if another frame is silent.
  if (responses.every((response) => response == null) || (missingFrame && !detection.detected)) {
    throw new Error('Receiving end does not exist')
  }
  return detection
}
