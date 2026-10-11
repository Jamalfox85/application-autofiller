// iCIMS career pages keep the application in a same-origin iframe
// (icims_content_iframe, ?in_iframe=1). The outer document's inputs are hidden,
// so a message that only reports the outer document says no fields are fillable.
// icimsFrameSnapshot is passed to chrome.scripting.executeScript, which
// stringifies it, so that function must not use any binding from this module.

// Runs in each frame. Hidden, submit, and button controls are what the career
// shell counts in the popup, and they are not fillable. The body is inlined
// because executeScript stringifies this function alone.
export function icimsFrameSnapshot() {
  const doc = typeof document === 'undefined' ? null : document
  let href = ''
  try {
    href = typeof location === 'undefined' || !location ? '' : String(location.href || '')
  } catch {
    href = ''
  }
  if (!doc || typeof doc.querySelectorAll !== 'function') {
    return { href, fillableCount: 0, hasPlainResumeFile: false }
  }
  const controls = Array.from(doc.querySelectorAll('input, textarea, select'))
  let fillableCount = 0
  let hasPlainResumeFile = false
  for (const el of controls) {
    const id = el && el.id ? String(el.id) : el && el.getAttribute ? String(el.getAttribute('id') || '') : ''
    const name = el && el.name ? String(el.name) : el && el.getAttribute ? String(el.getAttribute('name') || '') : ''
    if (id === 'PortalProfileFields.Resume_File' || name === 'PortalProfileFields.Resume_File') {
      hasPlainResumeFile = true
    }
    const attr = el && el.getAttribute ? el.getAttribute('type') : ''
    const type = String(attr || (el && el.type) || '').toLowerCase()
    if (type === 'hidden' || type === 'submit' || type === 'button') continue
    fillableCount += 1
  }
  return { href, fillableCount, hasPlainResumeFile }
}

function rankFrames(a, b) {
  if ((a.frameId === 0) !== (b.frameId === 0)) return a.frameId === 0 ? 1 : -1
  return (b.fillableCount || 0) - (a.fillableCount || 0)
}

// Prefer the frame that contains PortalProfileFields.Resume_File. The outer
// shell (frame 0, hidden inputs only) is the last resort.
export function chooseIcimsAutofillFrameIds(frames) {
  const ids = icimsFramesToFill(frames)
  return ids.length ? [ids[0]] : [0]
}

// Every frame that has something to fill, child frames before the career shell.
// The in-page Auto-fill button lives on the shell. The email field lives in the
// ?in_iframe=1 document. Messaging only the shell reports no matching fields.
export function icimsFramesToFill(frames) {
  const usable = (frames || []).filter((frame) => frame && typeof frame.frameId === 'number')
  const resumes = usable.filter((frame) => frame.hasPlainResumeFile).sort(rankFrames)
  const rest = usable
    .filter((frame) => !frame.hasPlainResumeFile && frame.fillableCount > 0)
    .sort(rankFrames)
  const ordered = resumes.concat(rest)
  if (ordered.length) return ordered.map((frame) => frame.frameId)
  const ranked = usable.slice().sort(rankFrames)
  if (ranked.length) return ranked.map((frame) => frame.frameId)
  return [0]
}

export function combineIcimsAutofillResults(results) {
  const list = (results || []).filter((result) => result && typeof result === 'object')
  const filled = list.filter((result) => result.success && (result.fieldsCount || 0) > 0)
  if (filled.length) {
    const fieldsCount = filled.reduce((sum, result) => sum + (result.fieldsCount || 0), 0)
    const totalCount = filled.reduce((sum, result) => sum + (result.totalCount || 0), 0)
    return {
      ...filled[0],
      success: true,
      fieldsCount,
      totalCount,
      message: `Filled ${fieldsCount} fields`,
    }
  }
  const awaiting = list.find((result) => result.code === 'awaiting_password')
  if (awaiting) return awaiting
  const hard = list.find((result) => result.code === 'hard_cap' || result.paywall === 'hard')
  if (hard) return hard
  const named = list.find((result) => typeof result.message === 'string' && result.message)
  return named || { success: false, message: 'No fillable fields found' }
}

function frameListenerMissing(error) {
  const message = error && error.message ? String(error.message) : String(error || '')
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  )
}

async function messageAutofillFrame(tabId, frameId, browser) {
  const tabs = browser && browser.tabs
  const scripting = browser && browser.scripting
  const payload = { action: 'autofill', surface: 'popup' }
  if (!tabs || typeof tabs.sendMessage !== 'function') return null
  try {
    return await tabs.sendMessage(tabId, payload, { frameId })
  } catch (error) {
    if (!frameListenerMissing(error) || !scripting || typeof scripting.executeScript !== 'function') return null
    try {
      if (typeof scripting.insertCSS === 'function') {
        await scripting.insertCSS({ target: { tabId, frameIds: [frameId] }, files: ['content.css'] })
      }
      await scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['content.js'] })
      return await tabs.sendMessage(tabId, payload, { frameId })
    } catch {
      return null
    }
  }
}

export function embeddedIcimsFillableFields(root, isSkippable) {
  if (!root || typeof root.querySelectorAll !== 'function') return []
  const frames = Array.from(root.querySelectorAll('iframe'))
  const fields = []
  for (const frame of frames) {
    const src = String(
      (frame && (frame.src || (typeof frame.getAttribute === 'function' ? frame.getAttribute('src') : ''))) || '',
    )
    if (src.includes('hcaptcha.com')) continue
    let doc = null
    try {
      doc = frame.contentDocument
    } catch {
      doc = null
    }
    if (!doc || doc === root || typeof doc.querySelectorAll !== 'function') continue
    const controls = Array.from(doc.querySelectorAll('input, textarea, select'))
    for (const control of controls) {
      if (typeof isSkippable === 'function' && isSkippable(control)) continue
      fields.push(control)
    }
  }
  return fields
}

export async function deliverIcimsAutofill(tabId, browser) {
  const scripting = browser && browser.scripting
  const tabs = browser && browser.tabs
  let frames = []
  if (scripting && typeof scripting.executeScript === 'function') {
    try {
      const injected = await scripting.executeScript({
        target: { tabId, allFrames: true },
        func: icimsFrameSnapshot,
      })
      frames = (injected || [])
        .map((entry) => ({
          frameId: entry && entry.frameId,
          ...(entry && entry.result ? entry.result : {}),
        }))
        .filter((frame) => typeof frame.frameId === 'number')
    } catch {
      frames = []
    }
  }
  const frameIds = frames.length ? icimsFramesToFill(frames) : [0]
  if (!tabs || typeof tabs.sendMessage !== 'function') {
    return { success: false, message: 'No fillable fields found' }
  }
  const results = []
  for (const frameId of frameIds) {
    const response = await messageAutofillFrame(tabId, frameId, browser)
    if (response && typeof response === 'object') results.push(response)
  }
  return combineIcimsAutofillResults(results)
}
