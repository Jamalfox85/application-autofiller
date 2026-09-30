// Shared by the popup Supabase client and the service-worker sign-in client so
// both persist the session under the same chrome.storage.local keys.

export const chromeLocalStorage = {
  getItem: (key: string) =>
    new Promise<string | null>((resolve) => {
      chrome.storage.local.get(key, (res) => {
        const value = res[key]
        resolve(typeof value === 'string' ? value : null)
      })
    }),
  setItem: (key: string, value: string) => chrome.storage.local.set({ [key]: value }),
  removeItem: (key: string) => chrome.storage.local.remove(key),
}
