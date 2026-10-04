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
  const usable = (frames || []).filter((frame) => frame && typeof frame.frameId === 'number')
  const resumes = usable.filter((frame) => frame.hasPlainResumeFile)
  if (resumes.length) {
    resumes.sort(rankFrames)
    return [resumes[0].frameId]
  }
  const children = usable.filter((frame) => frame.fillableCount > 0 && frame.frameId !== 0)
  if (children.length) {
    children.sort((a, b) => (b.fillableCount || 0) - (a.fillableCount || 0))
    return [children[0].frameId]
  }
  const fillable = usable.filter((frame) => frame.fillableCount > 0)
  if (fillable.length) return [fillable[0].frameId]
  const top = usable.find((frame) => frame.frameId === 0)
  if (top) return [top.frameId]
  return usable.length ? [usable[0].frameId] : [0]
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
  const frameIds = frames.length ? chooseIcimsAutofillFrameIds(frames) : [0]
  let last = { success: false, message: 'No fillable fields found' }
  if (!tabs || typeof tabs.sendMessage !== 'function') return last
  for (const frameId of frameIds) {
    try {
      const response = await tabs.sendMessage(
        tabId,
        { action: 'autofill', surface: 'popup' },
        { frameId },
      )
      if (response && typeof response === 'object') last = response
      if (response && response.success && response.fieldsCount > 0) return response
    } catch {
      // This frame has no listener. Try the next candidate.
    }
  }
  return last
}
