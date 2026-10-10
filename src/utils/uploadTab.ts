// The toolbar popup is destroyed the moment the native file dialog opens, so a file chosen
// there never reaches the change handler. The picker runs in a normal browser tab instead:
// the tab is the same extension page (popup.html) with ?upload=resume, and the upload itself
// is already owned by the service worker (see useResumeUpload), so the popup picks the
// result up from chrome.storage when it is reopened.

export const UPLOAD_TAB_PARAM = 'upload'

type Loc = Pick<Location, 'search'>

// True for the browser-action popup. A tab opened by openResumeUploadTab carries ?tab=1.
export function isToolbarPopup(loc: Loc = location): boolean {
  return !new URLSearchParams(loc.search).has('tab')
}

export function isResumeUploadTab(loc: Loc = location): boolean {
  const params = new URLSearchParams(loc.search)
  return params.has('tab') && params.get(UPLOAD_TAB_PARAM) === 'resume'
}

export function resumeUploadTabPath(): string {
  return `popup.html?tab=1&${UPLOAD_TAB_PARAM}=resume`
}

// Returns true when it handed off to a tab (the caller must not open the inline picker).
export async function openResumeUploadTab(
  api: {
    getURL: (path: string) => string
    createTab: (url: string) => Promise<unknown>
    closeSelf: () => void
  } = {
    getURL: (path) => chrome.runtime.getURL(path),
    createTab: (url) => chrome.tabs.create({ url }),
    closeSelf: () => window.close(),
  },
): Promise<boolean> {
  try {
    await api.createTab(api.getURL(resumeUploadTabPath()))
  } catch {
    return false
  }
  api.closeSelf()
  return true
}
