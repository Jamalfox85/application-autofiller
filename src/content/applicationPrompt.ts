import { brandIcon, mountInToastStack } from './toastStack.ts'

export const AUTOFILL_PROMPT_COPY =
  'Job application detected! Would you like to auto-fill this form?'

// Greenhouse job boards call hydrateRoot(document) from requestIdleCallback.
// That pass deletes nodes the content script appended to <body>. The prompt
// starts at opacity 0, so a "only remount if visible" check never puts it back.
let userClosedPrompt = false
let promptGeneration = 0

export function autofillPromptClosedByUser(): boolean {
  return userClosedPrompt
}

export function beginAutofillPrompt(): void {
  promptGeneration += 1
  userClosedPrompt = false
}

export function resetAutofillPromptSession(): void {
  promptGeneration += 1
  userClosedPrompt = false
}

export function dismissAutofillPrompt(doc: Document = document): void {
  doc.querySelectorAll('.gofillr-autofill-prompt').forEach((node) => node.remove())
}

export function connectedAutofillPrompt(doc: Document = document): HTMLElement | null {
  const node = doc.querySelector('.gofillr-autofill-prompt')
  if (!node || !node.isConnected) return null
  return node as HTMLElement
}

// Put the same prompt node back after the page rebuilds <body>. A click on
// Not now or Auto-fill sets userClosedPrompt so hydration cannot reopen it.
export function scheduleAutofillPromptRestore(
  prompt: HTMLElement,
  schedule: (fn: () => void, ms: number) => void = (fn, ms) => {
    setTimeout(fn, ms)
  },
): void {
  const view = prompt.ownerDocument.defaultView
  const href = view?.location?.href
  const generation = promptGeneration
  const restore = () => {
    if (generation !== promptGeneration) return
    if (userClosedPrompt) return
    const liveView = prompt.ownerDocument.defaultView
    if (href && liveView && liveView.location.href !== href) return
    if (prompt.isConnected) return
    mountInToastStack(prompt, 'bottom', prompt.ownerDocument)
  }
  for (const delayMs of [400, 1200, 2500, 4000]) schedule(restore, delayMs)
}

/** The on-page offer. Callers attach the fill and dismiss actions. */
export function renderAutofillPrompt(doc: Document = document): HTMLElement {
  const prompt = doc.createElement('div')
  prompt.className = 'gofillr-autofill-prompt'
  prompt.style.cssText = `
    background: #1b1b21;
    border: 1px solid #2e2e36;
    color: #ebebee;
    border-radius: 12px;
    box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.7);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    width: 280px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s ease, transform 0.3s ease;
    overflow: hidden;
  `

  prompt.innerHTML = `
    <div style="padding: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        ${brandIcon(20)}
        <span style="font-weight: 600; font-size: 15px;">GoFillr</span>
      </div>
      <p style="margin: 0 0 14px; color: #8f8f99; line-height: 1.4;">
        ${AUTOFILL_PROMPT_COPY}
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button data-action="dismiss" style="
          background: #232329;
          border: 1px solid #33333d;
          color: #ebebee;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Not now</button>
        <button data-action="autofill" style="
          background: #7c3aed;
          border: none;
          color: white;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        ">Auto-fill Form</button>
      </div>
    </div>
  `

  mountInToastStack(prompt, 'bottom', doc)
  return prompt
}

export function markAutofillPromptClosed(): void {
  userClosedPrompt = true
}
