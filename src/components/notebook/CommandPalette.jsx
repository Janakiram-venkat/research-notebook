// Ctrl/Cmd+K command palette for the notebook. Generic: the host page passes a
// flat `items` list ({ key, section, title, hint, Icon, keywords, run }); this
// component handles search, grouping, keyboard navigation and running an action.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft } from 'lucide-react'

// How many results to render at once. Filtering happens over everything first.
const MAX_VISIBLE = 50

export default function CommandPalette({ open, onClose, items = [] }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Reset query when the palette opens; focus the input after paint.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setQuery('')
      setSelected(0)
    }
  }
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Keep the highlighted row visible — arrowing down a long result list used to
  // walk the selection straight off the bottom of the scroll box.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('.nb-cmd-item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [open, selected])

  // Filter the *whole* list, then cap what's rendered. Callers used to hand in a
  // pre-truncated slice of notes, so searching for anything past the cut-off
  // returned "No matches" for a note that plainly existed.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = !q
      ? items
      : items.filter(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            (it.hint || '').toLowerCase().includes(q) ||
            (it.keywords || '').toLowerCase().includes(q) ||
            (it.section || '').toLowerCase().includes(q),
        )
    return matches.length > MAX_VISIBLE ? matches.slice(0, MAX_VISIBLE) : matches
  }, [items, query])

  // Reset the highlight when the result set changes (render-phase adjustment).
  const [seenFiltered, setSeenFiltered] = useState(filtered)
  if (seenFiltered !== filtered) {
    setSeenFiltered(filtered)
    setSelected(0)
  }

  if (!open) return null

  const run = (item) => {
    onClose()
    item?.run?.()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (filtered.length ? (s + 1) % filtered.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (filtered.length ? (s - 1 + filtered.length) % filtered.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(filtered[selected])
    }
  }

  // group in display order, but keep a flat index for keyboard nav
  let flatIndex = -1
  const sections = []
  for (const item of filtered) {
    const label = item.section || 'Actions'
    let group = sections.find((g) => g.label === label)
    if (!group) {
      group = { label, items: [] }
      sections.push(group)
    }
    group.items.push(item)
  }

  return (
    <div className="nb-cmd-backdrop" onMouseDown={onClose}>
      <div
        className="nb-cmd"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="nb-cmd-search">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, templates, and commands…"
          />
          <kbd className="nb-cmd-kbd">Esc</kbd>
        </div>

        <div className="nb-cmd-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="nb-cmd-empty">No matches</div>
          ) : (
            sections.map((group) => (
              <div key={group.label} className="nb-cmd-group">
                <div className="nb-cmd-group-label">{group.label}</div>
                {group.items.map((item) => {
                  flatIndex += 1
                  const idx = flatIndex
                  const Icon = item.Icon
                  return (
                    <button
                      key={item.key}
                      className={`nb-cmd-item${idx === selected ? ' is-active' : ''}`}
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => run(item)}
                    >
                      {Icon && <span className="nb-cmd-ico"><Icon size={16} /></span>}
                      <span className="nb-cmd-text">
                        <span className="nb-cmd-title">{item.title}</span>
                        {item.hint && <span className="nb-cmd-hint">{item.hint}</span>}
                      </span>
                      {idx === selected && <CornerDownLeft size={13} className="nb-cmd-enter" />}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
