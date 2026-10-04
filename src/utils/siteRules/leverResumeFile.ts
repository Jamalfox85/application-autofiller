// Puts a saved resume on a Lever file input.
//
// A file input ignores `value = ...`. The file has to be a real File on
// `input.files` (via DataTransfer). The change event is what Lever's own
// filename label listens for. That same change event also POSTs the file to
// /parseResume and copies the parsed contact fields into the form. GoFillr
// already fills those fields, so the parse request is dropped and the
// "Analyzing resume..." status is cleared. Nothing here clicks a control.

export type LeverResumePayload = {
  name: string
  mimeType: string
  bytes: Uint8Array
}

type XhrWithUrl = XMLHttpRequest & { __gofillrUrl?: string }

export function isLeverResumeParseRequest(url: string): boolean {
  return /parseResume/i.test(url)
}

// Same-realm guard (unit tests, and a backup beside the page-world script).
export function withLeverResumeParseSuppressed(view: Window, run: () => void) {
  const XHR = view.XMLHttpRequest
  const origOpen = XHR?.prototype.open
  const origSend = XHR?.prototype.send
  const origFetch = view.fetch?.bind(view)

  if (XHR && origOpen && origSend) {
    XHR.prototype.open = function (this: XhrWithUrl, ...args: unknown[]) {
      this.__gofillrUrl = args[1] == null ? '' : String(args[1])
      return origOpen.apply(this, args as never)
    } as typeof XHR.prototype.open
    XHR.prototype.send = function (this: XhrWithUrl, ...args: unknown[]) {
      if (isLeverResumeParseRequest(this.__gofillrUrl || '')) return
      return origSend.apply(this, args as never)
    } as typeof XHR.prototype.send
  }

  if (origFetch) {
    view.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (isLeverResumeParseRequest(url)) {
        return Promise.resolve(new view.Response(null, { status: 204 }))
      }
      return origFetch(input, init)
    }) as typeof fetch
  }

  try {
    run()
  } finally {
    if (XHR && origOpen && origSend) {
      XHR.prototype.open = origOpen
      XHR.prototype.send = origSend
    }
    if (origFetch) view.fetch = origFetch
  }
}

// Runs in the page world. Lever's parseResume.js is not visible to the content
// script, so the content script inserts this before dispatching change.
export const LEVER_PARSE_GUARD_INSTALL = `(function () {
  var root = globalThis;
  if (root.__gofillrResumeGuardRestore) return;
  var origOpen = root.XMLHttpRequest.prototype.open;
  var origSend = root.XMLHttpRequest.prototype.send;
  var origFetch = root.fetch;
  function isParse(url) {
    return typeof url === 'string' && url.indexOf('parseResume') !== -1;
  }
  root.XMLHttpRequest.prototype.open = function (method, url) {
    this.__gofillrUrl = url == null ? '' : String(url);
    return origOpen.apply(this, arguments);
  };
  root.XMLHttpRequest.prototype.send = function (body) {
    if (isParse(this.__gofillrUrl || '')) return;
    return origSend.apply(this, arguments);
  };
  if (typeof origFetch === 'function') {
    root.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (isParse(String(url))) return Promise.resolve(new root.Response(null, { status: 204 }));
      return origFetch.apply(this, arguments);
    };
  }
  root.__gofillrResumeGuardRestore = function () {
    root.XMLHttpRequest.prototype.open = origOpen;
    root.XMLHttpRequest.prototype.send = origSend;
    if (origFetch) root.fetch = origFetch;
    try { delete root.__gofillrResumeGuardRestore; } catch (e) { root.__gofillrResumeGuardRestore = undefined; }
  };
})();`

export const LEVER_PARSE_GUARD_RESTORE = `(function () {
  var restore = globalThis.__gofillrResumeGuardRestore;
  if (typeof restore === 'function') restore();
})();`

function injectPageScript(doc: Document, source: string) {
  const parent = doc.documentElement
  if (!parent) return
  const script = doc.createElement('script')
  script.textContent = source
  parent.appendChild(script)
  script.remove()
}

function pageWorldGuardAvailable(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

function fileRealm(input: HTMLInputElement): Window & typeof globalThis {
  const isolated = globalThis as Window & typeof globalThis
  // Content scripts already have File and DataTransfer in their own world, and
  // those are the constructors that can build a FileList the input will accept.
  // jsdom tests install DataTransfer on the node window instead.
  if (typeof isolated.DataTransfer === 'function' && typeof isolated.File === 'function') {
    return isolated
  }
  return (input.ownerDocument?.defaultView ?? isolated) as Window & typeof globalThis
}

export function assignLeverResumeFile(
  input: HTMLInputElement,
  resume: LeverResumePayload,
): boolean {
  const realm = fileRealm(input)
  const page = (input.ownerDocument?.defaultView ?? realm) as Window & typeof globalThis
  const FileCtor = realm.File
  const Transfer = realm.DataTransfer
  if (!FileCtor || typeof Transfer !== 'function') return false
  if (!resume?.bytes?.byteLength || !resume.name.trim()) return false

  const file = new FileCtor([resume.bytes], resume.name.trim(), {
    type: resume.mimeType || 'application/octet-stream',
  })
  const transfer = new Transfer()
  transfer.items.add(file)
  try {
    input.files = transfer.files
  } catch {
    return false
  }

  const dispatch = () => {
    const EventCtor = page.Event ?? realm.Event ?? Event
    input.dispatchEvent(new EventCtor('input', { bubbles: true }))
    input.dispatchEvent(new EventCtor('change', { bubbles: true }))
  }

  // Page listeners (parseResume.js) use the page's XMLHttpRequest. Insert the
  // guard into that world first, then patch this world for tests.
  if (pageWorldGuardAvailable() && input.ownerDocument) {
    injectPageScript(input.ownerDocument, LEVER_PARSE_GUARD_INSTALL)
  }
  try {
    withLeverResumeParseSuppressed(page, dispatch)
  } finally {
    if (pageWorldGuardAvailable() && input.ownerDocument) {
      injectPageScript(input.ownerDocument, LEVER_PARSE_GUARD_RESTORE)
    }
  }

  clearLeverResumeParseStatus(input)
  revealLeverResumeFilename(input, file.name)

  const attached = input.files?.[0]
  return !!attached && attached.name === file.name && attached.size === file.size
}

function asElement(node: Element | null): HTMLElement | null {
  if (!node || node.nodeType !== 1) return null
  return node as HTMLElement
}

function clearLeverResumeParseStatus(input: HTMLElement) {
  const question = input.closest('.application-question') || input.parentElement
  if (!question) return
  for (const node of question.querySelectorAll(
    '.resume-upload-working, .resume-upload-failure, .resume-upload-success, .resume-upload-oversize',
  )) {
    const element = asElement(node)
    if (element) element.style.display = 'none'
  }
}

function revealLeverResumeFilename(input: HTMLInputElement, name: string) {
  const host = input.closest('a, button, .application-field')
  if (!host) return
  const filename = asElement(host.querySelector('.filename'))
  const fallback = asElement(host.querySelector('.default-label'))
  if (filename) {
    filename.textContent = name
    filename.style.display = 'inline'
  }
  host.classList.add('has-file')
  if (fallback) fallback.style.display = 'none'
}
