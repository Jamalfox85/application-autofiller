import { ICIMS_DESCRIPTION_SELECTOR } from './icims.ts'

// A form is the usual score surface. The iCIMS job content frame has the description
// and no form, so that confirmed node is enough to run. Other ATS stay on the form
// check; their captured pages do not have a description node to wait for.
const SCORE_SURFACE_SELECTOR = `form, #application-form, #application_form, ${ICIMS_DESCRIPTION_SELECTOR}`

export function matchScoreSurfaceReady(doc: { querySelector(selector: string): unknown } | null | undefined): boolean {
  return !!doc?.querySelector(SCORE_SURFACE_SELECTOR)
}
