/**
 * Notebook list filtering.
 *
 * The filters moved behind a disclosure, which changes what these functions are
 * responsible for. Previously each filter was its own visible row, so a filter
 * that was on was self-evident. Now the only things saying so are the count on
 * the button and the chips derived from `describeFilters` — if either disagrees
 * with what `filterNotes` actually applied, the reader is looking at a
 * shortened list with no visible reason for it, which reads as lost notes.
 *
 * Node environment: pure array work. `searchNotes` is a pure matcher over the
 * list it is handed, so nothing here touches localStorage.
 */

import { describe, expect, it } from 'vitest'
import { NO_FILTERS, activeFilterCount, describeFilters, filterNotes } from './filters.js'

const note = (id, extra = {}) => ({
  id,
  title: id,
  folder: 'General',
  tags: [],
  content: [{ id: `${id}-b`, type: 'text', markdown: id }],
  updatedAt: 1,
  ...extra,
})

const notes = [
  note('alpha', { folder: 'Lab Work', tags: ['study'], pinned: true }),
  note('beta', { tags: ['study', 'code'], attachedTo: { kind: 'lesson', id: 'qubits_states', label: 'Qubits' } }),
  note('gamma', { folder: 'Lab Work', attachedTo: { kind: 'project', id: 'grover', label: 'Grover' } }),
]

const ids = (list) => list.map((n) => n.id).sort()

describe('activeFilterCount', () => {
  it('is zero at rest', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0)
    expect(activeFilterCount()).toBe(0)
  })

  it('counts each narrowing filter once', () => {
    expect(activeFilterCount({ ...NO_FILTERS, folder: 'Lab Work' })).toBe(1)
    expect(activeFilterCount({ ...NO_FILTERS, tag: 'study', pinnedOnly: true })).toBe(2)
    expect(
      activeFilterCount({ folder: 'Lab Work', tag: 'study', attachment: 'lesson:x', pinnedOnly: true }),
    ).toBe(4)
  })

  // The search box is always visible and has its own clear button. Counting it
  // would put a number on a panel that cannot clear it.
  it('does not count the search query', () => {
    expect(activeFilterCount({ ...NO_FILTERS, query: 'anything' })).toBe(0)
  })
})

describe('describeFilters', () => {
  it('returns nothing at rest', () => {
    expect(describeFilters(NO_FILTERS)).toEqual([])
  })

  // The chip count and the badge count are shown side by side; if they can
  // disagree, one of them is lying about what is filtering the list.
  it('produces exactly one chip per counted filter', () => {
    const filters = { folder: 'Lab Work', tag: 'study', attachment: 'lesson:qubits_states', pinnedOnly: true }
    expect(describeFilters(filters, []).length).toBe(activeFilterCount(filters))
  })

  it('clearing every chip returns the list to rest', () => {
    const filters = { folder: 'Lab Work', tag: 'study', attachment: 'project:grover', pinnedOnly: true }
    const cleared = describeFilters(filters).reduce((acc, chip) => ({ ...acc, ...chip.clear }), filters)
    expect(activeFilterCount(cleared)).toBe(0)
    expect(ids(filterNotes(notes, '', cleared))).toEqual(ids(notes))
  })

  it('labels an attachment with its target title when it is known', () => {
    const targets = [{ key: 'lesson:qubits_states', label: 'Qubits and states', count: 1 }]
    const [chip] = describeFilters({ ...NO_FILTERS, attachment: 'lesson:qubits_states' }, targets)
    expect(chip.label).toBe('Qubits and states')
  })

  // A target can leave the list between renders (its last note detached). The
  // chip still has to be readable and, above all, still clearable.
  it('falls back to the id when the target is gone', () => {
    const [chip] = describeFilters({ ...NO_FILTERS, attachment: 'lesson:qubits_states' }, [])
    expect(chip.label).toBe('qubits_states')
    expect(chip.clear).toEqual({ attachment: null })
  })
})

describe('filterNotes', () => {
  it('returns everything at rest', () => {
    expect(ids(filterNotes(notes, '', NO_FILTERS))).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('narrows by folder, treating a missing folder as the default', () => {
    expect(ids(filterNotes(notes, '', { ...NO_FILTERS, folder: 'Lab Work' }))).toEqual(['alpha', 'gamma'])
    const unfiled = [...notes, note('delta', { folder: undefined })]
    expect(ids(filterNotes(unfiled, '', { ...NO_FILTERS, folder: 'General' }))).toEqual(['beta', 'delta'])
  })

  it('narrows by tag, attachment and pinned', () => {
    expect(ids(filterNotes(notes, '', { ...NO_FILTERS, tag: 'study' }))).toEqual(['alpha', 'beta'])
    expect(ids(filterNotes(notes, '', { ...NO_FILTERS, attachment: 'project:grover' }))).toEqual(['gamma'])
    expect(ids(filterNotes(notes, '', { ...NO_FILTERS, pinnedOnly: true }))).toEqual(['alpha'])
  })

  it('combines filters, and combines them with the search query', () => {
    expect(ids(filterNotes(notes, '', { ...NO_FILTERS, folder: 'Lab Work', pinnedOnly: true }))).toEqual(['alpha'])
    expect(ids(filterNotes(notes, 'gamma', { ...NO_FILTERS, folder: 'Lab Work' }))).toEqual(['gamma'])
    expect(filterNotes(notes, 'gamma', { ...NO_FILTERS, pinnedOnly: true })).toEqual([])
  })

  it('does not mutate the list it is given', () => {
    const before = notes.map((n) => n.id)
    filterNotes(notes, 'alpha', { ...NO_FILTERS, tag: 'study' })
    expect(notes.map((n) => n.id)).toEqual(before)
  })
})
