// Notebook list filtering.
//
// The dashboard used to hold folder, tag, attachment and pinned filters as four
// separate pieces of state, each with its own always-visible row of chips. That
// is what made the landing page read as a control panel rather than a notebook:
// three rows of buttons above the notes, most of which filtered nothing on a
// small notebook. The rows now live behind one disclosure, which only works if
// something can answer "how many filters are on?" and "what are they?" without
// opening it — that is what this module is for.
//
// It is pure: no storage, no React. `searchNotes` is the store's own matcher and
// is likewise pure over the list it is handed.

import { searchNotes, DEFAULT_FOLDER } from './notebookStore.js'

/** The resting state: everything visible. */
export const NO_FILTERS = Object.freeze({
  folder: 'all',
  tag: null,
  // Key is `${kind}:${id}`, matching attachmentTargets().
  attachment: null,
  pinnedOnly: false,
})

/** How many filters are narrowing the list. Search is not one of them: it has
 *  its own always-visible box, so counting it would make the badge disagree
 *  with what the panel can clear. */
export function activeFilterCount(filters = NO_FILTERS) {
  let n = 0
  if (filters.folder && filters.folder !== 'all') n += 1
  if (filters.tag) n += 1
  if (filters.attachment) n += 1
  if (filters.pinnedOnly) n += 1
  return n
}

/**
 * The active filters as removable chips, so the page can show what is on
 * without the panel being open.
 *
 * Each entry carries the patch that clears it, rather than a key the caller has
 * to map back to a field — a chip that says what it undoes cannot fall out of
 * step with the filter it names.
 */
export function describeFilters(filters = NO_FILTERS, targets = []) {
  const chips = []
  if (filters.folder && filters.folder !== 'all') {
    chips.push({ key: 'folder', kind: 'folder', label: filters.folder, clear: { folder: 'all' } })
  }
  if (filters.attachment) {
    const target = targets.find((t) => t.key === filters.attachment)
    chips.push({
      key: 'attachment',
      kind: 'attachment',
      label: target?.label || filters.attachment.split(':').slice(1).join(':'),
      clear: { attachment: null },
    })
  }
  if (filters.tag) {
    chips.push({ key: 'tag', kind: 'tag', label: filters.tag, clear: { tag: null } })
  }
  if (filters.pinnedOnly) {
    chips.push({ key: 'pinned', kind: 'pinned', label: 'Pinned only', clear: { pinnedOnly: false } })
  }
  return chips
}

/**
 * Search, then narrow. Order matters only for cost — `searchNotes` is the
 * expensive pass and runs once over the full list either way.
 */
export function filterNotes(notes, query, filters = NO_FILTERS) {
  let result = searchNotes(notes, query)
  if (filters.folder && filters.folder !== 'all') {
    result = result.filter((n) => (n.folder || DEFAULT_FOLDER) === filters.folder)
  }
  if (filters.tag) result = result.filter((n) => (n.tags || []).includes(filters.tag))
  if (filters.attachment) {
    result = result.filter(
      (n) => n.attachedTo && `${n.attachedTo.kind}:${n.attachedTo.id}` === filters.attachment,
    )
  }
  if (filters.pinnedOnly) result = result.filter((n) => n.pinned)
  return result
}
