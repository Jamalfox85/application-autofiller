import { brandIcon, mountInToastStack } from './toastStack.ts'

export const AUTOFILL_PROMPT_COPY =
  'Job application detected! Would you like to auto-fill this form?'

export function dismissAutofillPrompt(doc: Document = document): void {
  doc.querySelectorAll('.gofillr-autofill-prompt').forEach((node) => node.remove())
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
