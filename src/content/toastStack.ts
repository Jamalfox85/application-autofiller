export const TOAST_STACK_ID = 'gofillr-toast-stack'
export const MATCH_SCORE_ID = 'match-score'

export function brandIcon(size: number): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="flex-shrink: 0;">
    <rect width="32" height="32" rx="8" fill="#7C3AED"/>
    <rect x="6" y="10" width="20" height="4" rx="2" fill="#FFFFFF"/>
    <rect x="6" y="18" width="13" height="4" rx="2" fill="#FFFFFF"/>
  </svg>`
}

export function toastStack(doc: Document = document): HTMLElement {
  let stack = doc.getElementById(TOAST_STACK_ID)
  if (!stack) {
    stack = doc.createElement('div')
    stack.id = TOAST_STACK_ID
    stack.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      pointer-events: none;
    `
    ;(doc.body ?? doc.documentElement).appendChild(stack)
  }
  return stack
}

export function mountInToastStack(
  el: HTMLElement,
  where: 'top' | 'bottom' = 'bottom',
  doc: Document = document,
): void {
  el.style.position = 'relative'
  el.style.pointerEvents = 'auto'
  el.style.right = 'auto'
  el.style.bottom = 'auto'
  const stack = toastStack(doc)
  if (where === 'top') stack.insertBefore(el, stack.firstChild)
  else stack.appendChild(el)
}
