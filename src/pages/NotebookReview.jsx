// Flashcard review. Cards come from `question :: answer` lines in notes; this page
// shows the ones due today, one at a time: think, reveal, then say how well you knew
// it. Keyboard: Space reveals, 1–4 grade (Again / Hard / Good / Easy).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Layers, RotateCcw, PartyPopper, FileText } from 'lucide-react'
import { listNotes } from '../lib/notebook/notebookStore.js'
import {
  GRADES, deckStats, describeNext, dueCards, extractCards, loadStates, review, saveState,
} from '../lib/notebook/flashcards.js'
import MarkdownView from '../components/notebook/MarkdownView.jsx'
import '../components/notebook/notebook.css'
import '../components/review.css'

const GRADE_LABEL = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }
const GRADE_HINT = { again: "Didn't know it", hard: 'Got it, with effort', good: 'Knew it', easy: 'Too easy' }

export default function NotebookReview() {
  const [params, setParams] = useSearchParams()
  const deck = params.get('deck') || 'all' // 'all' | note id | 'tag:<name>'
  const [states, setStates] = useState(loadStates)
  const [notes] = useState(() => listNotes())
  const allCards = useMemo(() => extractCards(notes), [notes])

  const decks = useMemo(() => {
    const byNote = new Map()
    for (const c of allCards) byNote.set(c.noteId, (byNote.get(c.noteId) || 0) + 1)
    const tags = new Map()
    for (const c of allCards) for (const t of c.tags) tags.set(t, (tags.get(t) || 0) + 1)
    return {
      notes: notes.filter((n) => byNote.has(n.id)).map((n) => ({ id: n.id, title: n.title, count: byNote.get(n.id) })),
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).map(([t, count]) => ({ t, count })),
    }
  }, [allCards, notes])

  const cards = useMemo(() => {
    if (deck === 'all') return allCards
    if (deck.startsWith('tag:')) return allCards.filter((c) => c.tags.includes(deck.slice(4)))
    return allCards.filter((c) => c.noteId === deck)
  }, [allCards, deck])

  // The session queue is fixed when the session starts (and when the deck changes);
  // "Again" puts a card back at the end so it comes round once more today.
  const [queue, setQueue] = useState(() => dueCards(cards, states))
  const [startedDeck, setStartedDeck] = useState(deck)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  if (startedDeck !== deck) {
    setStartedDeck(deck)
    setQueue(dueCards(cards, loadStates()))
    setRevealed(false)
    setDone(0)
  }

  const card = queue[0]
  const stats = deckStats(cards, states)

  const grade = useCallback((g) => {
    if (!card) return
    const next = review(states[card.id], g)
    setStates(saveState(card.id, next))
    setQueue((q) => (g === 'again' ? [...q.slice(1), card] : q.slice(1)))
    setRevealed(false)
    if (g !== 'again') setDone((d) => d + 1)
  }, [card, states])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return
      if (!card) return
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setRevealed(true); return }
      if (revealed) {
        const i = ['1', '2', '3', '4'].indexOf(e.key)
        if (i >= 0) { e.preventDefault(); grade(GRADES[i]) }
        else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); grade('good') }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [card, revealed, grade])

  const restart = () => { setQueue(dueCards(cards, loadStates())); setDone(0); setRevealed(false) }
  const total = done + queue.length

  return (
    <div className="review-page">
      <header className="review-head">
        <Link to="/notebook" className="nb-icon-btn" aria-label="Back to notes"><ArrowLeft size={18} /></Link>
        <div>
          <h1><Layers size={20} aria-hidden="true" /> Review</h1>
          <p>{stats.total} cards · {stats.due} due · {stats.fresh} new · {stats.learned} well learned</p>
        </div>
        <span className="review-spacer" />
        {allCards.length > 0 && (
          <label className="review-deck">
            <span>Deck</span>
            <select value={deck} onChange={(e) => setParams(e.target.value === 'all' ? {} : { deck: e.target.value })}>
              <option value="all">All cards ({allCards.length})</option>
              {decks.tags.length > 0 && (
                <optgroup label="By tag">
                  {decks.tags.map(({ t, count }) => <option key={t} value={`tag:${t}`}>#{t} ({count})</option>)}
                </optgroup>
              )}
              <optgroup label="By note">
                {decks.notes.map((n) => <option key={n.id} value={n.id}>{n.title} ({n.count})</option>)}
              </optgroup>
            </select>
          </label>
        )}
      </header>

      {allCards.length === 0 ? (
        <div className="review-empty">
          <Layers size={30} aria-hidden="true" />
          <h2>No flashcards yet</h2>
          <p>Write a card anywhere in a note as one line: <code>question :: answer</code>. Every card shows up here, and the ones you find hard come back sooner.</p>
          <p className="review-example"><code>- Capital of France :: Paris</code></p>
          <Link to="/notebook" className="nb-new-btn">Go to notes</Link>
        </div>
      ) : !card ? (
        <div className="review-empty">
          <PartyPopper size={30} aria-hidden="true" />
          <h2>{done ? `Done: ${done} card${done === 1 ? '' : 's'} reviewed` : 'Nothing due right now'}</h2>
          <p>{stats.fresh > 0 && done ? `${stats.fresh} new card${stats.fresh === 1 ? '' : 's'} left for another session.` : 'Cards come back when they are due. Check again tomorrow.'}</p>
          <div className="review-actions">
            {stats.fresh > 0 && <button type="button" className="nb-new-btn" onClick={restart}><RotateCcw size={15} /> Study more new cards</button>}
            <Link to="/notebook" className="nb-new-btn nb-new-btn-secondary">Back to notes</Link>
          </div>
        </div>
      ) : (
        <main className="review-stage">
          <div className="review-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Session progress">
            <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <p className="review-count">{queue.length} left{states[card.id] ? '' : ' · new card'}</p>

          <article className={`review-card${revealed ? ' is-revealed' : ''}`} aria-live="polite">
            <div className="review-front"><MarkdownView markdown={card.front} /></div>
            {revealed ? (
              <div className="review-back"><MarkdownView markdown={card.back} /></div>
            ) : (
              <button type="button" className="review-reveal" onClick={() => setRevealed(true)} autoFocus>
                Show answer <kbd>Space</kbd>
              </button>
            )}
            <Link className="review-source" to={`/notebook/${card.noteId}`}><FileText size={13} aria-hidden="true" /> {card.noteTitle}</Link>
          </article>

          {revealed && (
            <div className="review-grades" role="group" aria-label="How well did you know it?">
              {GRADES.map((g, i) => (
                <button key={g} type="button" className={`review-grade is-${g}`} onClick={() => grade(g)} autoFocus={g === 'good'}>
                  <span className="review-grade-label">{GRADE_LABEL[g]}</span>
                  <span className="review-grade-next">{describeNext(states[card.id], g)}</span>
                  <span className="review-grade-hint">{GRADE_HINT[g]} · <kbd>{i + 1}</kbd></span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}
    </div>
  )
}
