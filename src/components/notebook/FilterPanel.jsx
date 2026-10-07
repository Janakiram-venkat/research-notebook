// The notebook's filters, collected into one disclosure.
//
// Folders, attachments, tags and the pinned toggle each had their own row on
// the dashboard, always visible, above the notes. Collapsing them is not
// hiding: `activeFilterCount` puts the number on the button and the page draws
// a removable chip per active filter, so nothing filtering the list is ever
// invisible. What is hidden is the *controls* for filters nobody has turned on.
//
// A section is omitted when it cannot narrow anything — one folder, no tags, no
// attachments — for the same reason the rows were: a control that never changes
// the result is a question the reader has to answer before ignoring it.

import { Folder, Link2, Tag as TagIcon, Star, X } from 'lucide-react'
import { tagColor } from '../../lib/notebook/noteUtils.js'
import { DEFAULT_FOLDER } from '../../lib/notebook/notebookStore.js'

export default function FilterPanel({ filters, folders, targets, tags, onChange, onClear, activeCount }) {
  const realFolders = folders.filter((f) => f !== DEFAULT_FOLDER)
  const showFolders = realFolders.length > 0

  return (
    <div className="nb-filter-panel" role="group" aria-label="Filters">
      {showFolders && (
        <section className="nb-filter-section">
          <span className="nb-filter-section-label"><Folder size={12} aria-hidden="true" /> Folder</span>
          <div className="nb-filter-chips">
            <button
              className={`nb-folder-chip${filters.folder === 'all' ? ' is-active' : ''}`}
              onClick={() => onChange({ folder: 'all' })}
            >
              All folders
            </button>
            {folders.map((folder) => (
              <button
                key={folder}
                className={`nb-folder-chip${filters.folder === folder ? ' is-active' : ''}`}
                onClick={() => onChange({ folder })}
              >
                {folder}
              </button>
            ))}
          </div>
        </section>
      )}

      {targets.length > 0 && (
        <section className="nb-filter-section">
          <span className="nb-filter-section-label"><Link2 size={12} aria-hidden="true" /> Attached to</span>
          <div className="nb-filter-chips">
            <button
              className={`nb-folder-chip${filters.attachment === null ? ' is-active' : ''}`}
              onClick={() => onChange({ attachment: null })}
            >
              Anything
            </button>
            {targets.map((t) => (
              <button
                key={t.key}
                className={`nb-folder-chip${filters.attachment === t.key ? ' is-active' : ''}`}
                onClick={() => onChange({ attachment: t.key })}
                title={t.resolved ? `Notes on this ${t.kind}` : `This ${t.kind} is no longer available`}
              >
                {t.label}
                <span className="nb-folder-chip-count">{t.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {tags.length > 0 && (
        <section className="nb-filter-section">
          <span className="nb-filter-section-label"><TagIcon size={12} aria-hidden="true" /> Tag</span>
          <div className="nb-filter-chips">
            {tags.map((t) => (
              <button
                key={t}
                className={`nb-tagfilter-chip${filters.tag === t ? ' is-active' : ''}`}
                style={filters.tag === t ? tagColor(t) : undefined}
                onClick={() => onChange({ tag: filters.tag === t ? null : t })}
              >
                {t}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="nb-filter-section">
        <span className="nb-filter-section-label"><Star size={12} aria-hidden="true" /> Pinned</span>
        <div className="nb-filter-chips">
          <button
            className={`nb-folder-chip${filters.pinnedOnly ? ' is-active' : ''}`}
            onClick={() => onChange({ pinnedOnly: !filters.pinnedOnly })}
            aria-pressed={Boolean(filters.pinnedOnly)}
          >
            <Star size={12} aria-hidden="true" /> Pinned notes only
          </button>
        </div>
      </section>

      {activeCount > 0 && (
        <button className="nb-filter-clear" onClick={onClear}>
          <X size={13} aria-hidden="true" /> Clear {activeCount === 1 ? 'filter' : 'all filters'}
        </button>
      )}
    </div>
  )
}
