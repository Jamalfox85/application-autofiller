// Puts the resume already saved in GoFillr on a plain iCIMS choose-file input.
// The bytes come from the shared loadSavedResume worker (the same download
// BambooHR uses). Setting input.files is the same result as picking the file.
// This does not click the control, does not click "Autofill with resume",
// and does not submit the form.

import { fileFromSavedResumeMessage } from './bamboohrResume.ts'

type PageRealm = {
  File?: typeof File
  DataTransfer?: typeof DataTransfer
  Event?: typeof Event
}

type FileInputLike = {
  tagName?: string
  type?: string
  disabled?: boolean
  files?: ArrayLike<File> | null
  ownerDocument?: { defaultView?: PageRealm | null } | null
  getAttribute?: (name: string) => string | null
  dispatchEvent?: (event: Event) => boolean
}

export async function applyIcimsResumeFile(
  input: FileInputLike,
  file: File | null,
): Promise<boolean | 'skip'> {
  if (!file || file.size <= 0 || !file.name) return 'skip'
  const type = (input.getAttribute?.('type') || input.type || '').toLowerCase()
  const tag = (input.tagName || 'INPUT').toUpperCase()
  if (tag !== 'INPUT' || type !== 'file' || input.disabled) return 'skip'
  try {
    const view = input.ownerDocument?.defaultView
    const FileCtor = view?.File
    const DataTransferCtor = view?.DataTransfer
    if (typeof FileCtor !== 'function' || typeof DataTransferCtor !== 'function') return 'skip'
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength === 0) return 'skip'
    const localFile = new FileCtor([bytes], file.name, {
      type: file.type || 'application/octet-stream',
    })
    const transfer = new DataTransferCtor()
    transfer.items.add(localFile)
    input.files = transfer.files
    const assigned = input.files?.[0]
    if (!assigned || assigned.name !== file.name || assigned.size !== file.size) return 'skip'
    const EventCtor = view.Event ?? Event
    input.dispatchEvent?.(new EventCtor('input', { bubbles: true }))
    input.dispatchEvent?.(new EventCtor('change', { bubbles: true }))
    return true
  } catch {
    return 'skip'
  }
}

let inflight: Promise<File | null> | null = null

export function resetIcimsSavedResumeCache() {
  inflight = null
}

// loadSavedResume JSON-serializes its Uint8Array into a plain object. The file
// that survives the message is bytesBase64. A typed array still in this realm
// is accepted too. This decoder is only used for the iCIMS resume input.
function bytesFromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value.trim())
    if (!binary.length) return null
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

export function fileFromIcimsSavedResumeMessage(message: unknown): File | null {
  const direct = fileFromSavedResumeMessage(message)
  if (direct) return direct
  if (!message || typeof message !== 'object') return null
  const record = message as { bytesBase64?: unknown }
  if (typeof record.bytesBase64 !== 'string' || !record.bytesBase64.trim()) return null
  const bytes = bytesFromBase64(record.bytesBase64)
  if (!bytes) return null
  return fileFromSavedResumeMessage({ ...record, bytes })
}

async function requestIcimsSavedResume(): Promise<File | null> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null
    const message = await chrome.runtime.sendMessage({ action: 'loadSavedResume' })
    return fileFromIcimsSavedResumeMessage(message)
  } catch {
    return null
  }
}

export function loadIcimsSavedResume(): Promise<File | null> {
  if (!inflight) {
    inflight = requestIcimsSavedResume()
      .then((file) => {
        if (!file) inflight = null
        return file
      })
      .catch(() => {
        inflight = null
        return null
      })
  }
  return inflight
}

// iCIMS accepts PortalProfileFields.Resume_File, shows "Parsing resume", then
// reloads the candidate page (from=profilebuilder&resumeSubmitted=1&hrs=1&eem=…).
// The next fill, automatic or from the popup, would attach the same file and
// start that cycle again. sessionStorage is per tab and survives that reload.
// The key is the career host plus the job id, so a different posting can still
// receive the file and a changing eem token does not look like a new job.
const RESUME_ATTACHED_KEY = 'gofillr.icims.resumeAttached'
const JOB_ID = /\/jobs\/(\d+)/i
const ACCEPTED_RESUME_NAME = /\bresume\d{12,14}\.pdf\b/i
const STATUS_SELECTOR = 'button, a, input, span, p, label, li, div, [role="button"]'

type LocationParts = {
  hostname: string
  pathname: string
  search: string
  href: string
}

type StatusChild = {
  nodeType?: number
  nodeName?: string | null
  nodeValue?: string | null
  textContent?: string | null
}

type StatusNode = {
  hidden?: boolean
  type?: string
  className?: unknown
  textContent?: string | null
  value?: string | null
  style?: { display?: string; visibility?: string } | string | null
  parentElement?: StatusNode | null
  childNodes?: ArrayLike<StatusChild> | null
  getAttribute?: (name: string) => string | null
}

type ResumeDocument = {
  body?: { textContent?: string | null } | null
  documentElement?: { textContent?: string | null } | null
  querySelectorAll?: (selector: string) => ArrayLike<StatusNode>
}

let claimed: Set<string> | null = null
let unscopedAttached = false

// Drops the in-memory copy so the next read uses sessionStorage. A reload does
// this on its own because the content script starts over; tests call it to
// simulate that new document. sessionStorage itself is left alone.
export function resetIcimsResumeAttachMemory() {
  claimed = null
  unscopedAttached = false
}

function liveStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    if (typeof sessionStorage === 'undefined' || !sessionStorage) return null
    if (typeof sessionStorage.getItem !== 'function' || typeof sessionStorage.setItem !== 'function') {
      return null
    }
    return sessionStorage
  } catch {
    return null
  }
}

function loadClaimed(): Set<string> {
  if (claimed) return claimed
  const next = new Set<string>()
  const storage = liveStorage()
  if (storage) {
    try {
      const raw = storage.getItem(RESUME_ATTACHED_KEY)
      const parsed = raw ? (JSON.parse(raw) as unknown) : null
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item) next.add(item)
        }
      }
    } catch {
      // A corrupt value is ignored. This document still records new claims.
    }
  }
  claimed = next
  return next
}

function persistClaimed(keys: Set<string>) {
  claimed = keys
  const storage = liveStorage()
  if (!storage) return
  try {
    storage.setItem(RESUME_ATTACHED_KEY, JSON.stringify([...keys]))
  } catch {
    // The in-memory set still blocks another fill in this document.
  }
}

function rememberIcimsResumeAttached(jobKey: string) {
  if (!jobKey) {
    unscopedAttached = true
    return
  }
  const keys = loadClaimed()
  if (keys.has(jobKey)) return
  keys.add(jobKey)
  persistClaimed(keys)
}

function forgetIcimsResumeAttached(jobKey: string) {
  if (!jobKey) {
    unscopedAttached = false
    return
  }
  const keys = loadClaimed()
  if (!keys.delete(jobKey)) return
  persistClaimed(keys)
}

function icimsResumeAlreadyClaimed(jobKey: string): boolean {
  if (!jobKey) return unscopedAttached
  return loadClaimed().has(jobKey)
}

function readMaybe<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}

function asLocation(value: unknown): LocationParts | null {
  if (!value || typeof value !== 'object') return null
  const loc = value as { hostname?: unknown; pathname?: unknown; search?: unknown; href?: unknown }
  return {
    hostname: typeof loc.hostname === 'string' ? loc.hostname : '',
    pathname: typeof loc.pathname === 'string' ? loc.pathname : '',
    search: typeof loc.search === 'string' ? loc.search : '',
    href: typeof loc.href === 'string' ? loc.href : '',
  }
}

function sameLocation(a: LocationParts | null, b: LocationParts | null): boolean {
  if (!a || !b) return false
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search && a.href === b.href
}

function pushViewLocations(view: object, into: LocationParts[]) {
  const win = view as { location?: unknown; top?: unknown; parent?: unknown }
  const own = asLocation(readMaybe(() => win.location))
  if (own) into.push(own)
  const topLoc = asLocation(
    readMaybe(() => {
      const frame = win.top as { location?: unknown } | null | undefined
      if (!frame || (frame as object) === (win as object)) return null
      return frame.location
    }),
  )
  const parentLoc = asLocation(
    readMaybe(() => {
      const frame = win.parent as { location?: unknown } | null | undefined
      if (!frame || (frame as object) === (win as object)) return null
      return frame.location
    }),
  )
  if (topLoc && !sameLocation(own, topLoc)) into.push(topLoc)
  if (parentLoc && !sameLocation(own, parentLoc) && !sameLocation(topLoc, parentLoc)) into.push(parentLoc)
}

function collectLocations(input: unknown): LocationParts[] {
  const locs: LocationParts[] = []
  const views: unknown[] = []
  const owned =
    input && typeof input === 'object'
      ? (input as { ownerDocument?: { defaultView?: unknown } | null }).ownerDocument?.defaultView
      : null
  if (owned) views.push(owned)
  if (typeof window !== 'undefined') views.push(window)
  const seen = new Set<unknown>()
  for (const view of views) {
    if (!view || typeof view !== 'object' || seen.has(view)) continue
    seen.add(view)
    pushViewLocations(view, locs)
  }
  return locs
}

function jobKeyFromLocations(locations: LocationParts[]): string {
  let host = ''
  let path = ''
  for (const loc of locations) {
    const hostname = loc.hostname.trim().toLowerCase().replace(/\.$/, '')
    if (!host && hostname) host = hostname
    if (!path && loc.pathname) path = loc.pathname
    const job = JOB_ID.exec(loc.pathname)?.[1]
    if (job) return `${hostname || host}|${job}`
  }
  if (!host && !path) return ''
  return `${host}|${path}`
}

function resumeSubmitted(value: string): boolean {
  if (!value || !/resumeSubmitted/i.test(value)) return false
  const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : value.replace(/^\?/, '')
  try {
    return new URLSearchParams(query.split('#')[0]).get('resumeSubmitted') === '1'
  } catch {
    return false
  }
}

function styleHides(node: StatusNode): boolean {
  const style = node.style
  if (!style) return false
  if (typeof style === 'string') {
    return /display\s*:\s*none/i.test(style) || /visibility\s*:\s*hidden/i.test(style)
  }
  return style.display === 'none' || style.visibility === 'hidden'
}

function classHides(node: StatusNode): boolean {
  const parts: string[] = []
  if (typeof node.className === 'string' && node.className) parts.push(node.className)
  try {
    const fromAttr = node.getAttribute?.('class')
    if (fromAttr) parts.push(fromAttr)
  } catch {
    // A host node that rejects attribute reads still honors className.
  }
  // iCIMS hides the empty form's Replace Resume control and filename label
  // with iCIMS_NoDisplay (and, in older portal scripts, NoDisplay). Those are
  // not the same token as iCIMS_Hide.
  return /(?:^|\s)(?:hidden|hide|is-hidden|d-none|iCIMS_Hide|iCIMS_NoDisplay|NoDisplay)(?:\s|$)/i.test(
    parts.join(' '),
  )
}

// "Shows" means a person can see it. A hidden Replace Resume template on the
// empty form must not block the first attach.
function isShown(node: StatusNode | null | undefined): boolean {
  let current = node
  for (let depth = 0; current && depth < 8; depth++) {
    if (current.hidden === true) return false
    try {
      const type = String(current.type || current.getAttribute?.('type') || '').toLowerCase()
      if (type === 'hidden') return false
      if (current.getAttribute?.('hidden') != null) return false
      if (current.getAttribute?.('aria-hidden') === 'true') return false
      if (classHides(current)) return false
    } catch {
      // A node that rejects attribute reads is not treated as a hidden template.
    }
    if (styleHides(current)) return false
    current = current.parentElement
  }
  return true
}

// Direct text only. textContent on a visible wrapper includes the hidden
// Replace Resume label and filename that iCIMS keeps in the empty chooser.
function ownVisibleText(node: StatusNode): string {
  const children = node.childNodes
  if (!children || typeof children.length !== 'number') {
    return typeof node.textContent === 'string' ? node.textContent : ''
  }
  let text = ''
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child) continue
    const name = String(child.nodeName || '')
    const isText = child.nodeType === 3 || name === '#text' || name.toLowerCase() === '#text'
    if (!isText) continue
    const value = typeof child.nodeValue === 'string' ? child.nodeValue : child.textContent
    if (typeof value === 'string') text += value
  }
  return text
}

function nodeLabels(node: StatusNode): string[] {
  const labels: string[] = []
  const push = (value: unknown) => {
    if (typeof value !== 'string') return
    const text = value.replace(/\s+/g, ' ').trim()
    if (text) labels.push(text)
  }
  push(ownVisibleText(node))
  push(node.value)
  try {
    push(node.getAttribute?.('aria-label'))
    push(node.getAttribute?.('title'))
    push(node.getAttribute?.('value'))
  } catch {
    // Ignore a host node that rejects attribute reads.
  }
  return labels
}

function isReplaceResumeLabel(text: string): boolean {
  if (text.length > 40) return false
  return /^replace\s+resume\b[\s\W]*$/i.test(text)
}

function documentsFor(input: unknown): ResumeDocument[] {
  const docs: ResumeDocument[] = []
  if (input && typeof input === 'object') {
    const owned = (input as { ownerDocument?: ResumeDocument | null }).ownerDocument
    if (owned) docs.push(owned)
  }
  if (typeof document !== 'undefined' && document) {
    const page = document as ResumeDocument
    if (!docs.includes(page)) docs.push(page)
  }
  return docs
}

function pageShowsAcceptedResume(input: unknown, docs: ResumeDocument[]): boolean {
  if (input && typeof input === 'object') {
    const field = input as { value?: unknown; files?: ArrayLike<{ name?: string }> | null }
    const selected = typeof field.value === 'string' ? field.value : ''
    const named = field.files?.[0]?.name || ''
    if (ACCEPTED_RESUME_NAME.test(selected) || ACCEPTED_RESUME_NAME.test(named)) return true
  }
  for (const doc of docs) {
    // Do not scan body or document text. The empty chooser still contains
    // "Replace Resume" and a Resume<timestamp>.pdf label inside nodes iCIMS
    // hides with iCIMS_NoDisplay, and textContent includes those descendants.
    if (typeof doc.querySelectorAll !== 'function') continue
    let nodes: ArrayLike<StatusNode> | null = null
    try {
      nodes = doc.querySelectorAll(STATUS_SELECTOR)
    } catch {
      nodes = null
    }
    if (!nodes || typeof nodes.length !== 'number') continue
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      if (!node || !isShown(node)) continue
      for (const label of nodeLabels(node)) {
        if (isReplaceResumeLabel(label) || ACCEPTED_RESUME_NAME.test(label)) return true
      }
    }
  }
  return false
}

function readIcimsResumeContext(input: unknown): { jobKey: string; accepted: boolean } {
  const locations = collectLocations(input)
  const accepted =
    locations.some((loc) => resumeSubmitted(loc.search) || resumeSubmitted(loc.href)) ||
    pageShowsAcceptedResume(input, documentsFor(input))
  return { jobKey: jobKeyFromLocations(locations), accepted }
}

function assignedFileName(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const name = (input as { files?: ArrayLike<{ name?: string }> | null }).files?.[0]?.name
  return typeof name === 'string' ? name : ''
}

// Attaches the saved resume the first time this tab sees this iCIMS job, and
// not again after iCIMS reloads. A page that already shows an accepted resume
// (a visible Resume<timestamp>.pdf, a visible Replace Resume control, or
// resumeSubmitted=1) is left alone. Hidden iCIMS_NoDisplay templates on the
// empty chooser do not count. The claim is stored before the file is assigned
// so the parse reload cannot win the race. A download that never assigns a
// file is forgotten so a later fill can still attach it. This does not click
// Replace Resume, Submit, or the cloud-picker buttons.
export async function attachIcimsResumeOnce(input: FileInputLike): Promise<boolean | 'skip'> {
  const page = readIcimsResumeContext(input)
  if (page.accepted) rememberIcimsResumeAttached(page.jobKey)
  if (page.accepted || icimsResumeAlreadyClaimed(page.jobKey)) return 'skip'
  rememberIcimsResumeAttached(page.jobKey)
  const attached = await applyIcimsResumeFile(input, await loadIcimsSavedResume())
  if (attached !== true && !assignedFileName(input)) forgetIcimsResumeAttached(page.jobKey)
  return attached
}
