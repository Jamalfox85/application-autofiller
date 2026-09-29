export const WORKDAY_ACCOUNT_NOTICE_KEY = 'workdayAccountNotice'

export const WORKDAY_ACCOUNT_MISSING_MESSAGE =
  'Add a Workday login under Application Accounts so GoFillr can create your candidate account.'

export type WorkdayAccountNotice = {
  portal: 'Workday'
  message: string
  at: number
}

type StorageLike = {
  get?: (key: string) => Promise<Record<string, unknown>>
  set?: (items: Record<string, unknown>) => Promise<void> | void
  remove?: (key: string) => Promise<void> | void
}

type WorkdayAccountNoticeTransport = {
  storage?: StorageLike
  sendMessage?: (message: unknown) => Promise<unknown> | void
  showOnPage?: (message: string) => void
}

let transport: WorkdayAccountNoticeTransport = {}
let published = false

export function configureWorkdayAccountNotice(next: WorkdayAccountNoticeTransport) {
  transport = next
}

export function resetWorkdayAccountNoticeState() {
  published = false
  transport = {}
}

export function createWorkdayAccountNotice(now = Date.now()): WorkdayAccountNotice {
  return {
    portal: 'Workday',
    message: WORKDAY_ACCOUNT_MISSING_MESSAGE,
    at: now,
  }
}

export function parseWorkdayAccountNotice(value: unknown): WorkdayAccountNotice | null {
  if (!value || typeof value !== 'object') return null
  const notice = value as Record<string, unknown>
  if (notice.portal !== 'Workday') return null
  if (typeof notice.message !== 'string' || notice.message.trim() === '') return null
  return {
    portal: 'Workday',
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
export async function publishMissingWorkdayAccountNotice(): Promise<boolean> {
  if (published) return false
  published = true

  const notice = createWorkdayAccountNotice()
  console.warn(notice.message)

  try {
    transport.showOnPage?.(notice.message)
  } catch (error) {
    console.error('Workday account page notice failed', error)
  }

  const storage = transport.storage ?? defaultStorage()
  try {
    await storage?.set?.({ [WORKDAY_ACCOUNT_NOTICE_KEY]: notice })
  } catch (error) {
    console.error('Workday account notice storage failed', error)
  }

  try {
    const send = transport.sendMessage ?? defaultSendMessage
    await send({ action: 'workdayAccountRequired', notice })
  } catch (error) {
    console.error('Workday account notice message failed', error)
  }

  return true
}

export async function readPersonalInfoForWorkday<T>(fallback: T): Promise<T> {
  try {
    const storage = transport.storage ?? defaultStorage()
    if (!storage?.get) return fallback
    const data = await storage.get('personalInfo')
    const stored = data?.personalInfo
    if (stored && typeof stored === 'object') return stored as T
  } catch (error) {
    console.error('Could not read profile for Workday account', error)
  }
  return fallback
}
