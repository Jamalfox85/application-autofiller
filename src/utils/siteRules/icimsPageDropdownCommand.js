// Runs inside the page (Chrome MAIN world), not the content script.
// The content script cannot see window.ICIMS. This function is passed to
// chrome.scripting.executeScript, which stringifies it, so it must not use
// any binding from this module. It only reads and writes ICIMS.dropdowns.
// It does not click Next, Log In, Create Account, Submit, or hCaptcha.

const ICIMS_DROPDOWN_OPS = new Set(['read', 'search', 'commit'])

function icimsDropdownId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_.-]+$/.test(id) && id !== '__proto__' && id !== 'constructor' && id !== 'prototype'
}

export function sanitizeIcimsPageDropdownRequest(request) {
  const op = request && typeof request.op === 'string' ? request.op : ''
  const id = request && typeof request.id === 'string' ? request.id : ''
  if (!ICIMS_DROPDOWN_OPS.has(op) || !icimsDropdownId(id)) return null
  const payload = { op, id }
  if (op === 'search') {
    payload.query = request && typeof request.query === 'string' ? request.query.slice(0, 200) : ''
  }
  if (op === 'commit') {
    payload.value = request && typeof request.value === 'string' ? request.value.slice(0, 200) : ''
    payload.label = request && typeof request.label === 'string' ? request.label.slice(0, 200) : ''
  }
  return payload
}

export function icimsPageDropdownCommand(request) {
  const op = request && typeof request.op === 'string' ? request.op : ''
  const id = request && typeof request.id === 'string' ? request.id : ''
  if (op !== 'read' && op !== 'search' && op !== 'commit') return { ok: false }
  if (!/^[A-Za-z0-9_.-]+$/.test(id) || id === '__proto__' || id === 'constructor' || id === 'prototype') {
    return { ok: false }
  }
  const root = globalThis.ICIMS
  const registry = root && root.dropdowns
  if (!registry || !Object.prototype.hasOwnProperty.call(registry, id)) return { ok: false }
  const handle = registry[id]
  if (!handle) return { ok: false }

  function wordLabel(word) {
    const text = word && word.text
    let label = ''
    if (text && typeof text === 'object') label = text.en_US || text.en || ''
    else if (text != null) label = text
    return String(label).replace(/\s+/g, ' ').trim()
  }

  function listedWords() {
    const raw = typeof handle.getWords === 'function' ? handle.getWords(true) : []
    const list = raw || []
    const out = []
    for (let i = 0; i < list.length; i++) {
      const word = list[i] || {}
      const label = wordLabel(word)
      const value = word.value == null ? '' : String(word.value)
      if (!label && !value) continue
      out.push({ value, text: label })
    }
    return out
  }

  if (op === 'read') return { ok: true, words: listedWords() }

  if (op === 'search') {
    const query = request && typeof request.query === 'string' ? request.query : ''
    if (typeof handle.setInput === 'function') handle.setInput(query)
    return new Promise((resolve) => {
      let settled = false
      let timer
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: true, words: listedWords() })
      }
      timer = setTimeout(finish, 4000)
      try {
        if (typeof handle.resetOptions === 'function') handle.resetOptions(finish)
        else finish()
      } catch (error) {
        finish()
      }
    })
  }

  if (op === 'commit') {
    const value = request && typeof request.value === 'string' ? request.value : ''
    const label = request && typeof request.label === 'string' ? request.label : ''
    let word = { value, text: label }
    if (typeof handle.findWordFromValue === 'function') {
      const found = handle.findWordFromValue(value)
      if (found && String(found.value == null ? '' : found.value) === value) word = found
    }
    try {
      if (typeof handle.optionSelected === 'function') handle.optionSelected(word)
    } catch (error) {
      // Portal onchange runs after the hidden select and the visible label are stored.
    }
    return { ok: true, committed: true }
  }

  return { ok: false }
}

export function deliverIcimsPageDropdown(request, sender, scripting) {
  const payload = sanitizeIcimsPageDropdownRequest(request)
  const tabId = sender && sender.tab ? sender.tab.id : null
  if (!payload || tabId == null || !scripting || typeof scripting.executeScript !== 'function') {
    return Promise.resolve({ ok: false })
  }
  const target = { tabId }
  if (typeof sender.frameId === 'number') target.frameIds = [sender.frameId]
  return scripting
    .executeScript({
      target,
      world: 'MAIN',
      func: icimsPageDropdownCommand,
      args: [payload],
    })
    .then((results) => {
      const result = results && results[0] && results[0].result
      if (!result || result.ok !== true) return { ok: false }
      return result
    })
    .catch(() => ({ ok: false }))
}
