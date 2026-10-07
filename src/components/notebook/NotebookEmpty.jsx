// The first thing a new notebook shows.
//
// It used to be an icon, the sentence "No notes yet." and one button that
// opened a modal listing five templates. That is a dead end dressed as a start:
// the reader has to open a dialog to find out what a note in this product even
// looks like, and the five options arrive with no order between them.
//
// This offers the three starters directly — something blank, something for a
// lab run, something for a code experiment — and says in one line each what the
// notebook can do that a text file cannot. The full template list is still one
// click away for anyone who wants it.

import { Plus, FlaskConical, Code2, Sparkles, Link2, Sigma, Play } from 'lucide-react'
import { getTemplate, STARTER_TEMPLATE_IDS } from '../../lib/notebook/templates.js'

const STARTER_ICONS = {
  blank: Plus,
  experiment: FlaskConical,
  scratchpad: Code2,
}

// Three things worth knowing on day one, each shown as the thing you type.
const HINTS = [
  { Icon: Sigma, code: '$\\ket{\\psi}$', text: 'Write math inline with $…$ and it renders as you type.' },
  { Icon: Link2, code: '[[Superposition]]', text: 'Link one note to another. Backlinks appear at the foot of both.' },
  { Icon: Play, code: 'Ctrl+Enter', text: 'Code blocks run real Qiskit and keep their output in the note.' },
]

export default function NotebookEmpty({ onStart, onBrowseTemplates }) {
  return (
    <div className="nb-empty-state">
      <span className="nb-empty-eyebrow">
        <Sparkles size={13} aria-hidden="true" /> Start here
      </span>
      <h2 className="nb-empty-title">Create your first research note</h2>
      <p className="nb-empty-lead">
        A note holds writing, math, saved circuits and runnable code in one document. Pick a starting
        point below. You can change anything in it afterwards.
      </p>

      <div className="nb-empty-starters">
        {STARTER_TEMPLATE_IDS.map((id) => {
          const template = getTemplate(id)
          const Icon = STARTER_ICONS[id] || Plus
          return (
            <button key={id} className="nb-empty-starter" onClick={() => onStart(id)}>
              <span className="nb-empty-starter-icon"><Icon size={17} aria-hidden="true" /></span>
              <span className="nb-empty-starter-label">{template.label}</span>
              <span className="nb-empty-starter-desc">{template.description}</span>
            </button>
          )
        })}
      </div>

      <ul className="nb-empty-hints">
        {HINTS.map((hint) => (
          <li key={hint.code}>
            <hint.Icon size={14} aria-hidden="true" />
            <code>{hint.code}</code>
            <span>{hint.text}</span>
          </li>
        ))}
      </ul>

      <button className="nb-empty-more" onClick={onBrowseTemplates}>
        Browse all templates
      </button>
    </div>
  )
}
