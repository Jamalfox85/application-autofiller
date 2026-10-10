import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { isCurrentLocationQuestion } from '../src/utils/siteRules/greenhouseValues.ts'

describe('job-boards Current Location question', () => {
  it('matches the Dropbox "Current Location" dropdown', () => {
    assert.equal(isCurrentLocationQuestion('question_68839953', 'question_68839953currentlocation*select...'), true)
  })
  it('does not claim neighbours on the same form', () => {
    assert.equal(isCurrentLocationQuestion('question_68839960', 'question_68839960locationcosttier'), false)
    assert.equal(
      isCurrentLocationQuestion('question_68839954', 'question_68839954pleaseprovidethezipcodeofyourprimaryresidence.*'),
      false,
    )
    assert.equal(isCurrentLocationQuestion('candidate-location', 'candidate-locationcurrentlocation'), false)
  })

  it('opens an end-date year combobox in greenhouse mode instead of typing the year', () => {
    const src = readFileSync(new URL('../src/utils/siteRules/greenhouse.ts', import.meta.url), 'utf8')
    const year = src.slice(src.indexOf("field.kind === 'startYear' || field.kind === 'endYear'"))
    const branch = year.slice(0, year.indexOf('await fillNativeInput(input, year)'))
    assert.match(branch, /role'\) === 'combobox'/)
    assert.match(branch, /fillReactSelect\([\s\S]*'greenhouse'/)
  })
})
