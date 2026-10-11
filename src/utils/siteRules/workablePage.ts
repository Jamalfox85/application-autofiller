// Workable's form error boundary rethrows a React render error, and the careers
// shell replaces the apply page with "Sorry, an unknown error occurred." The
// fill can already have returned success by then. Callers use this to avoid
// leaving "Filled with …" up after that page is gone.

export const WORKABLE_PAGE_FAILED_MESSAGE =
  'Workable replaced this form with an error page.'

const FORM_ROOT = '[data-ui="application-form"], [data-ui="eeoc-form"]'
const ERROR_COPY = /unknown error occurred/i

export function workableApplicationFailed(doc: Document): boolean {
  const body = doc.body
  if (!body) return false
  const inner = typeof body.innerText === 'string' ? body.innerText : ''
  const content = typeof body.textContent === 'string' ? body.textContent : ''
  const text = `${inner}\n${content}`
  if (!ERROR_COPY.test(text)) return false
  // The error route removes the application form. A question that quotes the
  // sentence while the form is still on the page is not that route.
  return !doc.querySelector(FORM_ROOT)
}

export function watchWorkableApplication(
  doc: Document,
  onFailed: () => void,
  options?: { intervalMs?: number; timeoutMs?: number },
): () => void {
  const intervalMs = options?.intervalMs ?? 400
  const timeoutMs = options?.timeoutMs ?? 12000
  const started = Date.now()
  let stopped = false
  const timer = setInterval(() => {
    if (stopped) return
    let failed = false
    try {
      failed = workableApplicationFailed(doc)
    } catch {
      failed = false
    }
    if (failed) {
      stopped = true
      clearInterval(timer)
      onFailed()
      return
    }
    if (Date.now() - started >= timeoutMs) {
      stopped = true
      clearInterval(timer)
    }
  }, intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}
