// utils/siteRules.ts

type SiteRule = {
  detect: () => boolean
  apply: (
    input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
    personalInfo: any,
  ) => boolean
  formChanged?: () => string
}

export const siteRules: SiteRule[] = [
  {
    detect: () => window.location.hostname.includes('myworkday'),
    apply: (input, personalInfo) => {
      if (input.getAttribute('id') == 'name--legalName--firstName') {
        input.value = personalInfo.firstName || ''
        return true
      }
      return false
    },
    formChanged: () => {
      const container = document.querySelector('[data-automation-id="applyFlowPage"]')
      if (!container) return ''

      const inputs = container.querySelectorAll('input, textarea, select')
      return Array.from(inputs)
        .map((input) => `${input.tagName}:${input.name || input.id || input.type}`)
        .join(',')
    },
  },
  {
    detect: () => window.location.hostname.includes('greenhouse.io'),
    apply: (input, personalInfo) => {
      // Greenhouse-specific logic heres
      return false
    },
  },
]
