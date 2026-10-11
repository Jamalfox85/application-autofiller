import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { leverProfileUrl, normalizeProfileUrl } from './profileUrl.ts'

describe('profile URLs', () => {
  it('adds https when a profile link is constructed without a scheme', () => {
    assert.equal(normalizeProfileUrl('github.com/ada'), 'https://github.com/ada')
    assert.equal(normalizeProfileUrl('  /linkedin.com/in/ada '), 'https://linkedin.com/in/ada')
    assert.equal(normalizeProfileUrl(''), '')
  })

  it('leaves a full URL unchanged, including an explicit http URL', () => {
    assert.equal(normalizeProfileUrl('http://github.com/ada'), 'http://github.com/ada')
    assert.equal(normalizeProfileUrl('http://portfolio.example/ada'), 'http://portfolio.example/ada')
    assert.equal(normalizeProfileUrl('https://github.com/ada/repo'), 'https://github.com/ada/repo')
  })

  it('upgrades http on github and linkedin hosts when filling a hosted URL field', () => {
    assert.equal(leverProfileUrl('http://github.com/ada'), 'https://github.com/ada')
    assert.equal(leverProfileUrl('http://www.github.com/ada'), 'https://www.github.com/ada')
    assert.equal(leverProfileUrl('http://linkedin.com/in/ada'), 'https://linkedin.com/in/ada')
    assert.equal(leverProfileUrl('http://www.linkedin.com/in/ada'), 'https://www.linkedin.com/in/ada')
    assert.equal(leverProfileUrl('github.com/ada'), 'https://github.com/ada')
    assert.equal(leverProfileUrl('https://github.com/ada/repo'), 'https://github.com/ada/repo')
    assert.equal(leverProfileUrl('http://github.com/ada/repo'), 'https://github.com/ada/repo')
    assert.equal(leverProfileUrl('http://portfolio.example/ada'), 'http://portfolio.example/ada')
    assert.equal(leverProfileUrl(''), '')
  })
})
