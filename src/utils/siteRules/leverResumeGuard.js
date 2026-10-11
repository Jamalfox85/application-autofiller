// Runs in the page (Chrome MAIN world) via chrome.scripting.executeScript.
// Lever's parseResume.js listens for the resume input's change event and POSTs
// the file. GoFillr already fills the contact fields, so that request is dropped
// for the duration of the change event and then the originals are put back.
// These functions do not click a control and do not touch any other request.

export function installLeverResumeGuardInPage() {
  var root = globalThis
  if (root.__gofillrResumeGuardRestore) return
  if (!root.XMLHttpRequest || !root.XMLHttpRequest.prototype) return
  var origOpen = root.XMLHttpRequest.prototype.open
  var origSend = root.XMLHttpRequest.prototype.send
  var origFetch = root.fetch
  function isParse(url) {
    return typeof url === 'string' && url.indexOf('parseResume') !== -1
  }
  root.XMLHttpRequest.prototype.open = function (method, url) {
    this.__gofillrUrl = url == null ? '' : String(url)
    return origOpen.apply(this, arguments)
  }
  root.XMLHttpRequest.prototype.send = function (body) {
    if (isParse(this.__gofillrUrl || '')) return
    return origSend.apply(this, arguments)
  }
  if (typeof origFetch === 'function') {
    root.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || ''
      if (isParse(String(url))) return Promise.resolve(new root.Response(null, { status: 204 }))
      return origFetch.apply(this, arguments)
    }
  }
  root.__gofillrResumeGuardRestore = function () {
    root.XMLHttpRequest.prototype.open = origOpen
    root.XMLHttpRequest.prototype.send = origSend
    if (origFetch) root.fetch = origFetch
    try {
      delete root.__gofillrResumeGuardRestore
    } catch (e) {
      root.__gofillrResumeGuardRestore = undefined
    }
  }
}

export function restoreLeverResumeGuardInPage() {
  var restore = globalThis.__gofillrResumeGuardRestore
  if (typeof restore === 'function') restore()
}

// Location search has to run as the apply page so /searchLocations sees that
// page's referrer. The result is the JSON body, or [] when the request fails.
export function fetchLeverLocationsInPage(query) {
  var text = typeof query === 'string' ? query : ''
  return fetch('/searchLocations?text=' + encodeURIComponent(text), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  }).then(function (response) {
    return response && response.ok ? response.json() : []
  }).catch(function () {
    return []
  })
}
