export const TOAST_STACK_ID = 'gofillr-toast-stack'
export const MATCH_SCORE_ID = 'match-score'
// Clears the sticky header most job sites pin to the top of the window.
const TOP_GAP_PX = 64
const EDGE_GAP_PX = 20

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
      top: ${TOP_GAP_PX}px;
      right: ${EDGE_GAP_PX}px;
      max-height: calc(100vh - ${TOP_GAP_PX + EDGE_GAP_PX}px);
      overflow-y: auto;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;
      pointer-events: none;
    `
    doc.documentElement.appendChild(stack)
    followVisiblePartOfFrame(stack, doc)
  }
  // The stack hangs off <html>, not <body>: a transformed <body> turns position: fixed into
  // body-relative and pushes the stack off screen, and Remix/React hydration can rebuild
  // <body> and drop nodes we added. Reattach in case the page dropped it anyway.
  if (!stack.isConnected) doc.documentElement.appendChild(stack)
  return stack
}

function inEmbeddedFrame(view: Window): boolean {
  try {
    return view.top !== view
  } catch {
    return true
  }
}

// Careers sites often show the Greenhouse form in an iframe sized to the whole form, so
// position: fixed there is relative to the iframe, not the screen, and top: 64px can be
// scrolled away or sit under the host page's header. Keep the stack inside the part of the
// frame that is on screen. A cross-origin frame gets no scroll events from its parent, but
// IntersectionObserver still reports which part of it is visible.
function followVisiblePartOfFrame(stack: HTMLElement, doc: Document): void {
  const view = doc.defaultView
  if (!view || !inEmbeddedFrame(view) || typeof view.IntersectionObserver !== 'function') return
  const threshold = Array.from({ length: 201 }, (_, i) => i / 200)
  const observer = new view.IntersectionObserver((entries) => {
    const visible = entries[entries.length - 1]?.intersectionRect
    if (!visible || visible.height <= 0) return
    stack.style.top = `${visible.top + TOP_GAP_PX}px`
    stack.style.maxHeight = `${Math.max(visible.height - TOP_GAP_PX - EDGE_GAP_PX, 0)}px`
  }, { threshold })
  observer.observe(doc.documentElement)
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
