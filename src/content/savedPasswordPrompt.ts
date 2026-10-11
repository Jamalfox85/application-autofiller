import { brandIcon, mountInToastStack } from './toastStack.ts'

export const SAVED_PASSWORD_PROMPT_COPY = 'Fill the saved password for this account?'

export function showSavedPasswordPrompt(
  doc: Document,
  actions: { onConfirm: () => void; onDismiss: () => void },
): HTMLElement {
  doc.querySelectorAll('.gofillr-password-prompt').forEach((node) => node.remove())
  const prompt = doc.createElement('div')
  prompt.className = 'gofillr-password-prompt'
  prompt.style.cssText = `
    background: #1b1b21;
    border: 1px solid #2e2e36;
    color: #ebebee;
    border-radius: 12px;
    box-shadow: 0 10px 26px -12px rgba(0, 0, 0, 0.7);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    width: 280px;
    overflow: hidden;
    pointer-events: auto;
  `
  prompt.innerHTML = `
    <div style="padding: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        ${brandIcon(20)}
        <span style="font-weight: 600; font-size: 15px;">GoFillr</span>
      </div>
      <p style="margin: 0 0 14px; color: #8f8f99; line-height: 1.4;">
        ${SAVED_PASSWORD_PROMPT_COPY}
      </p>
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        <button type="button" data-action="dismiss" style="
          background: #232329;
          border: 1px solid #33333d;
          color: #ebebee;
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        ">Not now</button>
        <button type="button" data-action="confirm" style="
          background: #7c3aed;
          border: none;
          color: white;
          padding: 6px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        ">Fill password</button>
      </div>
    </div>
  `
  const close = (choice: 'confirm' | 'dismiss') => {
    prompt.remove()
    if (choice === 'confirm') actions.onConfirm()
    else actions.onDismiss()
  }
  prompt.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => close('dismiss'))
  prompt.querySelector('[data-action="confirm"]')?.addEventListener('click', () => close('confirm'))
  mountInToastStack(prompt, 'bottom', doc)
  return prompt
}
