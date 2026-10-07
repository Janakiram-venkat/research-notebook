// Auto outline from a note's headings. Fixed rail on the note page; clicking an
// entry scrolls to the matching heading. Collapsible and self-hiding when empty.

import { ListTree, X } from 'lucide-react'

export default function OutlinePanel({ items = [], onJump, onClose }) {
  if (!items.length) return null

  return (
    <aside className="nb-outline" aria-label="Note outline">
      <div className="nb-outline-head">
        <span className="nb-outline-title"><ListTree size={13} /> Outline</span>
        <button className="nb-outline-close" onClick={onClose} aria-label="Hide outline"><X size={14} /></button>
      </div>
      <nav className="nb-outline-list">
        {items.map((item, i) => (
          <button
            key={`${item.blockId}-${i}`}
            className={`nb-outline-item nb-outline-l${item.level}`}
            onClick={() => onJump(item)}
            title={item.text}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  )
}
