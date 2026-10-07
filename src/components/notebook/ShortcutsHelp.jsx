// Keyboard-shortcuts cheat sheet modal (opened from the note toolbar or `?`).

import { X } from 'lucide-react'

// Grouped so a reader scanning for "how do I do X" reads down the group that
// matches their intent rather than a long flat list. Each row lists the same
// keys the app actually binds, so a mismatch is a bug in a test.
const GROUPS = [
  {
    title: 'Navigation',
    rows: [
      { keys: ['Ctrl', 'K'], label: 'Command palette (search + jump)' },
      { keys: ['?'], label: 'Show this help' },
      { keys: ['Ctrl', '.'], label: 'Focus mode (hide everything but the note)' },
      { keys: ['Esc'], label: 'Exit focus mode' },
    ],
  },
  {
    title: 'Save + export',
    rows: [
      { keys: ['Ctrl', 'S'], label: 'Save now' },
      { keys: ['Ctrl', 'Shift', 'P'], label: 'Export PDF' },
    ],
  },
  {
    title: 'Insert blocks',
    rows: [
      { keys: ['/'], label: 'Slash menu (text, heading, code, table, plot, sketch…)' },
      { keys: ['[['], label: 'Link a note (wiki link)' },
      { keys: ['$', '$'], label: 'Inline math (LaTeX)' },
      { keys: ['$$'], label: 'Block equation' },
      { keys: ['```'], label: 'Fenced code, runnable' },
    ],
  },
  {
    title: 'Text formatting',
    rows: [
      { keys: ['Ctrl', 'B'], label: 'Bold' },
      { keys: ['Ctrl', 'I'], label: 'Italic' },
      { keys: ['Ctrl', 'Shift', '9'], label: 'Highlight selection' },
      { keys: ['Ctrl', 'E'], label: 'Inline code' },
      { keys: ['- '], label: 'Bullet list' },
      { keys: ['1. '], label: 'Numbered list' },
      { keys: ['[ ]'], label: 'Task list item' },
    ],
  },
  {
    title: 'Code + circuit',
    rows: [
      { keys: ['Ctrl', 'Enter'], label: 'Run code block' },
    ],
  },
  {
    title: 'Tables',
    rows: [
      { keys: ['Tab'], label: 'Next cell (adds a row at the end)' },
      { keys: ['Shift', 'Tab'], label: 'Previous cell' },
      { keys: ['Ctrl', 'Backspace'], label: 'Delete row / column when the cell is empty' },
    ],
  },
]

export default function ShortcutsHelp({ open, onClose }) {
  if (!open) return null
  return (
    <div className="nb-cmd-backdrop" onMouseDown={onClose}>
      <div className="nb-shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="nb-shortcuts-head">
          <h2>Keyboard shortcuts</h2>
          <button onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="nb-shortcuts-groups">
          {GROUPS.map((group) => (
            <section key={group.title} className="nb-shortcuts-group">
              <h3 className="nb-shortcuts-title">{group.title}</h3>
              <div className="nb-shortcuts-list">
                {group.rows.map((s) => (
                  <div key={s.label} className="nb-shortcuts-row">
                    <span>{s.label}</span>
                    <span className="nb-shortcuts-keys">
                      {s.keys.map((k, i) => <kbd key={`${k}-${i}`}>{k}</kbd>)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
