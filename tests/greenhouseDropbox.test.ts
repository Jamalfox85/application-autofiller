import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
})
