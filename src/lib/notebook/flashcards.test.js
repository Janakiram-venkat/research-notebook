import { describe, expect, it } from 'vitest'
import { cardId, deckStats, describeNext, dueCards, extractCards, review } from './flashcards.js'

const note = (id, markdown, extra = {}) => ({ id, title: `Note ${id}`, content: [{ type: 'text', markdown }], ...extra })
const DAY = 86400000

describe('extracting cards', () => {
  it('reads question :: answer lines, with or without list markers', () => {
    const cards = extractCards([note('n', 'Intro\n- Capital of France :: Paris\n1. Two plus two :: 4\n- [ ] Task card :: done\nplain :: line')])
    expect(cards.map((c) => [c.front, c.back])).toEqual([
      ['Capital of France', 'Paris'], ['Two plus two', '4'], ['Task card', 'done'], ['plain', 'line'],
    ])
    expect(cards[0].noteTitle).toBe('Note n')
  })

  it('ignores code (no spaces around ::, or inside a fence) and empty sides', () => {
    const md = 'Use std::vector here\n```\nkey :: value\n```\n :: no front\nno back ::'
    expect(extractCards([note('n', md)])).toEqual([])
  })

  it('keeps progress when the answer changes, not when the question does', () => {
    const [a] = extractCards([note('n', 'Q :: A')])
    const [b] = extractCards([note('n', 'Q :: different answer')])
    const [c] = extractCards([note('n', 'Other Q :: A')])
    expect(a.id).toBe(b.id)
    expect(a.id).not.toBe(c.id)
    expect(cardId('n', ' q ')).toBe(cardId('n', 'Q'))
  })

  it('ignores :: that is only mentioned, in inline code or bold', () => {
    const md = 'Write one card per line as **question :: answer**. Open Review.\nUse `q :: a` lines.\n**Bold Q** :: real answer'
    expect(extractCards([note('n', md)]).map((c) => c.back)).toEqual(['real answer'])
  })

  it('does not duplicate a repeated question within a note', () => {
    expect(extractCards([note('n', 'Q :: A\nQ :: A again')])).toHaveLength(1)
  })
})

describe('SM-2 scheduling', () => {
  const now = 1_000_000
  it('grows intervals with Good: 1d, 3d, then by ease', () => {
    let s = review(null, 'good', now)
    expect(s.interval).toBe(1)
    s = review(s, 'good', now)
    expect(s.interval).toBe(3)
    s = review(s, 'good', now)
    expect(s.interval).toBe(Math.round(3 * 2.5))
    expect(s.due).toBe(now + s.interval * DAY)
  })

  it('Again resets the card, counts a lapse and lowers ease (not below 1.3)', () => {
    let s = review(review(null, 'good', now), 'good', now)
    s = review(s, 'again', now)
    expect(s.interval).toBe(0)
    expect(s.lapses).toBe(1)
    expect(s.ease).toBeCloseTo(2.3)
    expect(s.due - now).toBe(10 * 60 * 1000)
    for (let i = 0; i < 20; i += 1) s = review(s, 'again', now)
    expect(s.ease).toBe(1.3)
  })

  it('Easy jumps further than Good, Hard less far', () => {
    const base = review(review(null, 'good', now), 'good', now) // interval 3
    expect(review(base, 'easy', now).interval).toBeGreaterThan(review(base, 'good', now).interval)
    expect(review(base, 'hard', now).interval).toBeLessThan(review(base, 'good', now).interval)
    expect(describeNext(null, 'again', now)).toBe('10m')
    expect(describeNext(null, 'easy', now)).toBe('4d')
  })
})

describe('what is due', () => {
  it('puts overdue cards first (most overdue first), then a limited number of new ones', () => {
    const cards = extractCards([note('n', 'A :: 1\nB :: 2\nC :: 3\nD :: 4\nE :: 5')])
    const [a, b, c] = cards
    const now = 10 * DAY
    const states = {
      [a.id]: { ...review(null, 'good', 0), due: now - DAY },
      [b.id]: { ...review(null, 'good', 0), due: now - 3 * DAY },
      [c.id]: { ...review(null, 'good', 0), due: now + DAY },
    }
    const queue = dueCards(cards, states, now, 1)
    expect(queue.map((x) => x.front)).toEqual(['B', 'A', 'D'])
    expect(deckStats(cards, states, now)).toEqual({ total: 5, due: 2, fresh: 2, learned: 0 })
  })
})
