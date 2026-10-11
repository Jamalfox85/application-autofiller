// Keyboard-command delivery. Sends {action:'autofill'} and reinjects content.js
// when the tab has no listener. The content script shows the sign-in or empty
// profile toast when the page cannot be filled.

export type AutofillMessage = { action: 'autofill' }

export type AutofillTabMessenger = {
  sendMessage(tabId: number, message: AutofillMessage): Promise<unknown>
  executeScript(tabId: number): Promise<unknown>
  insertCSS?(tabId: number): Promise<unknown>
}

export function isMissingContentScriptError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  )
}

/**
 * Send {action:'autofill'} to the active tab. When the content script is not
 * listening (page opened before Load unpacked, or the script failed to attach),
 * inject content.js into every frame and send once more.
 */
export async function deliverAutofillCommand(
  tabId: number,
  messenger: AutofillTabMessenger,
): Promise<'sent' | 'reinjected'> {
  try {
    await messenger.sendMessage(tabId, { action: 'autofill' })
    return 'sent'
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error
  }

  if (messenger.insertCSS) {
    try {
      await messenger.insertCSS(tabId)
    } catch (error) {
      console.error('Autofill stylesheet injection failed', error)
    }
  }

  await messenger.executeScript(tabId)
  await messenger.sendMessage(tabId, { action: 'autofill' })
  return 'reinjected'
}
