// Flashcards from notes, reviewed with spaced repetition.
//
// A card is any line in a note written as `question :: answer` (a list marker in
// front is fine; lines inside code fences are not cards). The spaces around `::`
// are required so code such as `std::vector` never turns into a card.
//
// Scheduling is SM-2, the algorithm behind Anki's classic mode: each card has an
// ease factor and an interval; "Good" multiplies the interval by the ease, "Again"
// sends the card back to the start and makes it a little harder from then on.
//
// A card's id comes from its note and question, so editing the answer keeps its
// progress and editing the question starts it fresh. Progress is stored on this
// device (localStorage); it does not sync.

const STORE_KEY = 'nb.flashcards'
const DAY = 24 * 60 * 60 * 1000
export const NEW_PER_SESSION = 20

const CARD_LINE = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?(.+?)\s+::\s+(.+?)\s*$/

function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function cardId(noteId, front) {
  return `c${hash(`${noteId}|${front.trim().toLowerCase()}`)}`
}

export function extractCards(notes) {
  const cards = []
  const seen = new Set()
  for (const note of notes || []) {
    for (const block of note.content || []) {
      if (block.type !== 'text' || !block.markdown) continue
      let inFence = false
      for (const line of block.markdown.split('\n')) {
        if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
        if (inFence) continue
        // A `::` inside inline code or bold is being talked about, not used:
        // "write cards as **question :: answer**" is an instruction, not a card.
        const masked = line.replace(/`[^`]*`/g, (s) => '_'.repeat(s.length)).replace(/\*\*[^*]*\*\*/g, (s) => '_'.repeat(s.length))
        if (!masked.includes(' :: ')) continue
        const m = CARD_LINE.exec(line)
        if (!m) continue
        const front = m[1].trim()
        const back = m[2].trim()
        if (!front || !back) continue
        const id = cardId(note.id, front)
        if (seen.has(id)) continue
        seen.add(id)
        cards.push({ id, noteId: note.id, noteTitle: note.title || 'Untitled note', tags: note.tags || [], front, back })
      }
    }
  }
  return cards
}

export function countCards(note) {
  return extractCards([note]).length
}

// ── scheduling ────────────────────────────────────────────────────────────────
export const GRADES = ['again', 'hard', 'good', 'easy']

export function newState() {
  return { interval: 0, ease: 2.5, reps: 0, lapses: 0, due: 0, last: 0 }
}

// Returns the card's next state after answering with `grade` at time `now`.
export function review(state, grade, now = Date.now()) {
  const s = { ...newState(), ...(state || {}) }
  let { interval, ease, reps, lapses } = s
  if (grade === 'again') {
    lapses += 1
    reps = 0
    interval = 0
    ease = Math.max(1.3, ease - 0.2)
    return { interval, ease, reps, lapses, last: now, due: now + 10 * 60 * 1000 }
  }
  if (grade === 'hard') {
    interval = Math.max(1, Math.round(interval * 1.2))
    ease = Math.max(1.3, ease - 0.15)
  } else if (grade === 'good') {
    interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease)
  } else {
    interval = interval === 0 ? 4 : Math.round(interval * ease * 1.3)
    ease += 0.15
  }
  reps += 1
  return { interval, ease: Math.round(ease * 100) / 100, reps, lapses, last: now, due: now + interval * DAY }
}

// "10m", "1d", "3w", "4mo" — what the grade buttons show.
export function describeNext(state, grade, now = Date.now()) {
  const ms = review(state, grade, now).due - now
  const mins = Math.round(ms / 60000)
  if (mins < 60) return `${mins}m`
  const days = Math.round(ms / DAY)
  if (days < 14) return `${days}d`
  if (days < 60) return `${Math.round(days / 7)}w`
  if (days < 365) return `${Math.round(days / 30)}mo`
  return `${(days / 365).toFixed(1)}y`
}

// The cards to study now: overdue reviews first (most overdue first), then up to
// `newLimit` cards never seen before, in note order.
export function dueCards(cards, states, now = Date.now(), newLimit = NEW_PER_SESSION) {
  const due = []
  const fresh = []
  for (const c of cards) {
    const st = states[c.id]
    if (!st) fresh.push(c)
    else if (st.due <= now) due.push(c)
  }
  due.sort((a, b) => states[a.id].due - states[b.id].due)
  return [...due, ...fresh.slice(0, newLimit)]
}

export function deckStats(cards, states, now = Date.now()) {
  let due = 0
  let fresh = 0
  let learned = 0
  for (const c of cards) {
    const st = states[c.id]
    if (!st) fresh += 1
    else {
      if (st.due <= now) due += 1
      if (st.interval >= 21) learned += 1
    }
  }
  return { total: cards.length, due, fresh, learned }
}

// ── storage ───────────────────────────────────────────────────────────────────
export function loadStates() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {} } catch { return {} }
}

export function saveState(id, state) {
  const all = loadStates()
  all[id] = state
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)) } catch { /* full or blocked: progress for this card is lost, the deck still works */ }
  return all
}
