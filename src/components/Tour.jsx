// A short first-run tour. A card in the corner (not a blocking overlay), so the page
// stays usable. Shown once, then reopened from "Take the tour" in the notes menu.

import { useEffect, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'

const DONE_KEY = 'nb.tourDone'

const STEPS = [
  { title: 'Make a note', text: 'Press New note and pick a starting point, or open the Welcome note. Notes save themselves as you type.' },
  { title: 'Type / for blocks', text: 'On an empty line, type / to add headings, lists, math, plots, sketches or runnable code.' },
  { title: 'Link your ideas', text: 'Type [[ and a note title to link two notes. Each note lists what links back to it.' },
  { title: 'Run code', text: 'Click a code block and press Ctrl+Enter. Python and JavaScript run right in your browser.' },
  { title: 'Ask the assistant', text: 'The Agents button opens an assistant that can search your notes, summarise them and quiz you.' },
]

function read() { try { return localStorage.getItem(DONE_KEY) } catch { return '1' } }
function markDone() { try { localStorage.setItem(DONE_KEY, '1') } catch { /* storage blocked */ } }

export default function Tour() {
  // Starts at step 0 on a first visit, null (hidden) otherwise.
  const [step, setStep] = useState(() => (read() ? null : 0))

  useEffect(() => {
    const open = () => setStep(0)
    window.addEventListener('nb:tour', open)
    return () => window.removeEventListener('nb:tour', open)
  }, [])

  if (step === null) return null
  const last = step === STEPS.length - 1
  const close = () => { markDone(); setStep(null) }

  return (
    <div className="tour-card" role="dialog" aria-label="Quick tour" aria-live="polite">
      <button className="tour-close" onClick={close} aria-label="Skip the tour"><X size={14} /></button>
      <p className="tour-count">{step + 1} of {STEPS.length}</p>
      <h2>{STEPS[step].title}</h2>
      <p>{STEPS[step].text}</p>
      <div className="tour-actions">
        <button className="tour-skip" onClick={close}>Skip</button>
        <button className="tour-next" onClick={() => (last ? close() : setStep(step + 1))} autoFocus>
          {last ? 'Done' : <>Next <ArrowRight size={14} aria-hidden="true" /></>}
        </button>
      </div>
    </div>
  )
}
