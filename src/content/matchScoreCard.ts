import { mountInToastStack, brandIcon, MATCH_SCORE_ID } from './toastStack.ts'
import {
  BAND_LABEL,
  INSUFFICIENT_COPY,
  MATCH_SCORE_FOOTNOTE,
  MATCH_SCORE_LOADING,
  STRONG_MATCH_COPY,
  quickAnswerFor,
  type MissingProfile,
  type ScoredMatch,
} from '../services/matchScore/types.ts'

export type MatchScoreCardModel =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'insufficient' }
  | {
      kind: 'scored'
      score: ScoredMatch
      collapsed: boolean
      pending: boolean
      undoSkill: string | null
    }

export interface MatchScoreCardHandlers {
  onDismiss: () => void
  onToggle: () => void
  onUpgrade: () => void
  onOpenProfile: () => void
  onQuickYes: (skill: string) => void
  onQuickNo: (skill: string) => void
  onUndo: (skill: string) => void
}

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

function el(
  doc: Document,
  tag: string,
  style: string,
  text?: string,
): HTMLElement {
  const node = doc.createElement(tag)
  node.style.cssText = style
  if (text != null) node.textContent = text
  return node
}

function closeButton(doc: Document, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.textContent = '×'
  button.setAttribute('aria-label', 'Dismiss Match Score')
  button.style.cssText = `
    border: none;
    background: none;
    color: #6f6f7a;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 3px;
  `
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

function cardShell(doc: Document): HTMLElement {
  const existing = doc.getElementById(MATCH_SCORE_ID)
  existing?.remove()
  const card = doc.createElement('div')
  card.id = MATCH_SCORE_ID
  card.style.cssText = `
    width: min(300px, calc(100vw - 40px));
    background: #16161a;
    border: 1px solid #2e2e36;
    border-radius: 11px;
    box-shadow: 0 18px 44px -14px rgba(0, 0, 0, 0.55);
    font-family: ${FONT};
    color: #ebebee;
    overflow: hidden;
  `
  mountInToastStack(card, 'top', doc)
  return card
}

function headerRow(doc: Document, title: string, trailing: HTMLElement | null, onDismiss: () => void): HTMLElement {
  const row = el(doc, 'div', 'display:flex; align-items:center; gap:9px; padding:11px 12px;')
  const mark = el(doc, 'span', 'display:flex;')
  mark.innerHTML = brandIcon(20)
  const label = el(doc, 'div', 'flex:1; min-width:0; font-size:12.5px; font-weight:600;', title)
  row.append(mark, label)
  if (trailing) row.append(trailing)
  row.append(closeButton(doc, onDismiss))
  return row
}

function pillButton(doc: Document, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  button.style.cssText = `
    border: 1px solid #33333d;
    background: #232329;
    color: #ebebee;
    border-radius: 6px;
    padding: 4px 10px;
    font: 600 12px/1.3 ${FONT};
    cursor: ${disabled ? 'wait' : 'pointer'};
  `
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    if (!disabled) onClick()
  })
  return button
}

function renderScored(
  doc: Document,
  card: HTMLElement,
  model: Extract<MatchScoreCardModel, { kind: 'scored' }>,
  handlers: MatchScoreCardHandlers,
) {
  const score = model.score
  if (model.collapsed) {
    const pill = headerRow(
      doc,
      String(score.score),
      el(doc, 'span', 'font-size:11px; color:#b9b9c2;', BAND_LABEL[score.band]),
      handlers.onDismiss,
    )
    pill.style.cursor = 'pointer'
    pill.addEventListener('click', handlers.onToggle)
    card.append(pill)
    return
  }

  const scoreMark = el(doc, 'div', 'font-size:22px; font-weight:700; letter-spacing:-0.03em;', String(score.score))
  card.append(headerRow(doc, 'Match Score', scoreMark, handlers.onDismiss))
  const body = el(doc, 'div', 'padding:0 12px 12px; display:flex; flex-direction:column; gap:8px;')
  body.append(el(doc, 'div', 'font-size:12.5px; font-weight:600; color:#d7d7de;', BAND_LABEL[score.band]))
  if (score.confidence === 'low') {
    body.append(el(doc, 'div', 'font-size:11px; color:#b9b9c2;', 'Low confidence'))
  }
  if (score.strong_match) {
    body.append(el(doc, 'div', 'font-size:12.5px; font-weight:600;', STRONG_MATCH_COPY))
  }
  if (model.undoSkill) {
    const undo = el(doc, 'div', 'font-size:12px; color:#d7d7de;')
    undo.append(doc.createTextNode(`Added ${model.undoSkill} · `))
    const undoButton = doc.createElement('button')
    undoButton.type = 'button'
    undoButton.textContent = 'Undo'
    undoButton.disabled = model.pending
    undoButton.style.cssText = `border:none; background:none; color:#c4b5fd; font:600 12px/1.3 ${FONT}; cursor:${model.pending ? 'wait' : 'pointer'}; padding:0;`
    undoButton.addEventListener('click', () => {
      if (!model.pending) handlers.onUndo(model.undoSkill as string)
    })
    undo.append(undoButton)
    body.append(undo)
  }
  const matched = score.matched.slice(0, 3)
  if (matched.length) {
    const block = el(doc, 'div', 'display:flex; flex-direction:column; gap:3px;')
    block.append(el(doc, 'div', 'font-size:11px; color:#8f8f99;', 'Matched'))
    for (const item of matched) {
      block.append(el(doc, 'div', 'font-size:12px; color:#ebebee;', item.label))
    }
    body.append(block)
  }
  if (!score.strong_match) {
    for (const suggestion of score.suggestions.slice(0, 3)) {
      const answer = quickAnswerFor(suggestion)
      const block = el(doc, 'div', 'display:flex; flex-direction:column; gap:6px;')
      if (answer) {
        block.append(el(doc, 'div', 'font-size:12.5px; line-height:1.4;', answer.question))
        const actions = el(doc, 'div', 'display:flex; gap:6px;')
        actions.append(
          pillButton(doc, 'Yes', () => handlers.onQuickYes(answer.skill), model.pending),
          pillButton(doc, 'No', () => handlers.onQuickNo(answer.skill), model.pending),
        )
        block.append(actions)
      } else {
        block.append(el(doc, 'div', 'font-size:12.5px; line-height:1.4;', suggestion.text))
      }
      body.append(block)
    }
  }
  for (const deal of score.dealbreakers) {
    body.append(el(doc, 'div', 'font-size:12px; line-height:1.4; color:#f0c7a0;', deal.text))
  }
  for (const notice of score.notices) {
    body.append(el(doc, 'div', 'font-size:12px; line-height:1.4; color:#b9b9c2;', notice.text))
  }
  body.append(el(doc, 'div', 'font-size:10.5px; line-height:1.4; color:#8f8f99;', MATCH_SCORE_FOOTNOTE))
  const collapse = doc.createElement('button')
  collapse.type = 'button'
  collapse.textContent = 'Hide details'
  collapse.style.cssText = `border:none; background:none; color:#8f8f99; font:500 11px/1.3 ${FONT}; cursor:pointer; padding:0; text-align:left;`
  collapse.addEventListener('click', handlers.onToggle)
  body.append(collapse)
  card.append(body)
}

export function hideMatchScoreCard(doc: Document = document): void {
  doc.getElementById(MATCH_SCORE_ID)?.remove()
}

export function renderMatchScoreCard(
  model: MatchScoreCardModel,
  handlers: MatchScoreCardHandlers,
  doc: Document = document,
): HTMLElement {
  const card = cardShell(doc)
  if (model.kind === 'loading') {
    card.append(headerRow(doc, MATCH_SCORE_LOADING, null, handlers.onDismiss))
    return card
  }
  if (model.kind === 'locked') {
    const row = headerRow(doc, 'Match Score', el(doc, 'span', 'font-size:11px; color:#c4b5fd;', 'Pro'), handlers.onDismiss)
    row.style.cursor = 'pointer'
    row.addEventListener('click', handlers.onUpgrade)
    card.append(row)
    return card
  }
  if (model.kind === 'insufficient') {
    card.append(headerRow(doc, 'Match Score', null, handlers.onDismiss))
    const body = el(doc, 'div', 'padding:0 12px 12px; display:flex; flex-direction:column; gap:8px;')
    body.append(el(doc, 'div', 'font-size:12.5px; line-height:1.4; color:#d7d7de;', INSUFFICIENT_COPY))
    body.append(pillButton(doc, 'Open profile', handlers.onOpenProfile))
    card.append(body)
    return card
  }
  renderScored(doc, card, model, handlers)
  return card
}

export function insufficientMissing(_missing: MissingProfile[]): string {
  return INSUFFICIENT_COPY
}
