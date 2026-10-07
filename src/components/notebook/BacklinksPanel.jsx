// Shows the notes that link to the current note via `[[Title]]`. Rendered at the
// foot of the note so the wiki-links become bidirectional.

import { Link2, Folder } from 'lucide-react'

export default function BacklinksPanel({ links, onOpen }) {
  if (!links || links.length === 0) return null

  return (
    <aside className="nb-backlinks" aria-label="Linked from">
      <div className="nb-backlinks-head">
        <Link2 size={14} />
        <span>Linked from</span>
        <span className="nb-backlinks-count">{links.length}</span>
      </div>
      <ul className="nb-backlinks-list">
        {links.map((l) => (
          <li key={l.id}>
            <button className="nb-backlink" onClick={() => onOpen(l.id)}>
              <span className="nb-backlink-title">{l.title}</span>
              {l.folder && (
                <span className="nb-backlink-folder">
                  <Folder size={11} /> {l.folder}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
