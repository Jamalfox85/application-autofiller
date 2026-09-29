export const ICIMS_ACCOUNT_NOTICE_KEY = 'icimsAccountNotice'

export const ICIMS_ACCOUNT_MISSING_MESSAGE =
  'Add an iCIMS login under Application Accounts so GoFillr can sign in on this application.'

export type IcimsAccountNotice = {
  portal: 'iCIMS'
  message: string
  at: number
}

type StorageLike = {
  get?: (key: string) => Promise<Record<string, unknown>>
  set?: (items: Record<string, unknown>) => Promise<void> | void
  remove?: (key: string) => Promise<void> | void
}

type IcimsAccountNoticeTransport = {
  storage?: StorageLike
  sendMessage?: (message: unknown) => Promise<unknown> | void
  showOnPage?: (message: string) => void
}

let transport: IcimsAccountNoticeTransport = {}
let published = false

export function configureIcimsAccountNotice(next: IcimsAccountNoticeTransport) {
  transport = next
}

export function resetIcimsAccountNoticeState() {
  published = false
  transport = {}
}

export function createIcimsAccountNotice(now = Date.now()): IcimsAccountNotice {
  return {
    portal: 'iCIMS',
    message: ICIMS_ACCOUNT_MISSING_MESSAGE,
    at: now,
  }
}

export function parseIcimsAccountNotice(value: unknown): IcimsAccountNotice | null {
  if (!value || typeof value !== 'object') return null
  const notice = value as Record<string, unknown>
  if (notice.portal !== 'iCIMS') return null
  if (typeof notice.message !== 'string' || notice.message.trim() === '') return null
  return {
    portal: 'iCIMS',
    message: notice.message,
    at: typeof notice.at === 'number' ? notice.at : 0,
  }
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null
    return {
      get: (key) => chrome.storage.local.get(key),
      set: (items) => chrome.storage.local.set(items),
      remove: (key) => chrome.storage.local.remove(key),
    }
  } catch {
    return null
  }
}

function defaultSendMessage(message: unknown) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return
    return chrome.runtime.sendMessage(message)
  } catch {
    return undefined
  }
}

// One announcement per content-script realm. The page toast, the extension badge, and the
// popup Application Accounts sheet all read this same notice — a missing login must not
// fail only in the console.
export async function publishMissingIcimsAccountNotice(): Promise<boolean> {
  if (published) return false
  published = true

  const notice = createIcimsAccountNotice()
  console.warn(notice.message)

  try {
    transport.showOnPage?.(notice.message)
  } catch (error) {
    console.error('iCIMS account page notice failed', error)
  }

  const storage = transport.storage ?? defaultStorage()
  try {
    await storage?.set?.({ [ICIMS_ACCOUNT_NOTICE_KEY]: notice })
  } catch (error) {
    console.error('iCIMS account notice storage failed', error)
  }

  try {
    const send = transport.sendMessage ?? defaultSendMessage
    await send({ action: 'icimsAccountRequired', notice })
  } catch (error) {
    console.error('iCIMS account notice message failed', error)
  }

  return true
}

export async function readPersonalInfoForIcims<T>(fallback: T): Promise<T> {
  try {
    const storage = transport.storage ?? defaultStorage()
    if (!storage?.get) return fallback
    const data = await storage.get('personalInfo')
    const stored = data?.personalInfo
    if (stored && typeof stored === 'object') return stored as T
  } catch (error) {
    console.error('Could not read profile for iCIMS account', error)
  }
  return fallback
}
