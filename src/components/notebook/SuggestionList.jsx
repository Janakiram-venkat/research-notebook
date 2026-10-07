// Shared dropdown for TipTap suggestion popups (slash menu + wiki-link
// autocomplete). Keyboard-navigable; the parent suggestion render bridge calls
// the imperative `onKeyDown` handle. Items: { key, title, subtitle, Icon }.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

const SuggestionList = forwardRef(function SuggestionList({ items = [], command, empty = 'No results' }, ref) {
  const [selected, setSelected] = useState(0)
  const listRef = useRef(null)
  // Reset the highlight whenever the result set changes (render-phase adjustment,
  // the React-recommended alternative to a setState-in-effect).
  const [seenItems, setSeenItems] = useState(items)
  if (seenItems !== items) {
    setSeenItems(items)
    setSelected(0)
  }

  // The popup scrolls (max-height + overflow-y), but arrowing down only moved the
  // highlight — it walked straight past the bottom edge and out of sight. Keep
  // the active row in view, including when Arrow-Up wraps back to the end.
  useEffect(() => {
    listRef.current?.querySelector('.nb-suggest-item.is-active')?.scrollIntoView({ block: 'nearest' })
  }, [selected, items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items[selected]) command(items[selected])
        return true
      }
      return false
    },
  }))

  if (!items.length) {
    return (
      <div className="nb-suggest">
        <div className="nb-suggest-empty">{empty}</div>
      </div>
    )
  }

  return (
    <div className="nb-suggest" role="listbox" ref={listRef}>
      {items.map((item, i) => {
        const Icon = item.Icon
        return (
          <button
            key={item.key ?? i}
            type="button"
            role="option"
            aria-selected={i === selected}
            className={`nb-suggest-item${i === selected ? ' is-active' : ''}`}
            onMouseEnter={() => setSelected(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              command(item)
            }}
          >
            {Icon && (
              <span className="nb-suggest-ico">
                <Icon size={16} />
              </span>
            )}
            <span className="nb-suggest-text">
              <span className="nb-suggest-title">{item.title}</span>
              {item.subtitle && <span className="nb-suggest-sub">{item.subtitle}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
})

export default SuggestionList
