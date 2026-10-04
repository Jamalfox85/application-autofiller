import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { renderMatchScoreCard } from './matchScoreCard.ts'
import {
  INSUFFICIENT_COPY,
  MATCH_SCORE_FOOTNOTE,
  MATCH_SCORE_HOW_COPY,
  MATCH_SCORE_HOW_LABEL,
  MATCH_SCORE_LOADING,
  STRONG_MATCH_COPY,
  type ScoredMatch,
} from '../services/matchScore/types.ts'

function scored(overrides: Partial<ScoredMatch> = {}): ScoredMatch {
  return {
    status: 'scored',
    score: 88,
    band: 'very_strong',
    confidence: 'high',
    strong_match: false,
    matched: [{ label: 'TypeScript', kind: 'must' }],
    suggestions: [],
    dealbreakers: [],
    notices: [],
    score_version: 1,
    requirements_version: 1,
    cached_requirements: false,
    ...overrides,
  }
}

const handlers = {
  onDismiss() {},
  onToggle() {},
  onUpgrade() {},
  onOpenProfile() {},
  onQuickYes() {},
  onQuickNo() {},
  onUndo() {},
}

function render(model: Parameters<typeof renderMatchScoreCard>[0]) {
  const dom = new JSDOM('<!doctype html><body></body>')
  const card = renderMatchScoreCard(model, handlers, dom.window.document)
  return card
}

test('a strong match shows the server phrase and no quick answers', () => {
  const card = render({
    kind: 'scored',
    collapsed: false,
    pending: false,
    undoSkill: null,
    score: scored({
      strong_match: true,
      suggestions: [
        {
          id: '1',
          kind: 'must',
          text: 'Ignored',
          quick_answer: { skill: 'Go', question: 'Do you have experience with Go?' },
        },
      ],
    }),
  })
  assert.equal(card.id, 'match-score')
  assert.match(card.textContent ?? '', new RegExp(STRONG_MATCH_COPY))
  assert.equal(card.textContent?.includes('Yes'), false)
  assert.match(card.textContent ?? '', new RegExp(MATCH_SCORE_FOOTNOTE))
  assert.match(card.textContent ?? '', /88/)
})

test('years and education suggestions stay plain text', () => {
  const card = render({
    kind: 'scored',
    collapsed: false,
    pending: false,
    undoSkill: null,
    score: scored({
      score: 55,
      band: 'okay',
      suggestions: [
        { id: 'y', kind: 'years', text: 'How many years of Go?', quick_answer: { skill: 'Go', question: 'Ask?' } },
        { id: 'e', kind: 'education', text: 'A CS degree is listed.' },
        {
          id: 'm',
          kind: 'must',
          text: 'GraphQL is missing.',
          quick_answer: { skill: 'GraphQL', question: 'Do you have experience with GraphQL?' },
        },
      ],
    }),
  })
  const text = card.textContent ?? ''
  assert.match(text, /How many years of Go\?/)
  assert.match(text, /A CS degree is listed\./)
  assert.match(text, /Do you have experience with GraphQL\?/)
  assert.equal(text.includes('Ask?'), false)
  const labels = [...card.querySelectorAll('button')].map((button) => button.textContent)
  assert.deepEqual(
    labels.filter((label) => label === 'Yes' || label === 'No'),
    ['Yes', 'No'],
  )
})

test('how this score is calculated reveals only the weight blurb', () => {
  const expanded = render({
    kind: 'scored',
    collapsed: false,
    pending: false,
    undoSkill: null,
    score: scored(),
  })
  const collapsed = render({
    kind: 'scored',
    collapsed: true,
    pending: false,
    undoSkill: null,
    score: scored(),
  })
  for (const card of [expanded, collapsed]) {
    const control = [...card.querySelectorAll('button')].find((button) => button.textContent === MATCH_SCORE_HOW_LABEL)
    assert.ok(control)
    assert.equal(control?.getAttribute('aria-expanded'), 'false')
    const blurb = control?.nextElementSibling
    assert.equal(blurb?.textContent, '')
    control?.dispatchEvent(new card.ownerDocument.defaultView!.Event('click', { bubbles: true }))
    assert.equal(control?.getAttribute('aria-expanded'), 'true')
    assert.equal(blurb?.textContent, MATCH_SCORE_HOW_COPY)
    assert.equal(blurb?.childElementCount, 0)
  }
  assert.equal(MATCH_SCORE_HOW_COPY, `The score compares your saved GoFillr profile with this job, not your resume file. Pieces the job doesn\u2019t mention are left out, and the rest still add up to 100.

Required skills, 40. A skill counts if it\u2019s on your profile or in a job description there, including synonyms.
Years and seniority, 20. Partial credit if your dated work history is short of the ask.
Nice-to-have skills, 15.
Job title overlap with past titles, 10.
Education, 10.
Industry, 5.

80 and up is Very strong, 60 is Good, 40 is Okay, and under 40 is Weak. If the role doesn\u2019t offer sponsorship you need, or it\u2019s onsite outside your country, the score stays under 40. Clearance and licenses are notes only.`)

  const loading = render({ kind: 'loading' })
  const locked = render({ kind: 'locked' })
  const insufficient = render({ kind: 'insufficient' })
  for (const card of [loading, locked, insufficient]) {
    assert.equal(card.textContent?.includes(MATCH_SCORE_HOW_LABEL), false)
  }
})

test('loading, locked, and insufficient states hide the number', () => {
  const loading = render({ kind: 'loading' })
  assert.match(loading.textContent ?? '', new RegExp(MATCH_SCORE_LOADING))
  assert.equal(/\d/.test(loading.textContent ?? ''), false)

  const locked = render({ kind: 'locked' })
  assert.match(locked.textContent ?? '', /Match Score/)
  assert.equal(locked.textContent?.includes('88'), false)

  const insufficient = render({ kind: 'insufficient' })
  assert.match(insufficient.textContent ?? '', new RegExp(INSUFFICIENT_COPY))
  assert.equal(/\d/.test(insufficient.textContent ?? ''), false)
})
