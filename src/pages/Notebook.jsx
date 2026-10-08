import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Notebook as NotebookIcon, Plus, Search, Type, Code2, X,
  Star, Folder, Copy, Clock3, FileText, Filter, Command, Download, Upload, AlertTriangle,
  MoreHorizontal, Lightbulb, Trash2, CloudOff, SlidersHorizontal, LayoutGrid, Rows3, Sparkles, Waypoints, CalendarDays, Network, Workflow, Layers,
} from 'lucide-react'
import {
  listNotes, createNote, allTags, allFolders, updateNote, duplicateNote,
  deleteNote, restoreNote, getRecentNotes, exportAllNotes, importNotes, getStorageInfo,
  syncWithRemote, acknowledgeConflicts, DEFAULT_FOLDER, newId, textBlock,
} from '../lib/notebook/notebookStore.js'
import { downloadJson, downloadZip, notesFromFile } from '../lib/notebook/exporters.js'
import { migrateEmbeddedImages } from '../lib/notebook/assetMigration.js'
import { purgeExpiredTombstones } from '../lib/notebook/retention.js'
import { attachmentTargets } from '../lib/notebook/attachments.js'
import { useSyncStatus } from '../lib/notebook/useSyncStatus.js'
import { useBackendStatus } from '../lib/useBackendStatus.js'
import { TEMPLATES, WELCOME_TEMPLATE, DAILY_TEMPLATE, dailyTitle, todayKey, templateBlockTypes } from '../lib/notebook/templates.js'
import { tagColor, wikiLinkParts, wikiLinkRegex } from '../lib/notebook/noteUtils.js'
import { deckStats, extractCards, loadStates } from '../lib/notebook/flashcards.js'
import CommandPalette from '../components/notebook/CommandPalette.jsx'
import FilterPanel from '../components/notebook/FilterPanel.jsx'
import NotebookEmpty from '../components/notebook/NotebookEmpty.jsx'
import { NO_FILTERS, activeFilterCount, describeFilters, filterNotes } from '../lib/notebook/filters.js'
import ToastHost from '../components/notebook/ui/ToastHost.jsx'
import { useConfirm } from '../components/notebook/ui/useConfirm.jsx'
import { toast, toastSuccess, toastError } from '../components/notebook/ui/toast.js'
import '../components/notebook/notebook.css'

const GUIDE_DISMISSED_KEY = 'qcb.notebook.guideDismissed'

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const BLOCK_CHIP = {
  text: { Icon: Type, label: 'Notes' },
  code: { Icon: Code2, label: 'Code' },
  mindmap: { Icon: Network, label: 'Mind map' },
  diagram: { Icon: Workflow, label: 'Diagram' },
}

// Highlight query matches inside a plain-text snippet.
function highlightMatch(text, query) {
  const q = (query || '').trim()
  if (!q || !text) return text
  const terms = q.split(/\s+/).filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!terms.length) return text
  const splitRe = new RegExp(`(${terms.join('|')})`, 'ig')
  const testRe = new RegExp(`^(?:${terms.join('|')})$`, 'i')
  return text.split(splitRe).map((part, i) =>
    testRe.test(part) ? <mark key={i} className="nb-hit">{part}</mark> : part,
  )
}

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString()
}

function snippet(note) {
  for (const b of note.content || []) {
    if (b.type === 'text' && b.markdown?.trim()) {
      return b.markdown
        // Show a link's label, not its [[id|Label]] syntax; drop callout markers.
        .replace(wikiLinkRegex('g'), (_, first, second) => wikiLinkParts(first, second).label)
        .replace(/\[!(\w+)\]/g, '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/\$\$[\s\S]*?\$\$/g, ' formula ')
        .replace(/\$([^$\n]+?)\$/g, '$1')
        .replace(/[#>*`_$-]/g, '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)[0]
        ?.slice(0, 150)
    }
  }
  return ''
}

function blockCounts(note) {
  const counts = { text: 0, code: 0 }
  for (const b of note.content || []) counts[b.type] = (counts[b.type] || 0) + 1
  return counts
}

function TemplatePicker({ onPick, onClose }) {
  return (
    <div className="nb-modal-backdrop" onClick={onClose}>
      <div className="nb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="nb-modal-head">
          <div>
            <h2>New note</h2>
            <p className="nb-modal-sub">Start fast with a structure you can edit immediately.</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="nb-template-grid">
          {TEMPLATES.map((t) => {
            const types = templateBlockTypes(t)
            return (
              <button key={t.id} className="nb-template-card" onClick={() => onPick(t.id)}>
                <span className="nb-template-label">{t.label}</span>
                <span className="nb-template-desc">{t.description}</span>
                <span className="nb-template-chips">
                  {types.map((type) => {
                    const chip = BLOCK_CHIP[type]
                    return (
                      <span key={type} className="nb-template-chip">
                        <chip.Icon size={11} /> {chip.label}
                      </span>
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// A brand-new notebook opens on a short guide note instead of a blank screen. Done
// once per browser (flagged), and only when there is nothing yet, so a reader who
// deletes it, or who restores a backup, is not given it again.
function seedWelcomeNote(existing) {
  try {
    if (existing.length > 0 || localStorage.getItem('nb.welcomed')) return existing
    localStorage.setItem('nb.welcomed', '1')
    createNote({ ...WELCOME_TEMPLATE.build(), pinned: true })
    return listNotes()
  } catch {
    return existing
  }
}

export default function Notebook() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [confirm, confirmEl] = useConfirm()
  const [notes, setNotes] = useState(() => seedWelcomeNote(listNotes()))

  // Notes the backend (or an agent) changed arrive via applyRemoteNotes().
  useEffect(() => {
    const refresh = () => setNotes(listNotes())
    window.addEventListener('nb:notes-changed', refresh)
    return () => window.removeEventListener('nb:notes-changed', refresh)
  }, [])
  const [query, setQuery] = useState(() => searchParams.get('search') || '')
  // One object rather than four pieces of state: the count on the Filters
  // button, the removable chips and the clear-all action all have to agree
  // about what is on, and they can only do that reading one value.
  const [filters, setFilters] = useState(NO_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [guideDismissed, setGuideDismissed] = useState(
    () => localStorage.getItem(GUIDE_DISMISSED_KEY) === '1',
  )
  // A compact list is the right shape for a large notebook; the mixed-density
  // grid is right for a small one where each card is doing the work of a
  // preview. Persisted so a reader who prefers one is not made to switch every
  // visit. `grid` on a fresh browser, since that is what everything else on
  // the site draws too.
  const [viewMode, setViewMode] = useState(() => {
    try {
      const v = localStorage.getItem('qcb.notebook.viewMode')
      return v === 'list' || v === 'grid' ? v : 'grid'
    } catch { return 'grid' }
  })
  useEffect(() => {
    try { localStorage.setItem('qcb.notebook.viewMode', viewMode) } catch { /* private mode */ }
  }, [viewMode])

  const tags = useMemo(() => allTags(notes), [notes])
  const folders = useMemo(() => allFolders(notes), [notes])
  const targets = useMemo(() => attachmentTargets(notes), [notes])
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when the note set changes
  const recent = useMemo(() => getRecentNotes(5), [notes])

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Signed-in users: pull/push against Supabase so notes follow them across
  // devices. No-op (and no UI change) when signed out.
  useEffect(() => {
    let cancelled = false
    syncWithRemote().then(async ({ synced, deleted }) => {
      if (cancelled) return
      if (!synced) return
      setNotes(listNotes())
      // A note vanishing from the list with no explanation reads as data loss,
      // even when it is the delete the user asked for on their other device.
      if (deleted > 0) {
        toast(
          deleted === 1
            ? 'A note deleted on another device was removed here too.'
            : `${deleted} notes deleted on another device were removed here too.`,
        )
      }

      // Housekeeping, after the sync rather than beside it: the pass rewrites
      // note bodies, and doing that while a pull is still deciding what to adopt
      // would have the two writing over each other.
      const moved = await migrateEmbeddedImages()
      if (cancelled) return
      if (moved.ran) {
        setNotes(listNotes())
        if (moved.uploaded > 0) {
          const freed = moved.freedBytes > 0 ? ` (${formatBytes(moved.freedBytes)} freed)` : ''
          toastSuccess(
            `Moved ${moved.uploaded} ${moved.uploaded === 1 ? 'image' : 'images'} to cloud storage${freed}.`,
          )
        }
      }

      // Retire tombstones past the retention window, with their images and
      // version history. Silent by design: the user deleted these notes a month
      // ago and has no reason to hear about the bookkeeping. Self-throttled to
      // one pass per browser per day.
      purgeExpiredTombstones()
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!moreOpen) return
    function onDown(e) {
      if (!e.target.closest?.('.nb-more-menu')) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  // A filter can outlive its folder (last note in it deleted or moved), and with
  // the row hidden there'd be no chip left to clear it — just an empty list.
  useEffect(() => {
    if (filters.folder !== 'all' && !folders.includes(filters.folder)) patchFilters({ folder: 'all' })
  }, [folders, filters.folder])

  // Same hazard as folders: detach or delete the last note for a target and the
  // chip that would clear the filter disappears with it, leaving an empty list
  // and no way back.
  useEffect(() => {
    if (filters.attachment && !targets.some((t) => t.key === filters.attachment)) {
      patchFilters({ attachment: null })
    }
  }, [targets, filters.attachment])

  function dismissGuide() {
    localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
    setGuideDismissed(true)
  }

  const totalBlocks = useMemo(
    () => notes.reduce((sum, note) => sum + (note.content?.length || 0), 0),
    [notes],
  )

  const pinnedCount = useMemo(() => notes.filter((note) => note.pinned).length, [notes])
  // `listNotes()` sorts pinned-first, so notes[0] is the top *pinned* note, not
  // the latest edit. Both "Continue latest" and the "Last updated" stat mean the
  // most recently updated note — find it explicitly.
  const recentNote = useMemo(
    () => notes.reduce((latest, n) => ((n.updatedAt || 0) > (latest?.updatedAt || 0) ? n : latest), null),
    [notes],
  )

  const visible = useMemo(() => filterNotes(notes, query, filters), [notes, query, filters])
  const activeCount = activeFilterCount(filters)
  const filterChips = useMemo(() => describeFilters(filters, targets), [filters, targets])

  const importRef = useRef(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute footprint when the note set changes
  const storage = useMemo(() => getStorageInfo(), [notes])
  const syncStatus = useSyncStatus()
  const backend = useBackendStatus()
  // Flashcards across all notes: drives the Review button and its count.
  const cardStats = useMemo(() => deckStats(extractCards(notes), loadStates()), [notes])

  function refreshNotes() {
    setNotes(listNotes())
  }

  function patchFilters(patch) {
    setFilters((current) => ({ ...current, ...patch }))
  }

  // Local-only notes need an escape hatch: export the whole notebook to a JSON
  // file the user can re-import on another browser or after a cleared cache.
  function exportBackup() {
    const count = downloadJson(exportAllNotes())
    toastSuccess(`Exported ${count} note${count === 1 ? '' : 's'}`)
  }

  function exportMarkdown() {
    const count = downloadZip(exportAllNotes().notes)
    toastSuccess(`Exported ${count} note${count === 1 ? '' : 's'} as Markdown files`)
  }

  // Accepts this app's JSON backup, a single .md file, or a .zip of Markdown files
  // (Obsidian vaults, Notion Markdown exports and this app's own zip).
  async function importBackup(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { payload } = await notesFromFile(file, { newId, textBlock })
      const { imported, ok } = importNotes(payload, { mode: 'merge' })
      if (!ok) {
        toastError('Import failed, the file was unreadable or storage is full.')
        return
      }
      refreshNotes()
      toastSuccess(`Imported ${imported} note${imported === 1 ? '' : 's'}`)
    } catch (err) {
      toastError(err instanceof SyntaxError ? "That file isn't a valid notebook export." : err.message)
    }
  }

  // One journal note per day: open today's if it exists, otherwise create it.
  function openToday() {
    const key = todayKey()
    // Matched on title too: dailyKey is local-only and does not travel through sync.
    const title = dailyTitle(key)
    const existing = listNotes().find((n) => n.dailyKey === key || n.title === title)
    const note = existing || createNote({ ...DAILY_TEMPLATE.build(key), templateType: 'daily' })
    if (!existing) updateNote(note.id, { dailyKey: key })
    navigate(`/notebook/${note.id}`)
  }

  function handlePick(templateId) {
    const tpl = TEMPLATES.find((t) => t.id === templateId)
    const seed = tpl.build()
    // Creating a note while a folder is filtered should put it in that folder —
    // blank notes already did this, templates ignored it and used their own.
    const note = createNote({
      ...seed,
      folder: filters.folder === 'all' ? seed.folder : filters.folder,
      templateType: templateId,
    })
    navigate(`/notebook/${note.id}`)
  }

  function handleBlankNote() {
    const note = createNote({ folder: filters.folder === 'all' ? DEFAULT_FOLDER : filters.folder })
    navigate(`/notebook/${note.id}`)
  }

  function togglePin(note) {
    updateNote(note.id, { pinned: !note.pinned })
    refreshNotes()
  }

  function handleDuplicate(note) {
    const copy = duplicateNote(note.id)
    refreshNotes()
    if (copy) navigate(`/notebook/${copy.id}`)
  }

  // Delete from the dashboard, with the same undo the note page offers — the
  // snapshot restores the original id so links to the note keep resolving.
  async function handleDelete(note) {
    const ok = await confirm({
      title: `Delete "${note.title || 'Untitled note'}"?`,
      message: 'The note and all its blocks will be removed. You can undo this from the notification.',
      confirmLabel: 'Delete note',
      danger: true,
    })
    if (!ok) return
    deleteNote(note.id) // snapshots to history on its way out — see the store
    refreshNotes()
    toast(`Deleted "${note.title || 'Untitled note'}"`, {
      duration: 8000,
      action: {
        label: 'Undo',
        run: () => {
          if (restoreNote(note)) refreshNotes()
          else toastError("Couldn't restore that note.")
        },
      },
    })
  }

  const commandItems = useMemo(() => {
    const create = [
      { key: 'today', section: 'Go to', title: "Today's journal note", Icon: CalendarDays, run: openToday },
      { key: 'review', section: 'Go to', title: 'Review flashcards', hint: 'question :: answer lines in your notes', Icon: Layers, run: () => navigate('/notebook/review') },
      { key: 'graph', section: 'Go to', title: 'Knowledge graph', hint: 'How your notes link together', Icon: Waypoints, run: () => navigate('/notebook/graph') },
      { key: 'new-blank', section: 'Create', title: 'New blank note', Icon: Plus, run: handleBlankNote },
      ...TEMPLATES.map((t) => ({
        key: `new-${t.id}`, section: 'Create', title: `New: ${t.label}`, hint: t.description, Icon: Plus,
        run: () => handlePick(t.id),
      })),
    ]
    // No slice — the palette filters the full list and caps only what it renders.
    const open = notes.map((n) => ({
      key: `open-${n.id}`, section: 'Open note', title: n.title || 'Untitled note', hint: n.folder,
      Icon: FileText, keywords: (n.tags || []).join(' '),
      run: () => navigate(`/notebook/${n.id}`),
    }))
    return [...create, ...open]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes])

  return (
    <div className="nb-dash">
      <div className="nb-dash-header nb-dash-header-pro">
        <div>
          <span className="nb-eyebrow">
            <NotebookIcon size={13} /> Research Notebook
          </span>
          <h1 className="nb-dash-title">Your notes</h1>
          <p className="nb-dash-sub">
            Write down what you learn, with equations, runnable code, sketches and plots on the same page. Keep it all tidy with folders and pins.
          </p>
        </div>
        <div className="nb-header-actions">
          <button className="nb-new-btn nb-new-btn-secondary" onClick={() => setCmdOpen(true)} title="Command palette (Ctrl+K)">
            <Command size={16} /> Search
          </button>
          <button className="nb-new-btn nb-new-btn-secondary" onClick={openToday} title="Open today's journal note">
            <CalendarDays size={16} /> Today
          </button>
          {cardStats.total > 0 && (
            <button className="nb-new-btn nb-new-btn-secondary" onClick={() => navigate('/notebook/review')} title={`${cardStats.due + cardStats.fresh} flashcards to study`}>
              <Layers size={16} /> Review
              {cardStats.due + cardStats.fresh > 0 && <span className="nb-btn-count">{cardStats.due + cardStats.fresh}</span>}
            </button>
          )}
          <button className="nb-new-btn nb-new-btn-secondary" onClick={() => navigate('/notebook/graph')} title="See how your notes link together">
            <Waypoints size={16} /> Graph
          </button>
          {recentNote && (
            <button className="nb-new-btn nb-new-btn-secondary" onClick={() => navigate(`/notebook/${recentNote.id}`)}>
              <Clock3 size={16} /> Continue latest
            </button>
          )}
          <div className="nb-more-menu nb-dash-more-menu">
            <button
              className={`nb-icon-btn${moreOpen ? ' is-open' : ''}`}
              onClick={() => setMoreOpen((o) => !o)}
              title="More actions"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal size={18} />
            </button>
            {moreOpen && (
              <div className="nb-more-pop">
                <button onClick={() => { handleBlankNote() }}>
                  <Plus size={15} /> Blank note
                </button>
                <div className="nb-more-sep" />
                <button onClick={() => { window.dispatchEvent(new CustomEvent('nb:tour')); setMoreOpen(false) }}>
                  <Sparkles size={15} /> Take the tour
                </button>
                <button onClick={() => { exportMarkdown(); setMoreOpen(false) }}>
                  <Download size={15} /> Export as Markdown (.zip)
                </button>
                <button onClick={() => { exportBackup(); setMoreOpen(false) }}>
                  <Download size={15} /> Export backup (.json)
                </button>
                <button onClick={() => { importRef.current?.click(); setMoreOpen(false) }}>
                  <Upload size={15} /> Import notes (.md, .zip, .json)
                </button>
              </div>
            )}
          </div>
          <button className="nb-new-btn" onClick={() => setPicking(true)}>
            <Plus size={16} /> New note
          </button>
          <input ref={importRef} type="file" accept=".json,.md,.markdown,.txt,.zip" hidden onChange={importBackup} />
        </div>
      </div>

      {/* Signed-out notes live only in this browser's localStorage — clearing
          site data loses them. That was only ever surfaced once storage was
          already 75% full, i.e. far too late to be a warning. */}
      {notes.length > 0 && (backend.state === 'local' || backend.state === 'signin') && (
        <div className="nb-storage-warn nb-local-only" role="note">
          <CloudOff size={15} />
          <span>
            These notes are saved in this browser only{backend.state === 'signin' ? ' (sign in from the top bar to back them up)' : ''}. Clearing site data would lose them, so
            <button className="nb-storage-warn-action" onClick={exportBackup}>export a backup</button>
            now and then.
          </span>
        </div>
      )}

      {/* Conflicts are the one sync outcome that needs an explanation rather
          than an icon: the user has an extra note they didn't create, and no
          way to guess where it came from. */}
      {syncStatus.conflicts.length > 0 && (
        <div className="nb-storage-warn nb-conflict-warn" role="alert">
          <AlertTriangle size={15} />
          <span>
            {syncStatus.conflicts.length === 1
              ? 'A note was edited on two devices at once. Your version was kept and the other was saved as a copy, '
              : `${syncStatus.conflicts.length} notes were edited on two devices at once. Your versions were kept and the others were saved as copies, `}
            {syncStatus.conflicts.map((c, i) => (
              <span key={c.conflictId}>
                {i > 0 && ', '}
                <button className="nb-storage-warn-action" onClick={() => navigate(`/notebook/${c.conflictId}`)}>
                  {c.title}
                </button>
              </span>
            ))}
            . Compare them and delete whichever you don't need.
          </span>
          <button className="nb-storage-warn-action" onClick={acknowledgeConflicts}>Dismiss</button>
        </div>
      )}

      {storage.level !== 'ok' && (
        <div className="nb-storage-warn" role="alert">
          <AlertTriangle size={15} />
          <span>
            Local storage is {Math.round(storage.ratio * 100)}% full.
            {storage.level === 'critical' && ' New images can’t be embedded until you free some space.'}
            {' '}Notes are saved in this browser , 
            <button className="nb-storage-warn-action" onClick={exportBackup}>export a backup</button>
            to avoid losing them.
          </span>
        </div>
      )}

      {/* Four gradient stat cards were the loudest thing above the notes and
          the least useful: a notebook's own size is not what someone came to
          the page to read. Same four numbers, one quiet line, and only once
          there is a notebook to describe. */}
      {notes.length > 0 && (
        <p className="nb-stat-line" aria-label="Notebook overview">
          <span><strong>{notes.length}</strong> {notes.length === 1 ? 'note' : 'notes'}</span>
          {pinnedCount > 0 && <span><strong>{pinnedCount}</strong> pinned</span>}
          <span><strong>{totalBlocks}</strong> {totalBlocks === 1 ? 'block' : 'blocks'}</span>
          {recentNote && <span>edited {relativeTime(recentNote.updatedAt)}</span>}
        </p>
      )}

      {!query && recent.length > 0 && (
        <div className="nb-recent" aria-label="Recently opened">
          <span className="nb-recent-label"><Clock3 size={13} /> Recent</span>
          <div className="nb-recent-chips">
            {recent.map((n) => (
              <button key={n.id} className="nb-recent-chip" onClick={() => navigate(`/notebook/${n.id}`)} title={n.title}>
                <FileText size={12} /> {n.title || 'Untitled note'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nothing to search on an empty notebook, and a search box above the
          first-run panel is one more thing to read past before writing. */}
      {notes.length > 0 && (
      <div className="nb-controls">
        <div className="nb-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, folders, tags, note text, code, and math…"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        {/* One button where three rows of chips used to be. It is only offered
            when something can be filtered: on a fresh notebook every section
            inside would be empty. */}
        {(notes.length > 1 || activeCount > 0) && (
          <button
            className={`nb-filter-pill${filtersOpen || activeCount > 0 ? ' is-active' : ''}`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="nb-filter-panel"
          >
            <SlidersHorizontal size={13} /> Filters
            {activeCount > 0 && <span className="nb-filter-count">{activeCount}</span>}
          </button>
        )}
        {/* Compact list vs preview grid. Sits beside the filter pill because
            it's a second axis on the same list: what is shown, and how it is
            shown. */}
        <div className="nb-view-toggle" role="group" aria-label="View mode">
          <button
            className={`nb-view-btn${viewMode === 'grid' ? ' is-active' : ''}`}
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            title="Grid view"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            className={`nb-view-btn${viewMode === 'list' ? ' is-active' : ''}`}
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            title="List view"
          >
            <Rows3 size={13} />
          </button>
        </div>
        {/* A collapsed panel must not be able to hide a filter that is on, so
            every active one is also a chip out here, and every chip clears the
            filter it names. */}
        {filterChips.map((chip) => (
          <button
            key={chip.key}
            className="nb-active-filter"
            onClick={() => patchFilters(chip.clear)}
            title={`Remove this filter`}
          >
            {chip.label}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
      </div>
      )}

      {filtersOpen && (
        <div id="nb-filter-panel">
          <FilterPanel
            filters={filters}
            folders={folders}
            targets={targets}
            tags={tags}
            activeCount={activeCount}
            onChange={patchFilters}
            onClear={() => setFilters(NO_FILTERS)}
          />
        </div>
      )}

      {/* The power-tools strip is for someone finding their feet. Past a few
          notes they have found them, and it is just a banner above their work.
          Dismissing it is still permanent. */}
      {!guideDismissed && notes.length > 0 && notes.length <= 3 && (
        <div className="nb-guide-panel nb-guide-panel-pro">
          <Lightbulb size={16} className="nb-guide-icon" />
          <div>
            <strong>Notebook power tools</strong>
            <span>Pin key notes, group by folder, link notes with [[...]], export Markdown/PDF, and write KaTeX with $...$ or $$...$$.</span>
          </div>
          <div className="nb-guide-examples">
            <code>$E = mc^2$</code>
            <code>[[Another note]]</code>
            <code>$$ \\sum_i p_i = 1 $$</code>
            <code>Ctrl+Shift+P PDF</code>
          </div>
          <button className="nb-guide-dismiss" onClick={dismissGuide} title="Dismiss" aria-label="Dismiss power tools guide">
            <X size={14} />
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        notes.length === 0 ? (
          <NotebookEmpty onStart={handlePick} onBrowseTemplates={() => setPicking(true)} />
        ) : (
          <div className="nb-empty">
            <Filter size={28} />
            <p>No notes match the current search or filters.</p>
            {/* The filters are behind a disclosure now, so an empty result has
                to offer the way out of it rather than assume the reader can
                see what is on. */}
            {(activeCount > 0 || query) && (
              <button
                className="nb-new-btn nb-new-btn-secondary"
                onClick={() => { setFilters(NO_FILTERS); setQuery('') }}
              >
                <X size={15} /> Clear search and filters
              </button>
            )}
          </div>
        )
      ) : (
        <div className={`nb-grid nb-grid-pro nb-view-${viewMode}`}>
          {visible.map((note) => {
            const counts = blockCounts(note)
            return (
              // The card used to be a <button> wrapping the pin/duplicate
              // buttons — invalid HTML, and neither keyboard nor screen readers
              // could reach the inner controls reliably. It's an article now,
              // with one stretched link for "open" and real buttons beside it.
              <article key={note.id} className={`nb-card${note.pinned ? ' is-pinned' : ''}`}>
                <div className={`nb-card-head${note.folder && note.folder !== DEFAULT_FOLDER ? '' : ' is-bare'}`}>
                  {/* Only worth showing when it says something — every card
                      reading "General" was noise on an unfiled notebook. */}
                  {note.folder && note.folder !== DEFAULT_FOLDER && (
                    <span className="nb-card-folder"><Folder size={12} /> {note.folder}</span>
                  )}
                  <div className="nb-card-actions">
                    <button
                      className={`nb-card-icon-btn${note.pinned ? ' is-active' : ''}`}
                      title={note.pinned ? 'Unpin note' : 'Pin note'}
                      aria-label={note.pinned ? `Unpin ${note.title || 'Untitled note'}` : `Pin ${note.title || 'Untitled note'}`}
                      aria-pressed={Boolean(note.pinned)}
                      onClick={() => togglePin(note)}
                    >
                      <Star size={14} />
                    </button>
                    <button
                      className="nb-card-icon-btn"
                      title="Duplicate note"
                      aria-label={`Duplicate ${note.title || 'Untitled note'}`}
                      onClick={() => handleDuplicate(note)}
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      className="nb-card-icon-btn nb-card-icon-danger"
                      title="Delete note"
                      aria-label={`Delete ${note.title || 'Untitled note'}`}
                      onClick={() => handleDelete(note)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h3 className="nb-card-title">
                  <Link className="nb-card-open" to={`/notebook/${note.id}`}>
                    {highlightMatch(note.title || 'Untitled note', query)}
                  </Link>
                </h3>
                <p className="nb-card-snippet">{highlightMatch(snippet(note), query) || 'Empty note, open it and start writing.'}</p>
                <div className="nb-card-badges">
                  {counts.text > 0 && <span className="nb-badge"><Type size={11} /> {counts.text}</span>}
                  {counts.code > 0 && <span className="nb-badge"><Code2 size={11} /> {counts.code}</span>}
                  {counts.mindmap > 0 && <span className="nb-badge" title="Mind maps"><Network size={11} /> {counts.mindmap}</span>}
                  {counts.diagram > 0 && <span className="nb-badge" title="Diagrams"><Workflow size={11} /> {counts.diagram}</span>}
                </div>
                {note.tags?.length > 0 && (
                  <div className="nb-card-tags">
                    {note.tags.map((t) => (
                      <span key={t} className="nb-card-tag" style={tagColor(t)}>{t}</span>
                    ))}
                  </div>
                )}
                <div className="nb-card-footer">
                  <span className="nb-card-time">{relativeTime(note.updatedAt)}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {picking && <TemplatePicker onPick={handlePick} onClose={() => setPicking(false)} />}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={commandItems} />
      {confirmEl}
      <ToastHost />
    </div>
  )
}
